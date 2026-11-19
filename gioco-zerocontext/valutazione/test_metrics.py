"""Voti delle prime 20 posizioni e metriche (Precision@10, nDCG@20, accezione, umana, bootstrap)."""
import math
import unittest

from valutazione.gold import GoldEntry
from valutazione.metrics import (bootstrap, grade_slots, human_share, ndcg20, precision_judged, precision_verified,
                                 sense_share)
from valutazione.store import Verdict

GOLD = GoldEntry('Animale domestico della specie canina', 'NOUN',
                 {'coda': 2351, 'scodinzolare': 2351, 'guinzaglio': 4972, 'osso': 7160, 'cuccia': 3010,
                  'fiuto': 4264, 'zampa': 11796, 'collare': 2384})
VOCAB = set(GOLD.groups) | {'cani', 'gatto', 'beach'}


class FakeRef:
    """Le sole quattro domande che grade_slots fa al riferimento, con risposte scritte a mano."""
    variants = {('cani', 'cane'), ('bancaria', 'banca')}
    lemma_of = {'guinzagli': {'guinzaglio'}}
    out_of_reference = {'beach'}
    pos_of = {'abbaiare': 'VERB'}

    def is_variant(self, word, secret):
        return (word, secret) in self.variants

    def lemmas(self, word):
        return self.lemma_of.get(word, set())

    def in_reference(self, word):
        return word not in self.out_of_reference

    def pos(self, word):
        return self.pos_of.get(word, 'NOUN')


REF = FakeRef()
TOP = ['cani', 'gatto', 'guinzaglio', 'coda', 'scodinzolare', 'beach', 'osso', 'cuccia', 'fiuto', 'zampa',
       'collare'] + [f'x{i}' for i in range(9)]
JUDGE = {'gatto': Verdict('gatto', 2, None, 'sinonimo'), 'beach': Verdict('beach', 0, False, 'inglese')}


def slots(top=TOP, gold=GOLD, human=None, judge=JUDGE):
    return grade_slots('cane', top, REF, gold, human or {}, judge)


class GradeSlotsTest(unittest.TestCase):
    def test_kinds_and_grades(self):
        s = {x.word: x for x in slots()}
        self.assertEqual((s['cani'].kind, s['cani'].grade), ('variante', None))
        self.assertEqual((s['gatto'].kind, s['gatto'].grade), ('giudice', 2))
        self.assertEqual((s['guinzaglio'].kind, s['guinzaglio'].grade), ('verificata', 2))
        self.assertEqual((s['beach'].kind, s['beach'].grade), ('giudice', 0))
        self.assertEqual((s['x0'].kind, s['x0'].grade), ('senza_voto', None))

    def test_only_the_first_word_of_a_group_scores(self):
        s = {x.word: x for x in slots()}
        self.assertEqual((s['coda'].grade, s['coda'].verified), (2, True))
        self.assertEqual((s['scodinzolare'].grade, s['scodinzolare'].verified, s['scodinzolare'].in_gold), (0, False, True))

    def test_inflected_form_of_a_verified_association_counts_as_it(self):
        s = slots(['guinzagli'] + [f'x{i}' for i in range(19)])[0]
        self.assertEqual((s.kind, s.grade, s.verified), ('verificata', 2, True))

    def test_human_verdict_overrides_gold_and_judge(self):
        human = {('cane', 'coda'): 'non_naturale', ('cane', 'beach'): 'naturale', ('cane', 'gatto'): 'non_so'}
        s = {x.word: x for x in slots(human=human)}
        self.assertEqual((s['coda'].kind, s['coda'].grade, s['coda'].human), ('umano', 0, 'non_naturale'))
        self.assertTrue(s['coda'].verified)               # l'appartenenza all'elenco verificato non dipende dai verdetti
        self.assertEqual((s['beach'].kind, s['beach'].grade), ('umano', 2))
        self.assertEqual((s['gatto'].kind, s['gatto'].grade, s['gatto'].human), ('giudice', 2, None))  # «non so» si passa oltre

    def test_without_gold_the_judge_decides(self):
        s = {x.word: x for x in slots(gold=None)}
        self.assertEqual((s['guinzaglio'].kind, s['guinzaglio'].grade), ('senza_voto', None))
        self.assertEqual(s['gatto'].grade, 2)

    def test_reference_pos_and_sense(self):
        s = {x.word: x for x in slots(['abbaiare', 'beach'] + [f'x{i}' for i in range(18)])}
        self.assertEqual(s['abbaiare'].pos, 'VERB')
        self.assertFalse(s['beach'].in_reference)
        self.assertEqual(s['beach'].sense_ok, False)
        # un'associazione verificata è legata per costruzione al senso della glossa
        self.assertTrue({x.word: x for x in slots()}['guinzaglio'].sense_ok)


class PrecisionTest(unittest.TestCase):
    def test_precision_verified_leaves_out_variants_and_group_duplicates(self):
        # prime 10: cani (variante) + 9 parole; verificate e prime del gruppo: guinzaglio coda osso cuccia fiuto zampa
        self.assertAlmostEqual(precision_verified(slots()), 6 / 9)

    def test_precision_judged_adds_the_judge(self):
        self.assertAlmostEqual(precision_judged(slots()), 7 / 9)

    def test_precision_judged_needs_every_word_to_be_graded(self):
        unjudged = {'gatto': JUDGE['gatto']}            # beach resta senza voto, tra le prime 10
        self.assertIsNone(precision_judged(slots(judge=unjudged)))
        self.assertAlmostEqual(precision_verified(slots(judge=unjudged)), 6 / 9)  # quella verificata non dipende dal giudice

    def test_precision_none_when_there_is_nothing_to_count(self):
        only_variants = slots(['cani'] + [f'x{i}' for i in range(19)])[:1]
        self.assertIsNone(precision_verified(only_variants))
        self.assertIsNone(precision_judged(only_variants))

    def test_human_verdict_lowers_precision_judged_not_verified(self):
        human = {('cane', 'coda'): 'non_naturale'}
        self.assertAlmostEqual(precision_judged(slots(human=human)), 6 / 9)
        self.assertAlmostEqual(precision_verified(slots(human=human)), 6 / 9)


