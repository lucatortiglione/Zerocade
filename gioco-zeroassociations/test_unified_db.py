import gc
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import unified_db as u

SCHEMA_A = '''
CREATE TABLE prompts(id INTEGER PRIMARY KEY, lemma TEXT NOT NULL) STRICT;
CREATE TABLE associations(id INTEGER PRIMARY KEY, prompt_id INTEGER NOT NULL REFERENCES prompts(id), word TEXT NOT NULL) STRICT;
CREATE INDEX associations_by_prompt ON associations(prompt_id);
CREATE VIEW pool_sizes AS SELECT p.lemma AS lemma, count(*) AS n FROM prompts p JOIN associations a ON a.prompt_id=p.id GROUP BY p.id;
CREATE TRIGGER no_empty_word BEFORE INSERT ON associations WHEN trim(NEW.word)='' BEGIN SELECT RAISE(ABORT,'vuota'); END;
'''
SCHEMA_B = '''
CREATE TABLE prompts(id INTEGER PRIMARY KEY, lemma TEXT NOT NULL, extra TEXT GENERATED ALWAYS AS (lemma||'!') VIRTUAL) STRICT;
CREATE VIEW pool_sizes AS SELECT count(*) AS n FROM prompts;
'''


def make(path, ddl, rows):
    db = sqlite3.connect(path)
    db.executescript(ddl)
    for sql, args in rows:
        db.execute(sql, args)
    db.commit()
    db.close()


class UnifiedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.dir = Path(self.tmp.name).resolve()
        make(self.dir/'prompt_raw.sqlite3', SCHEMA_A, [('INSERT INTO prompts VALUES(1,?)', ('mare',)),
                                                      ('INSERT INTO associations VALUES(1,1,?)', ('onda',)),
                                                      ('INSERT INTO associations VALUES(2,1,?)', ('sabbia',))])
        make(self.dir/'prompt.sqlite3', SCHEMA_B, [('INSERT INTO prompts(id,lemma) VALUES(7,?)', ('sole',))])
        self.sources = {'raw': self.dir/'prompt_raw.sqlite3', 'game': self.dir/'prompt.sqlite3'}
        self.patches = [mock.patch.object(u, 'ROOT', self.dir), mock.patch.object(u, 'UNIFIED', self.dir/'zeroassociazioni.sqlite3')]
        for p in self.patches:
            p.start()
        u._cache.clear()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        u._cache.clear()
        gc.collect()  # Windows: closes the connections the tests left open before deleting the files
        self.tmp.cleanup()

    def build(self):
        u.build(sources=self.sources, output=u.UNIFIED)
        return u.verify(u.UNIFIED)

    def test_build_copies_every_table_with_prefixes_and_verifies(self):
        result = self.build()
        self.assertTrue(result['ok'], result['problems'])
        db = sqlite3.connect(u.UNIFIED)
        names = {n for (n,) in db.execute("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")}
        self.assertTrue({'raw__prompts', 'raw__associations', 'raw__associations_by_prompt', 'raw__pool_sizes', 'raw__no_empty_word',
                         'game__prompts', 'game__pool_sizes'} <= names)
        self.assertEqual(db.execute('SELECT lemma FROM game__prompts').fetchall(), [('sole',)])
        # the same object name in two schemas does not clash, and the generated column is rebuilt
        self.assertEqual(db.execute('SELECT extra FROM game__prompts').fetchone(), ('sole!',))
        self.assertEqual(db.execute('SELECT lemma,n FROM raw__pool_sizes').fetchone(), ('mare', 2))

    def test_verify_notices_a_changed_table(self):
        self.build()
        db = sqlite3.connect(u.UNIFIED)
        db.execute("UPDATE raw__associations SET word='altro' WHERE id=1")
        db.commit()
        db.close()
        self.assertFalse(u.verify(u.UNIFIED, mark=False)['ok'])

    def test_not_active_until_verified_and_legacy_switch(self):
        u.build(sources=self.sources, output=u.UNIFIED)
        self.assertFalse(u.active())
        self.assertTrue(u.verify(u.UNIFIED)['ok'])
        self.assertTrue(u.active())
        with mock.patch.dict('os.environ', {'ZEROASSOC_DB': 'legacy'}):
            self.assertFalse(u.active())

    def test_rewrite_prefixes_names_but_not_columns_aliases_or_text(self):
        self.build()
        sql = "SELECT p.lemma AS prompts, a.word FROM prompts p JOIN associations a ON a.prompt_id=p.id WHERE a.word='prompts'"
        out = u.riscrivi(sql, 'raw')
        self.assertIn('FROM raw__prompts p JOIN raw__associations a', out)
        self.assertIn('AS prompts', out)  # an alias keeps its name
        self.assertIn("a.word='prompts'", out)  # data is not touched
        self.assertEqual(u.riscrivi("SELECT 1 FROM sqlite_schema WHERE name='prompts'", 'raw'),
                         "SELECT 1 FROM sqlite_schema WHERE name='raw__prompts'")
        hexed = "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=CAST(X'" + 'prompts'.encode().hex() + "' AS TEXT);"
        self.assertIn("X'" + 'raw__prompts'.encode().hex().upper() + "'", u.riscrivi(hexed, 'raw'))
        self.assertEqual(u.riscrivi('SELECT prompts.lemma FROM main.prompts', 'raw'), 'SELECT raw__prompts.lemma FROM raw__prompts')

    def test_connection_runs_old_sql_on_the_schema_of_the_old_file(self):
        self.build()
        con = u.connect(self.dir/'prompt_raw.sqlite3')
        self.assertIsInstance(con, u.Connection)
        con.execute("INSERT INTO prompts VALUES(2,'cielo')")
        con.execute("INSERT INTO associations VALUES(3,2,'nuvola')")
        con.commit()
        self.assertEqual(con.execute('SELECT lemma,n FROM pool_sizes ORDER BY lemma').fetchall(), [('cielo', 1), ('mare', 2)])
        with self.assertRaises(sqlite3.DatabaseError):
            con.execute("INSERT INTO associations VALUES(4,2,'  ')")  # the trigger came along
        cursor = con.cursor()
        cursor.execute('SELECT count(*) FROM associations')
        self.assertEqual(cursor.fetchone(), (3,))
        # the other schema is untouched, and a file with another name is an ordinary database
        self.assertEqual(sqlite3.connect(u.UNIFIED).execute('SELECT count(*) FROM game__prompts').fetchone(), (1,))
        self.assertNotIsInstance(u.connect(self.dir/'altro.sqlite3'), u.Connection)

    def test_attach_of_an_old_file_becomes_the_schema_and_not_a_second_connection(self):
        self.build()
        sql, aliases = u.prepare_sql(
            "ATTACH DATABASE 'file:" + (self.dir/'prompt.sqlite3').as_posix() + "?mode=ro' AS other;\nSELECT lemma FROM other.prompts;",
            'raw', main_is_unified=True)
        self.assertNotIn('ATTACH', sql)
        self.assertIn('SELECT lemma FROM game__prompts', sql)
        self.assertEqual(aliases, {'other': 'game'})
        # from a standalone database the unified file is attached under the same alias
        sql, _ = u.prepare_sql("ATTACH DATABASE '" + (self.dir/'prompt.sqlite3').as_posix() + "' AS other;\nSELECT 1 FROM other.prompts;", None)
        self.assertIn(u.UNIFIED.as_posix(), sql)
        self.assertIn('other.game__prompts', sql)

    def test_import_replaces_one_schema_and_leaves_the_others(self):
        self.build()
        fresh = self.dir/'nuovo.sqlite3'
        make(fresh, SCHEMA_B, [('INSERT INTO prompts(id,lemma) VALUES(1,?)', ('luna',)), ('INSERT INTO prompts(id,lemma) VALUES(2,?)', ('stella',))])
        u.import_schema(fresh, 'game', u.UNIFIED)
        db = sqlite3.connect(u.UNIFIED)
        self.assertEqual(db.execute('SELECT lemma FROM game__prompts ORDER BY id').fetchall(), [('luna',), ('stella',)])
        self.assertEqual(db.execute('SELECT count(*) FROM raw__associations').fetchone(), (2,))
        self.assertEqual(db.execute("SELECT rows FROM zerodb_objects WHERE schema='game' AND name='prompts'").fetchone(), (2,))

    def test_export_gives_back_a_standalone_database_without_prefixes(self):
        self.build()
        out = self.dir/'esportato.sqlite3'
        u.export_schema('raw', out, u.UNIFIED)
        db = sqlite3.connect(out)
        self.assertEqual(db.execute('SELECT count(*) FROM associations').fetchone(), (2,))
        self.assertEqual(db.execute('SELECT lemma,n FROM pool_sizes').fetchone(), ('mare', 2))
        names = {n for (n,) in db.execute("SELECT name FROM sqlite_schema")}
        self.assertFalse(any('__' in n for n in names), names)

    def test_status_reports_schemas(self):
        self.build()
        info = u.status(u.UNIFIED)
        self.assertEqual(set(info['schemas']), {'raw', 'game'})
        self.assertEqual(info['schemas']['raw']['table']['rows'], 3)
        json.dumps(info)


if __name__ == '__main__':
    unittest.main()
