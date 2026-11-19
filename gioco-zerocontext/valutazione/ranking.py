"""Il ranking di ZeroContext, uguale a `rankAgainst` (packages/shared/src/contextRanking.ts).

Coseno su vettori unitari, senza boost né penalità; la segreta è la posizione 1; le parole fissate dall'export della
Pipeline B vengono subito dopo, nel loro ordine; a pari somiglianza vince l'indice più basso.
"""
from __future__ import annotations

import numpy as np

from valutazione.profiles import Profile

CHUNK = 8192  # righe per volta: ABTT in float64 intero occuperebbe 770 MB


def similarities(profile: Profile, secret: int) -> np.ndarray:
    """Prodotto scalare con la segreta, sommato in doppia precisione e poi in float32, come il server."""
    n = len(profile.words)
    target = np.asarray(profile.vectors[secret], dtype=np.float64)
    sims = np.empty(n, dtype=np.float32)
    for start in range(0, n, CHUNK):
        sims[start:start + CHUNK] = (np.asarray(profile.vectors[start:start + CHUNK], dtype=np.float64) @ target).astype(np.float32)
    return sims


def order(profile: Profile, secret: int) -> np.ndarray:
    """Gli indici delle parole in ordine di posizione: order[0] è la segreta."""
    n = len(profile.words)
    if not 0 <= secret < n:
        raise ValueError(f'Segreta {secret} fuori dal vocabolario ({n} parole)')
    sims = similarities(profile, secret)
    sims[secret] = np.inf
    # chiave: 0 la segreta, 1.. le parole fissate nell'ordine dell'export, n + 2 tutte le altre
    key = np.full(n, n + 2, dtype=np.int64)
    key[secret] = 0
    nxt = 1
    for w in (profile.pinned or {}).get(secret, ()):
        if 0 <= w < n and key[w] == n + 2:
            key[w] = nxt
            nxt += 1
    return np.lexsort((np.arange(n), -sims, key))


def rank_of(profile: Profile, secret: int) -> np.ndarray:
    """Posizione di ogni parola, da 1 (la segreta)."""
    ranks = np.empty(len(profile.words), dtype=np.int64)
    ranks[order(profile, secret)] = np.arange(1, len(profile.words) + 1)
    return ranks


def top(profile: Profile, secret: int, k: int = 20) -> list[int]:
    """Le prime k parole dopo la segreta (posizioni 2..k+1)."""
    return order(profile, secret)[1:1 + k].tolist()
