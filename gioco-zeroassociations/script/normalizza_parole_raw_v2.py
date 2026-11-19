"""Popola normalizzata da parole nel RAW 2.0, preservando la raccolta originale.

Tiene i lemmi e scarta le forme flesse: per nomi e aggettivi il lemma attestato (non la forma più frequente),
per i verbi l'infinito (17/11/2026)."""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sqlite3

from filelock import FileLock

from canonical_word_forms import FamilyEvidence
from collect_prompt_sources import checksum
from parole_raw_v2 import DEFAULT_DB, ROOT, VERSION
from prompt_inventory import records
import raw_word_familiarity
import raw_word_metrics

POLICY = 'canonical-lemma-2.2'
KINDS = {'wiktextract','morphit','unimorph','glaffit','flex_it','conllu'}


def morphology_sources(con):
    heads = dict(con.execute("SELECT substr(name,6),value FROM meta WHERE name LIKE 'head:%'"))
    by_source = {}
    for row in con.execute('''SELECT id,source_key,sha256,cache_path,source_config_json
                              FROM inventory_snapshots ORDER BY acquired_at DESC,id DESC'''):
        snapshot,key,digest,path,raw = row
        if key in by_source or (key in heads and heads[key]!=snapshot):
            continue
        config = json.loads(raw)
        by_source[key] = {'snapshot':snapshot,'source':key,'sha256':digest,'path':path,'config':config}
    missing = set(heads)-set(by_source)
    if missing:
        raise ValueError(f'Snapshot attivi assenti: {sorted(missing)}')
    return [s for _,s in sorted(by_source.items()) if s['config']['kind'] in KINDS]


def analyze(con, frequency=None):
    baseline = con.execute('PRAGMA data_version').fetchone()[0]
    known, total, digest = set(), 0, hashlib.sha256()
    for word,single in con.execute('SELECT parola,is_single_word FROM parole ORDER BY parola'):
        total += 1
        digest.update(f'{word}\t{single}\n'.encode('utf-8'))
        if single:
            known.add(word)
    print(f'Raccolta: {total:,} voci; {len(known):,} parole singole.',flush=True)
    evidence = FamilyEvidence(known)
    sources = morphology_sources(con)
    if not sources:
        raise ValueError('Nessuna fonte morfologica acquisita: eseguire Aggiornamento parole RAW')
    for number,source in enumerate(sources,1):
        path = Path(source['path'])
        if not path.is_file():
            alternate = con.execute('''SELECT cache_path FROM inventory_http_cache
                WHERE source_key=? AND sha256=? ORDER BY checked_at DESC''',
                                    (source['source'],source['sha256'])).fetchall()
            path = next((Path(p) for p, in alternate if Path(p).is_file()),path)
        if not path.is_file():
            raise FileNotFoundError(f"Cache assente per {source['source']}: ripetere Aggiornamento parole RAW")
        print(f"[{number}/{len(sources)}] Prove morfologiche: {source['source']}",flush=True)
        if checksum(path)!=source['sha256']:
            raise ValueError(f"Cache modificata: {source['source']}")
        count = 0
        for count,row in enumerate(records(path,source['config']),1):
            evidence.add(source['source'],source['config']['kind'],row)
            if count%250000==0:
                print(f'  {count:,} attestazioni lette',flush=True)
        if not count or checksum(path)!=source['sha256']:
            raise ValueError(f"Fonte vuota o modificata durante la lettura: {source['source']}")
    print('Confronto delle forme e delle frequenze italiane...',flush=True)
    selected = evidence.finish(frequency)
    audit = evidence.audit(selected)
    if con.execute('PRAGMA data_version').fetchone()[0]!=baseline:
        raise ValueError('Il database è cambiato durante il calcolo: ripetere la normalizzazione')
    report = {'policy':POLICY,'database':str(DEFAULT_DB),'source_table':'parole','target_table':'normalizzata',
              'source_words':total,'single_words':len(known),'excluded':len(selected),
              'normalized_words':total-len(selected),'source_words_sha256':digest.hexdigest(),
              'wordfreq_version':importlib.metadata.version('wordfreq'),'zipf_minimum_filter':None,'audit':audit,
              'rules':dict(Counter(v['rule'] for v in selected.evidence.values())),
              'sources':[{k:s[k] for k in ('source','snapshot','sha256')} for s in sources],
              'examples':[{**v,'word':w,'reason':selected.reasons[w]} for w,v in list(selected.evidence.items())[:20]]}
    return selected,report,baseline


