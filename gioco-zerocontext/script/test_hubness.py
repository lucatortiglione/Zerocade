"""La penalità di genericità: chi è vicino a tutto paga di più."""
import unittest

import numpy as np

from hubness import dot_scale, hub_penalties


class HubnessTests(unittest.TestCase):
    def test_words_in_a_dense_neighbourhood_pay_more(self):
        rng = np.random.default_rng(1)
        spread = rng.normal(size=(40, 16))
        centre = rng.normal(size=16)
        dense = centre + rng.normal(scale=0.2, size=(20, 16))  # tante parole vicine tra loro
        rows = np.vstack([spread, dense])
        rows /= np.linalg.norm(rows, axis=1, keepdims=True)
        p = hub_penalties(np.rint(rows * 100).astype(np.int8), strength=0.5, neighbours=5)
        self.assertEqual(p.dtype, np.int32)
        self.assertGreater(p[40:].mean(), 2 * p[:40].mean())
        self.assertTrue((p >= 0).all())

    def test_strength_scales_the_penalty_and_zero_removes_it(self):
        rng = np.random.default_rng(2)
        rows = rng.normal(size=(40, 8))
        q = np.rint(rows / np.linalg.norm(rows, axis=1, keepdims=True) * 100).astype(np.int8)
        half, full = hub_penalties(q, 0.5, 5), hub_penalties(q, 1.0, 5)
        self.assertTrue(np.abs(full - 2 * half).max() <= 1)
        self.assertEqual(int(hub_penalties(q, 0.0, 5).max()), 0)
        self.assertGreater(dot_scale(q), 9000)  # unit rows at scale 100: about 10 000


if __name__ == '__main__':
    unittest.main()
