"""§5 componente G: grafo ConceptNet italiano filtrato dagli assertions dump ufficiali (TSV, anche .gz)."""
from __future__ import annotations

import csv
import gzip
import json
import re
from collections import defaultdict

from .config import EDGE_WEIGHT_CAP, HUB_DEGREE, NEGATIVE_RELATIONS, RELATION_WEIGHTS, TWO_HOP_FACTOR

NODE = re.compile(r'^/c/it/([^/]+)(?:/([a-z]))?(?:/.*)?$')
POS_MAP = {'n': 'NOUN', 'v': 'VERB', 'a': 'ADJ', 'r': 'ADV'}


def parse_node(uri: str):
    """'/c/it/mare/n' → ('mare', 'NOUN'); None se il nodo non è italiano. I multiword (`_`) hanno lo spazio."""
    m = NODE.match(uri)
    return (m.group(1).replace('_', ' '), POS_MAP.get(m.group(2))) if m else None


def load_graph(path, vocab=None, min_weight: float = 1.0, relations=RELATION_WEIGHTS, allow_multiword=False):
    """Legge `assertions.csv(.gz)` (uri, relazione, start, end, json). Tiene solo archi it→it con relazioni positive note,
    senza autocollegamenti, con peso ≥ min_weight; nessuna traduzione dall'inglese. Per coppia tiene l'arco migliore,
    non orientato. Ritorna (archi {(a,b): {weight, relation, source}}, scarti per motivo)."""
    opener = gzip.open if str(path).endswith('.gz') else open
    edges: dict = {}
    dropped: dict = defaultdict(int)
    with opener(path, 'rt', encoding='utf-8', newline='') as f:
        for row in csv.reader(f, delimiter='\t'):
            if len(row) < 5:
                continue
            rel = row[1].rsplit('/', 1)[-1]
            if rel in NEGATIVE_RELATIONS or rel not in relations:
                dropped['relation'] += 1
                continue
            a, b = parse_node(row[2]), parse_node(row[3])
            if not a or not b:
                dropped['non_italian'] += 1
                continue
            a, b = a[0], b[0]
            if a == b:
                dropped['self_loop'] += 1
                continue
            if not allow_multiword and (' ' in a or ' ' in b):
                dropped['multiword'] += 1
                continue
            if vocab is not None and (a not in vocab or b not in vocab):
                dropped['out_of_vocab'] += 1
                continue
            try:
                info = json.loads(row[4])
                weight = float(info.get('weight', 1.0))
            except (ValueError, TypeError, AttributeError):
                dropped['bad_json'] += 1
                continue
            if weight < min_weight:
                dropped['low_weight'] += 1
                continue
            score = relations[rel] * min(weight, EDGE_WEIGHT_CAP) / EDGE_WEIGHT_CAP
            key = tuple(sorted((a, b)))
            if key not in edges or score > edges[key]['weight']:
                edges[key] = {'weight': score, 'relation': rel, 'source': str(info.get('dataset', ''))}
    return edges, dict(dropped)


class Graph:
    def __init__(self, edges: dict):
        self.adj: dict[str, dict[str, dict]] = defaultdict(dict)
        for (a, b), d in edges.items():
            self.adj[a][b] = d
            self.adj[b][a] = d

    def has(self, w: str) -> bool:
        return w in self.adj

    def g_raw(self, w: str, v: str):
        """(score, relazioni). Arco diretto pesato, o il miglior cammino a 2 archi ×0.4 senza passare da hub.
        (None, None) = segnale assente (nodo mancante o nessun collegamento): mai zero."""
        if not self.has(w):
            return None, None
        direct = self.adj[w].get(v)
        if direct:
            return direct['weight'], [direct['relation']]
        best, rels = 0.0, None
        for mid, d1 in self.adj[w].items():
            if len(self.adj[mid]) > HUB_DEGREE:
                continue
            d2 = self.adj[mid].get(v)
            if d2:
                s = TWO_HOP_FACTOR * min(d1['weight'], d2['weight'])
                if s > best:
                    best, rels = s, [d1['relation'], d2['relation']]
        return (best, rels) if rels else (None, None)

    def g_all(self, w: str):
        """{lemma: (score, relazioni)} per ogni parola collegata a w: archi diretti e cammini a 2 archi ×0.4 (senza hub).
        Stessa regola di g_raw, ma per tutte le parole in una volta sola."""
        if not self.has(w):
            return {}
        out = {v: (d['weight'], [d['relation']]) for v, d in self.adj[w].items()}
        for mid, d1 in self.adj[w].items():
            if len(self.adj[mid]) > HUB_DEGREE:
                continue
            for v, d2 in self.adj[mid].items():
                if v == w or v in self.adj[w]:
                    continue
                score = TWO_HOP_FACTOR * min(d1['weight'], d2['weight'])
                if v not in out or score > out[v][0]:
                    out[v] = (score, [d1['relation'], d2['relation']])
        return out

    def neighbors(self, w: str, k: int):
        """Fino a k vicini diretti per peso: [(lemma, score, [relazione])]."""
        items = sorted(self.adj.get(w, {}).items(), key=lambda kv: (-kv[1]['weight'], kv[0]))[:k]
        return [(v, d['weight'], [d['relation']]) for v, d in items]