def populate(con, selected, report, baseline, metrics=None):
    # Ogni sostituta deve restare in normalizzata: un errore qui nomina le parole, invece del solo vincolo violato.
    chained = sorted((w, v[0]) for w, v in selected.items() if v and v[0] in selected)
    if chained:
        raise ValueError(f'{len(chained)} sostitute escluse a loro volta, per esempio {chained[:10]}')
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('BEGIN IMMEDIATE')
    try:
        if con.execute('PRAGMA data_version').fetchone()[0]!=baseline:
            raise ValueError('Le parole sono cambiate prima della pubblicazione')
        # normalizzata e le tabelle che la usano sono interamente derivate: si ricreano ogni volta, con lo schema attuale.
        con.execute('DROP TABLE IF EXISTS word_measurements')
        con.execute('DROP TABLE IF EXISTS normalizzazione_esclusioni')
        con.execute('DROP TABLE IF EXISTS normalizzata')
        con.execute('''CREATE TABLE normalizzata(
            parola TEXT PRIMARY KEY REFERENCES parole(parola),
            is_single_word INTEGER NOT NULL CHECK(is_single_word IN (0,1)),
            lexical_validity TEXT NOT NULL CHECK(lexical_validity IN ('VALID','REVIEW_REQUIRED','REJECTED','UNKNOWN')),
            word_prevalence REAL,
            contextual_diversity INTEGER CHECK(contextual_diversity IS NULL OR contextual_diversity>=0),
            frequency INTEGER CHECK(frequency IS NULL OR frequency>=0),
            iwfs REAL CHECK(iwfs IS NULL OR (iwfs>=0 AND iwfs<=100)),
            iwfs_status TEXT NOT NULL CHECK(iwfs_status IN ('FULL','PARTIAL','DIAGNOSTIC','UNAVAILABLE')),
            iwfs_confidence TEXT NOT NULL CHECK(iwfs_confidence IN ('HIGH','MEDIUM','LOW','NONE')),
            familiarity_band TEXT CHECK(familiarity_band IS NULL OR familiarity_band IN ('MOLTO_FAMILIARE','FAMILIARE','POCO_FAMILIARE','RARA'))
            ) STRICT, WITHOUT ROWID''')
        con.execute('''CREATE TABLE word_measurements(
            parola TEXT NOT NULL REFERENCES normalizzata(parola),
            metric TEXT NOT NULL CHECK(metric IN ('prevalence','contextual_diversity','frequency')),
            value_raw REAL,
            value_normalized REAL CHECK(value_normalized IS NULL OR (value_normalized>=0 AND value_normalized<=100)),
            status TEXT NOT NULL CHECK(status IN ('OBSERVED','ESTIMATED','MISSING','NOT_APPLICABLE')),
            sample_size INTEGER,
            source_id TEXT NOT NULL,source_version TEXT,normalization_version TEXT NOT NULL,
            PRIMARY KEY(parola,metric)) STRICT, WITHOUT ROWID''')
        # sostituita_da è vuoto per le forme verbali il cui infinito non è nella raccolta.
        con.execute('''CREATE TABLE normalizzazione_esclusioni(
            parola TEXT PRIMARY KEY REFERENCES parole(parola),
            sostituita_da TEXT REFERENCES normalizzata(parola),
            motivo TEXT NOT NULL,dettagli_json TEXT NOT NULL) STRICT, WITHOUT ROWID''')
        con.execute('CREATE TEMP TABLE excluded_words(parola TEXT PRIMARY KEY) WITHOUT ROWID')
        con.executemany('INSERT INTO excluded_words VALUES (?)',((w,) for w in selected))
        kept_rows = con.execute('''SELECT p.parola,p.is_single_word FROM parole p
                       WHERE NOT EXISTS (SELECT 1 FROM excluded_words e WHERE e.parola=p.parola)''').fetchall()
        # IWFS (specifica database/IWFS_Specifica_Indice_Familiarita_Italiano_v1.0.md): Word Prevalence, Contextual Diversity e
        # frequenza per ogni parola tenuta, con stato dei dati, confidence e fascia. NULL = non misurata.
        metrics = metrics or raw_word_metrics.load()
        sources_by_word = {w:set(f.split(',')) for w,f in con.execute('SELECT parola,group_concat(fonte_id) FROM parole_fonti GROUP BY parola')}
        table,measurements,summary = raw_word_familiarity.compute(kept_rows,sources_by_word,metrics)
        con.executemany('INSERT INTO normalizzata VALUES (?,?,?,?,?,?,?,?,?,?)',table)
        con.executemany('INSERT INTO word_measurements VALUES (?,?,?,?,?,?,?,?,?)',measurements)
        report['iwfs'] = {**summary,'metrics_version':raw_word_metrics.VERSION,'sources':metrics.sources}
        con.execute("INSERT OR REPLACE INTO meta VALUES ('iwfs_model',?)",(json.dumps(report['iwfs'],ensure_ascii=False),))
        con.executemany('INSERT INTO normalizzazione_esclusioni VALUES (?,?,?,?)',
                        ((w,v[0] if v else None,selected.reasons[w],json.dumps(selected.evidence[w],ensure_ascii=False))
                         for w,v in selected.items()))
        kept = con.execute('SELECT count(*) FROM normalizzata').fetchone()[0]
        if kept!=report['normalized_words'] or con.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Conteggi o riferimenti della normalizzazione non validi')
        if con.execute('SELECT count(*) FROM parole').fetchone()[0]!=report['source_words']:
            raise ValueError('La raccolta originale è cambiata')
        con.execute("INSERT OR REPLACE INTO meta VALUES ('normalizzazione_stato','aggiornata')")
        con.execute("INSERT OR REPLACE INTO meta VALUES ('normalizzazione_report',?)",
                    (json.dumps(report,ensure_ascii=False),))
        con.execute('DROP TABLE excluded_words')
        con.execute('COMMIT')
    except BaseException:
        con.execute('ROLLBACK')
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=Path,default=DEFAULT_DB)
    parser.add_argument('--report',type=Path,default=ROOT/'gioco-zeroassociations/reports/normalizzazione_raw_2.0.json')
    parser.add_argument('--backup-root',type=Path,default=ROOT/'gioco-zeroassociations/database-backups')
    parser.add_argument('--plan',action='store_true',help='Calcola il piano senza popolare le tabelle')
    args = parser.parse_args(argv)
    database = args.db.resolve()
    if not database.is_file():
        raise FileNotFoundError('Eseguire prima Aggiornamento parole RAW per creare il DB 2.0')
    with FileLock(str(database)+'.raw-update.lock',timeout=0):
        with closing(sqlite3.connect(database.as_uri()+'?mode=rw',uri=True,timeout=30,isolation_level=None)) as con:
            if con.execute("SELECT value FROM meta WHERE name='schema_version'").fetchone()!=(VERSION,):
                raise ValueError('Il normalizzatore richiede il secondo archivio RAW 2.0')
            selected,report,baseline = analyze(con)
            report.update({'database':str(database),'completed_at_utc':datetime.now(timezone.utc).isoformat(),
                           'published':not args.plan})
            if not args.plan:
                stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                backup = args.backup_root/f'normalizzata-{stamp}.sqlite3'
                backup.parent.mkdir(parents=True,exist_ok=True)
                print('Backup prima della normalizzazione:',backup,flush=True)
                with closing(sqlite3.connect(backup)) as target:
                    con.backup(target)
                report['backup'] = str(backup)
                print('Word Prevalence (ICP) e Contextual Diversity (SUBTLEX-IT): download o cache...',flush=True)
                metrics = raw_word_metrics.load()  # prima della transazione: un download fallito non tocca il DB
                populate(con,selected,report,baseline,metrics)
            args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(json.dumps({k:report[k] for k in ('source_words','normalized_words','excluded','published','rules')},ensure_ascii=False),flush=True)
            audit = report['audit']
            residue = audit['residual_inflected_forms']
            print(f"Controlli: {audit['reference_checks']['checked']} parole di riferimento, {len(audit['reference_checks']['failed'])} non conformi; "
                  f"plurali e femminili con lemma presente ancora in normalizzata: {residue['total']}, sospetti {residue['suspect']} (limite {residue['limit']}) {residue['by_reason']}; "
                  f"omografi tenuti: {audit['homographs_kept']['total']}; plurali più comuni: {audit['common_plurals']['total']}",flush=True)
            if not audit['ok']:
                print('ATTENZIONE: controlli non superati:',audit['reference_checks']['failed'] or 'residui oltre il limite',flush=True)
    return 0


if __name__=='__main__':
    raise SystemExit(main())
