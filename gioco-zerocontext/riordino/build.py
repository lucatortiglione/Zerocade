"""Costruzione delle liste riordinate: il modello impara solo dalle segrete di SVILUPPO con associazioni verificate; le liste si
producono per tutte le segrete dell'export, quindi anche per quelle di misura, che non sono mai servite ad addestrare."""
from __future__ import annotations

from pathlib import Path
import zlib

import numpy as np
from typing import Callable

from riordino.export import Candidate, read_candidates
from riordino.features import Lexicon, candidate_features
from riordino.model import Reranker, rank_words
from riordino.vectors import widen

VECTOR_NEGATIVES_KEPT = 3   # dei candidati dei vettori sbagliati se ne tiene 1 ogni 3 per l'addestramento (sono milioni e non servono tutti)


def training_secrets(ref, gold, is_measure: Callable[[str], bool]) -> list[str]:
    return sorted(s for s in ref.secrets if s in gold and not is_measure(s))


def _examples(secrets: list[str], found: dict[str, list[Candidate]], gold, lexicon: Lexicon, ref) -> list[tuple[list[float], int]]:
    rows = []
    for secret in secrets:
        right = gold[secret].groups
        for c in found.get(secret, []):
            if c.word == secret or ref.is_variant(c.word, secret):
                continue   # le varianti non si giudicano: non insegnano nulla né in un senso né nell'altro
            label = int(c.word in right)
            if not c.in_export and not label and zlib.crc32(f'{secret}|{c.word}'.encode()) % VECTOR_NEGATIVES_KEPT:
                continue
            rows.append((np.asarray(candidate_features(c, lexicon), dtype=np.float32), label))   # float32: milioni di righe
    return rows


def build_lists(export: Path, ref, gold, lexicon: Lexicon, top: int = 100, profile=None, neighbours: int = 0, kind: str = 'lineare', signals_for=None) -> tuple[dict[str, list[str]], dict]:
    """(liste {segreta: prime `top` parole riordinate}, rapporto con i numeri dell'addestramento e i pesi imparati).
    Con `profile` e `neighbours` > 0 i candidati comprendono anche i `neighbours` vicini più vicini nei vettori del profilo.
    `signals_for(found)` (opzionale) riceve i candidati dell'export e restituisce un oggetto con `enrich(segreta, candidati)` (riordino/signals.py)."""
    from valutazione.split import is_measure
    train = training_secrets(ref, gold, is_measure)
    found = read_candidates(export, sorted(ref.secrets))
    signals = signals_for(found) if signals_for else None
    if profile is not None and neighbours > 0:
        found = {secret: widen(secret, cands, profile, neighbours) for secret, cands in found.items()}
        for secret in sorted(ref.secrets):   # le segrete che l'export non ha (correre…) hanno almeno la lista dei vicini
            if secret not in found and secret in profile.index:
                found[secret] = widen(secret, [], profile, neighbours)
    if signals:
        found = {secret: signals.enrich(secret, cands) for secret, cands in found.items()}
    trained = [s for s in train if s in found]
    examples = _examples(trained, found, gold, lexicon, ref)
    model = Reranker(kind).fit(examples)
    lists = {secret: rank_words(secret, cands, lexicon, ref, model)[:top] for secret, cands in found.items()}
    report = {'segrete_addestramento': len(trained), 'esempi': len(examples), 'esempi_giusti': sum(y for _, y in examples),
              'segrete_con_lista': len(lists), 'pesi': model.weights(), 'regola_divisione': 'sviluppo (mai la misura)',
              'tipo_modello': kind, 'segnali_nuovi': signals is not None, 'vicini_dai_vettori': neighbours if profile is not None else 0}
    return lists, report


def gold_first(lists: dict[str, list[str]], gold, ref) -> dict[str, list[str]]:
    """Le associazioni verificate in cima alle liste (punto 4 del piano): un rappresentante per gruppo di significato, nell'ordine del
    riordino (quelli che la lista non ha, in ordine alfabetico); poi gli altri membri dei gruppi; poi il resto della lista.

    Le varianti della segreta non si promuovono (valgono già come soluzione). Le segrete senza associazioni restano com'erano.
    Attenzione alla misura: su queste segrete le associazioni verificate sono la risposta del metro, quindi il punteggio non vale più."""
    merged = {secret: list(words) for secret, words in lists.items()}
    for secret, entry in gold.items():
        words = lists.get(secret, [])
        position = {w: i for i, w in enumerate(words)}
        members = [w for w in entry.groups if not ref.is_variant(w, secret) and w != secret]
        if not members:
            continue
        by_group: dict[int, list[str]] = {}
        for w in sorted(members, key=lambda w: (position.get(w, len(words)), w)):
            by_group.setdefault(entry.groups[w], []).append(w)
        firsts = sorted((g[0] for g in by_group.values()), key=lambda w: (position.get(w, len(words)), w))
        others = sorted((w for g in by_group.values() for w in g[1:]), key=lambda w: (position.get(w, len(words)), w))
        promoted = firsts + others
        taken = set(promoted)
        merged[secret] = promoted + [w for w in words if w not in taken]
    return merged
