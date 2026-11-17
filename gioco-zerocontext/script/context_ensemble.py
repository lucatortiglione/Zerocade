"""Matematica dell'ensemble offline; produce il formato int8 già letto dal gioco.

Ogni fonte è centrata e ridotta con PCA prima della normalizzazione. I
blocchi pesati restano distinti: il prodotto scalare è la somma delle somiglianze.
Le righe mancanti di Numberbatch restano zero, non sono inventate da un altro modello.
"""
from __future__ import annotations

import json
import math
from collections import Counter
from urllib.parse import unquote

import numpy as np

MODEL_NAMES = ('qwen', 'bge', 'e5', 'gte', 'gemma', 'harrier', 'bge_it')
NAMES = (*MODEL_NAMES, 'fasttext', 'conceptnet', 'lsa')
MAX_WORDS = 200_000
MAX_DIMENSIONS = 1024
MAX_BYTES = 128 * 1024 * 1024


def unit_rows(rows):
    rows = np.asarray(rows, dtype=np.float32)
    if rows.ndim != 2 or not np.isfinite(rows).all():
        raise ValueError('Vettori non finiti o matrice non valida')
    norm = np.linalg.norm(rows, axis=1, keepdims=True)
    return rows / np.where(norm > 0, norm, 1)


def reduce_block(rows, dimensions, *, fit_limit=8192):
    """PCA deterministica su campione uniforme; zero solo per righe assenti.

    Non taglia arbitrariamente le prime coordinate di modelli non Matryoshka.
    Conserva media e proiezione per riprodurre la trasformazione.
    """
    rows = unit_rows(rows)
    present = np.flatnonzero(np.linalg.norm(rows, axis=1) > 0)
    if len(present) < 2 or dimensions < 1:
        raise ValueError('Ogni fonte richiede almeno due parole con vettore')
    chosen = present[np.linspace(0, len(present) - 1, min(len(present), fit_limit), dtype=int)]
    sample = rows[chosen].astype(np.float64)
    mean = sample.mean(axis=0)
    sample -= mean
    count = min(dimensions, rows.shape[1], len(chosen) - 1)
    eigenvalues, axes = np.linalg.eigh(sample.T @ sample)
    projection = axes[:, -count:][:, ::-1].copy()
    # Fissa il segno degli autovettori per avere artefatti riproducibili.
    for col in range(count):
        pivot = np.argmax(np.abs(projection[:, col]))
        if projection[pivot, col] < 0:
            projection[:, col] *= -1
    result = np.zeros((len(rows), count), dtype=np.float32)
    for start in range(0, len(present), 2048):
        selected = present[start:start + 2048]
        result[selected] = (rows[selected] - mean) @ projection
    result = unit_rows(result)
    if np.any(np.linalg.norm(result[present], axis=1) == 0):
        raise ValueError('La riduzione ha annullato un vettore presente')
    total = float(np.maximum(eigenvalues, 0).sum())
    retained = float(np.maximum(eigenvalues[-count:], 0).sum()) / total if total else 0.0
    return result, mean.astype(np.float32), projection.astype(np.float32), retained


def combine(blocks, weights):
    if set(blocks) != set(weights) or not set(blocks) <= set(NAMES) or not {'fasttext', 'conceptnet'} <= set(blocks):
        raise ValueError('Servono i blocchi dei metodi attivi, inclusi fastText e ConceptNet')
    if any(not math.isfinite(w) or w <= 0 for w in weights.values()) or not math.isclose(sum(weights.values()), 1):
        raise ValueError('Pesi attivi positivi con somma 1')
    sizes = {len(b) for b in blocks.values()}
    if len(sizes) != 1 or not 1 <= next(iter(sizes)) <= MAX_WORDS:
        raise ValueError('Le fonti devono avere lo stesso vocabolario entro i limiti del gioco')
    result = np.hstack([unit_rows(blocks[n]) * np.sqrt(weights[n]) for n in NAMES if n in blocks])
    if result.shape[1] > MAX_DIMENSIONS or result.size > MAX_BYTES:
        raise ValueError('Ensemble oltre i limiti del runtime (1024 dimensioni, 128 MiB int8)')
    if not np.linalg.norm(result, axis=1).all():
        raise ValueError('Una parola è priva di rappresentazione')
    return result


def quantize(rows):
    """Scala unica per tutti i blocchi: mantiene i pesi anche nel prodotto int8."""
    if not np.isfinite(rows).all() or not np.linalg.norm(rows, axis=1).all():
        raise ValueError('Matrice nulla o non finita')
    scale = 127 / float(np.max(np.abs(rows)))
    q = np.rint(rows * scale).astype(np.int8)
    if not np.any(q, axis=1).all():
        raise ValueError('La quantizzazione ha annullato una parola')
    return q, scale


def positions(scores, secret):
    scores = np.asarray(scores, dtype=np.float64).copy()
    scores[secret] = np.inf
    order = np.lexsort((np.arange(len(scores)), -scores))
    ranks = np.empty(len(scores), dtype=np.uint32)
    ranks[order] = np.arange(1, len(scores) + 1)
    return order, ranks


def conceptnet_word(uri):
    parts = unquote(uri).split('/')
    if len(parts) < 4 or parts[:3] != ['', 'c', 'it']:
        return None
    return parts[3] if parts[3].isalpha() and '_' not in parts[3] else None


def read_assertions(lines, words, secrets):
    """Relazioni dirette italiane, senza catene arbitrarie o traduzioni.

    Il grafo esplicito è opzionale e distinto da Numberbatch. Le relazioni sono
    prove della fonte, non associazioni revisionate da una persona.
    """
    allowed = {'IsA', 'PartOf', 'HasA', 'UsedFor', 'CapableOf', 'AtLocation', 'HasProperty', 'Synonym'}
    index = {w: i for i, w in enumerate(words)}
    targets = set(secrets)
    edges = {}
    per_secret = Counter()
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        if len(line) > 2 * 1024 * 1024:
            raise ValueError(f'Asserzione ConceptNet troppo grande, riga {number}')
        fields = line.rstrip('\r\n').split('\t')
        if len(fields) != 5:
            raise ValueError(f'Asserzione ConceptNet malformata, riga {number}')
        _, relation, first, second, details = fields
        relation = relation.removeprefix('/r/')
        if relation not in allowed:
            continue
        a, b = conceptnet_word(first), conceptnet_word(second)
        if a not in index or b not in index or a == b or not ({a, b} & targets):
            continue
        info = json.loads(details)
        weight = float(info.get('weight', 0))
        if not math.isfinite(weight) or weight < 1:
            continue
        for source, dest in ((a, b), (b, a)):
            if source in targets:
                pair = index[source], index[dest]
                if pair not in edges:
                    if len(edges) >= 500_000 or per_secret[pair[0]] >= 4096:
                        raise ValueError('Grafo ConceptNet oltre i limiti del gioco')
                    per_secret[pair[0]] += 1
                if len(edges.get(pair, [])) >= 16:
                    raise ValueError('Troppe attestazioni ConceptNet per la stessa coppia')
                edges.setdefault(pair, []).append({'relation': relation, 'weight': weight,
                                                   'license': info.get('license'), 'sources': info.get('sources', [])})
    return edges
