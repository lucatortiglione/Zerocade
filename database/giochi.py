"""Il DB dei giochi: database/giochi.sqlite3, piccolo e versionato in Git, con uno schema per gioco.

  dubbi   ZeroDubbi: i dilemmi (era gioco-dilemmi/data/domande.db)
  quizz   ZeroQuizz: domande e risposte (era gioco-quizzland/data/domande.db)
  wordle  ZeroWordle: soluzioni e parole ammesse, da 5 a 8 lettere (gioco-zerowordle/build_wordle_bank.py)
  context ZeroContext: parole giocabili e parole segrete (gioco-zerocontext/build_context_data.py); i vettori,
          18 MB, restano nel file gioco-zerocontext/data/vectors.bin, nello stesso ordine delle parole

ZeroAssociazioni ha il suo DB unico a parte (gioco-zeroassociazioni/zeroassociazioni.sqlite3: pesa gigabyte).
I dati di Zerocade in diretta (sessioni, eventi, classifiche) restano in apps/server/data/zerocade.db.

Gli strumenti di ZeroDubbi e ZeroQuizz continuano a indicare il loro vecchio domande.db: quel percorso significa
lo schema corrispondente di questo file (schemadb.py), e l'SQL viene riscritto al volo. Con ZEROCADE_GIOCHI_DB=legacy
tornano ai vecchi file. Gli altri due schemi li scrivono i loro script di costruzione.

Comandi:
  python database/giochi.py build [--replace]   crea il file dai vecchi DB e dalle liste attuali, poi lo verifica
  python database/giochi.py verify              confronta ogni schema con la sua origine
  python database/giochi.py status              schemi, tabelle e righe
  python database/giochi.py export SCHEMA FILE  uno schema come DB a sé
"""
from __future__ import annotations

import argparse
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
DUBBI = ROOT / 'gioco-dilemmi' / 'data' / 'domande.db'
QUIZZ = ROOT / 'gioco-quizzland' / 'data' / 'domande.db'
WORDLE_DATA = ROOT / 'gioco-zerowordle' / 'data'
CONTEXT_DATA = ROOT / 'gioco-zerocontext' / 'data'

db = SchemaDb(FILE, {DUBBI: 'dubbi', QUIZZ: 'quizz'}, 'ZEROCADE_GIOCHI_DB')
connect = db.connect
exists = db.exists
active = db.active
schema_of = db.schema_of


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


def _temp_db(ddl: str) -> tuple[Path, sqlite3.Connection]:
    handle = tempfile.NamedTemporaryFile(prefix='giochi-', suffix='.sqlite3', delete=False)
    handle.close()
    con = sqlite3.connect(handle.name)
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
    sub.add_parser('verify')
    sub.add_parser('status')
    e = sub.add_parser('export')
    e.add_argument('schema')
    e.add_argument('output', type=Path)
    args = ap.parse_args(argv)
    sources = {s: p for p, s in ((DUBBI, 'dubbi'), (QUIZZ, 'quizz')) if p.exists()}
    if args.command == 'build':
        print(json.dumps(db.build(sources, args.replace), indent=2))
        _from_files()
    if args.command in ('build', 'verify'):
        # The text lists are compared only when the build has just read them.
        problems = db.verify(sources, mark=False) + (verify_files() if args.command == 'build' else [])
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
