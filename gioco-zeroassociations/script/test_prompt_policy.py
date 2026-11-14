"""Familiarità dei prompt, lista chiusa dei prestiti e note POS del validatore."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest

from prompt_policy import load_prompt_policy, screen_prompt, borrowing_evidence, familiarity_reference
from validate_word_association_it_v3_6_0 import check_candidates_jsonl, load_taxonomy, TAXONOMY_FILENAME, main as validate_main
from test_word_association_it_v3_6_0 import candidate


class PromptPolicyTests(unittest.TestCase):
    def test_prompt_policy_separates_familiarity_and_closed_loan_list(self):
        policy = load_prompt_policy()
        self.assertNotIn('excluded_prompts', policy)
        self.assertTrue(screen_prompt('computer', 4.8, policy, ['source_loanword_label'])['accepted'])
        self.assertTrue(screen_prompt('bar', 4.8, policy, ['source_loanword_label'])['accepted'])
        # High frequency never bypasses the closed list for a foreign loan.
        self.assertFalse(screen_prompt('abstract', 6.0, policy, ['source_loanword_label'])['accepted'])
        self.assertFalse(screen_prompt('background', 6.0, policy, ['source_loanword_label'])['accepted'])
        self.assertFalse(screen_prompt('abside', 2.94, policy)['accepted'])
        self.assertTrue(screen_prompt('basilico', 3.5, policy)['accepted'])
        self.assertNotIn('basilico', policy['common_loanwords'])

    def test_borrowing_detection_ignores_translations_and_italian_derivations(self):
        entry = {'word': 'basilico', 'pos': 'noun', 'translations': [{'lang_code': 'en', 'word': 'basil'}]}
        self.assertEqual(borrowing_evidence(entry, {}), [])
        entry = {'word': 'abstract', 'pos': 'noun', 'etymology_texts': ["prestito diretto dall'inglese abstract"]}
        self.assertTrue(borrowing_evidence(entry, {}))
        entry = {'word': 'filmare', 'pos': 'verb', 'etymology_texts': ['derivazione di film']}
        self.assertEqual(borrowing_evidence(entry, {'raw_tags': ['forestierismo']}), [])

    def test_verbal_frequency_uses_only_attested_forms(self):
        scores = {'affettare': 2.7, 'affettato': 3.4, 'abside': 2.94, 'absidi': 3.8, 'avere': 6.0}
        reference = familiarity_reference({'word': 'affettare', 'pos': 'verb', 'forms': [
            {'form': 'affettato'}, {'form': 'avere', 'tags': ['auxiliary']}]}, scores.get)
        self.assertEqual(reference['form'], 'affettato')
        self.assertTrue(screen_prompt('affettare', 2.7, load_prompt_policy(), frequency_reference=reference)['accepted'])
        reference = familiarity_reference({'word': 'abside', 'pos': 'noun', 'forms': [{'form': 'absidi'}]}, scores.get)
        self.assertEqual(reference['form'], 'abside')
        self.assertFalse(screen_prompt('abside', 2.94, load_prompt_policy(), frequency_reference=reference)['accepted'])


class ValidatorTests(unittest.TestCase):
    def test_missing_verbs_is_informational(self):
        taxonomy = load_taxonomy(Path(__file__).parent.parent/TAXONOMY_FILENAME)
        items = [candidate('contesto'+chr(97+i//26)+chr(97+i % 26), f'test-{i}') for i in range(30)]
        for i, item in enumerate(items):
            item['difficulty_estimate'] = 'media' if i < 21 else 'alta'
            item['relations'] = [['strumento', 'luogo', 'parte', 'materiale', 'funzione'][(i+j) % 5] for j in range(7)]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'items.jsonl'
            path.write_text('\n'.join(json.dumps(item) for item in items), encoding='utf-8')
            result = check_candidates_jsonl(path, taxonomy)
            self.assertEqual(result['errors_count'], 0)
            self.assertTrue(result['planning_notes'])
            self.assertFalse(any('POS contesti' in warning for warning in result['warnings']))
            with redirect_stdout(io.StringIO()):
                self.assertEqual(validate_main(['--candidates-jsonl', str(path), '--strict-warnings']), 0)


if __name__ == '__main__':
    unittest.main()
