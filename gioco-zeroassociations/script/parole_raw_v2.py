"""Archivio RAW 2.0: parole uniche, fonti e acquisizioni, senza scarti editoriali."""
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3

from collect_prompt_sources import checksum
from inventory_updates import fetch_current
from prompt_inventory import normalize, records, SINGLE_WORD
from raw_language_filter import foreign_language, has_italian_frequency, spelling_oddity, ITALIAN_EVIDENCE, SPELLING, VERSION as LANGUAGE_VERSION
from raw_person_names import scan_wiktextract, LEXICAL_SOURCES, VERSION as NAMES_VERSION
from raw_word_cleaning import clean_word, clean_existing, VERSION as CLEANUP_VERSION

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / 'database/parole_ita_raw_2.0.sqlite3'
LEGACY_DB = ROOT / 'database/parole_ita_raw.sqlite3'
VERSION = 'parole-raw-2.0'
OBSOLETE_TABLES = ('pulizia_parole', 'parole_straniere', 'nomi_persona')

SCHEMA = '''
CREATE TABLE IF NOT EXISTS meta(name TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS parole(
 parola TEXT PRIMARY KEY,is_single_word INTEGER NOT NULL CHECK(is_single_word IN (0,1))
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS fonti(
 id TEXT PRIMARY KEY,nome TEXT NOT NULL,tipo TEXT NOT NULL,url TEXT NOT NULL,
 licenza TEXT NOT NULL,attribuzione TEXT NOT NULL,config_json TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS parole_fonti(
 parola TEXT NOT NULL REFERENCES parole(parola),fonte_id TEXT NOT NULL REFERENCES fonti(id),
 PRIMARY KEY(parola,fonte_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS parole_fonti_fonte ON parole_fonti(fonte_id);
CREATE TABLE IF NOT EXISTS inventory_snapshots(
 id TEXT PRIMARY KEY,source_key TEXT NOT NULL REFERENCES fonti(id),sha256 TEXT NOT NULL,
 acquired_at TEXT NOT NULL,cache_path TEXT NOT NULL,records INTEGER NOT NULL,
 source_config_json TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS inventory_http_cache(
 source_key TEXT NOT NULL REFERENCES fonti(id),url TEXT NOT NULL,etag TEXT,last_modified TEXT,
 cache_path TEXT NOT NULL,sha256 TEXT NOT NULL,checked_at TEXT NOT NULL,
 PRIMARY KEY(source_key,url)
) STRICT, WITHOUT ROWID;
'''


SAMPLE_SIZE = 200


