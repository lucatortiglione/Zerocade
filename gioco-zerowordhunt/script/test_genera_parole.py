"""ZeroWordHunt : Genera Parole: parole di almeno 4 lettere con IWFS ≥ 50 da normalizzata a giochi_v2, sostituzione atomica."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import genera_parole as task

WORDS = [  # (parola, is_single_word, iwfs, stato, confidenza)
    ('sole', 1, 50.0, 'FULL', 'HIGH'),             # 4 lettere e IWFS esattamente 50: dentro
    ('casa', 1, 99.65, 'FULL', 'HIGH'),
    ('città', 1, 80.0, 'FULL', 'MEDIUM'),          # accentata: dentro, ma lettere_semplici = 0
    ('tre', 1, 90.0, 'FULL', 'HIGH'),              # 3 lettere: fuori
    ('rosa', 1, 49.99, 'FULL', 'HIGH'),            # IWFS sotto 50: fuori
    ('zzzz', 1, None, 'UNAVAILABLE', 'NONE'),      # senza IWFS: fuori
    ('abaceto', 1, 55.0, 'PARTIAL', 'LOW'),        # parziale: dentro, ma marcata
    ('anti-aereo', 0, 90.0, 'FULL', 'HIGH'),       # non è una parola singola: fuori
    ('laurent', 1, 77.37, 'PARTIAL', 'LOW'),       # nome da rivedere (REVIEW_REQUIRED): fuori
]
REVIEW = {'laurent'}


def raw(folder, words=WORDS, with_iwfs=True, state='aggiornata'):
    path = Path(folder) / 'raw.sqlite3'
    with closing(sqlite3.connect(path)) as con, con:
        con.execute('CREATE TABLE meta(name TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT')
        if with_iwfs:
            con.execute('CREATE TABLE normalizzata(parola TEXT PRIMARY KEY,is_single_word INTEGER NOT NULL,iwfs REAL,iwfs_status TEXT,iwfs_confidence TEXT,lexical_validity TEXT NOT NULL)')
            con.executemany('INSERT INTO normalizzata VALUES (?,?,?,?,?,?)', [(*w, 'REVIEW_REQUIRED' if w[0] in REVIEW else 'VALID') for w in words])
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


class GeneraParoleTests(unittest.TestCase):
    def test_selects_words_of_at_least_four_letters_with_iwfs_of_at_least_fifty(self):
        with tempfile.TemporaryDirectory() as folder:
            summary, db = run(folder, raw(folder))
            with closing(sqlite3.connect(db)) as con:
                rows = {r[0]: r[1:] for r in con.execute('SELECT parola,lunghezza,iwfs,iwfs_completo,confidenza,lettere_semplici FROM zerowordhunt_parole')}
            self.assertEqual(set(rows), {'sole', 'casa', 'città', 'abaceto'})
            self.assertEqual(rows['sole'][:2], (4, 50.0))
            self.assertEqual(rows['casa'][2:4], (1, 3))
            self.assertEqual(rows['abaceto'][2:4], (0, 1))          # IWFS parziale con confidenza bassa: dentro, ma marcato
            self.assertEqual((rows['città'][4], rows['casa'][4]), (0, 1))  # lettere semplici: solo a-z
            self.assertEqual(summary['conteggi']['selezionate'], 4)
            self.assertEqual(summary['conteggi']['iwfs_parziale'], 1)

    def test_the_view_keeps_the_names_the_server_reads(self):
        with tempfile.TemporaryDirectory() as folder:
            _, db = run(folder, raw(folder))
            with closing(sqlite3.connect(db)) as con:
                self.assertEqual(con.execute("SELECT type FROM sqlite_schema WHERE name='zerowordhunt'").fetchone(), ('view',))
                self.assertEqual(con.execute("SELECT parola,lunghezza,iwfs_stato,iwfs_confidenza FROM zerowordhunt WHERE parola IN ('casa','abaceto') ORDER BY parola").fetchall(),
                                 [('abaceto', 7, 'PARTIAL', 'LOW'), ('casa', 4, 'FULL', 'HIGH')])
                self.assertEqual(con.execute('SELECT count(*) FROM zerowordhunt WHERE lettere_semplici=1 AND lunghezza BETWEEN 5 AND 12').fetchone(), (1,))
                meta = dict(con.execute('SELECT nome,valore FROM zerowordhunt_meta'))
            self.assertEqual((meta['lunghezza_minima'], meta['iwfs_minimo'], meta['parole']), ('4', '50.0', '4'))
            self.assertEqual(meta['versione_normalizzazione_iwfs'], 'iwfs-norm-1/abc')

    def test_other_tables_of_giochi_v2_stay_and_an_existing_file_is_backed_up(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'giochi_v2.sqlite3'
            with closing(sqlite3.connect(db)) as con, con:
                con.execute('CREATE TABLE zerocade_segrete(id INTEGER PRIMARY KEY, parola TEXT)')
                con.execute("INSERT INTO zerocade_segrete VALUES (1,'mare')")
                con.execute('CREATE TABLE zerowordhunt_parole(id INTEGER PRIMARY KEY, parola TEXT)')   # versione precedente
            summary, _ = run(folder, raw(folder), db)
            with closing(sqlite3.connect(db)) as con:
                self.assertEqual(con.execute('SELECT parola FROM zerocade_segrete').fetchall(), [('mare',)])
                self.assertEqual(con.execute('SELECT count(*) FROM zerowordhunt_parole').fetchone(), (4,))
            self.assertEqual(len(list((Path(folder) / 'bk').glob('giochi_v2-*.sqlite3'))), 1)
            self.assertTrue(Path(summary['backup']).is_file())
            self.assertEqual(json.loads((Path(folder) / 'report.json').read_text(encoding='utf-8'))['conteggi']['selezionate'], 4)

    def test_preconditions_leave_the_previous_table_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            summary, db = run(folder, raw(folder))
            def count():
                with closing(sqlite3.connect(db)) as con:
                    return con.execute('SELECT count(*) FROM zerowordhunt_parole').fetchone()
            before = count()
            for name, kwargs in (('senza_iwfs', {'with_iwfs': False}), ('non_aggiornata', {'state': 'da_aggiornare'}),
                                 ('nessuna_parola', {'words': [('sole', 1, 10.0, 'FULL', 'HIGH')]})):
                sub = Path(folder) / name
                sub.mkdir()
                with self.assertRaises(task.PreconditionError):
                    run(folder, raw(sub, **kwargs), db)
            self.assertEqual(count(), before)

    def test_plan_counts_without_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            summary, db = run(folder, raw(folder), plan=True)
            self.assertFalse(db.exists())
            self.assertEqual(summary['conteggi']['selezionate'], 4)

    def test_thresholds_can_be_changed(self):
        with tempfile.TemporaryDirectory() as folder:
            summary, _ = run(folder, raw(folder), min_length=5, min_iwfs=60.0, plan=True)
            self.assertEqual(summary['conteggi']['selezionate'], 1)   # solo città (5 lettere, IWFS 80): abaceto ha 55, casa e sole 4 lettere


if __name__ == '__main__':
    unittest.main()
