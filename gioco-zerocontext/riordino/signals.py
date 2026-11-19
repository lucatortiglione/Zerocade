"""Segnali nuovi per il riordino: i modelli (lineare e ad alberi) davano risultati quasi uguali, quindi il limite erano i segnali.

- coseno nei vettori ABTT (BGE-M3 italiano): un secondo parere, di un'altra famiglia di vettori;
- genericità («hub»): parole vicine a quasi tutto (autista, medico…) finiscono in alto per ogni segreta senza essere pertinenti;
- rango inverso: quanto in alto sta la segreta nella lista del candidato (se il candidato è a sua volta una segreta dell'export);
- categoria grammaticale del candidato e se è la stessa della segreta."""
from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np

from riordino.export import Candidate
from valutazione.profiles import Profile

HUB_NEIGHBOURS = 10
INVERSE_CAP = 300   # il rango inverso si registra solo se la segreta è tra le prime 300 del candidato


def hub_scores(profile: Profile, k: int = HUB_NEIGHBOURS, chunk: int = 2000) -> np.ndarray:
    """Per ogni parola, il coseno medio con le sue k parole più vicine (lei esclusa): alto = parola generica."""
    n = len(profile.words)
    if n <= k:
        raise ValueError('Troppe poche parole per misurare la genericità')
    rows = np.asarray(profile.vectors, dtype=np.float32)
    out = np.empty(n, dtype=np.float32)
    for start in range(0, n, chunk):
        sims = rows[start:start + chunk] @ rows.T
        sims[np.arange(len(sims)), np.arange(start, start + len(sims))] = -np.inf
        out[start:start + chunk] = np.partition(sims, -k, axis=1)[:, -k:].mean(axis=1)
    return out


def reverse_ranks(found: dict[str, list[Candidate]], cap: int = INVERSE_CAP) -> dict[str, dict[str, int]]:
    """reverse[parola][altra] = posizione di `altra` nella lista di `parola`, se `parola` è una segreta dell'export e ci sta entro `cap`."""
    reverse: dict[str, dict[str, int]] = {}
    for word, candidates in found.items():
        reverse[word] = {c.word: c.rank for c in candidates if c.rank <= cap and c.in_export}
    return reverse


@dataclass
class Signals:
    ref: object
    orig: Profile
    abtt: Profile
    hub: np.ndarray
    hub_abtt: np.ndarray
    reverse: dict[str, dict[str, int]]

    def enrich(self, secret: str, candidates: list[Candidate]) -> list[Candidate]:
        """Gli stessi candidati con i segnali nuovi; ciò che non si può calcolare (parola fuori da un profilo) resta None."""
        secret_pos = self.ref.pos(secret)
        s_abtt = self.abtt.index.get(secret)
        target = np.asarray(self.abtt.vectors[s_abtt], dtype=np.float32) if s_abtt is not None else None
        out = []
        for c in candidates:
            i_orig, i_abtt = self.orig.index.get(c.word), self.abtt.index.get(c.word)
            cos = float(np.asarray(self.abtt.vectors[i_abtt], dtype=np.float32) @ target) if i_abtt is not None and target is not None else None
            pos = self.ref.pos(c.word)
            out.append(replace(c, abtt_cos=cos,
                               hub=float(self.hub[i_orig]) if i_orig is not None else None,
                               hub_abtt=float(self.hub_abtt[i_abtt]) if i_abtt is not None else None,
                               inv_rank=self.reverse.get(c.word, {}).get(secret), pos=pos, pos_same=pos == secret_pos))
        return out