def sample_words(words, size=SAMPLE_SIZE):
    """Un campione uniforme e ripetibile dell'elenco ordinato, per controllare a occhio cosa ha tolto un filtro."""
    words = sorted(words)
    if len(words) <= size:
        return words
    return [words[i * len(words) // size] for i in range(size)]


def now():
    return datetime.now(timezone.utc).isoformat()


class WordDatabase:
    def __init__(self, path):
        self.file = Path(path).resolve()
        self.schema = None
        if self.file == LEGACY_DB.resolve() or '#' in str(self.file):
            raise ValueError('Usare il secondo database RAW 2.0, non il database originale')
        self.file.parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(self.file.as_uri(), uri=True, timeout=30, isolation_level=None)
        try:
            tables = {r[0] for r in self.con.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            if tables:
                version = self.con.execute("SELECT value FROM meta WHERE name='schema_version'").fetchone() if 'meta' in tables else None
                if version != (VERSION,):
                    raise ValueError('Il file esistente non è un archivio parole RAW 2.0')
            self.con.execute('PRAGMA foreign_keys=ON')
            self.con.executescript(SCHEMA)
            for table in OBSOLETE_TABLES:  # eliminate il 18/11/2026: non si conservano più registri delle parole scartate
                self.con.execute('DROP TABLE IF EXISTS '+table)
            self.con.execute("INSERT OR IGNORE INTO meta VALUES ('schema_version',?)", (VERSION,))
            if self.con.execute('SELECT count(*) FROM parole').fetchone()[0]==0:
                self.con.execute("INSERT OR IGNORE INTO meta VALUES ('word_cleanup_version',?)",(CLEANUP_VERSION,))
        except BaseException:
            self.con.close()
            raise

    def close(self):
        self.con.close()

    def run(self, sql, *, rows=False):
        # Interfaccia del downloader esistente: cache HTTP e snapshot immutabili.
        cursor = self.con.execute(sql)
        if rows:
            names = [d[0] for d in cursor.description]
            return [dict(zip(names, row)) for row in cursor.fetchall()]
        return ''

    def register(self, sources):
        with self.con:
            self.con.executemany('''INSERT INTO fonti VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,tipo=excluded.tipo,url=excluded.url,
                licenza=excluded.licenza,attribuzione=excluded.attribuzione,config_json=excluded.config_json''',
                ((s['id'],s['name'],s['kind'],s['url'],s['license'],s['attribution'],
                  json.dumps(s,ensure_ascii=False)) for s in sources))

    def counts(self):
        return {name:self.con.execute('SELECT count(*) FROM '+name).fetchone()[0]
                for name in ('parole','fonti','parole_fonti','inventory_snapshots')}

    def clean_existing(self, *, force=False):
        return clean_existing(self.con,force=force)

    def import_source(self, source, path):
        self.clean_existing()
        path = Path(path)
        digest = checksum(path)
        snapshot = hashlib.sha256((source['id']+'\0'+digest).encode()).hexdigest()
        self.register([source])
        if self.con.execute('SELECT 1 FROM inventory_snapshots WHERE id=?',(snapshot,)).fetchone():
            previous = self.con.execute('SELECT value FROM meta WHERE name=?',('head:'+source['id'],)).fetchone()
            self.con.execute('UPDATE inventory_snapshots SET cache_path=?,source_config_json=? WHERE id=?',
                             (str(path.resolve()),json.dumps(source,ensure_ascii=False),snapshot))
            self.con.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('head:'+source['id'],snapshot))
            if previous!=(snapshot,):
                self.con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
            return {'source':source['id'],'status':'UNCHANGED','sha256':digest,'new_words':0}
        before = self.con.execute('SELECT count(*) FROM parole').fetchone()[0]
        count, read_count, foreign, batch = 0, 0, 0, {}

        def flush():
            self.con.executemany('''INSERT INTO parole VALUES (?,?) ON CONFLICT(parola)
                DO UPDATE SET is_single_word=max(parole.is_single_word,excluded.is_single_word)''', batch.items())
            self.con.executemany('INSERT OR IGNORE INTO parole_fonti VALUES (?,?)',
                                 ((w,source['id']) for w in batch))
            batch.clear()

        self.con.execute('BEGIN IMMEDIATE')
        try:
            for row in records(path,source):
                read_count += 1
                word = clean_word(row['prompt'])
                if word is None:
                    continue
                if foreign_language(word) or spelling_oddity(word) == 'hard':
                    foreign += 1
                    continue
                count += 1
                batch[word] = int(bool(SINGLE_WORD.fullmatch(word)))
                if len(batch) >= 10000:
                    flush()
            if batch:
                flush()
            if not read_count:
                raise ValueError('Fonte vuota o formato non riconosciuto')
            if checksum(path) != digest:
                raise ValueError('Il file è cambiato durante la lettura')
            self.con.execute('INSERT INTO inventory_snapshots VALUES (?,?,?,?,?,?,?)',
                             (snapshot,source['id'],digest,now(),str(path.resolve()),read_count,
                              json.dumps(source,ensure_ascii=False)))
            self.con.execute('INSERT OR REPLACE INTO meta VALUES (?,?)',('head:'+source['id'],snapshot))
            self.con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
            self.con.execute('COMMIT')
        except BaseException:
            self.con.execute('ROLLBACK')
            raise
        after = self.con.execute('SELECT count(*) FROM parole').fetchone()[0]
        return {'source':source['id'],'status':'IMPORTED','records':count,'records_read':read_count,
                'non_lexical_records_removed':read_count-count-foreign,'foreign_records_skipped':foreign,'sha256':digest,'new_words':after-before}

    def _delete_words(self, words):
        """Toglie le parole da `parole`, `parole_fonti`, `normalizzata` e dal registro delle esclusioni (dentro la transazione
        del chiamante); l'elenco si tiene solo in una tabella temporanea."""
        self.con.execute('CREATE TEMP TABLE IF NOT EXISTS parole_da_togliere(parola TEXT PRIMARY KEY) WITHOUT ROWID')
        self.con.execute('DELETE FROM parole_da_togliere')
        self.con.executemany('INSERT OR IGNORE INTO parole_da_togliere VALUES (?)', ((w,) for w in words))
        tables = {r[0] for r in self.con.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
        if 'normalizzazione_esclusioni' in tables:
            self.con.execute('''DELETE FROM normalizzazione_esclusioni WHERE parola IN (SELECT parola FROM parole_da_togliere)
                                OR sostituita_da IN (SELECT parola FROM parole_da_togliere)''')
        if 'normalizzata' in tables:
            if 'word_measurements' in tables:
                self.con.execute('DELETE FROM word_measurements WHERE parola IN (SELECT parola FROM parole_da_togliere)')
            self.con.execute('DELETE FROM normalizzata WHERE parola IN (SELECT parola FROM parole_da_togliere)')
        self.con.execute('DELETE FROM parole_fonti WHERE parola IN (SELECT parola FROM parole_da_togliere)')
        self.con.execute('DELETE FROM parole WHERE parola IN (SELECT parola FROM parole_da_togliere)')
        self.con.execute('DROP TABLE parole_da_togliere')

    def remove_foreign_words(self):
        """Toglie dal RAW le parole non italiane (vedi raw_language_filter), con le loro attestazioni e le righe della
        normalizzazione che le nominano. Il rapporto (e `meta.filtro_lingua`) dà i conteggi per lingua. Una sola transazione."""
        evidence_sources = sorted(ITALIAN_EVIDENCE & {r[0] for r in self.con.execute('SELECT id FROM fonti')})
        attested = set()
        if evidence_sources:
            marks = ','.join('?' * len(evidence_sources))
            attested = {w for w, in self.con.execute(f'SELECT DISTINCT parola FROM parole_fonti WHERE fonte_id IN ({marks})', evidence_sources)}
        foreign = []
        for word, in self.con.execute('SELECT parola FROM parole').fetchall():
            lang = foreign_language(word)
            if not lang and (oddity := spelling_oddity(word)):
                if oddity == 'hard' or (word not in attested and not has_italian_frequency(word)):
                    lang = SPELLING
            if lang:
                foreign.append((word, lang))
        self.con.execute('BEGIN IMMEDIATE')
        try:
            self._delete_words(w for w, _ in foreign)
            by_language, words_by_language = {}, {}
            for word, lang in foreign:
                by_language[lang] = by_language.get(lang, 0) + 1
                words_by_language.setdefault(lang, []).append(word)
            report = {'version': LANGUAGE_VERSION, 'words_removed': len(foreign), 'by_language': by_language, 'evidence_sources': evidence_sources,
                      'sample_removed': {lang: sample_words(words) for lang, words in sorted(words_by_language.items())}}
            if foreign:
                self.con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
            self.con.execute("INSERT OR REPLACE INTO meta VALUES ('filtro_lingua',?)", (json.dumps({**report, 'at_utc': now()}),))
            if self.con.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Riferimenti non validi dopo il filtro di lingua')
            self.con.execute('COMMIT')
        except BaseException:
            self.con.execute('ROLLBACK')
            raise
        return report

    def remove_person_names(self):
        """Toglie dal RAW i nomi di battesimo e i cognomi (vedi raw_person_names), con le attestazioni e le righe della
        normalizzazione che li nominano; i conteggi stanno nel rapporto e in `meta.filtro_nomi`. Le fonti Wiktionary senza file in cache non
        contano e sono elencate nel rapporto. Una sola transazione."""
        names, common, skipped = set(), set(), []
        for source_id, in self.con.execute("SELECT id FROM fonti WHERE tipo='wiktextract' ORDER BY id").fetchall():
            path, config = self._head_file(source_id)
            if path is None:
                skipped.append(source_id)
                continue
            found, plain = scan_wiktextract(path, (config or {}).get('encoding', 'utf-8-sig'))
            names |= found
            common |= plain
        lexical = sorted(LEXICAL_SOURCES & {r[0] for r in self.con.execute('SELECT id FROM fonti')})
        attested = set()
        if lexical:
            marks = ','.join('?' * len(lexical))
            attested = {w for w, in self.con.execute(f'SELECT DISTINCT parola FROM parole_fonti WHERE fonte_id IN ({marks})', lexical)}
        stored = {w for w, in self.con.execute('SELECT parola FROM parole')}
        removed = sorted(w for w in names & stored if w not in common and w not in attested)
        self.con.execute('BEGIN IMMEDIATE')
        try:
            if removed:
                self._delete_words(removed)
            report = {'version': NAMES_VERSION, 'words_removed': len(removed), 'person_names_known': len(names),
                      'kept_as_common_words': len(names & stored) - len(removed), 'skipped_sources': skipped,
                      'sample_removed': sample_words(removed),
                      'sample_kept_as_common_words': sample_words(sorted(w for w in names & stored if w in common or w in attested))}
            if removed:
                self.con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
            self.con.execute("INSERT OR REPLACE INTO meta VALUES ('filtro_nomi',?)", (json.dumps({**report, 'at_utc': now()}),))
            if self.con.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Riferimenti non validi dopo il filtro dei nomi')
            self.con.execute('COMMIT')
        except BaseException:
            self.con.execute('ROLLBACK')
            raise
        return report

    def _head_file(self, source_id):
        """Il file in cache della versione attiva di una fonte, o None se non è più sul disco."""
        row = self.con.execute('''SELECT s.cache_path, s.sha256, s.source_config_json FROM meta m
            JOIN inventory_snapshots s ON s.id=m.value WHERE m.name=?''', ('head:'+source_id,)).fetchone()
        if not row:
            return None, None
        path, digest, config = Path(row[0]), row[1], json.loads(row[2])
        if not path.is_file():
            path = next((Path(p) for p, in self.con.execute(
                'SELECT cache_path FROM inventory_http_cache WHERE source_key=? AND sha256=?', (source_id, digest))
                if Path(p).is_file()), None)
        if path is None or checksum(path) != digest:
            return None, None
        return path, config

    def prune_sources(self, registered, refilter_kinds=frozenset({'conllu'})):
        """Allinea la raccolta al registro (17/11/2026): le fonti tolte dal registro perché davano parole straniere
        perdono le loro attestazioni; le fonti dei tipi in `refilter_kinds` si rileggono con le regole attuali di
        `records` (i treebank non danno più token stranieri né nomi propri). Una parola rimasta senza alcuna fonte
        esce da `parole`, e con lei le righe della normalizzazione che la nominano."""
        registered = set(registered)
        removed = sorted({r[0] for r in self.con.execute('SELECT id FROM fonti')} - registered)
        refiltered, skipped, dropped = {}, [], []
        for source_id, kind in self.con.execute('SELECT id, tipo FROM fonti ORDER BY id').fetchall():
            if source_id in removed or kind not in refilter_kinds:
                continue
            path, config = self._head_file(source_id)
            if path is None:
                skipped.append(source_id)
                continue
            keep = {w for row in records(path, config) if (w := clean_word(row['prompt'])) is not None}
            stale = [w for w, in self.con.execute('SELECT parola FROM parole_fonti WHERE fonte_id=?', (source_id,)) if w not in keep]
            refiltered[source_id] = len(stale)
            dropped += [(w, source_id) for w in stale]
        self.con.execute('BEGIN IMMEDIATE')
        try:
            self.con.execute('CREATE TEMP TABLE IF NOT EXISTS pruned_words(parola TEXT PRIMARY KEY) WITHOUT ROWID')
            self.con.execute('DELETE FROM pruned_words')
            self.con.executemany('INSERT OR IGNORE INTO pruned_words VALUES (?)', ((w,) for w, _ in dropped))
            attestations = len(dropped)
            if removed:
                marks = ','.join('?' * len(removed))
                attestations += self.con.execute(f'SELECT count(*) FROM parole_fonti WHERE fonte_id IN ({marks})', removed).fetchone()[0]
                self.con.execute(f'INSERT OR IGNORE INTO pruned_words SELECT parola FROM parole_fonti WHERE fonte_id IN ({marks})', removed)
                self.con.execute(f'DELETE FROM parole_fonti WHERE fonte_id IN ({marks})', removed)
            self.con.executemany('DELETE FROM parole_fonti WHERE parola=? AND fonte_id=?', dropped)
            # Solo le parole toccate qui e rimaste senza fonte: quelle senza fonte da prima (copia storica) restano.
            self.con.execute('DELETE FROM pruned_words WHERE EXISTS (SELECT 1 FROM parole_fonti f WHERE f.parola=pruned_words.parola)')
            orphans = self.con.execute('SELECT count(*) FROM pruned_words').fetchone()[0]
            tables = {r[0] for r in self.con.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
            if orphans:
                if 'normalizzazione_esclusioni' in tables:
                    self.con.execute('''DELETE FROM normalizzazione_esclusioni WHERE parola IN (SELECT parola FROM pruned_words)
                                        OR sostituita_da IN (SELECT parola FROM pruned_words)''')
                if 'normalizzata' in tables:
                    if 'word_measurements' in tables:
                        self.con.execute('DELETE FROM word_measurements WHERE parola IN (SELECT parola FROM pruned_words)')
                    self.con.execute('DELETE FROM normalizzata WHERE parola IN (SELECT parola FROM pruned_words)')
                self.con.execute('DELETE FROM parole WHERE parola IN (SELECT parola FROM pruned_words)')
                self.con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
            for source_id in removed:
                self.con.execute('DELETE FROM inventory_http_cache WHERE source_key=?', (source_id,))
                self.con.execute('DELETE FROM inventory_snapshots WHERE source_key=?', (source_id,))
                self.con.execute('DELETE FROM meta WHERE name=?', ('head:'+source_id,))
                self.con.execute('DELETE FROM fonti WHERE id=?', (source_id,))
            report = {'removed_sources': removed, 'refiltered_sources': refiltered, 'refilter_skipped_no_cache': skipped,
                      'attestations_removed': attestations, 'words_removed': orphans}
            if removed or dropped:
                self.con.execute("INSERT OR REPLACE INTO meta VALUES ('fonti_potatura',?)",
                                 (json.dumps({**report, 'at_utc': now()}, ensure_ascii=False),))
            if self.con.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Riferimenti non validi dopo la potatura delle fonti')
            self.con.execute('COMMIT')
        except BaseException:
            self.con.execute('ROLLBACK')
            raise
        return {**report, **self.counts()}

    def seed_from(self, source):
        """Copia il lessico già acquisito; non copia decisioni né filtri editoriali."""
        source = Path(source).resolve()
        if source == self.file:
            raise ValueError('Sorgente e destinazione devono essere diverse')
        self.con.execute('ATTACH DATABASE ? AS legacy',(source.as_uri()+'?mode=ro',))
        self.con.execute('BEGIN IMMEDIATE')
        try:
            before = self.con.execute('SELECT count(*) FROM parole').fetchone()[0]
            self.con.execute('''INSERT OR IGNORE INTO fonti
                SELECT s.source_key,s.name,s.kind,s.url,s.license,s.attribution,r.config_json
                FROM legacy.raw__inventory_sources s JOIN legacy.raw__inventory_registered_sources r USING(source_key)''')
            print('Copia delle parole già raccolte...',flush=True)
            self.con.execute('''INSERT OR IGNORE INTO parole
                SELECT prompt,is_single_word FROM legacy.raw__inventory_terms''')
            print('Copia delle fonti e delle acquisizioni...',flush=True)
            self.con.execute('''INSERT OR IGNORE INTO inventory_snapshots
                SELECT id,source_key,sha256,acquired_at,cache_path,records,source_config_json
                FROM legacy.raw__inventory_snapshots''')
            self.con.execute('''INSERT OR IGNORE INTO parole_fonti
                SELECT a.prompt,s.source_key FROM legacy.raw__inventory_attestation_rows a
                JOIN legacy.raw__inventory_snapshot_numbers n ON n.n=a.snapshot
                JOIN legacy.raw__inventory_snapshots s ON s.id=n.snapshot_id
                JOIN parole p ON p.parola=a.prompt''')
            if self.con.execute("SELECT 1 FROM legacy.sqlite_schema WHERE name='raw__inventory_source_heads'").fetchone():
                self.con.execute("INSERT OR REPLACE INTO meta SELECT 'head:'||source_key,snapshot_id FROM legacy.raw__inventory_source_heads")
            self.con.execute("UPDATE meta SET value='da_aggiornare' WHERE name='normalizzazione_stato'")
            self.con.execute("INSERT OR REPLACE INTO meta VALUES ('seed_source',?)",(str(source),))
            self.con.execute("INSERT OR REPLACE INTO meta VALUES ('seeded_at_utc',?)",(now(),))
            if self.con.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Riferimenti non validi dopo la copia')
            self.con.execute('COMMIT')
        except BaseException:
            self.con.execute('ROLLBACK')
            raise
        finally:
            self.con.execute('DETACH DATABASE legacy')
        cleanup = self.clean_existing(force=True)
        return {'origin':'existing_local_collection','source':str(source),'cleanup':cleanup,
                'new_words':self.con.execute('SELECT count(*) FROM parole').fetchone()[0]-before,**self.counts()}


def collect_all(db, sources, cache, report_path, backup, prepare_local):
    results, commits = [], {}
    report_path = Path(report_path)
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report = {'schema_version':VERSION,'started_at_utc':now(),'database':str(db.file),
              'words_table':'parole','backup':str(backup) if backup else None,
              'selected_sources':len(sources),'row_limit':None,'zipf_filter':None,
              'editorial_exclusions':False,'gameplay_publication':False,
              'attempts':results,'all_sources_completed':False}

    def save():
        temporary = report_path.with_suffix('.json.part')
        temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        temporary.replace(report_path)

    save()
    for number,source in enumerate(sources,1):
        print(f"[{number}/{len(sources)}] {source['name']}",flush=True)
        try:
            if source['id']=='wordfreq-it-local':
                source = prepare_local(source,cache)
            effective,path = fetch_current(db,source,Path(cache),commits)
            result = db.import_source(effective,path)
            result.update({'effective_url':effective['url'],'cache_path':str(path),
                           'revision':effective.get('revision')})
        except Exception as error:
            result = {'source':source['id'],'status':'FAILED','error':str(error)}
        results.append(result)
        print(json.dumps(result,ensure_ascii=False),flush=True)
        save()
    report['all_sources_completed'] = all(r['status']!='FAILED' for r in results)
    report['completed_at_utc'] = now()
    report['inventory'] = db.counts()
    save()
    return report
