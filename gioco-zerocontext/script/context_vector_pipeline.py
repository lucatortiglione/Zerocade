"""Pipeline offline Model2Vec -> fallback FastText allineato -> retrofitting con margine."""
from __future__ import annotations

from importlib.metadata import version
import json
from pathlib import Path
import re
import numpy as np
from context_semantic_sources import digest, sha, write_json
from context_subword import unit_rows


def configuration(path):
    c = json.loads(Path(path).read_text(encoding='utf-8'))
    if c['version'] != 'context-vectors-1' or c['dimensions'] != 300 or c['storage'] not in {'float32', 'float16'}:
        raise ValueError('Profilo vettoriale o formato non supportato')
    teacher = c['teacher']
    if not re.fullmatch('[a-f0-9]{40}', teacher['revision']) or teacher['pooling'] not in {'first', 'mean'}:
        raise ValueError('Revisione fissa e pooling del docente richiesti')
    if not 0 < teacher['sif_coefficient'] < 1 or not 1 <= teacher['batch_size'] <= 256 or not 8 <= teacher['max_length'] <= 512:
        raise ValueError('Parametri del docente non validi')
    templates = c['multi_context']['templates']
    if (c['multi_context']['scope'] not in {'all', 'verbs_domains_reviewed'} or len(templates) < 2 or
            any(not isinstance(t, str) or t.count('{w}') != 1 or len(t) > 500 for t in templates)):
        raise ValueError('Template multi-contesto non validi')
    for template in templates:
        try:
            template.format(w='prova')
        except (KeyError, ValueError) as e:
            raise ValueError('Template multi-contesto non valido') from e
    r = c['retrofitting']
    if (not isinstance(c['special_rounds_enabled'], bool) or not isinstance(c['multi_context']['enabled'], bool) or
            not 1 <= r['iterations'] <= 100 or not 0 < r['alpha'] <= 10 or
            not 0 <= r['beta'] <= 10 or not 0 <= r['gamma'] <= 10 or not 0 < r['margin'] <= 4 or not 0 < r['step'] <= 1):
        raise ValueError('Parametri di retrofitting non validi')
    q = c['quality']
    if (not q['polarity'] or any(len(t) != 3 for t in q['polarity']) or not q['oov'] or
            not 100 <= q['angular_samples'] <= 1000000 or not -1 <= q['angular_min'] <= q['angular_max'] <= 1 or
            not 0 < q['norm_tolerance'] <= .001 or any(not 0 <= p['minimum_cosine'] <= 1 for p in q['oov']) or
            not 301 <= c['alignment']['anchors'] <= 100000 or not 0 < c['alignment']['ridge'] <= 1):
        raise ValueError('Soglie di qualità o allineamento non valide')
    probes = [w for triple in q['polarity'] for w in triple] + [w for p in q['oov'] for w in (p['word'], p['lemma'])]
    if any(not isinstance(w, str) or not re.fullmatch('[a-zàèéìòù]{2,20}', w) for w in probes):
        raise ValueError('Lemmi di collaudo non validi')
    return c


def quality_words(config):
    q = config['quality']
    return sorted({w for triple in q['polarity'] for w in triple} |
                  {w for p in q['oov'] for w in (p['word'], p['lemma'])})


