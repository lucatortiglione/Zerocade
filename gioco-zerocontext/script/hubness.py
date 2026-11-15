"""La penalità di «genericità» di ogni parola di ZeroContext (decisa il 15/11/2026, forza 0,5).

Nei vettori alcune parole sono vicine a quasi tutto (autista, guidatore, medico...): per ogni segreta finiscono in alto
anche con poca attinenza («hubness»). Come nel metodo CSLS, ogni parola riceve una penalità proporzionale alla media
del suo coseno con le K parole più vicine (r): nella classifica di una segreta il suo punteggio scende di
forza * r, e le parole davvero pertinenti, che hanno un coseno alto con la segreta, restano in testa.

La penalità è espressa nella scala del prodotto scalare dei vettori int8 (come link_boost), pronta da sottrarre.
"""
from __future__ import annotations

import numpy as np

STRENGTH = 0.5
NEIGHBOURS = 10
CHUNK = 2000


def dot_scale(q: np.ndarray) -> float:
    """Il prodotto scalare di una riga con sé stessa, in media: il valore che il vettore ha come «coseno 1»."""
    return float(np.mean(np.einsum('ij,ij->i', q.astype(np.int64), q.astype(np.int64))))


def hub_penalties(q: np.ndarray, strength: float = STRENGTH, neighbours: int = NEIGHBOURS) -> np.ndarray:
    """Per ogni riga di q (int8, già normalizzata) la penalità intera, nella scala del prodotto scalare."""
    n = len(q)
    if n <= neighbours + 1:
        raise ValueError('Troppe poche parole per misurare la genericità')
    rows = q.astype(np.float32)
    rows /= np.linalg.norm(rows, axis=1, keepdims=True) + 1e-9
    mean = np.empty(n, np.float32)
    for start in range(0, n, CHUNK):
        sims = rows[start:start + CHUNK] @ rows.T
        sims[np.arange(len(sims)), np.arange(start, start + len(sims))] = -np.inf  # non conta come vicina a sé
        mean[start:start + CHUNK] = np.partition(sims, -neighbours, axis=1)[:, -neighbours:].mean(axis=1)
    return np.maximum(0, np.rint(strength * mean * dot_scale(q))).astype(np.int32)
