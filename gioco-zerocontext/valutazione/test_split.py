"""Divisione misura/sviluppo: regola fissa, NFC, quota e chiavi dei sottoinsiemi."""
import hashlib
import unicodedata
import unittest

from valutazione import split


class SplitTest(unittest.TestCase):
    def test_rule_is_stable(self):
        expected = int(hashlib.sha256('cane'.encode('utf-8')).hexdigest(), 16) % 5 == 0
        self.assertEqual(split.is_measure('cane'), expected)
        self.assertEqual(split.SPLIT_RULE, 'sha256-utf8-mod5-eq0')

    def test_known_words_land_where_the_rule_says(self):
        # Valori calcolati una volta con la regola della spec (sha256 UTF-8 mod 5 == 0): se la regola cambia, falliscono.
        for word in ('pizza', 'luna', 'albero'):
            self.assertTrue(split.is_measure(word), word)
        for word in ('cane', 'gatto', 'spiaggia', 'banca', 'sedia', 'sole', 'mare', 'casa', 'città'):
            self.assertFalse(split.is_measure(word), word)

    def test_nfc_and_lowercase(self):
        self.assertEqual(split.is_measure('città'), split.is_measure(unicodedata.normalize('NFD', 'città')))
        self.assertEqual(split.is_measure('Città'), split.is_measure('città'))

    def test_share_close_to_one_fifth(self):
        words = [f'parola{i}' for i in range(10000)]
        share = sum(map(split.is_measure, words)) / len(words)
        self.assertAlmostEqual(share, 0.2, delta=0.02)

    def test_split_of_names(self):
        self.assertEqual(split.split_of('pizza'), 'misura')
        self.assertEqual(split.split_of('cane'), 'sviluppo')

    def test_subsets_with_gold_and_group(self):
        self.assertEqual(split.subsets('misura', True, 'deroga'),
                         ['misura:tutte', 'misura:con_associazioni', 'misura:deroga'])

    def test_subsets_without_gold(self):
        self.assertEqual(split.subsets('sviluppo', False, 'aggiunta'),
                         ['sviluppo:tutte', 'sviluppo:senza_associazioni', 'sviluppo:aggiunta'])


if __name__ == '__main__':
    unittest.main()
