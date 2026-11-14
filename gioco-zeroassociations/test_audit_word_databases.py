"""Le segnalazioni NLP rispettano le regole diverse di soluzioni e tentativi."""
import unittest

from audit_word_databases import lexical_flags, context_flags, upos
from italian_nlp import ItalianAnalyzer, token_row


def item(word='porta', *, lemma=True, pos='NOUN', location='giochi#associazioni.prompts'):
    return {'word': word, 'require_lemma': lemma, 'expected_pos': pos, 'location': location}


class AuditTests(unittest.TestCase):
    def test_homograph_keeps_noun_and_verb_without_flagging_lexical_ambiguity(self):
        info = {'known_form': True, 'analyses': [('porta', 'NOUN', 'NOUN-F:s', 'morphit', 'lemma'),
                                               ('portare', 'VERB', 'VER', 'morphit', 'inflected_form')]}
        self.assertEqual(lexical_flags(item(), info, {}, {}), [])

    def test_inflections_allowed_as_guesses_but_not_certified_as_lemmas(self):
        info = {'known_form': True, 'analyses': [('casa', 'NOUN', 'NOUN-F:p', 'morphit', 'inflected_form')]}
        self.assertEqual(lexical_flags(item('case', lemma=False, pos=None), info, {}, {}), [])
        self.assertEqual(lexical_flags(item('case'), info, {}, {}), ['NO_LEMMA_EVIDENCE'])

    def test_wordle_accent_folding_does_not_change_other_games(self):
        empty = {'known_form': False, 'analyses': []}
        aliases, results = {'citta': ['città']}, {'città': {'known_form': True}}
        self.assertEqual(lexical_flags(item('citta', lemma=False, pos=None, location='giochi#wordle.words'),
                                       empty, aliases, results), [])
        self.assertEqual(lexical_flags(item('citta', lemma=False, pos=None), empty, aliases, results),
                         ['NO_LEXICAL_EVIDENCE'])

    def test_definition_does_not_certify_pos_of_absent_target(self):
        tokens = [token_row('Emettere', 'emettere', 'VERB', '', {}, 0, 8)]
        flags, matched = context_flags(item('abbaiare', pos='VERB'), {'analyses': []}, tokens)
        self.assertEqual((flags, matched), ([], []))

    def test_contextual_contradiction_is_reported_without_replacing_lexical_analyses(self):
        info = {'analyses': [('porta', 'NOUN', 'NOUN', 'morphit', 'lemma'),
                             ('portare', 'VERB', 'VER', 'morphit', 'inflected_form')]}
        tokens = [token_row('porta', 'portare', 'VERB', '', {}, 5, 10)]
        flags, matched = context_flags(item(), info, tokens)
        self.assertEqual(flags, ['CONTEXT_NON_CANONICAL_LEMMA', 'CONTEXT_POS_DISAGREEMENT'])
        self.assertEqual(len(info['analyses']), 2)
        self.assertEqual(matched, tokens)

    def test_unknown_pos_remains_unresolved(self):
        self.assertIsNone(upos('glaffit', 'unknown', 'lemma'))
        self.assertEqual(upos('glaffit', 'Npfs---', 'lemma'), 'PROPN')
        self.assertEqual(upos('unimorph', 'V.PTCP', 'inflected_form'), 'VERB')
        self.assertIsNone(upos('nvdb_text', 's.m. agg.', 'lemma'))

    def test_batch_rejects_bad_input_before_loading_pipeline(self):
        analyzer = ItalianAnalyzer.__new__(ItalianAnalyzer)
        analyzer.engine = 'spacy'
        with self.assertRaises(ValueError):
            list(analyzer.analyze_many(['testo', '']))


if __name__ == '__main__':
    unittest.main()
