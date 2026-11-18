"""§4.1: conteggi parola-contesto e matrici PMI / SPPMI / PPMI su matrici sparse (mai dense V×C)."""
from __future__ import annotations

from typing import Iterable

import numpy as np
from scipy import sparse


def count_cooccurrences(documents: Iterable[list[str]], vocab: dict[str, int], window: int = 5,
                        context_stopwords: frozenset = frozenset(), distance_weight: bool = False, chunk_tokens: int = 4_000_000):
    """Finestra simmetrica ±window per documento (i token fuori vocabolario occupano posizione ma non contano).
    `vocab` = lemma → indice (target e contesti). Le stopword sono rimosse dai contesti, non dai target.
    Conteggio vettoriale a blocchi: i documenti sono separati da `window` segnaposto, così nessuna finestra li attraversa.
    Ritorna (X csr V×V, conteggio dei target)."""
    n = len(vocab)
    stop_ids = {vocab[t] for t in context_stopwords if t in vocab}
    is_ctx = np.ones(n + 1, dtype=bool)          # indice n = segnaposto/fuori vocabolario
    is_ctx[n] = False
    for i in stop_ids:
        is_ctx[i] = False
    targets = np.zeros(n, dtype=np.int64)
    total = sparse.csr_matrix((n, n), dtype=np.float64)
    buf: list[int] = []
    gap = [n] * window

    def accumulate():
        nonlocal total
        if len(buf) > window:
            total = total + flush_into(buf)
        buf.clear()

    def flush_into(b):
        nonlocal targets
        ids = np.asarray(b, dtype=np.int64)
        valid = ids < n
        np.add.at(targets, ids[valid], 1)
        return _pairs(ids, valid, is_ctx, n, window, distance_weight)

    for doc in documents:
        buf.extend(vocab.get(t, n) for t in doc)
        buf.extend(gap)
        if len(buf) >= chunk_tokens:
            accumulate()
    accumulate()
    return total.tocsr(), targets


def _pairs(ids, valid, is_ctx, n, window, distance_weight):
    ctx = is_ctx[ids]
    rows, cols, vals = [], [], []
    for off in range(1, window + 1):
        w = 1.0 / off if distance_weight else 1.0
        left, right = ids[:-off], ids[off:]
        both = valid[:-off] & valid[off:]
        for target, context, m in ((left, right, both & ctx[off:]), (right, left, both & ctx[:-off])):
            rows.append(target[m]); cols.append(context[m]); vals.append(np.full(int(m.sum()), w))
    return sparse.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n))


def prune(X: sparse.csr_matrix, targets: np.ndarray, min_pair_count: int, min_target_count: int):
    """Scarta coppie e target con supporto insufficiente (§4.1.5). Ritorna (X potata, maschera dei target ammessi)."""
    X = X.tocoo()
    keep = X.data >= min_pair_count
    X = sparse.csr_matrix((X.data[keep], (X.row[keep], X.col[keep])), shape=X.shape)
    ok = targets >= min_target_count
    mask = sparse.diags(ok.astype(np.float64))
    return (mask @ X @ mask).tocsr(), ok


def sppmi(X: sparse.csr_matrix, k_shift: float = 1.0, smoothing: float = 1.0) -> sparse.csr_matrix:
    """max(0, PMI − ln k_shift), calcolata solo sulle coppie con conteggio > 0 (niente ln 0).
    PMI = ln( X[w,c]·N / (X[w,*]·X[*,c]^a) ) con context distribution smoothing a (a=1: nessuno).
    Le coppie non osservate valgono 0 nella matrice sparsa solo per il calcolo, non perché la PMI sia zero."""
    X = X.tocoo()
    if X.nnz == 0:
        return X.tocsr()
    row = np.asarray(X.sum(axis=1)).ravel()
    col = np.asarray(X.sum(axis=0)).ravel() ** smoothing
    pmi = np.log(X.data) - np.log(row[X.row]) - np.log(col[X.col]) + np.log(col.sum())
    pmi -= np.log(k_shift)
    keep = pmi > 0
    return sparse.csr_matrix((pmi[keep], (X.row[keep], X.col[keep])), shape=X.shape)


def ppmi(X: sparse.csr_matrix, smoothing: float = 1.0) -> sparse.csr_matrix:
    return sppmi(X, 1.0, smoothing)
