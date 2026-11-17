"""Valuta tutto l'inventario per ZeroContext senza modificare il gioco.

Applica le regole della banca alle sole attestazioni correnti, riconoscendo i
tag di UniMorph, GLAFF-IT e Flex_it. Salva un esito per ogni termine nel DB raw;
mantiene separati sostantivi segreti, riserva estesa e tentativi con vettore.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import closing
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile

import numpy as np

import build_context_bank as bank
import build_context_data as data
from inventory_evidence import upos, source_family
from context_vocabulary import inventory_vocab
import json_store
import unified_db

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
REPORTS = HERE / 'reports'
NEW_MORPHOLOGY = {'unimorph-ita', 'glaffit', 'flex-it-nouns', 'flex-it-adjectives'}
DICTIONARIES = bank.DICT | {source_family(s) for s in NEW_MORPHOLOGY}
MORPHOLOGY = {bank.MORPHIT, 'unimorph-ita'}
POLICY_FILES = [HERE / name for name in (
    'README.md', 'script/build_context_bank.py', 'script/build_context_data.py',
    'context_bank_exclusions.txt', 'script/evaluate_context_inventory.py', 'script/context_vocabulary.py')]
DDL = '''
CREATE TABLE IF NOT EXISTS raw__context_evaluation_runs(
 n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, evaluated_at TEXT NOT NULL,
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 summary_json TEXT NOT NULL CHECK(json_valid(summary_json))
) STRICT;
CREATE TABLE IF NOT EXISTS raw__context_evaluation_codes(
 n INTEGER PRIMARY KEY, role TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
 UNIQUE(role,status,reason)
) STRICT;
CREATE TABLE IF NOT EXISTS raw__context_evaluation_terms(
 run INTEGER NOT NULL REFERENCES raw__context_evaluation_runs(n),
 prompt TEXT NOT NULL,
 secret_code INTEGER NOT NULL REFERENCES raw__context_evaluation_codes(n),
 guess_code INTEGER NOT NULL REFERENCES raw__context_evaluation_codes(n),
 in_inventory INTEGER NOT NULL CHECK(in_inventory IN (0,1)),
 livecade INTEGER NOT NULL CHECK(livecade IN (0,1)),
 current_secret INTEGER NOT NULL CHECK(current_secret IN (0,1)),
 current_vocab INTEGER NOT NULL CHECK(current_vocab IN (0,1)),
 fasttext INTEGER NOT NULL CHECK(fasttext IN (0,1)),
 numberbatch INTEGER NOT NULL CHECK(numberbatch IN (0,1)),
 details_json TEXT CHECK(details_json IS NULL OR json_valid(details_json)),
 PRIMARY KEY(run,prompt)
) STRICT, WITHOUT ROWID;
CREATE VIEW IF NOT EXISTS raw__context_evaluation_results AS
 SELECT r.id AS run_id,t.prompt,s.status AS secret_status,s.reason AS secret_reason,
 g.status AS guess_status,g.reason AS guess_reason,
 t.in_inventory,t.livecade,t.current_secret,t.current_vocab,t.fasttext,t.numberbatch,t.details_json
 FROM raw__context_evaluation_terms t JOIN raw__context_evaluation_runs r ON r.n=t.run
 JOIN raw__context_evaluation_codes s ON s.n=t.secret_code
 JOIN raw__context_evaluation_codes g ON g.n=t.guess_code;
'''


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def rows_digest(rows):
    h = hashlib.sha256()
    for row in rows:
        h.update(dumps(row).encode('utf-8')); h.update(b'\n')
    return h.hexdigest()


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def empty_features():
    return {'N': set(), 'A': set(), 'V': set(), 'O': set(), 'src': set(),
            'inflN': {}, 'inflO': set(), 'prop': set(), 'tags': {}, 'udN': 0, 'udX': 0}


def add_evidence(f, word, source, source_kind, role, pos, lemma, details):
    fam = source_family(source)
    f['src'].add(fam)
    if source in NEW_MORPHOLOGY:
        k = {'NOUN': 'N', 'ADJ': 'A', 'VERB': 'V', 'AUX': 'V'}.get(upos(source_kind, pos, role), 'O')
    else:
        k = bank.kind(source, pos)
    if role == 'lemma':
        if k != '?': f[k].add(fam)
        if fam == 'ud': f['udN' if k == 'N' else 'udX'] += 1
        elif source == 'nvdb-de-mauro-2016': f['nvdb'] = pos
        elif source == 'itaoa-montefinese-2019': f['aoa'] = json.loads(details).get('aoa_mean')
        elif source.startswith('kaikki') and k == 'N':
            entry = json.loads(details)
            # Le etichette globali valgono anche quando non sono ripetute nei sensi.
            global_tags = entry.get('entry_tags', [])
            senses = [list(set(s.get('tags', [])) | set(global_tags)) for s in entry.get('senses', [])]
            if not senses and global_tags: senses = [global_tags]
            f['tags'].setdefault(source, []).append(senses)
    elif role == 'inflected_form':
        if k == 'N': f['inflN'].setdefault(lemma, set()).add(fam)
        else:
            f['inflO'].add(fam)
            if fam == 'ud': f['udX'] += 1
    elif role == 'proper_name': f['prop'].add(fam)
    elif role == 'frequency_form':
        d = json.loads(details)
        # Le frequenze Flex_it non sono conteggi OpenSubtitles.
        if source == 'wordfreq-it-local' and 'rank' in d:
            f['wf'] = min(f.get('wf', d['rank']), d['rank'])
        if source == 'frequencywords-it-2018' and 'frequency' in d:
            f['os'] = max(f.get('os', d['frequency']), d['frequency'])


def collect_batch(con, words, sources, roles, tags):
    feats = {w: empty_features() for w in words if bank.WORD.fullmatch(w)}
    con.execute('DELETE FROM context_targets')
    con.executemany('INSERT INTO context_targets VALUES (?)', ((w,) for w in feats))
    # La vista ricostruisce i dettagli compatti (prompt_inventory_schema.sql) e legge le righe per voce.
    query = '''SELECT a.prompt,a.snapshot,a.role,a.pos,a.lemma,a.details_json
        FROM context_targets t CROSS JOIN raw__inventory_attestation_rows_json a ON a.prompt=t.word'''
    for w, sid, role, pos, lemma, details in con.execute(query):
        if sid in sources:
            source, kind = sources[sid]
            add_evidence(feats[w], w, source, kind, roles[role], tags[pos], lemma, details)
    return feats


def evaluate(word, f, *, excluded, fasttext, base_vocab, livecade, expanded_vocab=(), current_vocab=()):
    """Due esiti indipendenti. La provenienza Livecade resta un dato, non una prova."""
    tier = None
    if not data.WORD.fullmatch(word):
        reason = 'lunghezza' if word and all(c in 'abcdefghijklmnopqrstuvwxyzàèéìòù' for c in word) else 'formato'
        secret = ('ESCLUSA', reason)
    elif not bank.WORD.fullmatch(word): secret = ('ESCLUSA', 'lunghezza_4_14')
    elif word in excluded: secret = ('ESCLUSA', 'esclusione_editoriale')
    else:
        tier = bank.decide(word, f, dictionary_sources=DICTIONARIES, morphology_sources=MORPHOLOGY)
        if tier.startswith('-'): secret = ('ESCLUSA', tier[1:])
        elif tier == 'esteso': secret = ('RISERVA_ESTESA', tier)
        elif word not in fasttext: secret = ('DA_VETTORIZZARE', tier)
        else: secret = ('CANDIDATA_SEGRETA', tier)
    if not data.WORD.fullmatch(word): guess = ('ESCLUSA', 'formato_o_lunghezza_3_16')
    elif word not in fasttext: guess = ('NON_GIOCABILE', 'vettore_fasttext_assente')
    elif word in base_vocab: guess = ('CANDIDATA_VOCAB', 'selezione_frequenze')
    elif word in expanded_vocab: guess = ('CANDIDATA_VOCAB', 'inventario_lessicale')
    elif word in current_vocab: guess = ('CANDIDATA_VOCAB', 'vocabolario_conservato')
    elif word in livecade: guess = ('CANDIDATA_VOCAB', 'banca_livecade')
    elif tier and not tier.startswith('-'): guess = ('CANDIDATA_VOCAB', 'banca_sostantivi')
    else: guess = ('NON_SELEZIONATA', 'fuori_selezione_frequenze_e_banca')
    return secret, guess


def feature_summary(f):
    return {'noun_families': sorted(f['N'] & DICTIONARIES), 'adjective_families': sorted(f['A'] & DICTIONARIES),
            'verb_families': sorted(f['V'] & DICTIONARIES), 'source_families': sorted(f['src']),
            'other_noun_lemmas': sorted(l for l in f['inflN'] if l), 'proper_families': sorted(f['prop']),
            'wordfreq_rank': f.get('wf'), 'opensubtitles_frequency': f.get('os'),
            'nvdb': f.get('nvdb'), 'aoa': f.get('aoa'), 'ud_nouns': f['udN'], 'ud_other': f['udX']}


def heads(con):
    return list(con.execute('''SELECT h.source_key,h.snapshot_id,s.sha256,s.records,i.kind,r.enabled
        FROM raw__inventory_source_heads h JOIN raw__inventory_snapshots s ON s.id=h.snapshot_id
        JOIN raw__inventory_sources i ON i.source_key=h.source_key
        JOIN raw__inventory_registered_sources r ON r.source_key=h.source_key ORDER BY h.source_key'''))


def game_snapshot(con):
    return {name: list(con.execute(query)) for name, query in {
        'vocab': 'SELECT idx,word FROM context__vocab ORDER BY idx',
        'secrets': 'SELECT word FROM context__secrets ORDER BY word',
        'meta': 'SELECT name,value FROM context__meta ORDER BY name'}.items()}


def load_vector_words(name):
    path = data.CACHE / f'{name}_words.txt'
    matrix = np.load(data.CACHE / f'{name}_vectors.npy', mmap_mode='r')
    lines = path.read_text(encoding='utf-8').split('\n')
    if matrix.ndim != 2 or matrix.shape[1] != 300: raise ValueError(f'Matrice {name} non valida')
    if not np.isfinite(matrix).all(): raise ValueError(f'Vettori {name} non finiti')
    index = {w: i for i, w in reversed(list(enumerate(lines[:len(matrix)]))) if data.WORD.fullmatch(w)}
    if any(lines[len(matrix):]): raise ValueError(f'Indice {name} oltre la matrice')
    return index


def save_to_raw(raw_path, staged, manifest, report):
    """Pubblica soltanto un audit completo, con input ancora identici."""
    with closing(sqlite3.connect(raw_path, timeout=60)) as con:
        con.execute('PRAGMA foreign_keys=ON')
        con.executescript(DDL)
        json_store.compact(con, 'raw__context_evaluation_terms')  # documenti in un dizionario JSONB, vista come prima
        con.execute('ATTACH DATABASE ? AS evaluated', (str(staged),))
        con.execute('BEGIN IMMEDIATE')
        if heads(con) != manifest['active_snapshots']: raise RuntimeError('Fonti cambiate durante la valutazione')
        if con.execute('SELECT count(*) FROM raw__inventory_terms').fetchone()[0] != manifest['inventory_terms']:
            raise RuntimeError('Inventario cambiato durante la valutazione')
        if rows_digest(w for w, in con.execute('SELECT prompt FROM raw__inventory_terms ORDER BY prompt')) != manifest['inventory_sha256']:
            raise RuntimeError('Termini cambiati durante la valutazione')
        old = con.execute('SELECT n FROM raw__context_evaluation_runs WHERE id=?', (report['run_id'],)).fetchone()
        if old:
            con.rollback()
            return old[0]
        run = con.execute('INSERT INTO raw__context_evaluation_runs(id,evaluated_at,manifest_json,summary_json) '
            'VALUES (?,?,?,?)', (report['run_id'], report['evaluated_at'], dumps(manifest), dumps(report['summary']))).lastrowid
        con.execute('INSERT OR IGNORE INTO raw__context_evaluation_codes(role,status,reason) '
                    'SELECT role,status,reason FROM evaluated.codes')
        con.execute('''INSERT INTO raw__context_evaluation_terms
            SELECT ?,t.prompt,s.n,g.n,t.in_inventory,t.livecade,t.current_secret,t.current_vocab,
                t.fasttext,t.numberbatch,t.details_json
            FROM evaluated.terms t JOIN evaluated.codes es ON es.n=t.secret_code
            JOIN evaluated.codes eg ON eg.n=t.guess_code
            JOIN raw__context_evaluation_codes s ON s.role=es.role AND s.status=es.status AND s.reason=es.reason
            JOIN raw__context_evaluation_codes g ON g.role=eg.role AND g.status=eg.status AND g.reason=eg.reason''', (run,))
        n = con.execute('SELECT count(*) FROM raw__context_evaluation_terms WHERE run=?', (run,)).fetchone()[0]
        if n != report['summary']['evaluated_terms']: raise RuntimeError('Copertura incompleta')
        con.commit()
    unified_db.register_objects('raw')
    return run


def export(con, path, predicate):
    query = '''SELECT t.prompt,s.status,s.reason,g.status,g.reason,t.in_inventory,t.livecade,
        t.current_secret,t.current_vocab,t.fasttext,t.numberbatch,t.details_json
        FROM terms t JOIN codes s ON s.n=t.secret_code JOIN codes g ON g.n=t.guess_code WHERE ''' + predicate + ' ORDER BY t.prompt'
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        cursor = con.execute(query)
        writer.writerow([d[0] for d in cursor.description])
        writer.writerows(cursor)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--vocab', type=int, default=60000)
    ap.add_argument('--batch-size', type=int, default=20000)
    args = ap.parse_args()
    if args.vocab <= 0 or args.batch_size <= 0: ap.error('Parametri positivi richiesti')
    REPORTS.mkdir(exist_ok=True)
    raw_path = unified_db.UNIFIED
    raw = readonly(raw_path)
    raw.execute('BEGIN')
    active = heads(raw)
    inventory = {w for w, in raw.execute('SELECT prompt FROM raw__inventory_terms')}
    games_path = ROOT / 'database/giochi.sqlite3'
    with closing(readonly(games_path)) as games: current = game_snapshot(games)
    current_vocab = {w for _, w in current['vocab']}
    current_secret = {w for w, in current['secrets']}
    current_meta = dict(current['meta'])
    if [i for i, w in current['vocab']] != list(range(len(current_vocab))):
        raise ValueError('Indici del vocabolario non contigui o parole duplicate')
    if not current_secret <= current_vocab: raise ValueError('Segrete fuori dal vocabolario')
    if int(current_meta['words']) != len(current_vocab) or int(current_meta['secrets']) != len(current_secret):
        raise ValueError('Metadati del gioco non coerenti')
    from publish_context import active_vectors
    current_vectors = active_vectors({k: json.loads(v) for k, v in current_meta.items()}, HERE / 'data')
    if current_vectors.stat().st_size != len(current_vocab)*int(current_meta['dim']):
        raise ValueError('Vocabolario e vettori di gioco non allineati')
    with bank.LIVECADE_CSV.open(encoding='utf-8-sig', newline='') as stream:
        livecade = {r['word'] for r in csv.DictReader(stream)}
    with bank.OUT_CSV.open(encoding='utf-8-sig', newline='') as stream:
        old_bank = {r['word'] for r in csv.DictReader(stream)}
    fasttext = load_vector_words('fasttext_it')
    numberbatch = load_vector_words('numberbatch_it')
    base_vocab = set(data.build_vocab(fasttext, [], args.vocab))
    print('Selezione del vocabolario attestato...', flush=True)
    expanded_vocab, lexical_snapshots = inventory_vocab(fasttext, raw_path)
    with data.FREQ.open(encoding='utf-8-sig', newline='') as stream:
        frequencies = {w for w, rank in list(csv.reader(stream))[1:] if data.WORD.fullmatch(w)}
    words = sorted(inventory | set(fasttext) | set(numberbatch) | frequencies | current_vocab | current_secret | livecade | old_bank)
    files = POLICY_FILES + [ROOT / 'gioco-zeroassociations/script/inventory_evidence.py']
    files += [bank.LIVECADE_CSV, bank.OUT_CSV, bank.OUT_META, data.FREQ,
              current_vectors]
    files += [data.CACHE / f'{name}_{part}' for name in ('fasttext_it', 'numberbatch_it')
              for part in ('words.txt', 'vectors.npy')]
    file_hashes = {str(p.relative_to(ROOT)): sha(p) for p in files}
    manifest = {'version': 1, 'inventory_terms': len(inventory), 'active_snapshots': active,
        'inventory_sha256': rows_digest(sorted(inventory)), 'scope_sha256': rows_digest(words),
        'files_sha256': file_hashes, 'game_sha256': rows_digest(sorted(current.items())),
        'vocab_limit': args.vocab, 'base_vocab_count': len(base_vocab),
        'attested_vocab_count': len(expanded_vocab), 'lexical_snapshots': lexical_snapshots,
        'dictionary_families': sorted(DICTIONARIES), 'morphology_families': sorted(MORPHOLOGY),
        'legacy_policy': 'Valutata anche Livecade; provenienza conservata separatamente dagli esiti',
        'scope': 'Inventario completo, banche, gioco attuale, frequenze e parole con vettori disponibili'}
    report = {'run_id': hashlib.sha256(dumps(manifest).encode('utf-8')).hexdigest(),
              'evaluated_at': datetime.now(timezone.utc).isoformat(), 'manifest': manifest}
    sources = {n: (key, kind) for n, key, kind in raw.execute('''SELECT n.n,h.source_key,i.kind
        FROM raw__inventory_source_heads h JOIN raw__inventory_snapshot_numbers n ON n.snapshot_id=h.snapshot_id
        JOIN raw__inventory_sources i USING(source_key)
        JOIN raw__inventory_registered_sources r USING(source_key) WHERE r.enabled=1''')}
    roles = dict(raw.execute('SELECT n,role FROM raw__inventory_attestation_roles'))
    tags = dict(raw.execute('SELECT n,pos FROM raw__inventory_attestation_pos'))
    raw.execute('CREATE TEMP TABLE context_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
    excluded = bank.load_exclusions()
    summary = {'evaluated_terms': len(words), 'inventory_terms': len(inventory), 'extra_terms': len(words)-len(inventory),
        'current_vocab': len(current_vocab), 'current_secrets': len(current_secret), 'livecade': len(livecade),
        'fasttext_words': len(fasttext), 'numberbatch_words': len(numberbatch)}
    counts = {name: Counter() for name in ('secret', 'guess', 'current_secret', 'current_vocab', 'new_secret', 'new_vocab')}
    print(dumps(summary), flush=True)
    with tempfile.TemporaryDirectory(prefix='zerocontext-evaluation-') as folder:
        staged = Path(folder) / 'evaluation.sqlite3'
        with closing(sqlite3.connect(staged)) as out:
            out.executescript('''CREATE TABLE codes(n INTEGER PRIMARY KEY,role TEXT,status TEXT,reason TEXT,
                UNIQUE(role,status,reason));
                CREATE TABLE terms(prompt TEXT PRIMARY KEY,secret_code INTEGER,guess_code INTEGER,
                in_inventory INTEGER,livecade INTEGER,current_secret INTEGER,current_vocab INTEGER,
                fasttext INTEGER,numberbatch INTEGER,details_json TEXT) WITHOUT ROWID;''')
            codes = {}
            def code(role, verdict):
                key = (role, *verdict)
                if key not in codes:
                    codes[key] = out.execute('INSERT INTO codes(role,status,reason) VALUES (?,?,?)', key).lastrowid
                return codes[key]
            for offset in range(0, len(words), args.batch_size):
                chunk = words[offset:offset+args.batch_size]
                features = collect_batch(raw, chunk, sources, roles, tags)
                values = []
                for word in chunk:
                    f = features.get(word)
                    secret, guess = evaluate(word, f, excluded=excluded, fasttext=fasttext, base_vocab=base_vocab,
                                             livecade=livecade, expanded_vocab=expanded_vocab, current_vocab=current_vocab)
                    counts['secret']['/'.join(secret)] += 1; counts['guess']['/'.join(guess)] += 1
                    if word in current_secret: counts['current_secret']['/'.join(secret)] += 1
                    if word in current_vocab: counts['current_vocab']['/'.join(guess)] += 1
                    if word not in current_secret and secret[0] == 'CANDIDATA_SEGRETA': counts['new_secret'][secret[1]] += 1
                    if word not in current_vocab and guess[0] == 'CANDIDATA_VOCAB': counts['new_vocab'][guess[1]] += 1
                    details = dumps(feature_summary(f)) if f else None
                    values.append((word, code('secret', secret), code('guess', guess), int(word in inventory),
                        int(word in livecade), int(word in current_secret), int(word in current_vocab),
                        int(word in fasttext), int(word in numberbatch), details))
                out.executemany('INSERT INTO terms VALUES (?,?,?,?,?,?,?,?,?,?)', values)
                out.commit()
                print(f'Valutate {min(offset+len(chunk), len(words))}/{len(words)}', flush=True)
            summary.update({key: dict(sorted(value.items())) for key, value in counts.items()})
            summary['candidate_secrets'] = out.execute("SELECT count(*) FROM terms t JOIN codes c ON c.n=t.secret_code WHERE c.status='CANDIDATA_SEGRETA'").fetchone()[0]
            summary['current_secrets_to_review'] = len(current_secret)-sum(v for k,v in counts['current_secret'].items() if k.startswith('CANDIDATA_SEGRETA/'))
            summary['new_vocab_candidates'] = sum(counts['new_vocab'].values())
            summary['current_vocab_outside_rebuild'] = len(current_vocab)-sum(v for k,v in counts['current_vocab'].items() if k.startswith('CANDIDATA_VOCAB/'))
            if out.execute('SELECT count(*) FROM terms').fetchone()[0] != len(words): raise RuntimeError('Copertura incompleta')
            if out.execute('PRAGMA quick_check').fetchone()[0] != 'ok': raise RuntimeError('Audit non integro')
            raw.rollback(); raw.close()
            # Nessun file di ingresso o dato di gioco deve cambiare prima della pubblicazione.
            changed = [p for p, expected in file_hashes.items() if sha(ROOT / p) != expected]
            if changed: raise RuntimeError('File di ingresso cambiati: ' + ', '.join(changed))
            with closing(readonly(games_path)) as games:
                if game_snapshot(games) != current: raise RuntimeError('Gioco cambiato durante la valutazione')
            report['summary'] = summary
            report['database_run'] = save_to_raw(raw_path, staged, manifest, report)
            for filename, predicate in {
                'secret_candidates.csv': "s.status='CANDIDATA_SEGRETA'",
                'current_secrets_review.csv': "t.current_secret=1 AND s.status!='CANDIDATA_SEGRETA'",
                'new_vocab_candidates.csv': "t.current_vocab=0 AND g.status='CANDIDATA_VOCAB'",
                'missing_vectors.csv': "s.status='DA_VETTORIZZARE'",
                'extended_reserve.csv': "s.status='RISERVA_ESTESA'"}.items():
                export(out, REPORTS / filename, predicate)
    (REPORTS / 'inventory_evaluation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(dumps({'run_id': report['run_id'], 'summary': summary}), flush=True)


if __name__ == '__main__': main()
