"""Il DB dei giochi: database/giochi.sqlite3, piccolo e versionato in Git, con uno schema per gioco.

  dubbi   ZeroDubbi: i dilemmi (era gioco-dilemmi/data/domande.db)
  wordle  ZeroWordle: soluzioni e parole ammesse, da 5 a 8 lettere (gioco-zerowordle/build_wordle_bank.py)
  context ZeroContext: parole giocabili e parole segrete (gioco-zerocontext/build_context_data.py); i vettori,
          18 MB, restano nel file gioco-zerocontext/data/vectors.bin, nello stesso ordine delle parole
  associazioni  ZeroAssociazioni e ZeroReazioniACatena: prompt, parole uniche e collegamenti dei bacini verificati, dal DB di lavoro
          database/parole_ita_raw.sqlite3 (gioco-zeroassociations/unified_db.py: pesa gigabyte, fuori da Git)
  parole  ZeroWords: lessico, lista di esclusione, capitoli e curva di difficoltà (dai file di gioco-parole)
  contenuti     la banca degli altri giochi dell'overlay (apps/server/src/content.seed.json), un elemento JSON per riga

ZeroQuizz non è qui: è un gioco di domande e risposte, non di parole, e ha un DB a sé, database/ZeroQuizz.sqlite3
(gioco-quizzland/tools/domande.py). I dati di Zerocade in diretta (sessioni, eventi, classifiche) restano in
apps/server/data/zerocade.db.

Gli strumenti di ZeroDubbi indicano il loro schema come database/giochi.sqlite3#dubbi (address), la stessa
scrittura del server, e scrivono l'SQL con i nomi senza prefisso, che viene riscritto al volo (schemadb.py). Il
vecchio DB a sé, gioco-dilemmi/data/domande.db, indica ancora lo stesso schema; con ZEROCADE_GIOCHI_DB=legacy
si torna a quel file, che non si aggiorna più. wordle e context li scrivono i loro script di costruzione; associazioni, parole e contenuti
sono copie delle loro origini, che restano dove sono: dopo una modifica all'origine si aggiornano con `aggiorna`.

Comandi:
  python database/giochi.py build [--replace]   crea il file dai vecchi DB e dalle liste attuali, poi lo verifica
  python database/giochi.py aggiorna [SCHEMA…]  ricopia associazioni, parole e contenuti (tutti, senza nomi)
  python database/giochi.py verify              confronta ogni schema con la sua origine
  python database/giochi.py status              schemi, tabelle e righe
  python database/giochi.py export SCHEMA FILE  uno schema come DB a sé
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from schemadb import SchemaDb  # noqa: E402

# ZEROCADE_GIOCHI_FILE moves it (for example, to try the tools on a copy).
FILE = Path(os.environ.get('ZEROCADE_GIOCHI_FILE') or HERE / 'giochi.sqlite3')
# Il vecchio DB di ZeroDubbi, da cui viene lo schema dubbi: non si aggiorna più, serve a build --replace, a verify e
# a ZEROCADE_GIOCHI_DB=legacy.
DUBBI = ROOT / 'gioco-dilemmi' / 'data' / 'domande.db'
WORDLE_DATA = ROOT / 'gioco-zerowordle' / 'data'
CONTEXT_DATA = ROOT / 'gioco-zerocontext' / 'data'
# ZeroAssociazioni: il DB di lavoro, uno schema per ognuno dei sei DB storici (gioco-zeroassociations/unified_db.py).
ASSOC_WORK = HERE / 'parole_ita_raw.sqlite3'
PAROLE = ROOT / 'gioco-parole'
PAROLE_FILES = {
    'words': PAROLE / 'lexicon' / 'it' / 'words.tsv',
    'blocklist': PAROLE / 'lexicon' / 'blocklist_it.txt',
    'chapters': PAROLE / 'data' / 'chapters.json',
    'curve': PAROLE / 'tools' / 'curve.json',
}
SEED = ROOT / 'apps' / 'server' / 'src' / 'content.seed.json'

db = SchemaDb(FILE, {DUBBI: 'dubbi'}, 'ZEROCADE_GIOCHI_DB')
connect = db.connect
exists = db.exists
active = db.active
schema_of = db.schema_of
# Come gli strumenti indicano uno schema: address('dubbi') -> database/giochi.sqlite3#dubbi.
address = db.address
file_of = db.file_of


# --- ZeroWordle e ZeroContext: tabelle scritte dai loro script ---

WORDLE_SCHEMA = '''
CREATE TABLE solutions(length INTEGER NOT NULL CHECK(length BETWEEN 5 AND 8), word TEXT NOT NULL,
  PRIMARY KEY(length, word)) STRICT, WITHOUT ROWID;
CREATE TABLE words(length INTEGER NOT NULL CHECK(length BETWEEN 5 AND 8), word TEXT NOT NULL,
  PRIMARY KEY(length, word)) STRICT, WITHOUT ROWID;
CREATE TABLE meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
'''
CONTEXT_SCHEMA = '''
CREATE TABLE vocab(idx INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE secrets(word TEXT PRIMARY KEY REFERENCES vocab(word)) STRICT, WITHOUT ROWID;
CREATE TABLE meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
'''
# Quello che ZeroAssociazioni e ZeroReazioniACatena usano, e nient'altro: i prompt, ogni parola una volta sola e i
# collegamenti fra i due (prompt_words). Sensi, verbali e prove, con i loro id di 64 caratteri, restano nel DB di
# lavoro: di un prompt la copia tiene il senso in chiaro, il ref del bacino (l'id stabile della telemetria, come
# poolRef del server) e l'id del verbale (per il contentId). Le chiavi sono numeri; i gruppi di significato di
# ogni prompt, con il massimo di risposte dello stesso gruppo in un round, e le difficoltà stanno in tabelle a
# parte. Il server legge queste tabelle (apps/server/src/word-association.ts); verify le confronta con l'origine
# nella forma canonica di ASSOC_CANONICAL.
ASSOC_SCHEMA = '''
CREATE TABLE prompts(id INTEGER PRIMARY KEY, prompt TEXT NOT NULL UNIQUE, pos TEXT NOT NULL CHECK(pos IN ('NOUN','VERB','ADJ')),
  sense TEXT NOT NULL, category_id TEXT, ref TEXT NOT NULL UNIQUE CHECK(length(ref) = 25), review_id TEXT NOT NULL) STRICT;
CREATE TABLE words(id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE difficulties(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE CHECK(name IN ('easy','medium','hard','unrated')))
  STRICT;
CREATE TABLE meaning_groups(prompt_id INTEGER NOT NULL REFERENCES prompts(id), name_id INTEGER NOT NULL REFERENCES words(id),
  maximum INTEGER CHECK(maximum IN (1,2)), PRIMARY KEY(prompt_id, name_id)) STRICT, WITHOUT ROWID;
CREATE TABLE prompt_words(prompt_id INTEGER NOT NULL REFERENCES prompts(id), word_id INTEGER NOT NULL REFERENCES words(id),
  group_name_id INTEGER NOT NULL, difficulty INTEGER NOT NULL REFERENCES difficulties(id), PRIMARY KEY(prompt_id, word_id),
  FOREIGN KEY(prompt_id, group_name_id) REFERENCES meaning_groups(prompt_id, name_id)) STRICT, WITHOUT ROWID;
CREATE TABLE conflicts(prompt_id INTEGER NOT NULL, word_a INTEGER NOT NULL, word_b INTEGER NOT NULL,
  PRIMARY KEY(prompt_id, word_a, word_b), FOREIGN KEY(prompt_id, word_a) REFERENCES prompt_words(prompt_id, word_id),
  FOREIGN KEY(prompt_id, word_b) REFERENCES prompt_words(prompt_id, word_id)) STRICT, WITHOUT ROWID;
CREATE TABLE meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
'''
DIFFICULTIES = ('easy', 'medium', 'hard', 'unrated')
# La forma canonica dei bacini, la stessa dalla copia ({s} è il prefisso dello schema) e dall'origine (_canonical).
ASSOC_CANONICAL = {
    'prompts': 'SELECT ref, prompt, sense, pos, category_id, review_id FROM {s}prompts ORDER BY 1',
    'answers': '''SELECT p.ref, w.word, n.word, d.name FROM {s}prompt_words pw JOIN {s}prompts p ON p.id = pw.prompt_id
                  JOIN {s}words w ON w.id = pw.word_id JOIN {s}words n ON n.id = pw.group_name_id
                  JOIN {s}difficulties d ON d.id = pw.difficulty ORDER BY 1, 2''',
    'group_limits': '''SELECT p.ref, n.word, g.maximum FROM {s}meaning_groups g JOIN {s}prompts p ON p.id = g.prompt_id
                       JOIN {s}words n ON n.id = g.name_id WHERE g.maximum IS NOT NULL ORDER BY 1, 2''',
    'conflicts': '''SELECT p.ref, a.word, b.word FROM {s}conflicts c JOIN {s}prompts p ON p.id = c.prompt_id
                    JOIN {s}words a ON a.id = c.word_a JOIN {s}words b ON b.id = c.word_b ORDER BY 1, 2, 3''',
}
PAROLE_SCHEMA = '''
CREATE TABLE words(word TEXT PRIMARY KEY, zipf REAL NOT NULL, tier TEXT NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE blocklist(entry TEXT PRIMARY KEY) STRICT, WITHOUT ROWID;
CREATE TABLE meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
'''
CONTENUTI_SCHEMA = '''
CREATE TABLE items(game_id TEXT NOT NULL, pos INTEGER NOT NULL, item TEXT NOT NULL, PRIMARY KEY(game_id, pos)) STRICT,
  WITHOUT ROWID;
'''


def _temp_db(ddl: str) -> tuple[Path, sqlite3.Connection]:
    handle = tempfile.NamedTemporaryFile(prefix='giochi-', suffix='.sqlite3', delete=False)
    handle.close()
    con = sqlite3.connect(f'file:{Path(handle.name).as_posix()}', uri=True)
    con.executescript(ddl)
    return Path(handle.name), con


def write_wordle(lists: dict[int, tuple[list[str], list[str]]], meta: dict) -> int:
    """Le liste di ZeroWordle ({lunghezza: (soluzioni, parole ammesse)}) diventano lo schema wordle."""
    path, con = _temp_db(WORDLE_SCHEMA)
    try:
        for length, (solutions, words) in lists.items():
            con.executemany('INSERT INTO solutions VALUES(?,?)', [(length, w) for w in sorted(set(solutions))])
            con.executemany('INSERT INTO words VALUES(?,?)', [(length, w) for w in sorted(set(words) | set(solutions))])
        con.executemany('INSERT INTO meta VALUES(?,?)', [(k, json.dumps(v)) for k, v in meta.items()])
        con.commit()
        con.close()
        return db.import_schema(path, 'wordle')
    finally:
        path.unlink(missing_ok=True)


def write_context(vocab: list[str], secrets: list[str], meta: dict) -> int:
    """Le parole di ZeroContext (nell'ordine dei vettori) e le parole segrete diventano lo schema context."""
    path, con = _temp_db(CONTEXT_SCHEMA)
    try:
        con.executemany('INSERT INTO vocab VALUES(?,?)', list(enumerate(vocab)))
        con.executemany('INSERT INTO secrets VALUES(?)', [(w,) for w in sorted(set(secrets))])
        con.executemany('INSERT INTO meta VALUES(?,?)', [(k, json.dumps(v)) for k, v in meta.items()])
        con.commit()
        con.close()
        return db.import_schema(path, 'context')
    finally:
        path.unlink(missing_ok=True)


# --- ZeroAssociazioni: i bacini verificati, copiati dal DB di lavoro ---

def _assoc_sources() -> list[tuple[Path, str, str]]:
    """Le origini dei bacini nell'ordine del server, gli schemi validi, game e raw del DB di lavoro:
    (file, prefisso delle tabelle, nome come file#schema)."""
    out: list[tuple[Path, str, str]] = []
    if ASSOC_WORK.exists():
        try:
            con = sqlite3.connect(f'file:{ASSOC_WORK.as_posix()}?mode=ro', uri=True)
            try:
                verified = con.execute("SELECT value FROM zerodb_meta WHERE name='verified'").fetchone()
                schemas = {r[0] for r in con.execute('SELECT DISTINCT schema FROM zerodb_objects')}
            finally:
                con.close()
            if verified and verified[0] == '1':
                out += [(ASSOC_WORK, f'{s}__', f'{ASSOC_WORK.name}#{s}') for s in ('validi', 'game', 'raw') if s in schemas]
        except sqlite3.Error:
            pass
    return out


def _assoc_rows(con: sqlite3.Connection, prefix: str) -> dict[str, list[tuple]]:
    """Le righe che il gioco legge da un DB di lavoro attaccato come src: ogni prompt nel suo senso familiare con
    un verbale verificato, mai una voce che la raccolta segna DISCARDED o DEFERRED (come il server)."""
    tables = {r[0] for r in con.execute("SELECT name FROM src.sqlite_schema WHERE type='table'")}
    discarded = f""" AND NOT EXISTS (SELECT 1 FROM src.{prefix}inventory_term_decisions d
        WHERE d.prompt = s.prompt AND d.decision IN ('DISCARDED', 'DEFERRED'))"""
    senses = con.execute(f"""SELECT s.id, s.prompt, s.description, s.pos, s.category_id, s.review_id
        FROM src.{prefix}prompts p
        JOIN src.{prefix}senses s ON s.prompt = p.lemma AND s.description = p.familiar_sense
        JOIN src.{prefix}reviews r ON r.id = s.review_id
        WHERE r.decision = 'verified'{discarded if f'{prefix}inventory_term_decisions' in tables else ''}
        ORDER BY s.id""").fetchall()
    con.execute('DROP TABLE IF EXISTS temp.pick')
    con.execute('CREATE TEMP TABLE pick(id TEXT PRIMARY KEY)')
    con.executemany('INSERT INTO temp.pick VALUES(?)', [(row[0],) for row in senses])
    rows = {
        'prompts': sorted({(row[1], row[2]) for row in senses}),
        'reviews': sorted({(row[5], 'verified') for row in senses}),
        'senses': senses,
        'associations': con.execute(f"""SELECT a.sense_id, a.word, a.meaning_group, a.difficulty
            FROM src.{prefix}associations a JOIN temp.pick k ON k.id = a.sense_id ORDER BY 1, 2""").fetchall(),
        'group_limits': con.execute(f"""SELECT g.sense_id, g.meaning_group, g.maximum
            FROM src.{prefix}group_limits g JOIN temp.pick k ON k.id = g.sense_id ORDER BY 1, 2""").fetchall(),
        'conflicts': con.execute(f"""SELECT c.sense_id, c.word_a, c.word_b
            FROM src.{prefix}conflicts c JOIN temp.pick k ON k.id = c.sense_id ORDER BY 1, 2, 3""").fetchall(),
    }
    con.execute('DROP TABLE temp.pick')
    return rows


def _digest(rows) -> str:
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def _source_rows(file: Path, prefix: str) -> dict[str, list[tuple]]:
    con = sqlite3.connect('file::memory:', uri=True)
    try:
        con.execute(f"ATTACH DATABASE 'file:{file.as_posix()}?mode=ro' AS src")
        return _assoc_rows(con, prefix)
    finally:
        con.close()


def _pool_ref(sense_id: str) -> str:
    """L'id stabile di un bacino nella telemetria: poolRef di apps/server/src/word-association.ts."""
    return 'c' + hashlib.sha256(sense_id.encode('utf-8')).hexdigest()[:24]


def _canonical(rows: dict[str, list[tuple]]) -> dict[str, list[tuple]]:
    """Le righe di _assoc_rows nella forma canonica di ASSOC_CANONICAL: il ref al posto dell'id del senso."""
    ref = {s[0]: _pool_ref(s[0]) for s in rows['senses']}
    return {
        'prompts': sorted(((ref[s[0]], s[1], s[2], s[3], s[4], s[5]) for s in rows['senses']), key=lambda r: r[0]),
        'answers': sorted(((ref[a[0]], a[1], a[2], a[3]) for a in rows['associations']), key=lambda r: r[:2]),
        'group_limits': sorted(((ref[g[0]], g[1], g[2]) for g in rows['group_limits']), key=lambda r: r[:2]),
        'conflicts': sorted((ref[c[0]], c[1], c[2]) for c in rows['conflicts']),
    }


def _write_associazioni(rows: dict[str, list[tuple]], source: str) -> dict:
    """Le righe come le dà _assoc_rows diventano lo schema associazioni: un numero per ogni prompt (in ordine
    alfabetico) e per ogni parola (una volta sola, in ordine alfabetico). Un gruppo di significato ha per nome una
    parola (quasi sempre una delle risposte): il gruppo è il numero di quella parola, e i pochi nomi che non sono
    risposte entrano anch'essi in words. L'impronta in meta è quella della forma canonica. Una riga che l'origine
    non accetterebbe (una difficoltà sconosciuta, un conflitto con una parola fuori dal bacino) fa fallire la
    scrittura."""
    senses = sorted(rows['senses'], key=lambda s: s[1])
    pid = {s[0]: n for n, s in enumerate(senses, 1)}
    maximum = {(g[0], g[1]): g[2] for g in rows['group_limits']}
    groups = {(a[0], a[2]) for a in rows['associations']} | set(maximum)
    wid = {w: n for n, w in enumerate(sorted({a[1] for a in rows['associations']} | {g[1] for g in groups}), 1)}
    path, con = _temp_db(ASSOC_SCHEMA)
    try:
        con.execute('PRAGMA foreign_keys=ON')
        con.executemany('INSERT INTO prompts VALUES(?,?,?,?,?,?,?)',
                        [(pid[s[0]], s[1], s[3], s[2], s[4], _pool_ref(s[0]), s[5]) for s in senses])
        con.executemany('INSERT INTO words VALUES(?,?)', [(n, w) for w, n in wid.items()])
        con.executemany('INSERT INTO difficulties VALUES(?,?)', list(enumerate(DIFFICULTIES, 1)))
        con.executemany('INSERT INTO meaning_groups VALUES(?,?,?)',
                        sorted((pid[g[0]], wid[g[1]], maximum.get(g)) for g in groups))
        con.executemany('INSERT INTO prompt_words VALUES(?,?,?,(SELECT id FROM difficulties WHERE name = ?))',
                        [(pid[a[0]], wid[a[1]], wid[a[2]], a[3]) for a in rows['associations']])
        con.executemany('INSERT INTO conflicts VALUES(?,?,?)', [(pid[c[0]], wid.get(c[1]), wid.get(c[2])) for c in rows['conflicts']])
        con.executemany('INSERT INTO meta VALUES(?,?)', [('source', json.dumps(source)),
                                                        ('digest', json.dumps(_digest(_canonical(rows))))])
        con.commit()
        con.close()
        return {'source': source, 'prompts': len(senses), 'words': len(wid), 'rows': db.import_schema(path, 'associazioni')}
    finally:
        con.close()
        path.unlink(missing_ok=True)


def write_associazioni() -> dict:
    """Lo schema associazioni dalla prima origine con bacini verificati."""
    for file, prefix, name in _assoc_sources():
        rows = _source_rows(file, prefix)
        if rows['senses']:
            return _write_associazioni(rows, name)
    raise SystemExit(f'associazioni: nessuna origine con bacini verificati ({ASSOC_WORK})')


def _schema_rows(schema: str, queries: dict[str, str]) -> dict[str, list[tuple]] | None:
    """Le righe di uno schema di questo file ({s} nell'SQL è il suo prefisso), None se lo schema non c'è."""
    con = sqlite3.connect(f'file:{FILE.as_posix()}?mode=ro', uri=True)
    try:
        if not con.execute('SELECT 1 FROM zerodb_objects WHERE schema=?', (schema,)).fetchone():
            return None
        return {name: con.execute(sql.replace('{s}', f'{schema}__')).fetchall() for name, sql in queries.items()}
    finally:
        con.close()


def verify_associazioni() -> list[str]:
    """associazioni deve avere, in forma canonica, le righe della sua origine, quando l'origine è su questo PC."""
    got = _schema_rows('associazioni', {'meta': 'SELECT name, value FROM {s}meta', **ASSOC_CANONICAL})
    if got is None:
        return ['associazioni: manca (python database/giochi.py aggiorna associazioni)']
    meta = {name: json.loads(value) for name, value in got.pop('meta')}
    if _digest(got) != meta.get('digest'):
        return ['associazioni: le righe non corrispondono alla loro impronta']
    origin = next(((f, p) for f, p, name in _assoc_sources() if name == meta.get('source')), None)
    if origin and _digest(_canonical(_source_rows(*origin))) != meta['digest']:
        return [f'associazioni: diverso da {meta["source"]} (python database/giochi.py aggiorna associazioni)']
    return []


# --- ZeroWords: lessico, esclusioni, capitoli e curva, dai file di gioco-parole ---

def _parole_rows() -> dict[str, list[tuple]]:
    lines = PAROLE_FILES['words'].read_text(encoding='utf-8').splitlines()
    if lines[0].split('\t') != ['word', 'zipf', 'tier']:
        raise SystemExit(f'parole: intestazione inattesa in {PAROLE_FILES["words"]}: {lines[0]!r}')
    words = sorted((w, float(z), t) for w, z, t in (line.split('\t') for line in lines[1:] if line.strip()))
    blocklist = sorted({line.strip().upper() for line in PAROLE_FILES['blocklist'].read_text(encoding='utf-8').splitlines()
                        if line.strip() and not line.strip().startswith('#')})
    meta = sorted((name, json.dumps(json.loads(PAROLE_FILES[name].read_text(encoding='utf-8')), ensure_ascii=False))
                  for name in ('chapters', 'curve'))
    return {'words': words, 'blocklist': [(b,) for b in blocklist], 'meta': meta}


def write_parole() -> dict:
    rows = _parole_rows()
    path, con = _temp_db(PAROLE_SCHEMA)
    try:
        con.executemany('INSERT INTO words VALUES(?,?,?)', rows['words'])
        con.executemany('INSERT INTO blocklist VALUES(?)', rows['blocklist'])
        con.executemany('INSERT INTO meta VALUES(?,?)', rows['meta'])
        con.commit()
        con.close()
        return {'words': len(rows['words']), 'rows': db.import_schema(path, 'parole')}
    finally:
        con.close()
        path.unlink(missing_ok=True)


def verify_parole() -> list[str]:
    got = _schema_rows('parole', {
        'words': 'SELECT word, zipf, tier FROM {s}words ORDER BY word',
        'blocklist': 'SELECT entry FROM {s}blocklist ORDER BY entry',
        'meta': 'SELECT name, value FROM {s}meta ORDER BY name',
    })
    if got is None:
        return ['parole: manca (python database/giochi.py aggiorna parole)']
    if all(f.exists() for f in PAROLE_FILES.values()) and _digest(got) != _digest(_parole_rows()):
        return ['parole: diverso dai file di gioco-parole (python database/giochi.py aggiorna parole)']
    return []


# --- La banca degli altri giochi dell'overlay, da content.seed.json ---

def _contenuti_rows() -> list[tuple]:
    seed = json.loads(SEED.read_text(encoding='utf-8'))
    return sorted((game, i, json.dumps(item, ensure_ascii=False)) for game, items in seed.items() for i, item in enumerate(items))


def write_contenuti() -> dict:
    rows = _contenuti_rows()
    path, con = _temp_db(CONTENUTI_SCHEMA)
    try:
        con.executemany('INSERT INTO items VALUES(?,?,?)', rows)
        con.commit()
        con.close()
        return {'games': len({r[0] for r in rows}), 'rows': db.import_schema(path, 'contenuti')}
    finally:
        con.close()
        path.unlink(missing_ok=True)


def verify_contenuti() -> list[str]:
    got = _schema_rows('contenuti', {'items': 'SELECT game_id, pos, item FROM {s}items ORDER BY 1, 2'})
    if got is None:
        return ['contenuti: manca (python database/giochi.py aggiorna contenuti)']
    if SEED.exists() and got['items'] != _contenuti_rows():
        return [f'contenuti: diverso da {SEED.name} (python database/giochi.py aggiorna contenuti)']
    return []


# Gli schemi che sono copie di un'origine: (scrivi, verifica).
COPIES = {
    'associazioni': (write_associazioni, verify_associazioni),
    'parole': (write_parole, verify_parole),
    'contenuti': (write_contenuti, verify_contenuti),
}


def _lines(path: Path) -> list[str]:
    return [l.strip() for l in path.read_text(encoding='utf-8').splitlines() if l.strip()]


def _from_files() -> None:
    """Gli schemi wordle e context dalle liste in testo che gli script scrivevano prima."""
    if (WORDLE_DATA / 'solutions-5.txt').exists():
        lists = {n: (_lines(WORDLE_DATA / f'solutions-{n}.txt'), _lines(WORDLE_DATA / f'words-{n}.txt'))
                 for n in range(5, 9) if (WORDLE_DATA / f'solutions-{n}.txt').exists()}
        meta = json.loads((WORDLE_DATA / 'meta.json').read_text(encoding='utf-8')) if (WORDLE_DATA / 'meta.json').exists() else {}
        write_wordle(lists, meta)
    if (CONTEXT_DATA / 'vocab.txt').exists():
        meta = json.loads((CONTEXT_DATA / 'meta.json').read_text(encoding='utf-8')) if (CONTEXT_DATA / 'meta.json').exists() else {}
        write_context(_lines(CONTEXT_DATA / 'vocab.txt'), _lines(CONTEXT_DATA / 'secrets.txt'), meta)


def verify_files() -> list[str]:
    """wordle e context devono avere le stesse parole delle liste in testo, se ci sono ancora."""
    problems = []
    con = sqlite3.connect(f'file:{FILE.as_posix()}?mode=ro', uri=True)
    for n in range(5, 9):
        for kind in ('solutions', 'words'):
            f = WORDLE_DATA / f'{kind}-{n}.txt'
            if f.exists():
                got = [w for (w,) in con.execute(f'SELECT word FROM wordle__{kind} WHERE length=? ORDER BY word', (n,))]
                want = sorted(set(_lines(f)) | (set(_lines(WORDLE_DATA / f'solutions-{n}.txt')) if kind == 'words' else set()))
                if got != want:
                    problems.append(f'wordle.{kind} {n} lettere: diverso da {f.name}')
    if (CONTEXT_DATA / 'vocab.txt').exists():
        got = [w for (w,) in con.execute('SELECT word FROM context__vocab ORDER BY idx')]
        if got != _lines(CONTEXT_DATA / 'vocab.txt'):
            problems.append('context.vocab: diverso da vocab.txt')
    con.close()
    return problems


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest='command', required=True)
    b = sub.add_parser('build')
    b.add_argument('--replace', action='store_true')
    a = sub.add_parser('aggiorna')
    a.add_argument('schemas', nargs='*', metavar='SCHEMA', help=', '.join(COPIES))
    sub.add_parser('verify')
    sub.add_parser('status')
    e = sub.add_parser('export')
    e.add_argument('schema')
    e.add_argument('output', type=Path)
    args = ap.parse_args(argv)
    sources = {s: p for p, s in ((DUBBI, 'dubbi'),) if p.exists()}
    if args.command in ('build', 'verify'):
        for p, s in ((DUBBI, 'dubbi'),):
            if s not in sources:
                print(f'{s}: il vecchio DB {p} non c\'è, lo schema non si confronta con la sua origine', file=sys.stderr)
    if args.command == 'build':
        print(json.dumps(db.build(sources, args.replace), indent=2))
        _from_files()
        print(json.dumps({name: write() for name, (write, _) in COPIES.items()}, indent=2, ensure_ascii=False))
    if args.command == 'aggiorna':
        names = args.schemas or list(COPIES)
        if unknown := [n for n in names if n not in COPIES]:
            ap.error(f'schema sconosciuto: {", ".join(unknown)} (si aggiornano: {", ".join(COPIES)})')
        if not FILE.exists():
            raise SystemExit(f'{FILE.name} non esiste: prima python database/giochi.py build')
        print(json.dumps({name: COPIES[name][0]() for name in names}, indent=2, ensure_ascii=False))
        # A replaced schema leaves free pages behind: the file is in Git, so it is compacted.
        con = sqlite3.connect(FILE)
        con.execute('VACUUM')
        con.close()
        problems = [p for name in names for p in COPIES[name][1]()]
        print(json.dumps({'ok': not problems, 'problems': problems}, indent=2, ensure_ascii=False))
        return 0 if not problems else 1
    if args.command in ('build', 'verify'):
        # The text lists are compared only when the build has just read them.
        problems = (db.verify(sources, mark=False) + (verify_files() if args.command == 'build' else [])
                    + [p for _, verify in COPIES.values() for p in verify()])
        if not problems:
            db.mark_verified()
        print(json.dumps({'ok': not problems, 'problems': problems}, indent=2, ensure_ascii=False))
        return 0 if not problems else 1
    if args.command == 'status':
        print(json.dumps(db.status(), indent=2, ensure_ascii=False))
    if args.command == 'export':
        print(json.dumps(db.export_schema(args.schema, args.output), indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