class NdcgTest(unittest.TestCase):
    def test_perfect_ranking_is_one(self):
        small = GoldEntry('g', 'NOUN', {'a': 1, 'a2': 1, 'b': 2, 'c': 3})
        s = grade_slots('cane', ['a', 'b', 'c'] + [f'x{i}' for i in range(17)], REF, small, {}, {})
        self.assertAlmostEqual(ndcg20(s, small, {'a', 'a2', 'b', 'c'}), 1.0)

    def test_missing_groups_lower_it_by_the_hand_computed_amount(self):
        small = GoldEntry('g', 'NOUN', {'a': 1, 'b': 2, 'c': 3, 'd': 4})
        s = grade_slots('cane', ['a', 'b', 'c'] + [f'x{i}' for i in range(17)], REF, small, {}, {})
        dcg = 2 / math.log2(2) + 2 / math.log2(3) + 2 / math.log2(4)
        idcg = dcg + 2 / math.log2(5)
        self.assertAlmostEqual(ndcg20(s, small, {'a', 'b', 'c', 'd'}), dcg / idcg)

    def test_words_outside_the_vocabulary_do_not_count_as_missing(self):
        small = GoldEntry('g', 'NOUN', {'a': 1, 'b': 2, 'fuori': 3})
        s = grade_slots('cane', ['a', 'b'] + [f'x{i}' for i in range(18)], REF, small, {}, {})
        self.assertAlmostEqual(ndcg20(s, small, {'a', 'b'}), 1.0)

    def test_judged_words_enter_the_ideal(self):
        # nessuna associazione verificata: il massimo è dato dalle parole che il giudice ha votato
        s = grade_slots('cane', ['gatto', 'osso'] + [f'x{i}' for i in range(18)], REF, None, {},
                        {'gatto': Verdict('gatto', 2, None, ''), 'osso': Verdict('osso', 1, None, '')})
        self.assertAlmostEqual(ndcg20(s, None, set()), 1.0)
        worse = grade_slots('cane', ['osso', 'gatto'] + [f'x{i}' for i in range(18)], REF, None, {},
                            {'gatto': Verdict('gatto', 2, None, ''), 'osso': Verdict('osso', 1, None, '')})
        self.assertLess(ndcg20(worse, None, set()), 1.0)

    def test_groups_in_vocabulary_can_be_given_instead_of_the_vocabulary(self):
        # Il ricalcolo non ha il vocabolario: usa il numero di gruppi salvato durante la valutazione.
        small = GoldEntry('g', 'NOUN', {'a': 1, 'b': 2, 'c': 3, 'd': 4})
        s = grade_slots('cane', ['a', 'b', 'c'] + [f'x{i}' for i in range(17)], REF, small, {}, {})
        self.assertAlmostEqual(ndcg20(s, small, set(), groups_in_vocab=4), ndcg20(s, small, {'a', 'b', 'c', 'd'}))
        # i gruppi già trovati contano comunque, anche se il numero salvato fosse più basso
        self.assertAlmostEqual(ndcg20(s, small, set(), groups_in_vocab=0), 1.0)

    def test_none_without_any_grade(self):
        s = grade_slots('cane', [f'x{i}' for i in range(20)], REF, None, {}, {})
        self.assertIsNone(ndcg20(s, None, set()))

    def test_stays_between_zero_and_one(self):
        value = ndcg20(slots(), GOLD, VOCAB)
        self.assertGreater(value, 0)
        self.assertLessEqual(value, 1)


class SenseAndHumanTest(unittest.TestCase):
    def test_sense_share_counts_known_answers_among_the_first_ten(self):
        judge = {'gatto': Verdict('gatto', 2, True, ''), 'beach': Verdict('beach', 0, False, '')}
        # guinzaglio coda scodinzolare osso cuccia fiuto zampa: verificate (senso giusto per costruzione) + gatto sì + beach no
        self.assertAlmostEqual(sense_share(slots(judge=judge)), 8 / 9)

    def test_sense_share_none_without_answers(self):
        self.assertIsNone(sense_share(slots(gold=None, judge={})))

    def test_human_share(self):
        human = {('cane', 'gatto'): 'naturale', ('cane', 'beach'): 'non_naturale', ('cane', 'osso'): 'non_so'}
        self.assertAlmostEqual(human_share(slots(human=human)), 1 / 2)

    def test_human_share_none_without_verdicts(self):
        self.assertIsNone(human_share(slots()))


class BootstrapTest(unittest.TestCase):
    def test_deterministic_and_ordered(self):
        low, high = bootstrap([0.1, 0.5, 0.9, 0.3, 0.7])
        self.assertEqual((low, high), bootstrap([0.1, 0.5, 0.9, 0.3, 0.7]))
        self.assertLessEqual(low, 0.5)
        self.assertGreaterEqual(high, 0.5)

    def test_constant_values_have_no_spread(self):
        self.assertEqual(bootstrap([0.4] * 12), (0.4, 0.4))

    def test_empty_is_refused(self):
        with self.assertRaises(ValueError):
            bootstrap([])


if __name__ == '__main__':
    unittest.main()
