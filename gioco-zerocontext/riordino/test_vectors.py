"""Punto 3: candidati anche dai vicini dei vettori, non solo dall'export della Pipeline B."""
import unittest

import numpy as np

from riordino.export import Candidate
from riordino.features import FEATURE_NAMES, Lexicon, candidate_features
from riordino.vectors import widen
from valutazione.profiles import Profile


def profile(words, vectors):
    v = np.array(vectors, dtype=np.float32)
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    return Profile('prova', words, {w: i for i, w in enumerate(words)}, v, 'sha')


# vicinanza a «cane»: osso > gatto > casa > luna
WORDS = ['cane', 'osso', 'gatto', 'casa', 'luna', 'solo_export']
VECTORS = [[1, 0, 0], [0.95, 0.3, 0], [0.8, 0.6, 0], [0.5, 0.86, 0], [0, 0, 1], [0, 1, 0.5]]


class WidenTest(unittest.TestCase):
    def setUp(self):
        self.profile = profile(WORDS, VECTORS)
        self.export = [Candidate('gatto', 0.9, 0.8, None, None, 0.1, 1), Candidate('solo_export', 0.5, 0.2, None, None, None, 2),
                       Candidate('fuori_profilo', 0.4, 0.2, None, None, None, 3)]

    def test_export_candidates_get_cosine_and_rank_among_the_vectors(self):
        found = {c.word: c for c in widen('cane', self.export, self.profile, k=0)}
        self.assertAlmostEqual(found['gatto'].vec_cos, float(self.profile.vectors[2] @ self.profile.vectors[0]), places=5)
        self.assertEqual(found['gatto'].vec_rank, 2)   # osso è il primo, la segreta non conta
        self.assertTrue(all(c.in_export for c in found.values()))
        self.assertEqual((found['fuori_profilo'].vec_cos, found['fuori_profilo'].vec_rank), (None, None))

    def test_adds_the_nearest_words_the_export_lacked_flagged_and_in_vector_order(self):
        wide = widen('cane', self.export, self.profile, k=3)
        added = [c for c in wide if not c.in_export]
        self.assertEqual([c.word for c in added], ['osso', 'casa'])   # i 3 vicini sono osso, gatto, casa: gatto c'era già
        self.assertTrue(all(c.score is None and c.emb is None and c.ppmi is None for c in added))
        self.assertEqual([c.vec_rank for c in added], [1, 3])

    def test_never_adds_the_secret_and_respects_the_limit(self):
        self.assertEqual([c.word for c in widen('cane', [], self.profile, k=2) if not c.in_export], ['osso', 'gatto'])
        self.assertNotIn('cane', [c.word for c in widen('cane', [], self.profile, k=10)])

    def test_a_secret_outside_the_profile_leaves_the_export_untouched(self):
        self.assertEqual(widen('inesistente', self.export, self.profile, k=5), self.export)

    def test_does_not_change_the_order_of_the_export_candidates(self):
        self.assertEqual([c.word for c in widen('cane', self.export, self.profile, k=3)][:3], ['gatto', 'solo_export', 'fuori_profilo'])


class FeaturesTest(unittest.TestCase):
    lexicon = Lexicon({})

    def features(self, c):
        return dict(zip(FEATURE_NAMES, candidate_features(c, self.lexicon)))

    def test_one_value_per_name(self):
        c = Candidate('osso', None, None, None, None, None, 1001, vec_cos=0.7, vec_rank=4, in_export=False)
        self.assertEqual(len(candidate_features(c, self.lexicon)), len(FEATURE_NAMES))

    def test_vector_features_and_the_export_flag(self):
        added = self.features(Candidate('osso', None, None, None, None, None, 1001, vec_cos=0.7, vec_rank=4, in_export=False))
        self.assertEqual((added['nell_export'], added['vec_cos'], added['vec_mancante']), (0.0, 0.7, 0.0))
        self.assertAlmostEqual(added['log_vec_rank'], np.log1p(4))
        old = self.features(Candidate('osso', 0.9, 0.8, 0.7, 0.6, 0.5, 1))
        self.assertEqual((old['nell_export'], old['vec_mancante'], old['vec_cos'], old['log_vec_rank']), (1.0, 1.0, 0.0, 0.0))


if __name__ == '__main__':
    unittest.main()
