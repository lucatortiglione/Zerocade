"""§4.2 componente D (SPPMI + SVD troncata) e §4.3 componente C (PPMI diretta, non fattorizzata)."""
from __future__ import annotations

import numpy as np
from scipy import sparse
from sklearn.decomposition import TruncatedSVD

from .embeddings import l2_normalize


def svd_vectors(M: sparse.csr_matrix, dim: int = 256, power: float = 0.5, seed: int = 0) -> np.ndarray:
    """v_D(w) = normalize(U_d[w] · Σ_d^p). Le righe senza contesti restano a zero: sono `missing`."""
    dim = max(1, min(dim, min(M.shape) - 1))
    svd = TruncatedSVD(n_components=dim, algorithm='randomized', random_state=seed)
    us = svd.fit_transform(M)                      # U·Σ
    sigma = np.maximum(svd.singular_values_, 1e-12)
    return l2_normalize(us / sigma * sigma ** power)


def symmetric(P: sparse.csr_matrix) -> sparse.csr_matrix:
    """max(PPMI(w,v), PPMI(v,w)) come matrice CSR: le righe si leggono in tempo costante, senza slicing di colonne."""
    return P.maximum(P.T).tocsr()


def c_raw(S: sparse.csr_matrix, w: int, v) -> np.ndarray:
    """C_raw = log1p(max(PPMI(w,v), PPMI(v,w))); `S` è la matrice simmetrica. NaN dove non osservata (missing, non zero)."""
    v = np.asarray(v, dtype=int)
    best = S[w, :].toarray().ravel()[v]
    return np.where(best > 0, np.log1p(best), np.nan)


def ppmi_neighbors(S: sparse.csr_matrix, w: int, k: int):
    """Top-k contesti di w per PPMI simmetrica. Ritorna (indici, c_raw)."""
    best = S[w, :].toarray().ravel()
    best[w] = 0
    idx = np.argsort(-best, kind='stable')[:k]
    idx = idx[best[idx] > 0]
    return idx, np.log1p(best[idx])
