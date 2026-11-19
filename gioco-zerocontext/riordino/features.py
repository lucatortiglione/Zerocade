"""Le caratteristiche di una coppia (segreta, candidato) per il riordino."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Mapping

from valutazione.common import connect_ro
from contextlib import closing

from riordino.export import Candidate

BANDS = ('MOLTO_FAMILIARE', 'FAMILIARE', 'POCO_FAMILIARE', 'RARA')
FEATURE_NAMES = ('emb', 'pmi', 'cn', 'ppmi', 'emb_mancante', 'pmi_mancante', 'cn_mancante', 'ppmi_mancante', 'score', 'log_rank',
                 'molto_familiare', 'familiare', 'poco_familiare', 'rara', 'lemma', 'log_frequenza',
                 'vec_cos', 'vec_mancante', 'log_vec_rank', 'nell_export',
                 'abtt_cos', 'abtt_mancante', 'hub', 'hub_abtt', 'hub_mancante', 'log_inv_rank', 'inv_mancante',
                 'pos_nome', 'pos_verbo', 'pos_agg', 'pos_uguale')


class Lexicon:
    """Familiarità e frequenza delle parole, da raw 2.0 (`normalizzata`): una parola che non c'è non è un lemma (forma flessa, rumore)."""

    def __init__(self, entries: Mapping[str, tuple[str | None, int | None]]):
        self.entries = dict(entries)

    def get(self, word: str) -> tuple[str | None, int | None] | None:
        return self.entries.get(word)

    @classmethod
    def from_raw2(cls, raw2: Path) -> 'Lexicon':
        with closing(connect_ro(raw2)) as con:
            return cls({w: (band, freq) for w, band, freq in con.execute('SELECT parola, familiarity_band, frequency FROM normalizzata')})


def candidate_features(c: Candidate, lexicon: Lexicon) -> list[float]:
    signals = (c.emb, c.pmi, c.cn, c.ppmi)
    entry = lexicon.get(c.word)
    band, frequency = entry if entry else (None, None)
    return [float(v) if v is not None else 0.0 for v in signals] + [float(v is None) for v in signals] + [
        float(c.score) if c.score is not None else 0.0, math.log1p(c.rank)] + [float(band == b) for b in BANDS] + [
        float(entry is not None), math.log1p(frequency or 0)] + [
        c.vec_cos or 0.0, float(c.vec_cos is None), math.log1p(c.vec_rank) if c.vec_rank is not None else 0.0, float(c.in_export)] + [
        c.abtt_cos or 0.0, float(c.abtt_cos is None), c.hub or 0.0, c.hub_abtt or 0.0, float(c.hub is None),
        math.log1p(c.inv_rank) if c.inv_rank is not None else 0.0, float(c.inv_rank is None),
        float(c.pos == 'NOUN'), float(c.pos == 'VERB'), float(c.pos == 'ADJ'), float(bool(c.pos_same))]
