import unittest

from build_riordino_relations import dictionary_relations, selective_clues


class ItalianDefinitions(unittest.TestCase):
    def test_roles_follow_the_direction_of_the_definition(self):
        words = {'ago', 'ricamatrice', 'ricamare', 'bocchetta', 'sassofono', 'strumento', 'persona'}
        definitions = [
            ('ago', "strumento usato dalla ricamatrice per ricamare"),
            ('bocchetta', "parte del sassofono"),
            ('ricamatrice', "persona che ricama"),
        ]
        edges = set(dictionary_relations(definitions, words, {'ricama': 'ricamare'}))
        self.assertIn(('ricamatrice', 'ago', 'strumento'), edges)
        self.assertIn(('sassofono', 'bocchetta', 'parte'), edges)
        self.assertIn(('ricamatrice', 'ricamare', 'azione'), edges)
        self.assertNotIn(('bocchetta', 'sassofono', 'parte'), edges)
        self.assertNotIn(('ricamare', 'ricamatrice', 'azione'), edges)

    def test_coverage_counts_distinct_secrets_across_all_relations(self):
        links = [('a', 'ruota', 'parte'), ('b', 'ruota', 'strumento'), ('a', 'pietrina', 'parte')]
        links.append(links[-1])
        self.assertEqual(selective_clues(links, max_secrets=1), {'a': [['pietrina', 'parte']]})
