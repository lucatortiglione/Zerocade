"""Voti delle prime 20 posizioni di una segreta e metriche (spec, sezioni 6.2 e 6.3). Solo funzioni pure.

Ogni parola dopo la segreta riceve un voto 0, 1 o 2 dalla prima fonte disponibile: verdetto di Luca, associazione
verificata, verdetto del giudice. Le varianti della segreta (cani per cane) non ricevono voto e restano fuori dai
conteggi; in uno stesso gruppo di significato conta solo la parola in posizione migliore.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Collection, Literal, Mapping, Protocol

import numpy as np

from valutazione.gold import GoldEntry
from valutazione.store import Verdict

Kind = Literal['variante', 'verificata', 'umano', 'giudice', 'senza_voto']
FIRST = 10   # Precision@10, accezione e valutazione umana guardano le prime 10 posizioni dopo la segreta
DEPTH = 20   # nDCG@20


class Reference(Protocol):
    def is_variant(self, word: str, secret: str) -> bool: ...
    def lemmas(self, word: str) -> set[str]: ...
    def in_reference(self, word: str) -> bool: ...
    def pos(self, word: str) -> str: ...


@dataclass(frozen=True)
class Slot:
    word: str
    kind: Kind
    grade: int | None          # 0, 1, 2; None per le varianti e per le parole senza nessun voto
    sense_ok: bool | None
    pos: str
    in_reference: bool
    in_gold: bool = False      # la parola (o un suo lemma) è tra le associazioni verificate
    verified: bool = False     # in_gold e prima del suo gruppo: conta come successo della Precision@10 verificata
    human: Literal['naturale', 'non_naturale'] | None = None
    group: int | None = None   # gruppo di significato dell'associazione verificata


def grade_slots(secret: str, top20: list[str], ref: Reference, gold: GoldEntry | None,
                human: Mapping[tuple[str, str], str], judge: Mapping[str, Verdict]) -> list[Slot]:
    slots: list[Slot] = []
    seen_groups: set[int] = set()
    for word in top20:
        pos, in_ref = ref.pos(word), ref.in_reference(word)
        if ref.is_variant(word, secret):
            slots.append(Slot(word, 'variante', None, None, pos, in_ref))
            continue
        matched = None
        if gold:
            matched = word if word in gold.groups else next((l for l in sorted(ref.lemmas(word)) if l in gold.groups), None)
        group = gold.groups[matched] if gold and matched is not None else None
        first = group is not None and group not in seen_groups
        if group is not None:
            seen_groups.add(group)
        said = human.get((secret, word))
        said = said if said in ('naturale', 'non_naturale') else None
        verdict = judge.get(word)
        if said:
            kind, grade = 'umano', 2 if said == 'naturale' else 0
        elif group is not None:
            kind, grade = 'verificata', 2
        elif verdict:
            kind, grade = 'giudice', verdict.grade
        else:
            kind, grade = 'senza_voto', None
        if group is not None and not first:
            grade = 0   # stesso gruppo di una parola già in classifica: non aggiunge punti
        sense = verdict.sense_ok if verdict else (True if group is not None else None)
        slots.append(Slot(word, kind, grade, sense, pos, in_ref, group is not None, first, said, group))
    return slots


def _counted(slots: list[Slot]) -> list[Slot]:
    return [s for s in slots[:FIRST] if s.kind != 'variante']


def precision_verified(slots: list[Slot], has_gold: bool = True) -> float | None:
    """Quota delle prime 10 (varianti escluse) che sono associazioni verificate. Non dipende da Qwen né dai verdetti.
    None se la segreta non ha associazioni verificate: non è un 0, è una misura che non c'è."""
    counted = _counted(slots)
    if not has_gold or not counted:
        return None
    return sum(s.verified for s in counted) / len(counted)


def precision_judged(slots: list[Slot]) -> float | None:
    """Quota delle prime 10 (varianti escluse) con voto ≥ 1. None se una di queste parole non ha nessun voto."""
    counted = _counted(slots)
    if not counted or any(s.grade is None for s in counted):
        return None
    return sum(s.grade >= 1 for s in counted) / len(counted)


def ndcg20(slots: list[Slot], gold: GoldEntry | None, vocab: Collection[str], groups_in_vocab: int | None = None) -> float | None:
    """nDCG sui voti 0–2 delle prime 20. Il massimo possibile ha un 2 per ogni gruppo verificato con almeno una parola
    nel vocabolario (o già trovato) e i voti positivi delle altre parole votate: resta tra 0 e 1 anche senza associazioni."""
    window = slots[:DEPTH]
    dcg = sum((s.grade or 0) / math.log2(i + 2) for i, s in enumerate(window))
    hit = {s.group for s in window if s.group is not None}
    if groups_in_vocab is None:   # il ricalcolo non ha il vocabolario: passa il numero di gruppi salvato dalla valutazione
        groups_in_vocab = len({g for w, g in (gold.groups.items() if gold else ()) if w in vocab} | hit)
    ideal = sorted([2] * max(groups_in_vocab, len(hit)) + [s.grade for s in window if s.kind != 'variante' and not s.in_gold and s.grade], reverse=True)
    idcg = sum(g / math.log2(i + 2) for i, g in enumerate(ideal[:DEPTH]))
    return dcg / idcg if idcg else None


def sense_share(slots: list[Slot]) -> float | None:
    """Tra le prime 10 (varianti escluse) con una risposta sul senso, quota di quelle nel senso della glossa."""
    known = [s.sense_ok for s in _counted(slots) if s.sense_ok is not None]
    return sum(known) / len(known) if known else None


def human_share(slots: list[Slot]) -> float | None:
    """Tra le prime 10 (varianti escluse) con un verdetto umano, quota di «naturale»."""
    said = [s.human for s in _counted(slots) if s.human]
    return sum(h == 'naturale' for h in said) / len(said) if said else None


def bootstrap(values: list[float], seed: int = 0, rounds: int = 1000) -> tuple[float, float]:
    """Intervallo al 95% della media (percentili 2,5 e 97,5), ricampionando le segrete con un seme fisso."""
    if not values:
        raise ValueError('Nessun valore: niente da ricampionare')
    arr = np.asarray(values, dtype=np.float64)
    if arr.min() == arr.max():
        return float(arr[0]), float(arr[0])
    rng = np.random.default_rng(seed)
    means = arr[rng.integers(0, len(arr), size=(rounds, len(arr)))].mean(axis=1)
    low, high = np.percentile(means, [2.5, 97.5])
    return float(low), float(high)
