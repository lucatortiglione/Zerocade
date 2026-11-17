"""LSA italiana: TF-IDF delle definizioni e SVD, senza modelli linguistici neurali."""
from __future__ import annotations

from collections import defaultdict
from importlib.metadata import version
import json
from pathlib import Path
import re

import numpy as np

from context_ensemble import unit_rows
from context_semantic_sources import digest, sha, write_json

TOKEN = re.compile(r'[a-zàèéìòù]+', re.IGNORECASE)
STOP = frozenset('a ad al alla allo ai agli alle anche che chi con da dal dalla dallo dai dagli dalle di del della dello dei degli delle e ed è era essere fra gli ha hanno il in la le lo ma nel nella nello nei negli nelle non o od per più quale quali se si sia sono su sul sulla sui sulle tra un una uno'.split())


def lemma_map(path):
    """Usa solo analisi univoche di Morph-it!: gli omografi restano nella loro grafia."""
    candidates = defaultdict(set)
    with Path(path).open(encoding='utf-8') as stream:
        for line in stream:
            fields = line.rstrip('\r\n').split('\t')
            if len(fields) != 3:
                continue
            form, lemma, tag = fields
            if tag.startswith(('NPR', 'SYM', 'PUN')) or not TOKEN.fullmatch(form) or not TOKEN.fullmatch(lemma):
                continue
            candidates[form.lower()].add(lemma.lower())
    return {form: next(iter(values)) for form, values in candidates.items() if len(values) == 1}


class ItalianTokens:
    def __init__(self, lemmas):
        self.lemmas = lemmas

    def __call__(self, text):
        return [self.lemmas.get(w, w) for w in TOKEN.findall(text.lower()) if len(w) > 1 and w not in STOP]


def lsa_vectors(cards, config, morphit, cache):
    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer

    identity = {'profiles': digest(cards), 'config': config, 'morphit_sha256': sha(morphit),
                'sklearn': version('scikit-learn'), 'script_sha256': sha(Path(__file__))}
    folder = Path(cache) / 'lsa' / digest(identity)
    folder.mkdir(parents=True, exist_ok=True)
    final = folder / 'vectors.npy'
    manifest_path = folder / 'manifest.json'
    if final.exists() and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest['identity'] != identity or manifest['sha256'] != sha(final):
            raise ValueError('Cache LSA non coerente con i suoi input')
        rows = np.load(final, allow_pickle=False)
        if rows.ndim != 2 or len(rows) != len(cards) or not np.isfinite(rows).all():
            raise ValueError('Matrice LSA in cache non valida')
        return rows, manifest['provenance']

    documents = [c['text'] if c['origin'] != 'lemma_only' else '' for c in cards]
    vectorizer = TfidfVectorizer(tokenizer=ItalianTokens(lemma_map(morphit)), token_pattern=None,
        lowercase=False, sublinear_tf=True, use_idf=True, norm='l2', dtype=np.float32,
        max_features=config['max_features'], min_df=config['min_df'])
    matrix = vectorizer.fit_transform(documents)
    dimensions = min(config['dimensions'], min(matrix.shape) - 1)
    if dimensions < 1 or np.count_nonzero(np.diff(matrix.indptr)) < 2:
        raise ValueError('Definizioni insufficienti per LSA: ampliare il campione o la copertura lessicale')
    model = TruncatedSVD(n_components=dimensions, n_iter=7, random_state=config['random_state'])
    rows = unit_rows(model.fit_transform(matrix))
    absent = int(np.count_nonzero(np.linalg.norm(rows, axis=1) == 0))
    temporary = folder / 'vectors.part.npy'
    np.save(temporary, rows, allow_pickle=False)
    temporary.replace(final)
    np.savez(folder / 'tfidf_svd.npz', idf=vectorizer.idf_, components=model.components_)
    write_json(folder / 'vocabulary.json', {k: int(v) for k, v in vectorizer.vocabulary_.items()})
    provenance = {'method': 'TF-IDF + TruncatedSVD', **identity, 'sha256': sha(final), 'cache': str(folder),
                  'missing': absent, 'dimensions': dimensions, 'terms': matrix.shape[1],
                  'explained_variance': float(model.explained_variance_ratio_.sum()),
                  'model_sha256': sha(folder / 'tfidf_svd.npz'), 'vocabulary_sha256': sha(folder / 'vocabulary.json')}
    write_json(manifest_path, {'identity': identity, 'sha256': sha(final), 'provenance': provenance})
    return rows, provenance
