import copy
import csv
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import mazzo

HERE = Path(__file__).resolve().parent.parent
CASES = json.loads((HERE / 'data' / 'normalizzazione-casi.json').read_text(encoding='utf-8'))
DECK = json.loads((HERE / 'data' / 'mazzo-v3.0.json').read_text(encoding='utf-8'))


def fresh():
    return copy.deepcopy(DECK)


class SharedNormalizationTests(unittest.TestCase):
    def test_tokenize_matches_the_shared_cases(self):
        for case in CASES['tokenize']:
            self.assertEqual(mazzo.tokenize(case['input']), case['tokens'], case['input'])

    def test_answer_key_matches_the_shared_cases(self):
        for case in CASES['answerKey']:
            self.assertEqual(mazzo.answer_key(case['input']), case['key'], case['input'])

    def test_shares_root_matches_the_shared_cases(self):
        for case in CASES['sharesRoot']:
            self.assertEqual(mazzo.shares_root(case['taboo'], case['target']), case['result'], case['taboo'])


class DeckTests(unittest.TestCase):
    def test_the_deck_has_62_cards_and_the_expected_split(self):
        self.assertEqual(len(DECK['cards']), 62)
        per = {c: sum(k['category_id'] == c for k in DECK['cards']) for c in 'ABCDEF'}
        self.assertEqual(per, {'A': 12, 'B': 10, 'C': 10, 'D': 10, 'E': 10, 'F': 10})
        levels = [sum(k['difficulty_initial'] == n for k in DECK['cards']) for n in (1, 2, 3)]
        self.assertEqual(levels, [18, 29, 15])  # ZEROTABOO §8: 18 easy, 29 medium, 15 hard

    def test_every_card_has_a_unique_target_and_five_distinct_taboo_words(self):
        errors, _ = mazzo.validate(DECK)
        self.assertEqual(errors, [])
        for k in DECK['cards']:
            self.assertEqual(len(k['taboo_words']), 5, k['card_id'])
            self.assertEqual(len({mazzo.answer_key(w) for w in k['taboo_words']}), 5, k['card_id'])

    def test_the_editorial_warnings_are_the_ones_of_the_decision_D18_and_nothing_is_corrected(self):
        _, warnings = mazzo.validate(DECK)
        codes = sorted(w.split(':')[0] for w in warnings)
        self.assertEqual(codes, ['D03', 'D06', 'D09', 'E08', 'F07'])
        # shown, never fixed: the Taboo words of the source are those of the rules
        d03 = next(k for k in DECK['cards'] if k['card_id'] == 'D03')
        self.assertIn('Denti', d03['taboo_words'])

    def test_aliases_and_excluded_answers_come_from_the_table(self):
        a10 = next(k for k in DECK['cards'] if k['card_id'] == 'A10')
        self.assertEqual(a10['accepted_answers'], ['capelli a riporto'])
        self.assertEqual(a10['excluded_answers'], ['calvizie', 'pelata'])
        d09 = next(k for k in DECK['cards'] if k['card_id'] == 'D09')
        self.assertEqual(d09['accepted_answers'], [])
        self.assertEqual(sum(bool(k['accepted_answers']) for k in DECK['cards']), 14)

    def test_the_candidate_cards_G_to_J_are_not_loaded(self):
        deck = fresh()
        deck['cards'].append({**deck['cards'][0], 'card_id': 'G01', 'category_id': 'G', 'target': 'PAD SCARICO'})
        errors, _ = mazzo.validate(deck)
        self.assertTrue(any('G-J' in e or 'Categoria' in e for e in errors))


