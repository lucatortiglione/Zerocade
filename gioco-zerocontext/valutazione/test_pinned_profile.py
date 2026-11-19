"""Un profilo con liste di parole messe in cima per ogni segreta (un riordino calcolato fuori), da misurare con il valutatore."""
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from valutazione import profiles, ranking

WORDS = ['cane', 'gatto', 'osso', 'coda', 'luna', 'sole']


def base() -> profiles.Profile:
    rng = np.random.default_rng(3)
    m = rng.normal(size=(6, 4)).astype('<f4')
    m /= np.linalg.norm(m, axis=1, keepdims=True)
    return profiles.Profile('original', list(WORDS), {w: i for i, w in enumerate(WORDS)}, m, 'a' * 64, None)


class PinnedProfileTest(unittest.TestCase):
    def test_pinned_words_become_indices_and_unknown_ones_are_skipped(self):
        p = profiles.with_pinned(base(), {'cane': ['osso', 'coda', 'assente', 'osso', 'cane'], 'sconosciuta': ['osso']}, 'originale+riordino')
        self.assertEqual(p.pinned, {0: [2, 3]})           # senza doppioni, senza la segreta stessa, senza parole fuori vocabolario

    def test_same_vectors_new_name_and_nothing_else_changes(self):
        original = base()
        p = profiles.with_pinned(original, {'cane': ['osso']}, 'originale+riordino')
        self.assertEqual((p.name, p.sha256, p.words), ('originale+riordino', original.sha256, original.words))
        self.assertIs(p.vectors, original.vectors)
        self.assertIsNone(original.pinned)               # il profilo di partenza non viene toccato

    def test_the_pinned_words_are_the_first_positions_in_the_given_order(self):
        p = profiles.with_pinned(base(), {'cane': ['coda', 'luna']}, 'x')
        self.assertEqual(ranking.top(p, 0, k=2), [3, 4])

    def test_a_secret_without_a_list_keeps_the_ordering_of_the_vectors(self):
        plain, pinned = base(), profiles.with_pinned(base(), {'cane': ['coda']}, 'x')
        self.assertEqual(list(ranking.order(pinned, 1)), list(ranking.order(plain, 1)))

    def test_pinned_json_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'riordino.json'
            file.write_text(json.dumps({'cane': ['osso', 'coda']}), encoding='utf-8')
            self.assertEqual(profiles.load_pinned_json(file, base().index), {0: [2, 3]})

    def test_a_malformed_json_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'riordino.json'
            for bad in ('[1, 2]', '{"cane": "osso"}', '{"cane": [1, 2]}'):
                file.write_text(bad, encoding='utf-8')
                with self.assertRaises(ValueError, msg=bad):
                    profiles.load_pinned_json(file, base().index)


if __name__ == '__main__':
    unittest.main()
