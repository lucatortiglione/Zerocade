"""Importa la banca CSV di ZeroLettere in un database SQLite autonomo."""
from __future__ import annotations

import argparse
from contextlib import closing
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile

HERE = Path(__file__).resolve().parent.parent
DEFAULT_CSV = HERE / 'livecade-missing-letters-it-bank-2026-11-14.csv'
DEFAULT_DB = HERE.parent / 'database/ZeroLettere.sqlite3'
COLUMNS = ('ref', 'source', 'language', 'category', 'difficulty', 'clue', 'answer', 'also_accept')
LOOKUPS = {'source': 'sources', 'language': 'languages', 'category': 'categories', 'difficulty': 'difficulties'}


def read_csv(path):
    raw = Path(path).read_bytes()
    reader = csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline=''))
    if tuple(next(reader, ())) != COLUMNS:
        raise ValueError('Intestazione CSV diversa dagli otto campi previsti')
    rows, refs = [], set()
    for line, values in enumerate(reader, 2):
        if len(values) != len(COLUMNS) or any(not v.strip() for v in values[:-1]):
            raise ValueError(f'Riga CSV incompleta: {line}')
        row = dict(zip(COLUMNS, values))
        if row['ref'] in refs: raise ValueError(f'Identificativo duplicato alla riga {line}')
        if row['difficulty'] not in {'easy', 'medium', 'hard'}:
            raise ValueError(f'Difficolta sconosciuta alla riga {line}')
        if row['also_accept'] and any(not a.strip() for a in row['also_accept'].split('|')):
            raise ValueError(f'Risposta alternativa vuota alla riga {line}')
        refs.add(row['ref']); rows.append(row)
    if not rows: raise ValueError('CSV senza dati')
    return rows, hashlib.sha256(raw).hexdigest()


def verify(con, rows, source_sha):
    # Il confronto completo controlla anche accenti, separatori e ordine.
    actual = con.execute('SELECT '+','.join(COLUMNS)+' FROM csv_entries ORDER BY position').fetchall()
    expected = [tuple(row[c] for c in COLUMNS) for row in rows]
    if actual != expected: raise ValueError('Contenuto del database diverso dal CSV')
    if con.execute("SELECT value FROM metadata WHERE name='source_sha256'").fetchone() != (source_sha,):
        raise ValueError('Impronta del CSV diversa da quella registrata nel database')
    if con.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('Database non integro')
    if con.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('Riferimenti del database non integri')


def import_csv(source=DEFAULT_CSV, target=DEFAULT_DB):
    source, target = Path(source).resolve(), Path(target).resolve()
    rows, source_sha = read_csv(source)
    summary = {'database': str(target), 'source': str(source), 'entries': len(rows),
               'accepted_answers': sum(len(r['also_accept'].split('|')) for r in rows if r['also_accept']),
               'source_sha256': source_sha}
    if target.exists():
        with closing(sqlite3.connect(target.as_uri()+'?mode=ro', uri=True)) as con:
            verify(con, rows, source_sha)
        return {**summary, 'status': 'ALREADY_IMPORTED'}

    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=target.stem+'-', suffix='.tmp', dir=target.parent)
    os.close(fd)
    staged = Path(name)
    try:
        with closing(sqlite3.connect(staged)) as con:
            con.execute('PRAGMA foreign_keys=ON')
            con.executescript((HERE / 'schema.sql').read_text(encoding='utf-8'))
            with con:
                ids = {}
                for column, table in LOOKUPS.items():
                    ids[column] = {value: i for i, value in enumerate(sorted({r[column] for r in rows}), 1)}
                    key = 'code' if column == 'language' else 'name'
                    con.executemany(f'INSERT INTO {table}(id,{key}) VALUES (?,?)',
                                    ((n, value) for value, n in ids[column].items()))
                for n, row in enumerate(rows, 1):
                    con.execute('INSERT INTO entries VALUES (?,?,?,?,?,?,?,?)',
                        (n, row['ref'], *(ids[c][row[c]] for c in LOOKUPS), row['clue'], row['answer']))
                    if row['also_accept']:
                        con.executemany('INSERT INTO accepted_answers VALUES (?,?,?)',
                            ((n, position, answer) for position, answer in enumerate(row['also_accept'].split('|'))))
                con.executemany('INSERT INTO metadata VALUES (?,?)', {
                    'source_file': source.name, 'source_sha256': source_sha,
                    'source_rows': str(len(rows)), 'imported_at': datetime.now(timezone.utc).isoformat(),
                    'sqlite_version': sqlite3.sqlite_version}.items())
            verify(con, rows, source_sha)
        # Pubblicazione completa: link fallisce se un altro processo ha gia creato il DB.
        os.link(staged, target)
    finally:
        staged.unlink(missing_ok=True)
    return {**summary, 'status': 'IMPORTED'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--csv', type=Path, default=DEFAULT_CSV)
    ap.add_argument('--db', type=Path, default=DEFAULT_DB)
    args = ap.parse_args()
    print(json.dumps(import_csv(args.csv, args.db), ensure_ascii=False, indent=2))


if __name__ == '__main__': main()
