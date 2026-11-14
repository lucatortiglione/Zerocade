"""json_store: le tabelle dei risultati compatte restituiscono gli stessi documenti e si scrivono come prima."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from json_store import SPECS, compact


class JsonStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.con = sqlite3.connect(Path(self.tmp.name)/'raw.sqlite3')
        self.addCleanup(self.con.close)
        self.con.execute('PRAGMA foreign_keys=ON')
        self.con.executescript('''
            CREATE TABLE raw__word_utility_runs(id TEXT PRIMARY KEY) STRICT, WITHOUT ROWID;
            INSERT INTO raw__word_utility_runs VALUES ('r1'),('r2');
            CREATE TABLE raw__word_utility_results(
             run_id TEXT NOT NULL REFERENCES raw__word_utility_runs(id), word TEXT NOT NULL,
             features_json TEXT NOT NULL CHECK(json_valid(features_json)),
             verdicts_json TEXT NOT NULL CHECK(json_valid(verdicts_json)),
             PRIMARY KEY(run_id,word)) STRICT, WITHOUT ROWID;''')

    def rows(self):
        return [(r, w, json.loads(f), json.loads(v)) for r, w, f, v in
                self.con.execute('SELECT * FROM raw__word_utility_results ORDER BY run_id,word')]

    def test_conversion_keeps_documents_and_shares_repeated_ones(self):
        same = json.dumps({'zerowordle': {'status': 'ESCLUSA_FORMATO', 'reason': 'apostrofo'}})
        with self.con:
            self.con.executemany('INSERT INTO raw__word_utility_results VALUES (?,?,?,?)', [
                ('r1', 'acqua', '{"zipf_it": 4.5}', same), ('r1', "l'acqua", '{"invalid_reasons": ["apostrofo"]}', same),
                ('r2', "l'acqua", '{"invalid_reasons":["apostrofo"]}', same), ('r2', 'città', '{"nota": "\\u00e8"}', same)])
        before = self.rows()
        self.assertTrue(compact(self.con, 'raw__word_utility_results'))
        self.assertEqual(self.rows(), before)
        types = dict(self.con.execute("SELECT name,type FROM sqlite_schema WHERE name LIKE 'raw__word_utility%'"))
        self.assertEqual(types['raw__word_utility_results'], 'view')
        # Il verdetto ripetuto e le due grafie dello stesso documento stanno una volta sola.
        self.assertEqual(self.con.execute('SELECT count(*) FROM raw__word_utility_documents').fetchone()[0], 4)
        self.assertFalse(compact(self.con, 'raw__word_utility_results'))
        self.assertEqual(self.con.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_the_view_is_written_like_the_old_table(self):
        compact(self.con, 'raw__word_utility_results')
        with self.con:
            self.con.executemany('INSERT OR IGNORE INTO raw__word_utility_results VALUES (?,?,?,?)', [
                ('r1', 'casa', '{"a":1}', '{"b":2}'), ('r1', 'casa', '{"a":9}', '{"b":9}')])
        self.assertEqual(self.rows(), [('r1', 'casa', {'a': 1}, {'b': 2})])
        with self.assertRaises(sqlite3.Error):  # JSON non valido, come con il CHECK di prima
            self.con.execute("INSERT INTO raw__word_utility_results VALUES ('r1','x','{rotto','{}')")
        with self.assertRaises(sqlite3.IntegrityError):  # la chiave esterna vale ancora
            self.con.execute("INSERT INTO raw__word_utility_results VALUES ('r9','x','{}','{}')")
        self.con.execute("DELETE FROM raw__word_utility_results WHERE word='casa'")
        self.assertEqual(self.rows(), [])

    def test_child_foreign_keys_move_to_the_compact_table(self):
        self.con.executescript('''
            INSERT INTO raw__word_utility_results VALUES ('r1','casa','{}','{"a":1}');
            CREATE TABLE raw__word_reviews(run_id TEXT NOT NULL, word TEXT NOT NULL, verdict TEXT NOT NULL,
             PRIMARY KEY(run_id,word), FOREIGN KEY(run_id,word) REFERENCES raw__word_utility_results(run_id,word))
             STRICT, WITHOUT ROWID;
            INSERT INTO raw__word_reviews VALUES ('r1','casa','ok');''')
        self.assertTrue(compact(self.con, 'raw__word_utility_results'))
        parents = {fk[2] for fk in self.con.execute('PRAGMA foreign_key_list(raw__word_reviews)')}
        self.assertEqual(parents, {'raw__word_utility_result_rows'})
        self.assertEqual(self.con.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(self.con.execute('PRAGMA foreign_keys').fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):  # il vincolo vale sulla tabella compatta
            self.con.execute("INSERT INTO raw__word_reviews VALUES ('r1','gatto','no')")

    def test_a_failed_conversion_leaves_the_table_as_it_was(self):
        self.con.executescript('''
            INSERT INTO raw__word_utility_results VALUES ('r1','casa','{}','{}');
            CREATE TABLE raw__word_reviews(run_id TEXT, word TEXT, FOREIGN KEY(run_id,word)
             REFERENCES raw__word_utility_results(run_id,word));
            PRAGMA foreign_keys=OFF; INSERT INTO raw__word_reviews VALUES ('r1','orfana'); PRAGMA foreign_keys=ON;''')
        with self.assertRaises(sqlite3.IntegrityError):  # una figlia orfana: nessun COMMIT
            compact(self.con, 'raw__word_utility_results')
        self.assertEqual(self.con.execute("SELECT type FROM sqlite_schema WHERE name='raw__word_utility_results'").fetchone()[0],
                         'table')
        self.assertIsNone(self.con.execute("SELECT 1 FROM sqlite_schema WHERE name='raw__word_utility_result_rows'").fetchone())

    def test_every_spec_builds_on_an_empty_database(self):
        from json_store import ddl
        with closing(sqlite3.connect(':memory:')) as con:
            for name in SPECS:
                con.executescript(ddl(name))
                self.assertEqual(con.execute('SELECT type FROM sqlite_schema WHERE name=?', (name,)).fetchone()[0], 'view')


if __name__ == '__main__':
    unittest.main()
