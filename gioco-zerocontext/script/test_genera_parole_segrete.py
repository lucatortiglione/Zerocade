import json
import unittest

import numpy as np

from genera_parole_segrete import preconditions, select_pools


def fixture():
    common = [f'c{i}' for i in range(150)]
    targets = ['alfa', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'sopire', 'cuprite', 'privo']
    words = common + targets
    rng = np.random.default_rng(1)
    matrix = rng.normal(0, .05, (len(words), 8)).astype(np.float32)
    matrix[:, 0] += 1  # tutte vicine tra loro: densità alta
    eta = words.index('eta')
    matrix[eta] = rng.normal(0, .05, 8)
    matrix[eta, 1] += 1  # isolata: densità bassa
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
    zipf = {**{w: 5.0 for w in common}, 'alfa': 2.2, 'beta': 3.0, 'epsilon': 2.2, 'zeta': 2.2, 'eta': 2.2, 'theta': 5.0,
            'gamma': 1.0, 'gammi': 1.9, 'gammo': 1.9, 'delta': 2.9, 'delti': 2.9, 'deltu': 2.9,
            'sopire': 1.95, 'cuprite': 1.95, 'privo': 1.95}
    forms = {'gamma': {'gamma', 'gammi', 'gammo'}, 'delta': {'delta', 'delti', 'deltu'}}
    parts = {'alfa': {'noun'}, 'beta': {'noun'}, 'gamma': {'verb'}, 'delta': {'verb'}, 'epsilon': {'noun'}, 'zeta': {'noun'},
             'eta': {'noun'}, 'theta': {'noun'}, 'sopire': {'verb'}, 'cuprite': {'noun'}, 'privo': {'adjective'}}
    tiers = {'beta': 'AU', 'epsilon': 'FO'}
    domains = {'sopire': 'emozioni', 'cuprite': 'emozioni'}
    normalized = set(words) - {'zeta'}
    return words, matrix, normalized, parts, forms, tiers, domains, lambda w: zipf.get(w, 0.0)


def run(secrets=(), blocked=()):
    words, matrix, normalized, parts, forms, tiers, domains, frequency = fixture()
    rows, stats = select_pools(words, matrix, list(secrets), normalized, parts, forms, tiers, domains, set(blocked), frequency)
    return {r[0]: r for r in rows}, stats


class SecretWordTests(unittest.TestCase):
    def test_ordinary_window_derogations_and_verbs(self):
        rows, _ = run()
        self.assertTrue(rows['alfa'][1])           # Zipf 2.2: finestra ordinaria
        self.assertTrue(rows['beta'][1])           # AU, sostantivo, fino a 3.2
        self.assertTrue(rows['gamma'][1])          # verbo: frequenza delle forme attestate (1.9 + 2 forme = 2.2)
        self.assertEqual(rows['gamma'][12], 'forme_attestate')
        self.assertTrue(rows['delta'][1])          # verbo con forme attestate a 3.4: da 2,00 in su, senza limite (§3.3, §7)
        self.assertNotIn('epsilon', rows)          # FO escluse
        self.assertNotIn('zeta', rows)             # non è in normalizzata
        self.assertNotIn('eta', rows)              # densità insufficiente

    def test_ordinary_window_is_1_80_to_2_50(self):
        from context_semantic_policy import ORDINARY_CEILING, ORDINARY_FLOOR
        self.assertEqual((ORDINARY_FLOOR, ORDINARY_CEILING), (1.8, 2.5))

    def test_special_pool_needs_domain_and_non_technical_suffix(self):
        rows, _ = run()
        self.assertTrue(rows['sopire'][2])
        # A Zipf 1,95 rientrano nella finestra ordinaria [1,80, 2,50], ma non nello speciale:
        self.assertEqual((rows['cuprite'][1], rows['cuprite'][2]), (1, 0))  # suffisso -ite
        self.assertEqual((rows['privo'][1], rows['privo'][2]), (1, 0))      # nessun dominio accreditato

    def test_current_secrets_are_never_lost(self):
        rows, stats = run(secrets=['theta', 'eta', 'zeta', 'alfa'])
        for word in ('theta', 'eta', 'zeta'):      # tutte fuori dai filtri: restano, in deroga
            self.assertEqual((rows[word][3], rows[word][4], rows[word][1], rows[word][2]), (1, 1, 0, 0), word)
        self.assertEqual((rows['alfa'][3], rows['alfa'][4], rows['alfa'][1]), (1, 0, 1))
        self.assertEqual(stats['legacy'], 4)

    def test_blocked_words_are_not_added_but_current_ones_stay(self):
        rows, _ = run(secrets=['beta'], blocked=['alfa', 'beta'])
        self.assertNotIn('alfa', rows)
        # Già in uso ma bloccata dalle esclusioni: non è più conforme, resta giocabile in deroga.
        self.assertEqual((rows['beta'][3], rows['beta'][4], rows['beta'][1]), (1, 1, 0))

    def test_stale_raw_is_refused_with_the_task_to_run(self):
        problems = preconditions({'word_cleanup_version': 'raw-word-cleaning-2', 'normalizzazione_stato': 'aggiornata',
                                  'normalizzazione_report': json.dumps({'policy': 'canonical-gender-number-2.0'})})
        self.assertEqual(len(problems), 2)
        self.assertIn('Aggiornamento parole RAW', problems[0])
        self.assertIn('Normalizzare parole RAW', problems[1])
        from raw_word_cleaning import VERSION
        from normalizza_parole_raw_v2 import POLICY
        self.assertEqual(preconditions({'word_cleanup_version': VERSION, 'normalizzazione_stato': 'aggiornata',
                                        'normalizzazione_report': json.dumps({'policy': POLICY})}), [])
        self.assertEqual(len(preconditions({'word_cleanup_version': VERSION, 'normalizzazione_stato': 'da_aggiornare',
                                            'normalizzazione_report': json.dumps({'policy': POLICY})})), 1)


if __name__ == '__main__':
    unittest.main()
