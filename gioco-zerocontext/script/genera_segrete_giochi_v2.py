"""Genera le parole segrete dal RAW 2.0 e le scrive in database/giochi_v2.sqlite3, tabella `zerocade_segrete`.

In due passi, nello stesso task: 1) genera_parole_segrete.py sceglie le segrete (finestra Zipf, NVdB, verbi attestati,
densità e ponti) e le scrive in `parole_segrete` nel RAW 2.0; 2) questo script le copia, normalizzate, nel DB nuovo:
ordinarie conformi, speciali e segrete già in uso conservate in deroga. Non tocca giochi.sqlite3, i vettori e il
server: il gioco continua a leggere i suoi DB finché non si sceglie di passare a giochi_v2.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys

from filelock import FileLock

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE / 'script'))

from context_semantic_sources import sha, write_json
import genera_parole_segrete

SOURCE_COLUMNS = ('parola', 'ordinaria', 'speciale', 'legacy', 'deroga', 'zipf', 'zipf_superficie', 'nvdb', 'dominio',
                  'densita', 'ponti_4', 'ponti_38', 'metodo_frequenza', 'in_normalizzata')

SCHEMA = '''
CREATE TABLE zerocade_domini(
 id INTEGER PRIMARY KEY,
 nome TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE zerocade_segrete(
 id INTEGER PRIMARY KEY,
 parola TEXT NOT NULL UNIQUE,
 ordinaria INTEGER NOT NULL CHECK(ordinaria IN (0,1)),
 speciale INTEGER NOT NULL CHECK(speciale IN (0,1)),
 legacy INTEGER NOT NULL CHECK(legacy IN (0,1)),
 deroga INTEGER NOT NULL CHECK(deroga IN (0,1)),
 zipf REAL NOT NULL,
 zipf_superficie REAL NOT NULL,
 nvdb TEXT CHECK(nvdb IN ('FO','AU','AD')),
 dominio_id INTEGER REFERENCES zerocade_domini(id),
 densita REAL NOT NULL,
 ponti_4 INTEGER NOT NULL,
 ponti_38 INTEGER NOT NULL,
 frequenza_da_forme INTEGER NOT NULL CHECK(frequenza_da_forme IN (0,1)),
 giocabile_ordinaria INTEGER GENERATED ALWAYS AS (ordinaria OR deroga) VIRTUAL,
 CHECK(ordinaria OR speciale OR deroga)
) STRICT;
CREATE INDEX zerocade_segrete_dominio ON zerocade_segrete(dominio_id) WHERE dominio_id IS NOT NULL;
CREATE TABLE zerocade_segrete_meta(
 nome TEXT PRIMARY KEY,
 valore TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE VIEW zerocade_segrete_vista AS
 SELECT s.id, s.parola, s.ordinaria, s.speciale, s.legacy, s.deroga, s.giocabile_ordinaria, s.zipf, s.zipf_superficie,
        s.nvdb, d.nome AS dominio, s.densita, s.ponti_4, s.ponti_38, s.frequenza_da_forme
 FROM zerocade_segrete s LEFT JOIN zerocade_domini d ON d.id = s.dominio_id;
CREATE VIEW zerocade_segrete_ordinarie AS SELECT * FROM zerocade_segrete_vista WHERE giocabile_ordinaria = 1;
CREATE VIEW zerocade_segrete_speciali AS SELECT * FROM zerocade_segrete_vista WHERE speciale = 1;
'''
OBJECTS = ('zerocade_segrete_speciali', 'zerocade_segrete_ordinarie', 'zerocade_segrete_vista',
           'zerocade_segrete_meta', 'zerocade_segrete', 'zerocade_domini')


class PreconditionError(ValueError):
    pass


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def load_source(raw_db):
    """Le segrete del RAW 2.0, dopo aver controllato che derivino dalla normalizzazione corrente."""
    with closing(readonly(raw_db)) as con:
        meta = dict(con.execute('SELECT name,value FROM meta'))
        if not con.execute("SELECT 1 FROM sqlite_schema WHERE name='parole_segrete'").fetchone():
            raise PreconditionError('Manca la tabella parole_segrete: eseguire il task senza --skip-generation')
        report = json.loads(meta.get('parole_segrete_report') or '{}')
        problems = []
        if meta.get('parole_segrete_stato') != 'aggiornata':
            problems.append('le segrete non sono aggiornate: eseguire il task senza --skip-generation')
        current = json.loads(meta.get('normalizzazione_report') or '{}').get('source_words_sha256')
        if not report.get('normalization_source_sha256') or report['normalization_source_sha256'] != current:
            problems.append('le segrete non derivano dalla normalizzazione corrente del RAW 2.0: '
                            'rieseguire il task senza --skip-generation')
        if problems:
            raise PreconditionError('Segrete non pronte:\n - ' + '\n - '.join(problems))
        rows = list(con.execute(f'SELECT {",".join(SOURCE_COLUMNS)} FROM parole_segrete ORDER BY parola'))
    if not rows or len(rows) != report.get('secrets_total'):
        raise PreconditionError(f'parole_segrete ha {len(rows)} righe, il rapporto ne dichiara {report.get("secrets_total")}')
    return rows, report


def generate(args):
    """Primo passo: sceglie le segrete e le scrive in parole_segrete (con le sue verifiche e il suo backup)."""
    command = ['--db', str(args.raw_db), '--game-db', str(args.game_db), '--profile', args.profile]
    if args.plan:
        command.append('--plan')
    return genera_parole_segrete.main(command)


def build(con, rows, report, source_db):
    """Ricrea soltanto le tabelle e le viste delle segrete; il resto del DB resta com'è."""
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('BEGIN IMMEDIATE')
    try:
        for name in OBJECTS:
            kind = 'VIEW' if name.endswith(('_vista', '_ordinarie', '_speciali')) else 'TABLE'
            con.execute(f'DROP {kind} IF EXISTS {name}')
        for statement in SCHEMA.split(';\n'):
            if statement.strip():
                con.execute(statement)
        domains = {name: i for i, name in enumerate(sorted({r[8] for r in rows if r[8]}), 1)}
        con.executemany('INSERT INTO zerocade_domini VALUES (?,?)', [(i, n) for n, i in domains.items()])
        con.executemany('''INSERT INTO zerocade_segrete (id,parola,ordinaria,speciale,legacy,deroga,zipf,zipf_superficie,nvdb,
            dominio_id,densita,ponti_4,ponti_38,frequenza_da_forme) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                        [(i, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], domains.get(r[8]), r[9], r[10], r[11],
                          int(r[12] == 'forme_attestate')) for i, r in enumerate(rows, 1)])
        meta = {'schema': 'zerocade-segrete-1', 'generato_il_utc': datetime.now(timezone.utc).isoformat(),
                'origine': str(source_db), 'profilo_vettoriale': report.get('profile'),
                'vettori_sha256': report.get('vectors_sha256'), 'impronta_normalizzazione': report.get('normalization_source_sha256'),
                'finestra_ordinaria': json.dumps(report.get('thresholds', {}).get('ordinary')),
                'finestra_speciale': json.dumps(report.get('thresholds', {}).get('special')),
                'segrete': str(len(rows)), 'ordinarie': str(sum(r[1] for r in rows)), 'speciali': str(sum(r[2] for r in rows)),
                'in_deroga': str(sum(r[4] for r in rows)), 'nuove': str(report.get('added'))}
        con.executemany('INSERT INTO zerocade_segrete_meta VALUES (?,?)', meta.items())
        if con.execute('PRAGMA foreign_key_check').fetchone():
            raise ValueError('Riferimenti non validi nelle segrete')
        total = con.execute('SELECT count(*) FROM zerocade_segrete').fetchone()[0]
        if total != len(rows):
            raise ValueError('Conteggio delle segrete non valido')
        con.execute('COMMIT')
    except BaseException:
        con.execute('ROLLBACK')
        raise
    return meta


def verify(path, rows):
    """Rilegge il file scritto e lo confronta con la sorgente, riga per riga."""
    with closing(readonly(path)) as con:
        if con.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or con.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('DB giochi_v2 non integro')
        stored = list(con.execute('SELECT parola,ordinaria,speciale,legacy,deroga,zipf,zipf_superficie,nvdb,dominio,densita,ponti_4,ponti_38,'
                                  "CASE WHEN frequenza_da_forme THEN 'forme_attestate' ELSE 'superficie' END FROM zerocade_segrete_vista ORDER BY parola"))
    expected = [r[:13] for r in rows]
    if stored != expected:
        raise ValueError('Le segrete scritte non coincidono con quelle del RAW 2.0')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--raw-db', type=Path, default=ROOT / 'database/parole_ita_raw_2.0.sqlite3')
    ap.add_argument('--db', type=Path, default=ROOT / 'database/giochi_v2.sqlite3')
    ap.add_argument('--report', type=Path, default=HERE / 'reports/giochi_v2_segrete.json')
    ap.add_argument('--backup-root', type=Path, default=ROOT / 'gioco-zeroassociations/database-backups')
    ap.add_argument('--game-db', type=Path, default=ROOT / 'database/giochi.sqlite3',
                    help='DB del gioco da cui si leggono guess list e vettori (sola lettura)')
    ap.add_argument('--profile', choices=genera_parole_segrete.PROFILES, default='original',
                    help='Spazio vettoriale in cui si misurano densità e ponti')
    ap.add_argument('--skip-generation', action='store_true', help='Salta il primo passo: usa le segrete già in parole_segrete')
    ap.add_argument('--plan', action='store_true', help='Calcola e conta senza scrivere')
    args = ap.parse_args(argv)
    if not args.raw_db.is_file():
        raise FileNotFoundError('Eseguire prima "ZeroCade : Aggiornamento parole RAW" per creare il DB 2.0')
    if not args.skip_generation:
        print('Passo 1/2: generazione delle segrete nel RAW 2.0', flush=True)
        generate(args)
        if args.plan:  # in prova la generazione non scrive: non c'è ancora nulla da copiare
            return 0
        print('Passo 2/2: scrittura in giochi_v2', flush=True)
    rows, report = load_source(args.raw_db)
    summary = {'task': 'ZeroContext : Generazione segrete', 'database': str(args.db.resolve()), 'table': 'zerocade_segrete',
               'segrete': len(rows), 'ordinarie_conformi': sum(r[1] for r in rows), 'speciali': sum(r[2] for r in rows),
               'in_deroga': sum(r[4] for r in rows), 'nuove': report.get('added'), 'profilo': report.get('profile'), 'plan_only': args.plan}
    if not args.plan:
        args.db.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(str(args.db.resolve()) + '.lock', timeout=0):
            if args.db.exists():
                stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                backup = args.backup_root / f'giochi_v2-{stamp}.sqlite3'
                backup.parent.mkdir(parents=True, exist_ok=True)
                with closing(readonly(args.db)) as original, closing(sqlite3.connect(backup)) as target:
                    original.backup(target)
                summary['backup'] = str(backup)
            with closing(sqlite3.connect(args.db, isolation_level=None, timeout=30)) as con:
                meta = build(con, rows, report, args.raw_db.resolve())
                con.execute('PRAGMA optimize')
                con.execute('VACUUM')
            verify(args.db, rows)
        summary.update(meta=meta, size_bytes=args.db.stat().st_size, sha256=sha(args.db))
        write_json(args.report, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
