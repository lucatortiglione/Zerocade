"""Regressioni del referente: stesso aggettivo, contesti diversi."""
from types import SimpleNamespace
import unittest

from semantic_rules import adjective_attachment, screen_set, editorial_errors
from validate_word_association_it_v3_6_0 import filter_definition


def token(text, pos, dep, head=None, index=0):
    item = SimpleNamespace(text=text, lemma_=text, pos_=pos, dep_=dep,
                           idx=index, i=index, children=[], is_stop=False)
    item.head = head if head is not None else item
    return item


class AdjectiveReferenceTests(unittest.TestCase):
    def test_fresco_is_excluded_but_intonaco_remains(self):
        painting = token('dipinto', 'NOUN', 'ROOT')
        plaster = token('intonaco', 'NOUN', 'obl', painting, 4)
        fresh = token('fresco', 'ADJ', 'amod', plaster, 8)
        rows = filter_definition('affresco', 'dipinto su intonaco fresco',
                                 lambda _: [painting, plaster, fresh])
        self.assertNotEqual(rows[1]['status'], 'excluded')
        self.assertEqual(rows[2]['status'], 'excluded')
        self.assertEqual(rows[2]['adjective_attachment']['governor'], 'intonaco')

    def test_same_adjective_can_describe_the_prompt_directly(self):
        root = token('intonaco', 'NOUN', 'ROOT')
        fresh = token('fresco', 'ADJ', 'amod', root, 4)
        self.assertEqual(adjective_attachment('intonaco', fresh)['status'], 'direct')

    def test_definition_genus_can_represent_the_prompt(self):
        root = token('dipinto', 'NOUN', 'ROOT')
        durable = token('durevole', 'ADJ', 'amod', root, 4)
        self.assertEqual(adjective_attachment('affresco', durable)['status'], 'direct')

    def test_coordinated_attributes_keep_the_same_referent(self):
        root = token('dipinto', 'NOUN', 'ROOT')
        plaster = token('intonaco', 'NOUN', 'obl', root, 4)
        first = token('fresco', 'ADJ', 'amod', plaster, 8)
        second = token('umido', 'ADJ', 'conj', first, 12)
        self.assertEqual(adjective_attachment('affresco', second)['status'], 'other_referent')

    def test_missing_parser_cannot_admit_adjective(self):
        fresh = SimpleNamespace(text='fresco', lemma_='fresco', pos_='ADJ', is_stop=False)
        rows = filter_definition('affresco', 'intonaco fresco', lambda _: [fresh])
        self.assertEqual(rows[0]['status'], 'excluded')
        self.assertEqual(rows[0]['adjective_attachment']['status'], 'unverified')

    def test_explicit_other_subject_is_not_the_prompt(self):
        subject = token('intonaco', 'NOUN', 'nsubj')
        fresh = token('fresco', 'ADJ', 'ROOT')
        fresh.children = [subject]
        self.assertEqual(adjective_attachment('affresco', fresh)['status'], 'other_referent')

    def test_prepositional_fragment_is_not_a_definition_genus(self):
        root = token('intonaco', 'NOUN', 'ROOT')
        root.children = [token('con', 'ADP', 'case', root, 1)]
        fresh = token('fresco', 'ADJ', 'amod', root, 4)
        self.assertEqual(adjective_attachment('affresco', fresh)['status'], 'other_referent')

    def test_existing_metadata_without_attachment_requires_review(self):
        metadata = {'clue_evidence': {'fresco': {'analysis': {'pos': 'ADJ'}}}}
        result = screen_set('affresco', ['fresco'], metadata)
        self.assertIn('adjective_referent_unverified', {s['code'] for s in result['signals']})
        self.assertFalse(result['semantic_approval'])


if __name__ == '__main__':
    unittest.main()