def dense_contexts(model, tokenizer, words, config):
    """Inferenza densa solo durante il build; media dei quattro contesti per lemma."""
    import torch
    teacher, multi = config['teacher'], config['multi_context']
    templates = multi['templates']
    output = np.empty((len(words), model.config.hidden_size), dtype=np.float32)
    model.to(teacher['device']).eval()
    batch = max(1, teacher['batch_size'] // len(templates))
    for start in range(0, len(words), batch):
        texts = [template.format(w=w) for w in words[start:start + batch] for template in templates]
        tokens = tokenizer(texts, padding=True, truncation=True, max_length=teacher['max_length'], return_tensors='pt')
        tokens = {k: v.to(teacher['device']) for k, v in tokens.items()}
        with torch.inference_mode():
            hidden = model(**tokens).last_hidden_state.float()
            if teacher['pooling'] == 'first':
                pooled = hidden[:, 0]
            else:
                mask = tokens['attention_mask'].unsqueeze(-1)
                pooled = (hidden * mask).sum(1) / mask.sum(1).clamp_min(1)
        values = pooled.cpu().numpy().reshape(-1, len(templates), hidden.shape[-1]).mean(axis=1)
        output[start:start + len(values)] = values
        if start % (batch * 100) == 0:
            print(f'Prompt-averaging: {start}/{len(words)} lemmi', flush=True)
    if not np.isfinite(output).all():
        raise ValueError('Embedding densi non finiti')
    return output


def distill_teacher(model, tokenizer, vocabulary, config, directory):
    """API Model2Vec 0.10 effettiva. PCA condivisa e SIF conservati anche per i prompt."""
    from model2vec.distill import distill_from_model
    from model2vec.distill.inference import compute_weights
    from model2vec import StaticModel
    from sklearn.decomposition import PCA
    teacher = config['teacher']
    known = tokenizer.get_vocab()
    additions = [w for w in vocabulary if w not in known]
    raw = distill_from_model(model=model, tokenizer=tokenizer, vocabulary=additions,
        device=teacher['device'], pca_dims=None, sif_coefficient=None,
        quantize_to='float32', pooling=teacher['pooling'])
    if min(raw.embedding.shape) <= config['dimensions']:
        raise ValueError('Vocabolario/docente troppo piccolo per PCA a 300 dimensioni')
    pca = PCA(n_components=config['dimensions'], svd_solver='covariance_eigh')
    reduced = pca.fit_transform(np.asarray(raw.embedding, np.float32))
    weights = compute_weights(len(reduced), sif_coefficient=teacher['sif_coefficient'])
    static = StaticModel(vectors=np.ascontiguousarray(reduced * weights[:, None], dtype=np.float32),
        tokenizer=raw.tokenizer, config={**raw.config, 'hidden_dim': config['dimensions'],
        'apply_pca': config['dimensions'], 'sif_coefficient': teacher['sif_coefficient']},
        base_model_name=teacher['id'], normalize=True)
    static.save_pretrained(directory / 'model2vec')
    np.savez(directory / 'pca.npz', mean=pca.mean_, axes=pca.components_)
    return static, pca


def align_fallback(base, fasttext, count, ridge):
    """I due spazi non sono intercambiabili: apprende una mappa da ancore comuni."""
    from sklearn.linear_model import Ridge
    valid = np.isfinite(base).all(axis=1) & (np.linalg.norm(base, axis=1) > 1e-9)
    anchors = np.flatnonzero(valid)
    if len(anchors) < min(301, base.shape[1] + 1):
        raise ValueError('Ancore insufficienti per allineare FastText a Model2Vec')
    anchors = anchors[np.linspace(0, len(anchors) - 1, min(count, len(anchors)), dtype=int)]
    model = Ridge(alpha=ridge).fit(fasttext[anchors], unit_rows(base[anchors]))
    missing = np.flatnonzero(~valid)
    result = base.copy()
    if len(missing):
        result[missing] = model.predict(fasttext[missing])
    return unit_rows(result), {'anchors': len(anchors), 'fallback_rows': missing.tolist(),
        'anchor_mean_cosine': float(np.mean(np.sum(unit_rows(model.predict(fasttext[anchors])) * unit_rows(base[anchors]), axis=1)))}, model


def initial_vectors(words, guess_count, context_words, fasttext, config, cache):
    """Cache verificata: niente passaggio silenzioso a FastText quando il docente fallisce."""
    from huggingface_hub import snapshot_download
    from transformers import AutoModel, AutoTokenizer
    import torch
    packages = {p: version(p) for p in ('model2vec', 'transformers', 'torch', 'scikit-learn')}
    key = digest({'words': words, 'guesses': guess_count, 'context_words': context_words, 'config': config,
                  'fasttext': sha_array(fasttext),
                  'packages': packages, 'script': sha(__file__)})
    directory = cache / 'model2vec' / key
    receipt = directory / 'complete.json'
    if receipt.exists():
        metadata = json.loads(receipt.read_text(encoding='utf-8'))
        for name, expected in metadata['artifacts'].items():
            if sha(directory / name) != expected:
                raise ValueError(f'Cache Model2Vec corrotta: {name}')
        return unit_rows(np.load(directory / 'initial.npy')), metadata
    directory.mkdir(parents=True, exist_ok=True)
    t = config['teacher']
    snapshot = Path(snapshot_download(t['id'], revision=t['revision'], cache_dir=cache / 'models', token=False,
        allow_patterns=['config.json', '*.safetensors', '*.safetensors.index.json', 'tokenizer*.json', 'special_tokens_map.json',
                        'sentencepiece.bpe.model', 'vocab.txt']))
    tokenizer = AutoTokenizer.from_pretrained(snapshot, trust_remote_code=False, local_files_only=True)
    model = AutoModel.from_pretrained(snapshot, trust_remote_code=False, local_files_only=True, use_safetensors=True)
    # Prima della distillazione: Model2Vec può modificare il dizionario di input del docente.
    selected = sorted(set(context_words) & set(words)) if config['multi_context']['enabled'] else []
    prompt_cache = directory / 'contexts.npy'
    if selected:
        if prompt_cache.exists():
            contexts = np.load(prompt_cache)
            if contexts.shape != (len(selected), model.config.hidden_size) or not np.isfinite(contexts).all():
                raise ValueError('Cache dei contesti incompleta')
        else:
            contexts = dense_contexts(model, tokenizer, selected, config)
            np.save(prompt_cache, contexts)
    static, pca = distill_teacher(model, tokenizer, words[:guess_count], config, directory)
    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    base = np.asarray(static.encode(words), dtype=np.float32)
    if selected:
        ids = {w: i for i, w in enumerate(words)}
        base[[ids[w] for w in selected]] = pca.transform(contexts)
    merged, alignment, mapper = align_fallback(base, fasttext, config['alignment']['anchors'], config['alignment']['ridge'])
    np.savez(directory / 'fasttext_alignment.npz', coefficients=mapper.coef_, intercept=mapper.intercept_)
    np.save(directory / 'initial.npy', merged)
    metadata = {'cache': str(directory.resolve()), 'teacher': t, 'packages': packages, 'multi_context_words': len(selected),
                'templates': config['multi_context']['templates'], 'alignment': alignment,
                'teacher_files': {p.name: sha(p) for p in snapshot.iterdir() if p.is_file()},
                'method': 'model2vec_raw_shared_pca_sif_dense_contexts_aligned_fasttext',
                'artifacts': {str(p.relative_to(directory)).replace('\\', '/'): sha(p) for p in directory.rglob('*') if p.is_file()}}
    write_json(receipt, metadata)
    return merged, metadata


def sha_array(matrix):
    import hashlib
    return hashlib.sha256(np.ascontiguousarray(matrix).view(np.uint8)).hexdigest()


def margin_retrofit(initial, synonyms, antonyms, parameters):
    """Discesa proiettata sul funzionale con hinge; backtracking evita divergenze."""
    q = unit_rows(initial)
    original = q.copy()
    alpha, beta, gamma, margin = (parameters[k] for k in ('alpha', 'beta', 'gamma', 'margin'))
    def edges(pairs):
        return np.asarray(sorted({(min(a, b), max(a, b)) for a, b in pairs if a != b}), dtype=np.int64).reshape(-1, 2)
    syn, ant = edges(synonyms), edges(antonyms)
    if any(np.any(e < 0) or np.any(e >= len(q)) for e in (syn, ant)):
        raise ValueError('Relazione fuori dal vocabolario')
    def loss(values):
        total = alpha * np.square(values - original).sum(dtype=np.float64)
        if len(syn): total += beta * np.square(values[syn[:, 0]] - values[syn[:, 1]]).sum(dtype=np.float64)
        if len(ant): total += gamma * np.maximum(0, margin - np.square(values[ant[:, 0]] - values[ant[:, 1]]).sum(axis=1)).sum(dtype=np.float64)
        return float(total)
    losses = [loss(q)]
    for iteration in range(parameters['iterations']):
        gradient = 2 * alpha * (q - original)
        for links, weight, repel in ((syn, beta, False), (ant, gamma, True)):
            if not len(links): continue
            a, b = links.T
            diff = q[a] - q[b]
            if repel:
                active = np.square(diff).sum(axis=1) < margin
                a, b, diff = a[active], b[active], diff[active]
                weight = -weight
            np.add.at(gradient, a, 2 * weight * diff)
            np.add.at(gradient, b, -2 * weight * diff)
        step = parameters['step']
        for _ in range(24):
            trial = q - step * gradient
            if np.any(np.linalg.norm(trial, axis=1) < 1e-9):
                step *= .5; continue
            trial = unit_rows(trial)
            value = loss(trial)
            if value <= losses[-1] + 1e-7:
                q = trial; losses.append(value); break
            step *= .5
        else:
            break
        print(f'Retrofitting con margine: {iteration + 1}/{parameters["iterations"]}, loss={losses[-1]:.4f}', flush=True)
    return q, {'method': 'projected_gradient_hinge_with_backtracking', **parameters, 'losses': losses}


def validate_quality(matrix, words, config, guess_count=None):
    q = config['quality']
    matrix = np.asarray(matrix, np.float32)
    count = len(words) if guess_count is None else guess_count
    if matrix.shape != (len(words), config['dimensions']) or count < 2 or count > len(words):
        raise ValueError('Matrice o campione per il collaudo non validi')
    index = {w: i for i, w in enumerate(words)}
    norms = np.linalg.norm(matrix, axis=1)
    norm_ok = bool(np.isfinite(matrix).all() and np.all(np.abs(norms - 1) <= q['norm_tolerance']))
    if not norm_ok:
        return {'passed': False, 'unit_norms': False, 'max_norm_error': None,
                'checks': [{'kind': 'normalization', 'passed': False}]}
    matrix = unit_rows(matrix)
    checks = []
    for word, opposite, related in q['polarity']:
        present = all(w in index for w in (word, opposite, related))
        opposing = float(matrix[index[word]] @ matrix[index[opposite]]) if present else None
        close = float(matrix[index[word]] @ matrix[index[related]]) if present else None
        checks.append({'kind': 'polarity', 'words': [word, opposite, related], 'opposite_cosine': opposing,
                       'related_cosine': close, 'passed': present and opposing < close})
    for p in q['oov']:
        present = all(w in index for w in (p['word'], p['lemma']))
        cosine = float(matrix[index[p['word']]] @ matrix[index[p['lemma']]]) if present else None
        checks.append({'kind': 'oov', **p, 'cosine': cosine, 'passed': present and cosine >= p['minimum_cosine'],
                       'in_guess_list': p['word'] in words[:count]})
    rng = np.random.default_rng(q['seed'])
    a = rng.integers(0, count, q['angular_samples'])
    b = rng.integers(0, count - 1, q['angular_samples'])
    b += b >= a  # coppie distinte, anche in un pilota.
    sampled = np.einsum('ij,ij->i', matrix[a], matrix[b])
    mean = float(sampled.mean())
    checks.append({'kind': 'angular', 'samples': q['angular_samples'], 'seed': q['seed'], 'mean_cosine': mean,
                   'min': q['angular_min'], 'max': q['angular_max'], 'passed': bool(np.isfinite(mean) and q['angular_min'] <= mean <= q['angular_max'])})
    return {'passed': norm_ok and all(c['passed'] for c in checks), 'unit_norms': norm_ok,
            'max_norm_error': float(np.max(np.abs(norms - 1))) if np.isfinite(norms).all() else None,
            'checks': checks}