class ValidationRejectsTests(unittest.TestCase):
    def errors(self, mutate):
        deck = fresh()
        mutate(deck)
        return mazzo.validate(deck)[0]

    def test_missing_card(self):
        self.assertTrue(any('62' in e for e in self.errors(lambda d: d['cards'].pop())))

    def test_four_taboo_words(self):
        self.assertTrue(any('cinque Taboo' in e for e in self.errors(lambda d: d['cards'][0]['taboo_words'].pop())))

    def test_repeated_taboo_word_after_normalization(self):
        def mutate(d):
            d['cards'][0]['taboo_words'][1] = d['cards'][0]['taboo_words'][0].upper() + '!'
        self.assertTrue(any('cinque Taboo' in e for e in self.errors(mutate)))

    def test_duplicate_target(self):
        def mutate(d):
            d['cards'][1]['target'] = d['cards'][0]['target'].lower()
        self.assertTrue(any('uguale' in e for e in self.errors(mutate)))

    def test_target_in_the_A_B_format(self):
        def mutate(d):
            d['cards'][9]['target'] = 'CALVIZIE (RIPORTO)'
        self.assertTrue(any('A (B)' in e for e in self.errors(mutate)))

    def test_alias_equal_to_another_target(self):
        def mutate(d):
            d['cards'][0]['accepted_answers'] = [d['cards'][1]['target']]
        self.assertTrue(any('bersaglio di' in e for e in self.errors(mutate)))

    def test_bad_or_duplicate_ids(self):
        def mutate(d):
            d['cards'][1]['card_id'] = d['cards'][0]['card_id']
        self.assertTrue(self.errors(mutate))

    def test_quality_score_out_of_range(self):
        def mutate(d):
            d['cards'][0]['quality_score'] = 101
        self.assertTrue(any('qualità' in e for e in self.errors(mutate)))


class DatabaseTests(unittest.TestCase):
    def test_import_verify_and_the_view_in_the_shape_of_the_rules(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ZeroTaboo.sqlite3'
            mazzo.replace_atomically(DECK, path)
            self.assertEqual(mazzo.verify(DECK, path), [])
            with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM carte').fetchone()[0], 62)
                self.assertEqual(db.execute('SELECT count(*) FROM revisione_taboo').fetchone()[0], 62 * 5)
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                row = db.execute("SELECT target, difficulty_initial, taboo_words, accepted_answers, status FROM mazzo_corrente WHERE card_id='A10'").fetchone()
                self.assertEqual(row[0], 'RIPORTO')
                self.assertEqual(row[1], 2 + 1)  # red = hard
                self.assertEqual(json.loads(row[2]), ['Capelli', 'Pelata', 'Pettine', 'Lato', 'Vento'])
                self.assertEqual(json.loads(row[3]), ['capelli a riporto'])
                self.assertEqual(row[4], 'playtest')
                self.assertEqual(db.execute('SELECT count(*) FROM avvisi').fetchone()[0], 5)
            # the database refuses a sixth Taboo word on a card
            with closing(sqlite3.connect(path)) as writer:
                writer.execute('PRAGMA foreign_keys = ON')
                with self.assertRaises(sqlite3.IntegrityError):
                    writer.execute('INSERT INTO revisione_taboo VALUES (1, 6, 1)')

    def test_verify_finds_a_difference(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ZeroTaboo.sqlite3'
            mazzo.replace_atomically(DECK, path)
            changed = fresh()
            changed['cards'][3]['target'] = 'ALTRO BERSAGLIO'
            self.assertTrue(any('target' in p for p in mazzo.verify(changed, path)))

    def test_a_broken_source_leaves_the_existing_database_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ZeroTaboo.sqlite3'
            mazzo.replace_atomically(DECK, path)
            before = path.read_bytes()
            broken = fresh()
            broken['cards'].pop()
            with self.assertRaises(SystemExit):
                mazzo.replace_atomically(broken, path)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual([p.name for p in Path(folder).iterdir()], ['ZeroTaboo.sqlite3'])  # no stray temporary file

    def test_csv_export_has_a_bom_and_neutralises_formulas(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'z.sqlite3'
            out = Path(folder) / 'z.csv'
            deck = fresh()
            deck['cards'][0]['accepted_answers'] = ['=cmd']
            mazzo.replace_atomically(deck, db)
            mazzo.main(['export', '--db', str(db), '--csv', str(out)])
            raw = out.read_bytes()
            self.assertTrue(raw.startswith(b'\xef\xbb\xbf'))
            rows = list(csv.reader(raw.decode('utf-8-sig').splitlines()))
            self.assertEqual(len(rows), 63)
            self.assertIn("'=cmd", rows[1][8])


if __name__ == '__main__':
    unittest.main()
