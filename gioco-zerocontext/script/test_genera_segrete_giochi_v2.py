from contextlib import closing
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import sqlite3
import tempfile
import unittest

from unittest import mock

import genera_segrete_giochi_v2 as step
from genera_segrete_giochi_v2 import PreconditionError, main

ROWS = [  # parola, ordinaria, speciale, legacy, deroga, zipf, zipf_superficie, nvdb, dominio, densita, ponti_4, ponti_38, metodo, in_norm
    ('alfa', 1, 0, 0, 0, 2.2, 2.2, None, None, .9, 20, 25, 'superficie', 1),
    ('gamma', 1, 0, 1, 0, 2.5, 1.0, 'AD', None, .8, 12, 15, 'forme_attestate', 1),
    ('probità', 1, 1, 1, 0, 1.9, 1.9, None, 'carattere e comportamento', .7, 11, 16, 'superficie', 1),
    ('vecchia', 0, 0, 1, 1, 4.0, 4.0, 'FO', None, .5, 3, 3, 'superficie', 1),
]


def raw_db(folder, *, stato='aggiornata', sha='abc', declared=None):
    path = Path(folder) / 'raw.sqlite3'
    with closing(sqlite3.connect(path)) as con:
        con.execute('CREATE TABLE meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT')
        con.execute('''CREATE TABLE parole_segrete(parola TEXT PRIMARY KEY, ordinaria INTEGER, speciale INTEGER, legacy INTEGER,
            deroga INTEGER, zipf REAL, zipf_superficie REAL, nvdb TEXT, dominio TEXT, densita REAL, ponti_4 INTEGER, ponti_38 INTEGER,
            metodo_frequenza TEXT, in_normalizzata INTEGER) STRICT, WITHOUT ROWID''')
        con.executemany('INSERT INTO parole_segrete VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ROWS)
        report = {'secrets_total': len(ROWS) if declared is None else declared, 'normalization_source_sha256': 'abc', 'profile': 'original',
                  'vectors_sha256': 'v', 'added': 1, 'thresholds': {'ordinary': {'density': .45}, 'special': {'density': .48}}}
        con.execute("INSERT INTO meta VALUES ('parole_segrete_stato',?)", (stato,))
        con.execute("INSERT INTO meta VALUES ('parole_segrete_report',?)", (json.dumps(report),))
        con.execute("INSERT INTO meta VALUES ('normalizzazione_report',?)", (json.dumps({'source_words_sha256': sha}),))
        con.commit()
    return path


def run(raw, db, *extra, backup=None):
    args = ['--raw-db', str(raw), '--db', str(db), '--report', str(Path(db).parent / 'r.json'),
            '--backup-root', str(backup or Path(db).parent / 'bk'), '--skip-generation', *extra]
    with redirect_stdout(io.StringIO()):
        return main(args)


class SecretsDbTests(unittest.TestCase):
    def test_writes_all_secrets_normalized_with_views_and_integrity(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, db = raw_db(folder), Path(folder) / 'giochi_v2.sqlite3'
            run(raw, db)
            with closing(sqlite3.connect(db)) as con:
                self.assertEqual(con.execute('SELECT count(*) FROM zerocade_segrete').fetchone()[0], 4)
                self.assertEqual(con.execute('SELECT parola FROM zerocade_segrete_ordinarie ORDER BY parola').fetchall(),
                                 [('alfa',), ('gamma',), ('probità',), ('vecchia',)])  # le conformi e quelle in deroga
                self.assertEqual(con.execute('SELECT parola,dominio FROM zerocade_segrete_speciali').fetchall(),
                                 [('probità', 'carattere e comportamento')])
                self.assertEqual(con.execute('SELECT count(*) FROM zerocade_domini').fetchone()[0], 1)
                self.assertEqual(con.execute("SELECT valore FROM zerocade_segrete_meta WHERE nome='segrete'").fetchone(), ('4',))
                self.assertEqual(con.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
                self.assertEqual(con.execute('PRAGMA foreign_key_check').fetchall(), [])
                self.assertEqual(con.execute("SELECT frequenza_da_forme FROM zerocade_segrete WHERE parola='gamma'").fetchone(), (1,))
                with self.assertRaises(sqlite3.IntegrityError):  # nessuna riga senza uso
                    con.execute("INSERT INTO zerocade_segrete (parola,ordinaria,speciale,legacy,deroga,zipf,zipf_superficie,densita,"
                                "ponti_4,ponti_38,frequenza_da_forme) VALUES ('x',0,0,0,0,2,2,.5,1,1,0)")

    def test_rerun_replaces_only_its_tables_and_keeps_a_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, db = raw_db(folder), Path(folder) / 'giochi_v2.sqlite3'
            run(raw, db)
            with closing(sqlite3.connect(db)) as con:
                con.execute('CREATE TABLE altro(x INTEGER)')
                con.execute('INSERT INTO altro VALUES (7)')
                con.commit()
            run(raw, db)
            with closing(sqlite3.connect(db)) as con:
                self.assertEqual(con.execute('SELECT x FROM altro').fetchone(), (7,))
                self.assertEqual(con.execute('SELECT count(*) FROM zerocade_segrete').fetchone()[0], 4)
            self.assertEqual(len(list((Path(folder) / 'bk').glob('giochi_v2-*.sqlite3'))), 1)

    def test_plan_writes_nothing(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, db = raw_db(folder), Path(folder) / 'giochi_v2.sqlite3'
            run(raw, db, '--plan')
            self.assertFalse(db.exists())

    def test_without_skip_the_generation_runs_first_and_a_plan_stops_there(self):
        with tempfile.TemporaryDirectory() as folder:
            raw, db = raw_db(folder), Path(folder) / 'giochi_v2.sqlite3'
            common = ['--raw-db', str(raw), '--db', str(db), '--report', str(Path(folder) / 'r.json'),
                      '--backup-root', str(Path(folder) / 'bk'), '--profile', 'abtt']
            with mock.patch.object(step.genera_parole_segrete, 'main', return_value=0) as generation, redirect_stdout(io.StringIO()):
                main(common + ['--plan'])
                self.assertFalse(db.exists())  # in prova non si scrive e non si copia
                main(common)
            self.assertEqual(generation.call_count, 2)
            first, second = (c.args[0] for c in generation.call_args_list)
            self.assertIn('--plan', first)
            self.assertNotIn('--plan', second)
            self.assertEqual(second[second.index('--profile') + 1], 'abtt')
            with closing(sqlite3.connect(db)) as con:  # dopo la generazione le segrete sono state copiate
                self.assertEqual(con.execute('SELECT count(*) FROM zerocade_segrete').fetchone()[0], 4)

    def test_refuses_stale_or_inconsistent_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'giochi_v2.sqlite3'
            for kwargs in ({'stato': 'da_aggiornare'}, {'sha': 'cambiata'}, {'declared': 99}):
                with tempfile.TemporaryDirectory() as sub:
                    with self.assertRaises(PreconditionError, msg=str(kwargs)):
                        run(raw_db(sub, **kwargs), db)
            self.assertFalse(db.exists())


if __name__ == '__main__':
    unittest.main()
