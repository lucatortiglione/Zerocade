from pathlib import Path
import tempfile
import unittest

import numpy as np

from context_lsa import ItalianTokens, lemma_map, lsa_vectors


class LSATests(unittest.TestCase):
    def test_morphology_uses_only_unambiguous_lemmas(self):
        with tempfile.TemporaryDirectory() as tmp:
            morphit = Path(tmp) / 'morphit.txt'
            morphit.write_text('nidi\tnido\tNOUN-M:p\ncanto\tcanto\tNOUN-M:s\ncanto\tcantare\tVER:ind\nRocco\trocco\tNPR\n', encoding='utf-8')
            tokens = ItalianTokens(lemma_map(morphit))
            self.assertEqual(tokens('I nidi e il canto'), ['nido', 'canto'])

    def test_related_definitions_missing_rows_and_cache(self):
        cards = [
            {'word': 'cuculo', 'text': 'cuculo uccello depone uova nei nidi', 'origin': 'dictionary_first_sense'},
            {'word': 'nido', 'text': 'nido riparo di un uccello e delle uova', 'origin': 'dictionary_first_sense'},
            {'word': 'uccello', 'text': 'uccello animale con piume costruisce nidi', 'origin': 'dictionary_first_sense'},
            {'word': 'luna', 'text': 'luna satellite nello spazio tra le stelle', 'origin': 'dictionary_first_sense'},
            {'word': 'lattea', 'text': 'lattea stelle e galassia nello spazio', 'origin': 'dictionary_first_sense'},
            {'word': 'ignota', 'text': 'ignota', 'origin': 'lemma_only'}]
        config = {'dimensions': 3, 'max_features': 100, 'min_df': 1, 'random_state': 0}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            morphit = root / 'morphit.txt'
            morphit.write_text('nidi\tnido\tNOUN-M:p\n', encoding='utf-8')
            vectors, provenance = lsa_vectors(cards, config, morphit, root)
            self.assertGreater(float(vectors[0] @ vectors[1]), float(vectors[0] @ vectors[3]))
            np.testing.assert_array_equal(vectors[-1], 0)
            self.assertEqual(provenance['missing'], 1)
            cached, cached_provenance = lsa_vectors(cards, config, morphit, root)
            np.testing.assert_array_equal(cached, vectors)
            self.assertEqual(cached_provenance['sha256'], provenance['sha256'])


if __name__ == '__main__':
    unittest.main()
