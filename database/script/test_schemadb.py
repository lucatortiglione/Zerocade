import gc
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from schemadb import SchemaDb, rewrite

QUESTIONS = '''
CREATE TABLE domande(id TEXT PRIMARY KEY, testo TEXT NOT NULL, ordine INTEGER NOT NULL);
CREATE TABLE opzioni(domanda TEXT NOT NULL REFERENCES domande(id) ON DELETE CASCADE, posizione INTEGER NOT NULL,
  testo TEXT NOT NULL, giusta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(domanda, posizione));
CREATE UNIQUE INDEX opzioni_una_giusta ON opzioni(domanda) WHERE giusta = 1;
'''
QUESTIONS_WITHOUT_ROWID = '''
CREATE TABLE domande(id TEXT PRIMARY KEY, testo TEXT NOT NULL, ordine INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE opzioni(domanda TEXT NOT NULL REFERENCES domande(id) ON DELETE CASCADE, posizione INTEGER NOT NULL,
  testo TEXT NOT NULL, giusta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(domanda, posizione)) WITHOUT ROWID;
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
        with closing(sqlite3.connect(self.a)) as original, closing(db.connect(self.a.parent / 'altro.db')) as other:
            self.assertEqual(original.execute('SELECT count(*) FROM domande').fetchone(), (1,))
            self.assertIsInstance(other, sqlite3.Connection)
        ro.close()
        con.close()

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
        again.close()

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

    def test_a_view_keeps_an_old_table_name(self):
        db = self.built()
        src = Path(self.tmp.name) / 'con_vista.db'
        con = sqlite3.connect(src)
        con.executescript('CREATE TABLE righe(n INTEGER PRIMARY KEY, testo TEXT NOT NULL) STRICT;'
                          'CREATE VIEW domande AS SELECT n AS id, testo FROM righe;'
                          "INSERT INTO righe VALUES(1, 'Capitale?');")
        con.close()
        db.import_schema(src, 'uno')
        con = db.connect(self.a)
        self.assertEqual(con.execute('SELECT id, testo FROM domande').fetchall(), [(1, 'Capitale?')])
        con.close()
        con = sqlite3.connect(db.file)
        self.assertEqual(dict(con.execute("SELECT name, type FROM zerodb_objects WHERE schema='uno'")),
                         {'righe': 'table', 'domande': 'view'})
        self.assertIn('FROM uno__righe', con.execute("SELECT sql FROM sqlite_schema WHERE name='uno__domande'").fetchone()[0])
        con.close()
        out = Path(self.tmp.name) / 'uno.db'
        self.assertEqual(db.export_schema('uno', out), {'righe': 1})
        con = sqlite3.connect(out)
        self.assertEqual(con.execute('SELECT testo FROM domande').fetchall(), [('Capitale?',)])
        con.close()

    def test_verify_does_not_depend_on_the_order_of_the_rows_in_the_file(self):
        # In the old file 'a0' comes after 'q1' (insertion order); WITHOUT ROWID keeps it before (key order).
        con = sqlite3.connect(self.a)
        con.execute("INSERT INTO domande VALUES('a0','Fiume?',2)")
        con.execute("INSERT INTO opzioni VALUES('a0',0,'Po',1)")
        con.commit()
        con.close()
        db = self.built()
        src = Path(self.tmp.name) / 'senza_rowid.db'
        con = sqlite3.connect(src)
        con.executescript(QUESTIONS_WITHOUT_ROWID)
        con.execute(f"ATTACH DATABASE '{self.a}' AS a")
        con.execute('INSERT INTO domande SELECT * FROM a.domande')
        con.execute('INSERT INTO opzioni SELECT * FROM a.opzioni')
        con.commit()
        # Read like _digest reads them (every column, so no covering index): file order.
        self.assertEqual(con.execute('SELECT id, testo FROM domande').fetchall(), [('a0', 'Fiume?'), ('q1', 'Capitale?')])
        self.assertEqual(con.execute('SELECT id, testo FROM a.domande').fetchall(), [('q1', 'Capitale?'), ('a0', 'Fiume?')])
        con.close()
        db.import_schema(src, 'uno')
        self.assertEqual(db.verify({'uno': self.a, 'due': self.b}), [])

    def test_an_address_names_a_schema_and_legacy_goes_back_to_the_old_file(self):
        db = self.built()
        address = db.address('uno')
        self.assertEqual(address, f'{db.file}#uno')
        self.assertEqual(db.schema_of(address), 'uno')
        self.assertEqual(db.schema_of(f'file:{db.address("due")}?mode=ro'), 'due')
        self.assertIsNone(db.schema_of(f'{db.file}#altro'))  # not a schema of this file
        with self.assertRaises(ValueError):
            db.address('altro')
        con = db.connect(address)
        self.assertEqual(con.execute('SELECT testo FROM domande').fetchall(), [('Capitale?',)])
        con.close()
        con = db.connect(f'file:{address}?mode=ro', uri=True)
        self.assertEqual(con.execute('SELECT count(*) FROM opzioni').fetchone(), (1,))
        con.close()
        self.assertTrue(db.exists(address))
        import os
        os.environ['TEST_SCHEMADB'] = 'legacy'
        try:  # without the file of all schemas, the address is the old database of its schema
            self.assertEqual(Path(db.file_of(address)).resolve(), self.a.resolve())
            con = db.connect(f'file:{address}?mode=ro', uri=True)
            self.assertEqual(con.execute('SELECT testo FROM domande').fetchall(), [('Capitale?',)])
            con.close()
            self.assertTrue(db.exists(address))
        finally:
            del os.environ['TEST_SCHEMADB']

    def test_a_folder_name_with_an_apostrophe_does_not_break_the_copy(self):
        # Before, the path went into the SQL between apostrophes: "Documenti dell'utente" ended the string early.
        d = Path(self.tmp.name) / "Documenti dell'utente"
        d.mkdir()
        src = d / 'domande.db'
        make(src, [("INSERT INTO domande VALUES('q9','Monte?',1)", ())])
        db = SchemaDb(d / 'giochi.sqlite3', {src: 'uno'}, 'TEST_SCHEMADB')
        db.build({'uno': src})
        self.assertEqual(db.verify({'uno': src}), [])
        con = sqlite3.connect(db.file)
        self.assertEqual(con.execute('SELECT testo FROM uno__domande').fetchall(), [('Monte?',)])
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

    def test_paths_with_uri_characters_still_address_the_unified_schema(self):
        folder = Path(self.tmp.name) / "dati #20% dell'utente"
        folder.mkdir()
        source = folder / 'domande.db'
        make(source, [("INSERT INTO domande VALUES('q1','Prima',1)", ())])
        db = SchemaDb(folder / 'giochi.sqlite3', {source: 'uno'}, 'TEST_SCHEMADB')
        db.build({'uno': source})
        self.assertEqual(db.verify({'uno': source}), [])
        with closing(db.connect(source)) as con, con:
            con.execute("INSERT INTO domande VALUES('q2','Seconda',2)")
        with closing(db.connect(Path(db.address('uno')).as_uri() + '?mode=ro', uri=True)) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM domande').fetchone(), (2,))
        with closing(sqlite3.connect(source)) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM domande').fetchone(), (1,))
        self.assertEqual(db.export_schema('uno', folder / 'export.db')['domande'], 2)

    def test_failed_exports_never_publish_a_partial_database(self):
        db = self.built()
        target = Path(self.tmp.name) / 'export.db'
        with self.assertRaises(SystemExit):
            db.export_schema('unknown', target)
        self.assertFalse(target.exists())
        with closing(sqlite3.connect(db.file)) as con, con:
            con.execute('DROP TABLE uno__opzioni')
        with self.assertRaises(KeyError):
            db.export_schema('uno', target)
        self.assertFalse(target.exists())
        self.assertEqual(list(target.parent.glob(target.name + '.*.part')), [])

    def test_unsupported_object_names_fail_before_replacing_a_schema(self):
        db = self.built()
        source = Path(self.tmp.name) / 'invalid.db'
        with closing(sqlite3.connect(source)) as con:
            con.execute('CREATE TABLE "bad name"(id INTEGER)')
        with self.assertRaisesRegex(ValueError, 'nomi'):
            db.import_schema(source, 'uno')
        with closing(db.connect(self.a)) as con:
            self.assertEqual(con.execute('SELECT testo FROM domande').fetchall(), [('Capitale?',)])


if __name__ == '__main__':
    unittest.main()
