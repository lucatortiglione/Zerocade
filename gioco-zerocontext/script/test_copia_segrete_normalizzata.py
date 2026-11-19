"""ZeroContext : Copia segrete da normalizzata: tutte le parole con IWFS ≥ 45 in giochi_v2, sostituzione atomica."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import copia_segrete_normalizzata as task

WORDS = [  # (parola, is_single_word, iwfs, stato, confidenza)
    ('sole', 1, 45.0, 'FULL', 'HIGH'),             # IWFS esattamente 45: dentro
    ('casa', 1, 99.65, 'FULL', 'HIGH'),
    ('tre', 1, 90.0, 'FULL', 'HIGH'),              # parole corte: dentro, non c'è un limite di lunghezza
    ('città', 1, 80.0, 'FULL', 'MEDIUM'),          # accentata: dentro
    ('rosa', 1, 44.99, 'FULL', 'HIGH'),            # IWFS sotto 45: fuori
    ('zzzz', 1, None, 'UNAVAILABLE', 'NONE'),      # senza IWFS: fuori
    ('abaceto', 1, 46.0, 'PARTIAL', 'LOW'),        # parziale: dentro, ma marcata
    ('anti-aereo', 0, 90.0, 'FULL', 'HIGH'),       # non è una parola singola: dentro, con parola_singola = 0
]


def raw(folder, words=WORDS, with_iwfs=True, state='aggiornata'):
    path = Path(folder) / 'raw.sqlite3'
    with closing(sqlite3.connect(path)) as con, con:
        con.execute('CREATE TABLE meta(name TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT')
        if with_iwfs:
            con.execute('CREATE TABLE normalizzata(parola TEXT PRIMARY KEY,is_single_word INTEGER NOT NULL,iwfs REAL,iwfs_status TEXT,iwfs_confidence TEXT)')
            con.executemany('INSERT INTO normalizzata VALUES (?,?,?,?,?)', words)
        else:
            con.execute('CREATE TABLE normalizzata(parola TEXT PRIMARY KEY,is_single_word INTEGER NOT NULL)')
            con.executemany('INSERT INTO normalizzata VALUES (?,?)', [(w[0], w[1]) for w in words])
        con.executemany('INSERT INTO meta VALUES (?,?)', [
            ('normalizzazione_stato', state),
            ('iwfs_model', json.dumps({'model_version': '1.0', 'normalization_version': 'iwfs-norm-1/abc'})),
            ('normalizzazione_report', json.dumps({'source_words_sha256': 'f' * 64}))])
    return path


def run(folder, raw_path, db=None, **kwargs):
    db = db or Path(folder) / 'giochi_v2.sqlite3'
    return task.generate(raw_path, db, Path(folder) / 'report.json', Path(folder) / 'bk', **kwargs), db


def count(db, table='ZeroContext_Segrete'):
    with closing(sqlite3.connect(db)) as con:
        return con.execute(f'SELECT count(*) FROM {table}').fetchone()[0]


class CopiaSegreteTests(unittest.TestCase):
    def test_copies_every_word_of_normalizzata_with_iwfs_of_at_least_45(self):
        with tempfile.TemporaryDirectory() as folder:
            summary, db = run(folder, raw(folder))
            with closing(sqlite3.connect(db)) as con:
                rows = {r[0]: r[1:] for r in con.execute(
                    'SELECT parola,lunghezza,parola_singola,iwfs,iwfs_completo,confidenza FROM ZeroContext_Segrete')}
            self.assertEqual(set(rows), {'sole', 'casa', 'tre', 'città', 'abaceto', 'anti-aereo'})
            self.assertEqual(rows['sole'][2], 45.0)
            self.assertEqual(rows['tre'][0], 3)
            self.assertEqual(rows['anti-aereo'][1], 0)                      # parola_singola
            self.assertEqual(rows['abaceto'][3:5], (0, 1))                  # IWFS parziale con confidenza bassa: copiata, ma marcata
            self.assertEqual(rows['casa'][3:5], (1, 3))
            self.assertEqual(summary['conteggi']['copiate'], 6)
            self.assertEqual(summary['conteggi']['iwfs_parziale'], 1)

    def test_the_name_is_case_insensitive_and_metadata_are_written(self):
        with tempfile.TemporaryDirectory() as folder:
            _, db = run(folder, raw(folder))
            with closing(sqlite3.connect(db)) as con:
                self.assertEqual(con.execute('SELECT count(*) FROM zerocontext_segrete').fetchone(), (6,))
                meta = dict(con.execute('SELECT nome,valore FROM ZeroContext_Segrete_meta'))
            self.assertEqual((meta['iwfs_minimo'], meta['parole']), ('45.0', '6'))
            self.assertEqual(meta['versione_normalizzazione_iwfs'], 'iwfs-norm-1/abc')

    def test_other_tables_of_giochi_v2_stay_and_an_existing_file_is_backed_up(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'giochi_v2.sqlite3'
            with closing(sqlite3.connect(db)) as con, con:
                con.execute('CREATE TABLE zerocade_segrete(id INTEGER PRIMARY KEY, parola TEXT)')
                con.execute("INSERT INTO zerocade_segrete VALUES (1,'mare')")
                con.execute('CREATE TABLE zerowordhunt_parole(id INTEGER PRIMARY KEY, parola TEXT)')
                con.execute('CREATE TABLE ZeroContext_Segrete(id INTEGER PRIMARY KEY, parola TEXT)')   # versione precedente
            summary, _ = run(folder, raw(folder), db)
            with closing(sqlite3.connect(db)) as con:
                self.assertEqual(con.execute('SELECT parola FROM zerocade_segrete').fetchall(), [('mare',)])
                self.assertEqual(con.execute('SELECT count(*) FROM zerowordhunt_parole').fetchone(), (0,))
            self.assertEqual(count(db), 6)
            self.assertEqual(len(list((Path(folder) / 'bk').glob('giochi_v2-*.sqlite3'))), 1)
            self.assertTrue(Path(summary['backup']).is_file())
            self.assertEqual(json.loads((Path(folder) / 'report.json').read_text(encoding='utf-8'))['conteggi']['copiate'], 6)

    def test_preconditions_leave_the_previous_table_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            _, db = run(folder, raw(folder))
            before = count(db)
            for name, kwargs in (('senza_iwfs', {'with_iwfs': False}), ('non_aggiornata', {'state': 'da_aggiornare'}),
                                 ('nessuna_parola', {'words': [('sole', 1, 10.0, 'FULL', 'HIGH')]})):
                sub = Path(folder) / name
                sub.mkdir()
                with self.assertRaises(task.PreconditionError):
                    run(folder, raw(sub, **kwargs), db)
            self.assertEqual(count(db), before)

    def test_plan_counts_without_writing_and_the_threshold_can_change(self):
        with tempfile.TemporaryDirectory() as folder:
            source = raw(folder)
            summary, db = run(folder, source, plan=True)
            self.assertFalse(db.exists())
            self.assertEqual(summary['conteggi']['copiate'], 6)
            summary, _ = run(folder, source, min_iwfs=80.0, plan=True)
            self.assertEqual(summary['conteggi']['copiate'], 4)   # casa, tre, città, anti-aereo


if __name__ == '__main__':
    unittest.main()
