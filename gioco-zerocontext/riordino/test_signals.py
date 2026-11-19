"""Segnali nuovi per il riordino: coseno ABTT, genericità («hub»), rango inverso nell'export e categoria grammaticale."""
import unittest

import numpy as np

from riordino.export import Candidate
from riordino.features import FEATURE_NAMES, Lexicon, candidate_features
from riordino.signals import Signals, hub_scores, reverse_ranks
from valutazione.profiles import Profile


def profile(words, vectors):
    v = np.array(vectors, dtype=np.float32)
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    return Profile('prova', words, {w: i for i, w in enumerate(words)}, v, 'sha')


class FakeRef:
    tags = {'cane': 'NOUN', 'osso': 'NOUN', 'abbaiare': 'VERB', 'fedele': 'ADJ'}

    def pos(self, word):
        return self.tags.get(word, 'ALTRO')


class HubScoresTest(unittest.TestCase):
    def test_is_the_mean_cosine_with_the_k_nearest_words_excluding_itself(self):
        p = profile(['a', 'b', 'c', 'd'], [[1, 0], [0.9, 0.436], [0, 1], [-1, 0]])
        scores = hub_scores(p, k=2)
        cos = p.vectors @ p.vectors.T
        np.fill_diagonal(cos, -np.inf)
        expected = np.sort(cos, axis=1)[:, -2:].mean(axis=1)
        np.testing.assert_allclose(scores, expected, rtol=1e-5)

    def test_a_generic_word_scores_higher_than_an_isolated_one(self):
        words = ['hub', 'x1', 'x2', 'x3', 'solo']
        p = profile(words, [[1, 1, 0], [1, 0.9, 0], [0.9, 1, 0], [1, 1, 0.1], [0, 0, 1]])
        s = hub_scores(p, k=2)
        self.assertGreater(s[0], s[4])

    def test_chunking_does_not_change_the_result(self):
        rng = np.random.default_rng(0)
        p = profile([f'w{i}' for i in range(30)], rng.normal(size=(30, 5)))
        np.testing.assert_allclose(hub_scores(p, k=3, chunk=7), hub_scores(p, k=3, chunk=1000), rtol=1e-6)


class ReverseRanksTest(unittest.TestCase):
    def test_rank_of_the_secret_in_the_list_of_each_candidate_up_to_the_cap(self):
        found = {'cane': [Candidate('osso', .9, 0, 0, 0, 0, 1), Candidate('gatto', .5, 0, 0, 0, 0, 2)],
                 'osso': [Candidate('x', .9, 0, 0, 0, 0, 1), Candidate('cane', .5, 0, 0, 0, 0, 2), Candidate('y', .1, 0, 0, 0, 0, 3)],
                 'gatto': [Candidate('cane', .9, 0, 0, 0, 0, 1)]}
        reverse = reverse_ranks(found, cap=2)
        self.assertEqual(reverse['osso'], {'x': 1, 'cane': 2})   # reverse[candidato][segreta]: posizione della segreta nella lista del candidato
        self.assertEqual(reverse['cane'], {'osso': 1, 'gatto': 2})
        self.assertEqual(reverse['gatto'], {'cane': 1})
        self.assertNotIn('y', reverse['osso'])                   # oltre il tetto non si registra


class EnrichTest(unittest.TestCase):
    def setUp(self):
        words = ['cane', 'osso', 'abbaiare', 'fedele']
        self.orig = profile(words, [[1, 0, 0], [0.9, 0.4, 0], [0.7, 0.7, 0], [0, 0.2, 1]])
        self.abtt = profile(words, [[1, 0, 0, 0], [0.5, 0.8, 0, 0], [0.9, 0.1, 0.3, 0], [0, 0, 0, 1]])
        self.signals = Signals(FakeRef(), self.orig, self.abtt, hub_scores(self.orig, 1), hub_scores(self.abtt, 1), {'osso': {'cane': 3}})

    def test_adds_abtt_cosine_hub_reverse_rank_and_pos(self):
        cands = [Candidate('osso', .9, 0, 0, 0, 0, 1), Candidate('abbaiare', .5, 0, 0, 0, 0, 2), Candidate('fuori', .1, 0, 0, 0, 0, 3)]
        osso, abbaiare, fuori = self.signals.enrich('cane', cands)
        self.assertAlmostEqual(osso.abtt_cos, float(self.abtt.vectors[1] @ self.abtt.vectors[0]), places=5)
        self.assertAlmostEqual(osso.hub, float(self.signals.hub[1]), places=6)
        self.assertEqual((osso.inv_rank, abbaiare.inv_rank), (3, None))
        self.assertEqual((osso.pos, abbaiare.pos, osso.pos_same, abbaiare.pos_same), ('NOUN', 'VERB', True, False))
        self.assertEqual((fuori.abtt_cos, fuori.hub, fuori.hub_abtt), (None, None, None))   # fuori dal profilo

    def test_keeps_every_other_field_untouched(self):
        c = Candidate('osso', .9, .1, .2, .3, .4, 1, vec_cos=.8, vec_rank=2, in_export=False)
        out = self.signals.enrich('cane', [c])[0]
        self.assertEqual((out.word, out.score, out.emb, out.pmi, out.cn, out.ppmi, out.rank, out.vec_cos, out.vec_rank, out.in_export),
                         ('osso', .9, .1, .2, .3, .4, 1, .8, 2, False))


class FeaturesTest(unittest.TestCase):
    lexicon = Lexicon({})

    def features(self, c):
        return dict(zip(FEATURE_NAMES, candidate_features(c, self.lexicon)))

    def test_one_value_per_name(self):
        c = Candidate('osso', .9, 0, 0, 0, 0, 1, abtt_cos=.5, hub=.4, hub_abtt=.3, inv_rank=7, pos='NOUN', pos_same=True)
        self.assertEqual(len(candidate_features(c, self.lexicon)), len(FEATURE_NAMES))

    def test_new_signals_and_their_missing_flags(self):
        f = self.features(Candidate('osso', .9, 0, 0, 0, 0, 1, abtt_cos=.5, hub=.4, hub_abtt=.3, inv_rank=7, pos='VERB', pos_same=False))
        self.assertEqual((f['abtt_cos'], f['abtt_mancante'], f['hub'], f['hub_abtt'], f['hub_mancante'], f['inv_mancante']), (.5, 0.0, .4, .3, 0.0, 0.0))
        self.assertAlmostEqual(f['log_inv_rank'], np.log1p(7))
        self.assertEqual((f['pos_nome'], f['pos_verbo'], f['pos_agg'], f['pos_uguale']), (0.0, 1.0, 0.0, 0.0))
        bare = self.features(Candidate('osso', .9, 0, 0, 0, 0, 1))
        self.assertEqual((bare['abtt_mancante'], bare['hub_mancante'], bare['inv_mancante'], bare['log_inv_rank']), (1.0, 1.0, 1.0, 0.0))
        self.assertEqual((bare['pos_nome'], bare['pos_verbo'], bare['pos_agg'], bare['pos_uguale']), (0.0, 0.0, 0.0, 0.0))


if __name__ == '__main__':
    unittest.main()
