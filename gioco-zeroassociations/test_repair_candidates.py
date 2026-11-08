import json
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from generate_candidates import load_corpus
from repair_candidates import revise
from test_word_association_it_v3_6_0 import candidate
from validate_word_association_it_v3_6_0 import load_taxonomy, TAXONOMY_FILENAME


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.taxonomy = load_taxonomy(Path(__file__).parent / TAXONOMY_FILENAME)
        self.row = candidate('pizza', 'root')
        self.row['ref'] = 'c' + '0' * 24
        self.row['words'] = ['forno', 'mozzarella', 'pomodoro', 'impasto', 'lievito', 'basilico', 'secolo']

    def patch(self, words):
        return {'prompt': 'pizza', 'revision_id': 'test', 'expected_words': self.row['words'],
            'sense_description': 'Pizza come preparazione alimentare',
            'answers': [{'word': word, 'relation': 'ingrediente',
                         'rationale': 'Motivazione editoriale di prova della relazione.'} for word in words]}

    def test_targeted_repair_keeps_prompt_and_archives_parent(self):
        patch = self.patch(self.row['words'][:-1] + ['olio'])
        before = deepcopy(self.row)
        result, archive, changes = revise([self.row], [patch], self.taxonomy)
        self.assertEqual(self.row, before)
        self.assertEqual(result[0]['prompt'], 'pizza')
        self.assertEqual(result[0]['parent_candidate_id'], 'root')
        self.assertEqual(result[0]['repair_attempt'], 1)
        self.assertEqual(archive, [before])
        self.assertEqual(changes[0]['added'], ['olio'])
        self.assertIsNone(result[0]['semantic_review'])
        self.assertFalse(result[0]['editorial_revision']['independent_review'])
        again, previous, changes = revise(result, [patch], self.taxonomy)
        self.assertEqual(again, result)
        self.assertEqual((previous, changes), ([], []))

    def test_systemic_regeneration_preserves_prompt_and_truthful_lineage(self):
        words = ['farina', 'acqua', 'sale', 'olio', 'pomodoro', 'forno', 'mozzarella']
        result, archive, changes = revise([self.row], [self.patch(words)], self.taxonomy)
        self.assertEqual(result[0]['prompt'], 'pizza')
        self.assertEqual(result[0]['repair_attempt'], 0)
        self.assertIsNone(result[0]['parent_candidate_id'])
        self.assertEqual(result[0]['regenerated_from_candidate_id'], 'root')
        self.assertEqual(changes[0]['kind'], 'regeneration_same_prompt')

    def test_missing_justification_or_modified_source_fails_closed(self):
        patch = self.patch(self.row['words'][:-1] + ['olio'])
        patch['answers'][0]['rationale'] = ''
        with self.assertRaises(ValueError):
            revise([self.row], [patch], self.taxonomy)
        patch = self.patch(self.row['words'][:-1] + ['olio'])
        patch['expected_words'] = ['diverso']
        with self.assertRaises(ValueError):
            revise([self.row], [patch], self.taxonomy)
        patch = self.patch(self.row['words'][:-1] + ['sua'])
        with self.assertRaises(ValueError):
            revise([self.row], [patch], self.taxonomy)

    def test_content_words_are_not_a_context_free_blacklist(self):
        words = ['vita', 'pensare', 'alcol', 'misura', 'secolo', 'massa', 'olio']
        # Il controllo di forma consente contenuti: la loro pertinenza richiede QA.
        result, _, _ = revise([self.row], [self.patch(words)], self.taxonomy)
        self.assertEqual(result[0]['words'], words)
        self.assertEqual(result[0]['editorial_revision']['decision'], 'DA_RIVEDERE')

    def test_page_relations_cannot_leak_into_anatomical_sense(self):
        entry = {'word': 'palato', 'lang_code': 'it', 'pos': 'noun',
            'senses': [{'id': 'anatomia', 'glosses': ['parte della bocca formata da quattro ossa'],
                        'related': [{'word': 'bocca'}]}],
            'related': [{'word': 'palo'}, {'word': 'fasciato'}, {'word': 'sbarrato'}],
            'synonyms': [{'word': 'competenza', 'tags': ['figuratively']}]}
        entry['antonyms'] = [{'word': 'digiuno'}]
        entry['hypernyms'] = [{'word': 'animale'}]
        entry['hyponyms'] = [{'word': 'orango'}]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'corpus.jsonl'
            source.write_text(json.dumps(entry), encoding='utf-8')
            entries, _, _ = load_corpus(source)
        self.assertEqual(entries[0]['rels']['related'], ['bocca'])
        self.assertEqual(entries[0]['rels']['synonyms'], [])
        self.assertEqual(entries[0]['rels']['antonyms'], [])
        self.assertEqual(entries[0]['rels']['hypernyms'], [])
        self.assertEqual(entries[0]['rels']['hyponyms'], [])
        self.assertEqual(len(entries[0]['unscoped_relations']['related']), 3)


if __name__ == '__main__':
    unittest.main()
