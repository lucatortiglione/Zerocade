"""Candidati dai vettori: l'export della Pipeline B ha solo ~1000 parole per segreta e il tetto di recall (56% delle associazioni
verificate) sta lì; i vicini dei vettori ne portano dentro altre (con 1000 vicini il 74%). Ai candidati dell'export si aggiungono
coseno e posizione nei vettori; i vicini che l'export non aveva entrano senza i segnali dell'export e con `in_export=False`."""
from __future__ import annotations

from dataclasses import replace

import numpy as np

from riordino.export import Candidate
from valutazione import ranking
from valutazione.profiles import Profile

EXPORT_DEPTH = 1000   # posizione data ai candidati che l'export non aveva: subito dopo l'ultimo


def widen(secret: str, candidates: list[Candidate], profile: Profile, k: int = 1000) -> list[Candidate]:
    """I candidati dell'export (stesso ordine, con coseno e posizione nei vettori) e, dopo, i k vicini più vicini che non c'erano."""
    idx = profile.index.get(secret)
    if idx is None:
        return list(candidates)
    sims = ranking.similarities(profile, idx)
    sims[idx] = -np.inf
    order = np.lexsort((np.arange(len(sims)), -sims))   # il più vicino per primo; a pari somiglianza l'indice più basso; la segreta in fondo
    vec_rank = np.empty(len(sims), dtype=np.int64)
    vec_rank[order] = np.arange(1, len(sims) + 1)
    annotated, have = [], {secret}
    for c in candidates:
        have.add(c.word)
        i = profile.index.get(c.word)
        annotated.append(c if i is None else replace(c, vec_cos=float(sims[i]), vec_rank=int(vec_rank[i])))
    for i in order[:k]:
        word = profile.words[i]
        if word not in have:
            annotated.append(Candidate(word, None, None, None, None, None, EXPORT_DEPTH + 1, float(sims[i]), int(vec_rank[i]), False))
    return annotated
