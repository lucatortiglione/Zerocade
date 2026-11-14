"""La valutazione distingue ammissibilità tecnica, fonti e approvazione dei giochi."""
import unittest

from evaluate_imported_words import (assess, empty_context, empty_wordle, family,
                                     invalid_reasons, wheel_support, wordle, context)


def environment():
    return {'zipf': lambda word, lang: 0.0, 'ranks': {}, 'dictionaries': {'unimorph-ita', 'kaikki-itwiktionary'},
            'forms': {'unimorph-ita', 'kaikki-itwiktionary'}, 'morphology': {'unimorph-ita'},
            'wordle_excluded': set(), 'context_excluded': set(), 'fasttext': set(), 'numberbatch': set(),
            'vocab_size': 60000, 'max_wheel': 9, 'blocklist': (set(), ('CAZZ',)), 'not_in_grid': set(),
            'decisions': {}, 'verb_references': {}, 'policy': {'minimum_zipf_it': 3.0},
            'active_answers': set(), 'active_wordle': set(), 'active_context': set(), 'active_words': set(),
            'wheel_support': wheel_support(['andassi'], ['ANNODASSI'])}


def inflected(sources=('unimorph-ita', 'glaffit')):
    wf, cf = empty_wordle(), empty_context()
    families = {family(source) for source in sources}
    wf['infl'] = families
    wf['inflL'] = {'andare': families}
    wf['kinds'] = {('V', name) for name in families}
    cf['inflO'] = families
    return {'sources': set(sources), 'analyses': {('andare', 'VERB', 'inflected_form', 'V', source) for source in sources},
            'wordle': wf, 'context': cf}


class UtilityTests(unittest.TestCase):
    def test_phrases_are_rejected_before_their_frequency_can_look_high(self):
        env = environment()
        env['zipf'] = lambda *args: self.fail('Una locuzione non deve ricevere la frequenza di una parola')
        features, verdicts = assess('si fa', None, env)
        self.assertIn('locuzione_o_piu_token', features['invalid_reasons'])
        self.assertTrue(all(v['status'] == 'ESCLUSA_FORMATO' for roles in verdicts.values() for v in roles.values()))

    def test_accents_are_valid_characters_and_replacement_characters_are_not(self):
        self.assertEqual(invalid_reasons('città'), [])
        self.assertIn('carattere_di_sostituzione', invalid_reasons('citt\ufffd'))

    def test_two_independent_sources_allow_a_guess_without_approving_a_solution(self):
        _, verdicts = assess('andassi', inflected(), environment())
        self.assertEqual(verdicts['zerowordle']['tentativo']['status'], 'CANDIDATA_TENTATIVO')
        self.assertEqual(verdicts['zerowordle']['soluzione']['status'], 'NON_ADATTA_SOLUZIONE')
        self.assertEqual(verdicts['zeroassociations']['risposta']['status'], 'SOLO_MORFOLOGIA')

    def test_glaff_and_its_wiktionary_origin_do_not_count_as_two_sources(self):
        _, verdicts = assess('andassi', inflected(('glaffit', 'kaikki-itwiktionary')), environment())
        self.assertEqual(verdicts['zerowordle']['tentativo']['status'], 'NON_AMMISSIBILE')
        self.assertEqual(family('flex-it-nouns'), family('morphit-048-mirror'))

    def test_zero_frequency_single_source_bonus_requires_review_even_if_a_wheel_exists(self):
        _, verdicts = assess('andassi', inflected(('glaffit',)), environment())
        bonus = verdicts['zerowords']['bonus']
        self.assertEqual(bonus['status'], 'DA_REVISIONARE_BONUS')
        self.assertEqual(bonus['example_wheels'], ['ANNODASSI'])
        self.assertEqual(verdicts['zerowords']['griglia']['status'], 'SOLO_BONUS')

    def test_word_without_supporting_wheel_is_not_a_playable_bonus(self):
        env = environment(); env['wheel_support'] = {}
        _, verdicts = assess('andassi', inflected(), env)
        self.assertEqual(verdicts['zerowords']['bonus']['status'], 'NON_FORMABILE')

    def test_blocklist_applies_to_bonuses_too(self):
        env = environment(); env['blocklist'] = ({'ANDASSI'}, ())
        _, verdicts = assess('andassi', inflected(), env)
        self.assertEqual(verdicts['zerowords']['bonus']['status'], 'ESCLUSA_BLOCKLIST')
        self.assertEqual(verdicts['zerowords']['griglia']['status'], 'ESCLUSA_BLOCKLIST')

    def test_fasttext_alone_does_not_put_a_word_into_context_vocabulary(self):
        env = environment(); env['fasttext'] = {'andassi'}
        _, verdicts = assess('andassi', inflected(), env)
        self.assertEqual(verdicts['zerocontext']['tentativo']['status'], 'NON_SELEZIONATA')

    def test_only_real_letter_multisets_support_a_bonus(self):
        support = wheel_support(['casa', 'cassa'], ['SACCHI', 'CASATA'])
        self.assertIn('AACS', support)
        self.assertNotIn('AACSS', support)

    def test_generator_rules_keep_their_original_default_source_policy(self):
        self.assertEqual(wordle.verdict('andassi', inflected()['wordle']), (False, 'poco_attestata'))
        noun = empty_context(); noun['N'] = {'unimorph-ita', 'glaffit'}
        self.assertEqual(context.decide('esempio', noun), '-non_sostantivo')


if __name__ == '__main__': unittest.main()
