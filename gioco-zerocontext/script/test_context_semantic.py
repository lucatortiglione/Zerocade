import math
from pathlib import Path
import struct
import tempfile
import unittest
import numpy as np
from context_subword import SubwordModel, fnv1a, ngrams, unit_rows
from context_semantic_policy import aggregate_zipf, neighbourhoods, ordinary_lexical, retrofit, special_lexical


class SemanticTests(unittest.TestCase):
    def test_frequency_sum_deduplicates_forms_and_ignores_unattested(self):
        scores = {'vado': 3, 'andare': 2, 'assente': 0}
        f = lambda w: scores[w]
        self.assertAlmostEqual(aggregate_zipf(['vado', 'vado', 'andare', 'assente'], f), math.log10(1100))
        self.assertEqual(aggregate_zipf(['assente'], f), 0)

    def test_lexical_boundaries_and_nvdb_exceptions(self):
        self.assertTrue(ordinary_lexical(1.8, None, True))
        self.assertTrue(ordinary_lexical(2.5, None, True))
        self.assertTrue(ordinary_lexical(2, None, True))
        self.assertFalse(ordinary_lexical(1.79, None, True))
        self.assertFalse(ordinary_lexical(2.51, None, True))
        self.assertTrue(ordinary_lexical(1.5, 'AD', True))
        self.assertFalse(ordinary_lexical(1.5, 'AU', True))
        self.assertTrue(ordinary_lexical(1.8, None, False, verb=True))
        self.assertFalse(ordinary_lexical(1.79, None, False, verb=True))
        self.assertTrue(ordinary_lexical(3.2, 'AU', True))
        self.assertFalse(ordinary_lexical(3.21, 'AU', True))
        self.assertFalse(ordinary_lexical(2.9, 'AU', False))
        self.assertTrue(ordinary_lexical(3.3, None, False, verb=True))
        self.assertFalse(ordinary_lexical(2.2, 'FO', True, verb=True))
        for z in [1.85, 2.05]: self.assertTrue(special_lexical('probità', z, None, 'morale'))
        self.assertFalse(special_lexical('probità', 1.84, None, 'morale'))
        self.assertFalse(special_lexical('probità', 1.94, None, None))
        self.assertFalse(special_lexical('probità', 1.94, 'FO', 'morale'))
        self.assertFalse(special_lexical('artrite', 1.94, None, 'morale'))

    def test_retrofit_attracts_synonyms_repels_antonyms_and_preserves_unit_norms(self):
        initial = unit_rows(np.array([[1, 0], [.5, .866], [.99, -.14], [0, 1]], np.float32))
        final = retrofit(initial, [(0, 1)], [(0, 2)])
        self.assertGreater(final[0] @ final[1], initial[0] @ initial[1])
        self.assertLess(final[0] @ final[2], initial[0] @ initial[2])
        np.testing.assert_allclose(np.linalg.norm(final, axis=1), 1, atol=1e-6)
        np.testing.assert_allclose(final[3], initial[3])

    def test_neighbourhood_excludes_self_and_counts_bridges_on_actual_top100(self):
        matrix = unit_rows(np.column_stack([np.ones(101), np.linspace(0, 1, 101)]))
        frequencies = np.zeros(101); frequencies[:20] = 4; frequencies[20:30] = 3.9
        i, density, bridges, extra = next(neighbourhoods(matrix, [0], frequencies))
        self.assertEqual((i, bridges, extra), (0, 19, 29))
        self.assertAlmostEqual(density, float((matrix[1:] @ matrix[0]).mean()), places=6)

    def test_full_fasttext_reader_averages_word_and_subwords_and_encodes_oov(self):
        self.assertEqual(fnv1a(b'hello'), 0x4f9f2cab)
        self.assertEqual(len(ngrams('è', 3, 6, 17)), 1)  # <è> ha tre caratteri, quattro byte.
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'tiny.bin'
            matrix = np.arange(18 * 300, dtype=np.float32).reshape(18, 300)
            with path.open('wb') as s:
                s.write(struct.pack('<ii', 793712314, 12))
                s.write(struct.pack('<12id', 300, 5, 5, 5, 5, 1, 2, 2, 17, 3, 6, 100, .0001))
                s.write(struct.pack('<iiiqq', 1, 1, 0, 10, -1))
                s.write(b'a\0' + struct.pack('<qb', 10, 0))
                s.write(b'\0' + struct.pack('<qq', 18, 300))
                s.write(matrix.astype('<f4').tobytes())
            model = SubwordModel(path, ['a', 'è'])
            bucket_a = fnv1a(b'<a>') % 17 + 1
            np.testing.assert_array_equal(model.vector('a'), (matrix[0] + matrix[bucket_a]) / 2)
            bucket_e = fnv1a('<è>'.encode()) % 17 + 1
            np.testing.assert_array_equal(model.vector('è'), matrix[bucket_e])
            del model


if __name__ == '__main__': unittest.main()
