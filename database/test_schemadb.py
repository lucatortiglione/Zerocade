import gc
import sqlite3
import tempfile
import unittest
from pathlib import Path

from schemadb import SchemaDb, rewrite

QUESTIONS = '''
CREATE TABLE domande(id TEXT PRIMARY KEY, testo TEXT NOT NULL, ordine INTEGER NOT NULL);
CREATE TABLE opzioni(domanda TEXT NOT NULL REFERENCES domande(id) ON DELETE CASCADE, posizione INTEGER NOT NULL,
  testo TEXT NOT NULL, giusta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(domanda, posizione));
CREATE UNIQUE INDEX opzioni_una_giusta ON opzioni(domanda) WHERE giusta = 1;
'''


def make(path: Path, rows):
    con = sqlite3.connect(path)
    con.executescript(QUESTIONS)
    for sql, args in rows:
        con.execute(sql, args)
    con.commit()
    con.close()


class SchemaDbTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        d = Path(self.tmp.name)
        # Two old databases with the same file and table names, in two folders.
        (d / 'a').mkdir()
        (d / 'b').mkdir()
        self.a, self.b = d / 'a' / 'domande.db', d / 'b' / 'domande.db'
        make(self.a, [("INSERT INTO domande VALUES('q1','Capitale?',1)", ()), ("INSERT INTO opzioni VALUES('q1',0,'Roma',1)", ())])
        make(self.b, [("INSERT INTO domande VALUES('x1','Altro?',1)", ())])
        self.db = SchemaDb(d / 'giochi.sqlite3', {self.a: 'uno', self.b: 'due'}, 'TEST_SCHEMADB')

    def tearDown(self):
        gc.collect()
        self.tmp.cleanup()

    def built(self):
        self.db.build({'uno': self.a, 'due': self.b})
        self.assertEqual(self.db.verify({'uno': self.a, 'due': self.b}), [])
        return self.db

    def test_same_names_in_two_schemas_and_a_verified_copy(self):
        db = self.built()
        self.assertTrue(db.active())
        con = sqlite3.connect(db.file)
        self.assertEqual(con.execute('SELECT testo FROM uno__domande').fetchall(), [('Capitale?',)])
        self.assertEqual(con.execute('SELECT testo FROM due__domande').fetchall(), [('Altro?',)])
        names = {n for (n,) in con.execute("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'zerodb_%'")}
        self.assertTrue(all(n.startswith(('uno__', 'due__')) for n in names), names)
        con.close()

    def test_an_old_path_reads_and_writes_its_schema(self):
        db = self.built()
        con = db.connect(self.a)
        con.execute('PRAGMA foreign_keys = ON')
        con.execute("INSERT INTO domande VALUES('q2','Fiume?',2)")
        con.execute("INSERT INTO opzioni VALUES('q2',0,'Po',1)")
        con.commit()
        with self.assertRaises(sqlite3.IntegrityError):  # the partial unique index came along
            con.execute("INSERT INTO opzioni VALUES('q2',1,'Arno',1)")
        self.assertEqual(con.execute('SELECT count(*) FROM domande').fetchone(), (2,))
        ro = db.connect(f'file:{self.b.as_posix()}?mode=ro', uri=True)
        self.assertEqual(ro.execute('SELECT id FROM domande').fetchall(), [('x1',)])
        # the old files are untouched, another file is an ordinary database
        self.assertEqual(sqlite3.connect(self.a).execute('SELECT count(*) FROM domande').fetchone(), (1,))
        self.assertIsInstance(db.connect(self.a.parent / 'altro.db'), sqlite3.Connection)

    def test_a_table_a_tool_creates_joins_the_schema(self):
        db = self.built()
        con = db.connect(self.a)
        con.executescript('CREATE TABLE IF NOT EXISTS note(id INTEGER PRIMARY KEY, testo TEXT);')
        con.execute("INSERT INTO note(testo) VALUES('ciao')")
        con.commit()
        con.close()
        again = db.connect(self.a)
        self.assertEqual(again.execute('SELECT testo FROM note').fetchall(), [('ciao',)])
        self.assertIn('note', db.names_of('uno'))

    def test_legacy_switch_and_unverified_file(self):
        self.db.build({'uno': self.a, 'due': self.b})
        self.assertFalse(self.db.active())  # not verified yet: the old files are used
        self.assertEqual(self.db.verify({'uno': self.a, 'due': self.b}), [])
        self.assertTrue(self.db.active())
        import os
        os.environ['TEST_SCHEMADB'] = 'legacy'
        try:
            self.assertFalse(self.db.active())
        finally:
            del os.environ['TEST_SCHEMADB']

    def test_export_gives_back_the_old_database(self):
        db = self.built()
        out = Path(self.tmp.name) / 'uno.db'
        self.assertEqual(db.export_schema('uno', out), {'domande': 1, 'opzioni': 1})
        con = sqlite3.connect(out)
        self.assertEqual(con.execute('SELECT testo FROM opzioni').fetchall(), [('Roma',)])
        con.close()

    def test_rewrite_keeps_aliases_text_and_columns(self):
        names = {'domande', 'opzioni'}
        sql = "SELECT d.testo AS domande FROM domande d JOIN opzioni o ON o.domanda = d.id WHERE d.testo = 'domande'"
        out = rewrite(sql, 'uno', names)
        self.assertIn('FROM uno__domande d JOIN uno__opzioni o', out)
        self.assertIn('AS domande', out)
        self.assertIn("d.testo = 'domande'", out)
        self.assertEqual(rewrite("SELECT 1 FROM sqlite_schema WHERE name = 'opzioni'", 'uno', names),
                         "SELECT 1 FROM sqlite_schema WHERE name = 'uno__opzioni'")


if __name__ == '__main__':
    unittest.main()
