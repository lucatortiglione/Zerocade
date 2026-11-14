import json
from pathlib import Path
import tempfile
import unittest

from editorial_review_claude import REASONS, check_row, read_drafts

CANDIDATES = [{'prompt': 'newsletter'}, {'prompt': 'platone'}, {'prompt': 'choc'}]
CATALOG = {'109': {'category_name': 'Giornalismo'}}


class CheckRowTest(unittest.TestCase):
    def test_valid_rows(self):
        self.assertIsNone(check_row({'i': 0, 'w': 'newsletter', 'd': 'V', 'p': 'NOUN', 'c': '109',
                                     's': 'Bollettino informativo inviato per e-mail.'}, CANDIDATES, CATALOG))
        self.assertIsNone(check_row({'i': 1, 'w': 'platone', 'd': 'R', 'k': 'proper'}, CANDIDATES, CATALOG))
        self.assertIsNone(check_row({'i': 2, 'w': 'choc', 'd': 'D', 'k': 'sense'}, CANDIDATES, CATALOG))

    def test_rejects_wrong_word_category_reason_and_short_sense(self):
        self.assertIn('non corrisponde', check_row({'i': 1, 'w': 'newsletter', 'd': 'R', 'k': 'rare'}, CANDIDATES, CATALOG))
        self.assertIn('categoria', check_row({'i': 0, 'w': 'newsletter', 'd': 'V', 'p': 'NOUN', 'c': '999',
                                              's': 'Bollettino informativo inviato per e-mail.'}, CANDIDATES, CATALOG))
        self.assertIn('senso', check_row({'i': 0, 'w': 'newsletter', 'd': 'V', 'p': 'NOUN', 'c': '109', 's': 'breve'},
                                         CANDIDATES, CATALOG))
        self.assertIn('scarto', check_row({'i': 1, 'w': 'platone', 'd': 'R', 'k': 'sense'}, CANDIDATES, CATALOG))
        self.assertIn('rinvio', check_row({'i': 2, 'w': 'choc', 'd': 'D', 'k': 'rare'}, CANDIDATES, CATALOG))
        self.assertTrue(set(REASONS) >= {'generic', 'rare', 'form', 'proper', 'foreign', 'offensive', 'sense', 'category'})

    def test_duplicate_index_across_drafts(self):
        with tempfile.TemporaryDirectory() as folder:
            a, b = Path(folder)/'00000_00001.jsonl', Path(folder)/'00000_00002.jsonl'
            a.write_text(json.dumps({'i': 0, 'w': 'newsletter', 'd': 'R', 'k': 'rare'})+'\n', encoding='utf-8')
            b.write_text(json.dumps({'i': 0, 'w': 'newsletter', 'd': 'R', 'k': 'rare'})+'\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'duplicato'):
                read_drafts([a, b])


if __name__ == '__main__':
    unittest.main()
