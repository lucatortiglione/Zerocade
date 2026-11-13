import gc
import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import giochi

A = 'a' * 64  # gli id dei sensi sono impronte di 64 caratteri
B = 'b' * 64
# Le righe come le dà _assoc_rows dal DB di lavoro. «pane» è risposta di tutti e due i prompt.
ROWS = {
    'prompts': [('forno', 'Apparecchio per cuocere'), ('mare', 'Distesa di acqua salata')],
    'reviews': [('r1', 'verified'), ('r2', 'verified')],
    'senses': [(A, 'forno', 'Apparecchio per cuocere', 'NOUN', '009', 'r1'),
               (B, 'mare', 'Distesa di acqua salata', 'NOUN', None, 'r2')],
    'associations': [(A, 'pane', 'pane', 'easy'), (A, 'pizza', 'pizza', 'unrated'), (A, 'teglia', 'teglia', 'medium'),
                     (B, 'onda', 'onda', 'easy'), (B, 'pane', 'cibo', 'medium'), (B, 'sale', 'sale', 'hard')],
    'group_limits': [(A, 'pane', 1), (A, 'pizza', 2), (B, 'onda', 1)],
    'conflicts': [(A, 'pane', 'pizza')],
}
TABLES = {'prompts', 'words', 'difficulties', 'meaning_groups', 'prompt_words', 'conflicts', 'meta'}


def rows():
    return {k: list(v) for k, v in ROWS.items()}


class AssociazioniTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.file = Path(self.tmp.name) / 'giochi.sqlite3'
        # Un file di prova, e mai il DB di lavoro come origine.
        for target, value in ((giochi, self.file), (giochi.db, self.file)):
            patch = mock.patch.object(target, 'FILE' if target is giochi else 'file', value)
            patch.start()
            self.addCleanup(patch.stop)
        patch = mock.patch.object(giochi, '_assoc_sources', lambda: [])
        patch.start()
        self.addCleanup(patch.stop)

    def tearDown(self):
        gc.collect()
        self.tmp.cleanup()

    def test_the_copy_gives_back_the_rows_of_the_source(self):
        result = giochi._write_associazioni(rows(), 'prova')
        self.assertEqual((result['prompts'], result['words']), (2, 6))
        self.assertEqual(giochi._schema_rows('associazioni', giochi.ASSOC_CANONICAL), giochi._canonical(rows()))
        self.assertEqual(giochi.verify_associazioni(), [])

    def test_only_prompts_unique_words_and_links(self):
        giochi._write_associazioni(rows(), 'prova')
        con = sqlite3.connect(self.file)
        kinds = dict(con.execute("SELECT name, type FROM zerodb_objects WHERE schema='associazioni'"))
        self.assertEqual({n for n, t in kinds.items() if t == 'table'}, TABLES)
        self.assertNotIn('view', kinds.values())
        # Ogni parola una volta sola, anche se è risposta di più prompt; un collegamento per ogni risposta.
        self.assertEqual(con.execute('SELECT word FROM associazioni__words ORDER BY id').fetchall(),
                         [('cibo',), ('onda',), ('pane',), ('pizza',), ('sale',), ('teglia',)])
        self.assertEqual(con.execute('SELECT count(*) FROM associazioni__prompt_words').fetchone()[0], len(ROWS['associations']))
        self.assertEqual(con.execute('''SELECT p.prompt FROM associazioni__prompt_words pw
            JOIN associazioni__prompts p ON p.id = pw.prompt_id JOIN associazioni__words w ON w.id = pw.word_id
            WHERE w.word = 'pane' ORDER BY 1''').fetchall(), [('forno',), ('mare',)])
        # Il ref è quello del server (poolRef): la telemetria resta collegata.
        expected = 'c' + hashlib.sha256(A.encode()).hexdigest()[:24]
        self.assertEqual(con.execute("SELECT ref FROM associazioni__prompts WHERE prompt='forno'").fetchone()[0], expected)
        self.assertEqual(con.execute('SELECT DISTINCT typeof(word_id) FROM associazioni__prompt_words').fetchall(), [('integer',)])
        # Il gruppo è il numero della parola che gli dà il nome: «pane» di mare sta nel gruppo «cibo».
        self.assertEqual(con.execute('''SELECT n.word FROM associazioni__prompt_words pw
            JOIN associazioni__prompts p ON p.id = pw.prompt_id JOIN associazioni__words w ON w.id = pw.word_id
            JOIN associazioni__words n ON n.id = pw.group_name_id WHERE p.prompt = 'mare' AND w.word = 'pane' ''').fetchone(), ('cibo',))
        self.assertIn('WITHOUT ROWID', con.execute("SELECT sql FROM sqlite_schema WHERE name='associazioni__prompt_words'").fetchone()[0])
        self.assertEqual(con.execute('PRAGMA foreign_key_check').fetchall(), [])
        con.close()

    def test_rows_the_source_would_reject_are_refused(self):
        for table, row in (('associations', (A, 'forno', 'forno', 'facilissima')),  # difficoltà sconosciuta
                           ('conflicts', (A, 'pane', 'tostapane'))):  # parola fuori dal bacino
            bad = rows()
            bad[table].append(row)
            with self.subTest(table=table), self.assertRaises(sqlite3.IntegrityError):
                giochi._write_associazioni(bad, 'prova')

    def test_a_changed_row_no_longer_matches_the_digest(self):
        giochi._write_associazioni(rows(), 'prova')
        con = sqlite3.connect(self.file)
        con.execute('''UPDATE associazioni__prompt_words SET difficulty = 3
            WHERE word_id = (SELECT id FROM associazioni__words WHERE word = 'teglia')''')
        con.commit()
        con.close()
        self.assertEqual(giochi.verify_associazioni(), ['associazioni: le righe non corrispondono alla loro impronta'])


if __name__ == '__main__':
    unittest.main()
