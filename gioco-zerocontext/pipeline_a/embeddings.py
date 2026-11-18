"""§3A componente E: BGE-M3 dense (1024d) su lemmi, vettori L2-normalizzati; ricerca esatta o FAISS."""
from __future__ import annotations

import numpy as np

REPRESENTATIONS = {
    'A': lambda lemma, pos=None: lemma,  # lemma nudo (baseline)
    'B': lambda lemma, pos=None: f'Parola italiana: {lemma}. Categoria grammaticale: {pos or "sostantivo"}.',
}


def l2_normalize(a: np.ndarray) -> np.ndarray:
    """Normalizza le righe; le righe nulle restano nulle (= assenti)."""
    a = np.asarray(a, dtype=np.float32)
    norm = np.linalg.norm(a, axis=1, keepdims=True)
    return np.where(norm > 0, a / np.maximum(norm, 1e-12), 0).astype(np.float32)


def encode_bge_m3(lemmas, representation='A', model_name='BAAI/bge-m3', batch_size=16, max_length=64,
                  use_fp16=None, pos=None):
    """Solo dense, rappresentazione uniforme per tutti i lemmi. Ritorna (matrice normalizzata, info per l'audit).
    Dipendenza pesante (FlagEmbedding + torch) importata solo qui: `pip install FlagEmbedding`."""
    import FlagEmbedding
    import torch
    from FlagEmbedding import BGEM3FlagModel
    use_fp16 = torch.cuda.is_available() if use_fp16 is None else use_fp16
    model = BGEM3FlagModel(model_name, use_fp16=use_fp16)
    make = REPRESENTATIONS[representation]
    texts = [make(lemma, (pos or {}).get(lemma)) for lemma in lemmas]
    vecs = model.encode(texts, batch_size=batch_size, max_length=max_length)['dense_vecs']
    info = {'model': model_name, 'representation': representation, 'fp16': bool(use_fp16),
            'device': 'cuda' if torch.cuda.is_available() else 'cpu',
            'FlagEmbedding': getattr(FlagEmbedding, '__version__', 'unknown'), 'torch': torch.__version__}
    return l2_normalize(vecs), info


def encode_fasttext(lemmas, model_path):
    """Pipeline B, componente E: fastText italiano cc.it.300.bin (300d, Common Crawl + Wikipedia) con n-grammi di sottoparola.
    Legge il modello con il lettore verificato di script/context_subword.py (nessun pacchetto `fasttext`).
    Ritorna (matrice L2-normalizzata, info per l'audit, lemmi il cui vettore nasce solo da sottoparole = `oov_subword_only`).
    Un vettore generato non rende valido il lemma: il vocabolario resta quello della tabella `parole`."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'script'))
    from context_subword import MODEL_REVISION, MODEL_SHA, SubwordModel
    model = SubwordModel(model_path, lemmas)
    vecs = np.zeros((len(lemmas), model.dim), dtype=np.float32)
    no_vector = []
    for n, word in enumerate(lemmas):
        try:
            vecs[n] = model.vector(word)
        except ValueError:   # nessuna sottoparola: il vettore resta nullo, cioè `missing`, non una parola scartata
            no_vector.append(word)
        if n % 50000 == 0:
            print(f'FastText: {n}/{len(lemmas)}', flush=True)
    oov = [w for w in lemmas if w not in model.ids]
    info = {'model': 'facebook/fasttext-it-vectors (cc.it.300.bin)', 'revision': MODEL_REVISION, 'sha256': MODEL_SHA,
            'dimensions': model.dim, 'oov_subword_only': len(oov), 'no_vector': len(no_vector)}
    return l2_normalize(vecs), info, oov


class VectorIndex:
    """Prodotto scalare su vettori normalizzati = coseno. Backend: GPU (torch, fp16) se disponibile, poi FAISS, poi numpy.
    Con ~840.000 vettori la ricerca esatta su CPU per decine di migliaia di query sarebbe di ore; su GPU è di millisecondi."""

    def __init__(self, vectors: np.ndarray):
        self.vectors = np.ascontiguousarray(vectors, dtype=np.float32)
        self.valid = np.linalg.norm(self.vectors, axis=1) > 0
        self._torch = self._faiss = None
        try:
            import torch
            if torch.cuda.is_available() and self.vectors.size:
                self._torch = torch
                self._gpu = torch.from_numpy(self.vectors).to('cuda', dtype=torch.float16)
                return
        except ImportError:
            pass
        try:
            import faiss
            self._faiss = faiss.IndexFlatIP(self.vectors.shape[1])
            self._faiss.add(self.vectors)
        except ImportError:
            pass

    def _sims(self, i: int) -> np.ndarray:
        if self._torch is not None:
            return (self._gpu @ self._gpu[i]).float().cpu().numpy()
        return self.vectors @ self.vectors[i]

    def search(self, i: int, k: int):
        """Top-k vicini della riga i (escluse se stessa e le righe vuote). Ritorna (indici, coseni)."""
        if not self.valid[i]:
            return np.array([], dtype=int), np.array([], dtype=np.float32)
        if self._faiss is not None and self._torch is None:
            sims, idx = self._faiss.search(self.vectors[i:i + 1], k + 1)
            sims, idx = sims[0], idx[0]
        else:
            sims = self._sims(i)
            sims[~self.valid] = -np.inf
            top = np.argpartition(-sims, min(k + 1, len(sims) - 1))[:k + 1]
            idx = top[np.argsort(-sims[top], kind='stable')]
            sims = sims[idx]
        keep = (idx >= 0) & (idx != i) & np.isfinite(sims)
        return idx[keep][:k], sims[keep][:k]

    def all_cosines(self, i: int) -> np.ndarray:
        """Coseni di i con TUTTE le righe (float32); NaN dove manca un vettore. Su GPU: millisecondi."""
        if not self.valid[i]:
            return np.full(len(self.vectors), np.nan, dtype=np.float32)
        sims = self._sims(i).astype(np.float32)
        sims[~self.valid] = np.nan
        return sims

    def cosine(self, i: int, js) -> np.ndarray:
        """Coseni tra i e js; NaN (= missing) dove manca un vettore."""
        js = np.asarray(js, dtype=int)
        if not self.valid[i]:
            return np.full(len(js), np.nan, dtype=np.float32)
        out = self.vectors[js] @ self.vectors[i]
        out[~self.valid[js]] = np.nan
        return out
