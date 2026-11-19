"""IWFS: formula 50/30/20, normalizzazione, dati mancanti, confidence e fasce della specifica IWFS v1.0."""
import unittest

from raw_word_familiarity import (Reference, band, combine, compute, confidence, lexical_validity,
                                  prevalence_percent)
from raw_word_metrics import WordMetrics


class FamiliarityTests(unittest.TestCase):
    def test_full_score_uses_the_50_30_20_weights(self):
        iwfs, status = combine({'prevalence': 100.0, 'contextual_diversity': 50.0, 'frequency': 0.0})
        self.assertEqual((iwfs, status), (65.0, 'FULL'))

    def test_missing_components_are_never_zero_and_weights_are_renormalized(self):
        iwfs, status = combine({'prevalence': None, 'contextual_diversity': 80.0, 'frequency': 40.0})
        self.assertEqual(status, 'PARTIAL')
        self.assertEqual(iwfs, round((0.30 * 80 + 0.20 * 40) / 0.50, 2))  # non (0,3·80 + 0,2·40) / 1
        self.assertEqual(combine({'prevalence': None, 'contextual_diversity': 70.0, 'frequency': None}), (70.0, 'DIAGNOSTIC'))
        self.assertEqual(combine({'prevalence': None, 'contextual_diversity': None, 'frequency': None}), (None, 'UNAVAILABLE'))

    def test_prevalence_is_the_probability_scale_of_the_icp_estimate(self):
        self.assertAlmostEqual(prevalence_percent(0), 50.0)
        self.assertAlmostEqual(prevalence_percent(2.5758293035489), 99.5, places=2)  # 0,005 + 0,99 · accuratezza con accuratezza 1
        self.assertAlmostEqual(prevalence_percent(-2.5758293035489), 0.5, places=2)

    def test_percentile_ranks_are_mid_ranks_of_positive_values(self):
        reference = Reference([1, 2, 2, 3])
        self.assertEqual(reference.percentile(0), 0.0)
        self.assertEqual(reference.percentile(1), 12.5)
        self.assertEqual(reference.percentile(2), 50.0)
        self.assertEqual(reference.percentile(3), 87.5)

    def test_bands_and_confidence(self):
        self.assertEqual([band(v) for v in (100, 85, 84.99, 65, 64.99, 40, 39.99, 0)],
                         ['MOLTO_FAMILIARE', 'MOLTO_FAMILIARE', 'FAMILIARE', 'FAMILIARE', 'POCO_FAMILIARE', 'POCO_FAMILIARE', 'RARA', 'RARA'])
        self.assertEqual(confidence('FULL', 'VALID', 49), 'HIGH')
        self.assertEqual(confidence('FULL', 'VALID', 12), 'MEDIUM')        # campione piccolo
        self.assertEqual(confidence('FULL', 'REVIEW_REQUIRED', 80), 'MEDIUM')
        self.assertEqual(confidence('PARTIAL', 'VALID', None), 'LOW')      # senza Word Prevalence
        self.assertEqual(confidence('DIAGNOSTIC', 'VALID', 80), 'LOW')
        self.assertEqual(confidence('UNAVAILABLE', 'VALID', None), 'NONE')

    def test_lexical_validity_needs_a_lexicographic_source_and_unknown_is_not_rejected(self):
        self.assertEqual(lexical_validity({'liita-lemma-bank', 'paisa-eurac'}), 'VALID')
        self.assertEqual(lexical_validity({'paisa-eurac', 'morphit-048-mirror'}), 'REVIEW_REQUIRED')
        self.assertEqual(lexical_validity(set()), 'UNKNOWN')

    def test_compute_rows_follow_the_specification(self):
        words = [('casa', 1), ('mare', 1), ('zzz', 1)]
        metrics = WordMetrics({'casa': (2.5758, 1.0, 49), 'mare': (1.0, 0.8, 40)},
                              {'casa': (17000, 130000), 'mare': (9000, 30000)},
                              [{'id': 'icp-prevalence', 'sha256': 'a' * 64}, {'id': 'subtlex-it', 'sha256': 'b' * 64}])
        sources = {'casa': {'liita-lemma-bank'}, 'mare': {'liita-lemma-bank'}, 'zzz': {'morphit-048-mirror'}}
        table, measurements, summary = compute(words, sources, metrics)
        rows = {r[0]: r for r in table}
        # (parola, single, validità, prevalenza, CD, frequenza, iwfs, stato, confidence, fascia)
        self.assertEqual(rows['casa'][2:6], ('VALID', 2.5758, 17000, 130000))
        self.assertEqual(rows['casa'][7:10], ('FULL', 'HIGH', rows['casa'][9]))
        self.assertGreater(rows['casa'][6], rows['mare'][6])
        self.assertEqual(rows['zzz'][3:6], (None, 0, 0))             # P non misurata; D ed F zero osservato
        self.assertEqual(rows['zzz'][7:9], ('PARTIAL', 'LOW'))
        self.assertEqual(rows['zzz'][6], 0.0)
        self.assertEqual(len(measurements), 9)
        by_key = {(m[0], m[1]): m for m in measurements}
        self.assertEqual(by_key[('zzz', 'prevalence')][4], 'MISSING')
        self.assertEqual(by_key[('zzz', 'frequency')][4], 'OBSERVED')
        self.assertEqual(by_key[('casa', 'prevalence')][5:8], (49, 'icp-prevalence', 'a' * 12))
        self.assertTrue(summary['normalization_version'].startswith('iwfs-norm-1/'))
        self.assertEqual(summary['status'], {'FULL': 2, 'PARTIAL': 1, 'DIAGNOSTIC': 0, 'UNAVAILABLE': 0})


if __name__ == '__main__':
    unittest.main()
