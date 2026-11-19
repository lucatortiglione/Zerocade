"""Il modello del riordino: regressione logistica che impara dalle associazioni verificate quali candidati sono giusti."""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from riordino.export import Candidate
from riordino.features import FEATURE_NAMES, Lexicon, candidate_features

CLEAN_TOP = 20   # i primi 20 posti restano liberi dalle varianti della segreta (cani, bancaria…): valgono già come soluzione


KINDS = ('lineare', 'alberi')


class Reranker:
    """kind='lineare': regressione logistica (i pesi si leggono); kind='alberi': alberi di decisione a gradiente (colgono le interazioni
    tra i segnali, ma non hanno pesi da leggere). Iperparametri fissati in anticipo, non scelti guardando la misura."""

    def __init__(self, kind: str = 'lineare'):
        if kind not in KINDS:
            raise ValueError(f'kind deve essere uno tra {KINDS}, non {kind!r}')
        self.kind = kind
        self.scaler = StandardScaler()
        if kind == 'lineare':
            self.model = LogisticRegression(max_iter=3000, class_weight='balanced', random_state=0)
        else:
            self.model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.1, max_leaf_nodes=31, l2_regularization=1.0,
                                                        class_weight='balanced', early_stopping='auto', random_state=0)
        self.fitted = False

    def fit(self, examples: list[tuple[list[float], int]]) -> 'Reranker':
        labels = {y for _, y in examples}
        if labels != {0, 1}:
            raise ValueError(f"Servono esempi giusti e sbagliati per imparare (visti: {sorted(labels)})")
        x = np.array([f for f, _ in examples], dtype=np.float64)
        self.model.fit(self.scaler.fit_transform(x), np.array([y for _, y in examples]))   # gli alberi non ne hanno bisogno, ma non fa male
        self.fitted = True
        return self

    def score(self, features: list[float]) -> float:
        return float(self.model.decision_function(self.scaler.transform(np.array([features], dtype=np.float64)))[0])

    def scores(self, matrix: list[list[float]]) -> np.ndarray:
        return self.model.decision_function(self.scaler.transform(np.array(matrix, dtype=np.float64)))

    def weights(self) -> dict[str, float]:
        """I pesi sulle caratteristiche standardizzate: dicono quanto conta ciascuna (positivo = rende un candidato più probabile)."""
        if self.kind != 'lineare':
            return {}
        return {name: round(float(w), 3) for name, w in zip(FEATURE_NAMES, self.model.coef_[0])}


def rank_words(secret: str, candidates: list[Candidate], lexicon: Lexicon, ref, model: Reranker) -> list[str]:
    """I candidati riordinati dal migliore: la segreta non è candidata di se stessa e le sue varianti restano fuori dai primi 20 posti."""
    usable = [c for c in candidates if c.word != secret]
    if not usable:
        return []
    scores = model.scores([candidate_features(c, lexicon) for c in usable])
    ordered = [usable[i] for i in np.argsort(-scores, kind='stable')]
    plain = [c.word for c in ordered if not ref.is_variant(c.word, secret)]
    variants = [c.word for c in ordered if ref.is_variant(c.word, secret)]
    return plain[:CLEAN_TOP] + variants + plain[CLEAN_TOP:]
