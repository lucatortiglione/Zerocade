"""§6: recupero candidati per segnale, fusione con segnali mancanti, confidenza, MMR, output spiegabile."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import sparse

from . import MODEL_ID, VERSION
from .calibration import Calibrator
from .config import MODE_WEIGHTS, SIGNALS, Config
from .conceptnet import Graph
from .distributional import c_raw, ppmi_neighbors, symmetric
from .embeddings import VectorIndex

# Famiglie non ridondanti (§6.2): PMI-SVD e PPMI derivano dagli stessi conteggi e contano come una sola.
FAMILY = {'embedding': 'vettoriale', 'pmi_svd': 'distribuzionale', 'ppmi_direct': 'distribuzionale', 'conceptnet': 'grafo'}
EVIDENCE = {'embedding': 'EMBEDDING', 'pmi_svd': 'DISTRIBUTIONAL', 'ppmi_direct': 'COLLOCATION', 'conceptnet': 'RELATED_TO'}


class Pipeline:
    def __init__(self, vocab: list[str], emb: np.ndarray, svd: np.ndarray, ppmi: sparse.csr_matrix, graph: Graph,
                 calibrator: Calibrator, config: Config | None = None, meta: dict | None = None):
        self.vocab = vocab
        self.index = {w: i for i, w in enumerate(vocab)}
        self.E = VectorIndex(emb)
        self.D = VectorIndex(svd)
        self.P = ppmi.tocsr()
        self.S = symmetric(self.P)
        self.G = graph
        self.cal = calibrator
        self.config = config or Config()
        self.meta = meta or {}
        self.oov = frozenset(self.meta.get('oov_subword_only', ()))

    # ---- persistenza -------------------------------------------------------------------------------------------
    def save(self, folder):
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'vocab.txt').write_text('\n'.join(self.vocab) + '\n', encoding='utf-8')
        np.save(folder / 'embedding.npy', self.E.vectors.astype(np.float16))
        np.save(folder / 'pmi_svd.npy', self.D.vectors.astype(np.float16))
        sparse.save_npz(folder / 'ppmi.npz', self.P)
        edges = [[a, b, d['weight'], d['relation'], d['source']] for a in self.G.adj for b, d in self.G.adj[a].items() if a < b]
        (folder / 'conceptnet.json').write_text(json.dumps(edges, ensure_ascii=False), encoding='utf-8')
        (folder / 'calibrator.json').write_text(json.dumps(self.cal.to_dict()), encoding='utf-8')
        (folder / 'meta.json').write_text(json.dumps({'config': self.config.as_dict(), **self.meta}, ensure_ascii=False, indent=1),
                                          encoding='utf-8')

    @classmethod
    def load(cls, folder):
        folder = Path(folder)
        vocab = folder.joinpath('vocab.txt').read_text(encoding='utf-8').splitlines()
        meta = json.loads(folder.joinpath('meta.json').read_text(encoding='utf-8'))
        edges = {(a, b): {'weight': w, 'relation': r, 'source': s}
                 for a, b, w, r, s in json.loads(folder.joinpath('conceptnet.json').read_text(encoding='utf-8'))}
        cfg = Config(**{k: v for k, v in meta.pop('config').items()})
        return cls(vocab, np.load(folder / 'embedding.npy').astype(np.float32), np.load(folder / 'pmi_svd.npy').astype(np.float32),
                   sparse.load_npz(folder / 'ppmi.npz'), Graph(edges),
                   Calibrator.from_dict(json.loads(folder.joinpath('calibrator.json').read_text(encoding='utf-8'))), cfg, meta)

    # ---- segnali grezzi ----------------------------------------------------------------------------------------
    def raw_signals(self, i: int, cands: np.ndarray):
        """Valori grezzi dei quattro segnali per i candidati; NaN = missing. Ritorna (dict, relazioni ConceptNet)."""
        raw = {'embedding': self.E.cosine(i, cands), 'pmi_svd': self.D.cosine(i, cands), 'ppmi_direct': c_raw(self.S, i, cands)}
        g = np.full(len(cands), np.nan)
        rels: dict[int, list[str]] = {}
        for n, j in enumerate(cands):
            score, r = self.G.g_raw(self.vocab[i], self.vocab[j])
            if score is not None:
                g[n] = score
                rels[int(j)] = r
        raw['conceptnet'] = g
        return raw, rels

    def candidates(self, i: int, k: int):
        """§6.3.1: top-k per ciascun segnale, unione per chiave canonica."""
        out = {}
        idx, _ = self.E.search(i, k)
        out['embedding'] = idx
        idx, _ = self.D.search(i, k)
        out['pmi_svd'] = idx
        out['ppmi_direct'] = ppmi_neighbors(self.S, i, k)[0]
        out['conceptnet'] = np.array([self.index[v] for v, _, _ in self.G.neighbors(self.vocab[i], k) if v in self.index], dtype=int)
        merged = sorted({int(j) for a in out.values() for j in a if int(j) != i})
        return np.array(merged, dtype=int), {s: {int(j) for j in a} for s, a in out.items()}

    # ---- punteggio su tutto il vocabolario ----------------------------------------------------------------------
    def score_all(self, lemma: str, weights: dict | None = None, mode: str = 'balanced'):
        """Punteggio di TUTTE le parole rispetto a `lemma` (la segreta), vettorizzato: stessa formula di `query` (§6.1-6.2).
        Ritorna un dict: score (NaN = nessun segnale), coverage, raw/norm per segnale, rels (ConceptNet). La parola stessa è NaN."""
        w = weights or MODE_WEIGHTS[mode]
        i = self.index[lemma]
        n = len(self.vocab)
        raw = {'embedding': self.E.all_cosines(i), 'pmi_svd': self.D.all_cosines(i)}
        row = self.S[i, :].toarray().ravel()
        raw['ppmi_direct'] = np.where(row > 0, np.log1p(row), np.nan)
        g = np.full(n, np.nan)
        rels = {}
        for v, (score, r) in self.G.g_all(lemma).items():
            j = self.index.get(v)
            if j is not None:
                g[j] = score
                rels[j] = r
        raw['conceptnet'] = g
        num = np.zeros(n)
        den = np.zeros(n)
        norm = {}
        for s in SIGNALS:
            raw[s][i] = np.nan
            norm[s] = self.cal.normalize(s, raw[s])
            ok = ~np.isnan(norm[s])
            num[ok] += w[s] * norm[s][ok]
            den[ok] += w[s]
        score = np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)
        return {'score': score, 'coverage': den / sum(w.values()), 'raw': raw, 'norm': norm, 'rels': rels, 'weights': w}

    def _order(self, score, allow=None):
        """Indici ordinati per punteggio decrescente (parità: ordine alfabetico del vocabolario, che è già ordinato)."""
        ok = ~np.isnan(score)
        if allow is not None:
            ok &= np.fromiter((allow(x) for x in self.vocab), dtype=bool, count=len(self.vocab))
        idx = np.flatnonzero(ok)
        return idx[np.argsort(-score[idx], kind='stable')]

    def rank_of(self, lemma: str, word: str, mode: str = 'balanced', allow=None, weights: dict | None = None):
        """Posizione di `word` nella classifica completa di `lemma` (1 = la più vicina) su tutto il vocabolario.
        Le parità condividono la posizione (rank = 1 + parole con punteggio strettamente maggiore)."""
        if lemma not in self.index or word not in self.index:
            return {'status': 'unknown_lemma', 'rank': None}
        full = self.score_all(lemma, weights, mode)
        score = full['score']
        j = self.index[word]
        if np.isnan(score[j]):
            return {'status': 'no_signal', 'rank': None, 'of': int((~np.isnan(score)).sum())}
        valid = ~np.isnan(score)
        if allow is not None:
            valid &= np.fromiter((allow(x) for x in self.vocab), dtype=bool, count=len(self.vocab))
        return {'status': 'ok', 'rank': int((score[valid] > score[j]).sum()) + 1, 'of': int(valid.sum()),
                'score': round(float(score[j]), 6), 'weight_coverage': round(float(full['coverage'][j]), 4)}

    def ranks(self, lemma: str, mode: str = 'balanced', allow=None, weights: dict | None = None):
        """Array (lunghezza del vocabolario) con la posizione di ogni parola per `lemma`; 0 = parola senza segnali."""
        score = self.score_all(lemma, weights, mode)['score']
        order = self._order(score, allow)
        out = np.zeros(len(self.vocab), dtype=np.int64)
        s = score[order]
        pos = np.arange(1, len(order) + 1)
        first = np.r_[True, s[1:] != s[:-1]]
        out[order] = np.maximum.accumulate(np.where(first, pos, 0))   # le parità prendono la prima posizione
        return out

    # ---- fusione -----------------------------------------------------------------------------------------------
    def query(self, lemma: str, mode: str = 'balanced', top_n: int = 20, pos: str | None = None, sense_id: str | None = None,
              allow=None, weights: dict | None = None):
        """Top-N di `lemma` sull'intero vocabolario, con prove per segnale. `allow(lemma) -> bool` è il filtro del gioco
        (POS, flessioni, familiarità, multiword…): la pipeline non lo impone."""
        base = {'query': lemma, 'pos': pos, 'sense_id': sense_id, 'model_id': self.meta.get('model_id', MODEL_ID), 'version': VERSION, 'mode': mode,
                'score_calibrator_version': self.cal.version}
        if mode not in MODE_WEIGHTS:
            raise ValueError(f'modalità sconosciuta: {mode}')
        if lemma not in self.index:
            return {**base, 'status': 'unknown_lemma', 'results': []}
        i = self.index[lemma]
        w = weights or MODE_WEIGHTS[mode]
        full = self.score_all(lemma, w, mode)
        score, coverage, raw, norm, rels = full['score'], full['coverage'], full['raw'], full['norm'], full['rels']
        ok = ~np.isnan(score) & (coverage >= self.config.min_weight_coverage)
        if allow is not None:
            ok &= np.fromiter((allow(x) for x in self.vocab), dtype=bool, count=len(self.vocab))
        pool = np.flatnonzero(ok)
        keep = min(len(pool), max(top_n * 5, top_n) if self.config.mmr_lambda > 0 else top_n)
        if not keep:
            return {**base, 'status': 'no_candidates', 'results': []}
        part = pool[np.argpartition(-score[pool], keep - 1)[:keep]] if keep < len(pool) else pool
        cands = part[np.lexsort((part, -score[part]))]   # punteggio decrescente, parità per ordine alfabetico
        results = []
        for j in cands:
            j = int(j)
            present = [s for s in SIGNALS if not np.isnan(norm[s][j])]
            families = {FAMILY[s] for s in present}
            if coverage[j] < self.config.min_weight_coverage:
                confidence = 'degraded'
            elif len(families) >= self.config.high_confidence_families and 'grafo' in families and self.cal.calibrated:
                confidence = 'high_confidence'
            else:
                confidence = 'provisional'
            oov = self.vocab[j] in self.oov or lemma in self.oov  # fastText: vettore solo da sottoparole = meno affidabile
            if oov and confidence == 'high_confidence':
                confidence = 'provisional'
            evidence = [EVIDENCE[s] if s != 'conceptnet' else '/'.join(rels[j])
                        for s in sorted(present, key=lambda s: -w[s] * float(norm[s][j]))]
            results.append({
                'lemma': self.vocab[j], 'pos': pos, 'sense_id': sense_id,
                'score': round(float(score[j]), 6), 'score_is_calibrated': bool(self.cal.calibrated),
                'weight_coverage': round(float(coverage[j]), 4), 'confidence': confidence,
                'signals': {s: (round(float(raw[s][j]), 6) if s in present else None) for s in SIGNALS},
                'availability': {s: ('observed' if s in present else 'missing') for s in SIGNALS},
                **({'oov_subword_only': oov} if 'oov_subword_only' in self.meta else {}),
                'evidence': evidence, 'sense_ambiguous': sense_id is None and pos is None, '_j': j})
        if self.config.mmr_lambda > 0:
            results = self._mmr(results, top_n)
        results = results[:top_n]
        for r in results:
            r.pop('_j')
        return {**base, 'status': 'ok' if results else 'no_candidates', 'results': results}

    def _mmr(self, results, top_n):
        """Diversificazione: λ·rilevanza − (1−λ)·massima somiglianza (coseno E) con i già scelti."""
        lam, chosen, pool = self.config.mmr_lambda, [], list(results[:max(top_n * 5, top_n)])
        while pool and len(chosen) < top_n:
            def value(r):
                sims = [x for x in (self.E.cosine(r['_j'], [c['_j'] for c in chosen]) if chosen else []) if not np.isnan(x)]
                return lam * r['score'] - (1 - lam) * (max(sims) if sims else 0.0)
            best = max(pool, key=value)
            chosen.append(best)
            pool.remove(best)
        return chosen
