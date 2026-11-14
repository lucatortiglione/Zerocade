"""ottimizza_db: le evidenze dell'analisi e la compattazione condizionata, su DB temporanei."""
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from ottimizza_db import analyze, compact


class OttimizzaDbTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/'prova.sqlite3'

    def test_analysis_reports_rowid_key_and_repeated_strings(self):
        with closing(sqlite3.connect(self.path)) as con:
            con.execute('CREATE TABLE voci(parola TEXT PRIMARY KEY, stato TEXT NOT NULL)')
            con.execute('CREATE TABLE ordinata(id INTEGER PRIMARY KEY, nome TEXT)')
            con.executemany('INSERT INTO voci VALUES (?,?)',
                            ((f'parola{i:06d}', 'IN_ATTESA_DI_REVISIONE' if i % 2 else 'REVISIONATA_E_PUBBLICATA')
                             for i in range(60_000)))
            con.execute('INSERT INTO ordinata(nome) VALUES (?)', ('uno',))
            con.commit()
        report = analyze(self.path, exe=None)
        rules = {(f['rule'], f.get('table'), f.get('column')) for f in report['findings']}
        self.assertIn(('§6 WITHOUT ROWID', 'voci', None), rules)
        self.assertIn(('§3 lookup', 'voci', 'stato'), rules)
        self.assertFalse(any(f.get('table') == 'ordinata' for f in report['findings']))
        self.assertEqual(report['integrity'], 'ok')
        self.assertFalse(report['table_sizes_measured'])

    def test_prose_is_not_composite_but_lists_and_json_are(self):
        import ottimizza_db
        with closing(sqlite3.connect(self.path)) as con:
            con.execute('CREATE TABLE note(id INTEGER PRIMARY KEY, frase TEXT, lista TEXT, doc TEXT)')
            con.executemany('INSERT INTO note(frase, lista, doc) VALUES (?,?,?)',
                            ((f'Difficoltà non calibrata; nessun test, riga {i}.', f'a{i}|b|c',
                              '{"chiave": "'+'x'*900+f'", "n": {i}}}') for i in range(2_000)))
            con.commit()
        original = ottimizza_db.MB
        ottimizza_db.MB = 1024  # soglie in KB: il DB di prova è piccolo
        self.addCleanup(setattr, ottimizza_db, 'MB', original)
        rules = {(f['rule'], f.get('column')) for f in analyze(self.path, exe=None)['findings']}
        self.assertIn(('§1 1NF', 'lista'), rules)
        self.assertIn(('§1 JSON', 'doc'), rules)
        self.assertNotIn(('§1 1NF', 'frase'), rules)

    def test_compaction_only_when_free_pages_are_significant(self):
        with closing(sqlite3.connect(self.path)) as con:
            con.execute('CREATE TABLE dati(id INTEGER PRIMARY KEY, testo TEXT)')
            con.executemany('INSERT INTO dati(testo) VALUES (?)', (('x'*500,) for _ in range(5_000)))
            con.commit()
            con.execute('DELETE FROM dati WHERE id > 100')
            con.commit()
        result = compact(self.path)
        self.assertEqual(result['status'], 'COMPACTED')
        self.assertLess(result['bytes_after'], result['bytes_before'])
        with closing(sqlite3.connect(self.path)) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM dati').fetchone()[0], 100)
        self.assertEqual(compact(self.path)['status'], 'SKIPPED')


if __name__ == '__main__':
    unittest.main()
