"""Fonti e cache riprendibili dell'ensemble ZeroContext, senza scritture nei DB."""
from __future__ import annotations

from contextlib import closing
import gc
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import sqlite3

import numpy as np


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.part')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def model_access(models, cache):
    """Verifica i piccoli config prima dei pesi, usando solo l'accesso HF già configurato."""
    if not any(c.get('enabled', True) for c in models.values()):
        return
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import GatedRepoError

    enabled = [c for c in models.values() if c.get('enabled', True)]
    for config in sorted(enabled, key=lambda c: not c.get('gated', False)):
        try:
            hf_hub_download(config['id'], filename='config.json', revision=config['revision'],
                            cache_dir=str(cache / 'models'), token=False)
            if config.get('trust_remote_code'):
                checked_model_code(config)
                for filename in ('configuration.py', 'modeling.py'):
                    hf_hub_download('Alibaba-NLP/new-impl', filename=filename,
                                    revision=config['code_revision'], cache_dir=str(cache / 'models'), token=False)
        except GatedRepoError as error:
            raise ValueError(f"Accesso richiesto a https://huggingface.co/{config['id']}. "
                             "Esaminare e accettare personalmente le condizioni, poi configurare l'accesso "
                             "con hf auth login nell'ambiente semantico. Nessun modello è stato omesso.") from error


def checked_model_code(config):
    """Solo il codice GTE esaminato e fissato, mai una revisione mobile."""
    if config.get('trust_remote_code') and (
            config['id'] != 'Alibaba-NLP/gte-multilingual-base' or
            config.get('code_revision') != '40ced75c3017eb27626c9d4ea981bde21a2662f4'):
        raise ValueError('Codice remoto del modello non verificato o revisione non fissata')


def configure_gte(model):
    """Compatibilità locale con Transformers 5: il codice GTE usa un helper rimosso.

    Maschera additiva del solo encoder bidirezionale, equivalente al vecchio
    ModuleUtilsMixin. Nessuna modifica globale alle classi di Transformers.
    """
    import types
    import torch

    target = model[0].auto_model
    if hasattr(target, 'get_extended_attention_mask'):
        return

    def extended_mask(self, mask, input_shape, device=None, dtype=None):
        if getattr(self.config, 'is_decoder', False) or mask.ndim not in (2, 3):
            raise ValueError('GTE richiede una maschera encoder bidirezionale 2D o 3D')
        mask = mask[:, None, None, :] if mask.ndim == 2 else mask[:, None, :, :]
        dtype = dtype or self.dtype
        return (1.0 - mask.to(dtype=dtype)) * torch.finfo(dtype).min

    target.get_extended_attention_mask = types.MethodType(extended_mask, target)


def load_game(path):
    with closing(readonly(path)) as con:
        con.execute('BEGIN')
        rows = list(con.execute('SELECT idx,word FROM context__vocab ORDER BY idx'))
        if [i for i, _ in rows] != list(range(len(rows))):
            raise ValueError('Indici del vocabolario non contigui')
        words = [w for _, w in rows]
        secrets = [w for w, in con.execute('SELECT word FROM context__secrets ORDER BY word')]
        meta = {k: json.loads(v) for k, v in con.execute('SELECT name,value FROM context__meta')}
        links = list(con.execute('SELECT secret_idx,word_idx FROM context__links ORDER BY 1,2'))
        tables = {n for n, in con.execute("SELECT name FROM sqlite_schema")}
        hubs = ([p for _, p in con.execute('SELECT idx,penalty FROM context__hubs ORDER BY idx')]
                if 'context__hubs' in tables else [0] * len(words))
        reviewed = (dict(con.execute('SELECT prompt,sense FROM associazioni__prompts ORDER BY prompt'))
                    if 'associazioni__prompts' in tables else {})
        verified = (list(con.execute('''SELECT p.prompt,w.word FROM associazioni__prompt_words pw
                     JOIN associazioni__prompts p ON p.id=pw.prompt_id
                     JOIN associazioni__words w ON w.id=pw.word_id ORDER BY 1,2'''))
                    if 'associazioni__prompt_words' in tables else [])
    if len(words) != len(set(words)) or not set(secrets) <= set(words) or len(hubs) != len(words):
        raise ValueError('Vocabolario, segrete o penalità incoerenti')
    return words, secrets, meta, links, hubs, reviewed, verified


BAD_TAGS = {'form-of', 'alt-of', 'obsolete', 'archaic', 'rare', 'offensive', 'vulgar', 'slur'}


def definition(details):
    if set(details.get('entry_tags', [])) & BAD_TAGS:
        return None
    for sense in details.get('senses', []):
        if set(sense.get('tags', [])) & BAD_TAGS or sense.get('form_of'):
            continue
        for gloss in sense.get('glosses', []):
            if isinstance(gloss, str) and gloss.strip():
                return ' '.join(gloss.split())[:1000]
    return None


def profiles(words, reviewed, raw_path, overrides=None):
    """Un senso per parola: override, senso revisionato, prima definizione italiana pulita.

    La scelta automatica del primo senso non viene descritta come disambiguazione
    umana. Le parole prive di definizione sono segnalate e codificate come lemmi.
    """
    result = {w: {'word': w, 'text': w, 'origin': 'lemma_only'} for w in words}
    for w, sense in reviewed.items():
        if w in result and sense.strip():
            result[w] = {'word': w, 'text': f'{w}: {sense.strip()}', 'origin': 'reviewed_sense'}
    snapshots = []
    if raw_path is not None:
        with closing(readonly(raw_path)) as con:
            con.execute('BEGIN')
            snapshots = list(con.execute('''SELECT n.n,h.snapshot_id,s.sha256
                FROM raw__inventory_source_heads h JOIN raw__inventory_snapshot_numbers n ON n.snapshot_id=h.snapshot_id
                JOIN raw__inventory_snapshots s ON s.id=h.snapshot_id
                JOIN raw__inventory_registered_sources r ON r.source_key=h.source_key
                WHERE h.source_key='kaikki-itwiktionary' AND r.enabled=1'''))
            roles = dict(con.execute('SELECT n,role FROM raw__inventory_attestation_roles'))
            tags = dict(con.execute('SELECT n,pos FROM raw__inventory_attestation_pos'))
            con.execute('CREATE TEMP TABLE ensemble_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
            con.executemany('INSERT INTO ensemble_targets VALUES (?)',
                            ((w,) for w in words if result[w]['origin'] == 'lemma_only'))
            current = {n: sid for n, sid, _ in snapshots}
            for w, snap, role, pos, locator, details in con.execute('''
                SELECT a.prompt,a.snapshot,a.role,a.pos,a.locator,a.details_json
                FROM ensemble_targets t CROSS JOIN raw__inventory_attestation_rows_json a ON a.prompt=t.word
                ORDER BY t.word,a.snapshot,a.locator'''):
                if snap not in current or roles[role] != 'lemma' or tags[pos] in {'name', 'PROPN', 'NPR'}:
                    continue
                if result[w]['origin'] != 'lemma_only':
                    continue
                gloss = definition(json.loads(details or '{}'))
                if gloss:
                    result[w] = {'word': w, 'text': f'{w}: {gloss}', 'origin': 'dictionary_first_sense',
                                 'snapshot': current[snap], 'locator': locator}
    if overrides:
        seen = set()
        for line in Path(overrides).read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            w = entry['word']
            if w in seen or w not in result or not isinstance(entry.get('definition'), str) or not entry['definition'].strip():
                raise ValueError(f'Override ripetuto, sconosciuto o vuoto: {w}')
            if not entry.get('reviewer') or not entry.get('source'):
                raise ValueError(f'Override senza revisore e provenienza: {w}')
            seen.add(w)
            result[w] = {'word': w, 'text': f"{w}: {entry['definition'].strip()}",
                         'origin': 'editorial_override', 'evidence': entry}
    return [result[w] for w in words], snapshots


def lexical_vectors(cache, source, words):
    source_words = cache / f'{source}_words.txt'
    source_matrix = cache / f'{source}_vectors.npy'
    matrix = np.load(source_matrix, mmap_mode='r', allow_pickle=False)
    lines = source_words.read_text(encoding='utf-8').splitlines()
    if matrix.ndim != 2 or matrix.shape[1] != 300 or len(lines) != len(matrix):
        raise ValueError(f'Indice e matrice {source} non allineati')
    index = {}
    for i, word in enumerate(lines):
        index.setdefault(word, i)
    out = np.zeros((len(words), matrix.shape[1]), dtype=np.float32)
    absent = []
    for i, word in enumerate(words):
        if word in index:
            out[i] = matrix[index[word]]
        else:
            absent.append(word)
    if not np.isfinite(out).all():
        raise ValueError(f'Vettori {source} non finiti')
    return out, {'words_sha256': sha(source_words), 'vectors_sha256': sha(source_matrix),
                 'missing': len(absent), 'missing_examples': absent[:50]}


def sentence_vectors(key, model_config, texts, cache, *, batch_size, sequence_length, device=None):
    """Checkpoint dopo ogni batch; un modello alla volta e revisioni Hugging Face fissate."""
    import torch
    from sentence_transformers import SentenceTransformer

    checked_model_code(model_config)
    identity = {'model': model_config['id'], 'revision': model_config['revision'],
                'prefix': model_config['prefix'], 'texts': digest(texts), 'sequence_length': sequence_length,
                'config_kwargs': model_config.get('config_kwargs', {}),
                'code_revision': model_config.get('code_revision'),
                'gte_adapter': 1 if key == 'gte' else None,
                'sentence_transformers': version('sentence-transformers'), 'torch': version('torch')}
    folder = cache / 'embeddings' / key / digest(identity)
    folder.mkdir(parents=True, exist_ok=True)
    final = folder / 'vectors.npy'
    if final.exists():
        manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        actual_sha = sha(final)
        if manifest.get('identity') != identity or manifest.get('sha256') != actual_sha:
            raise ValueError(f'Impronta cache {key} non valida: {folder}')
        matrix = np.load(final, mmap_mode='r', allow_pickle=False)
        if (matrix.ndim != 2 or len(matrix) != len(texts) or not np.isfinite(matrix).all()
                or not np.linalg.norm(matrix, axis=1).all()):
            raise ValueError(f'Cache {key} non valida: {final}')
        return matrix, {**identity, 'sha256': actual_sha, 'cache': str(folder)}
    from filelock import FileLock
    with FileLock(str(folder / 'encoding.lock'), timeout=1):
        code = {'code_revision': model_config['code_revision']} if model_config.get('trust_remote_code') else {}
        model = SentenceTransformer(model_config['id'], revision=model_config['revision'],
                                    cache_folder=str(cache / 'models'), device=device,
                                    token=False, trust_remote_code=model_config.get('trust_remote_code', False),
                                    config_kwargs={**model_config.get('config_kwargs', {}), **code},
                                    model_kwargs={'use_safetensors': True, 'dtype': torch.float32, **code})
        try:
            if key == 'gte':
                configure_gte(model)
            model.max_seq_length = sequence_length
            progress = folder / 'progress.json'
            partial = folder / 'vectors.part.npy'
            dim = model.get_sentence_embedding_dimension()
            checkpoint = json.loads(progress.read_text()) if progress.exists() else {'completed': 0, 'identity': identity}
            if checkpoint.get('identity') != identity:
                raise ValueError(f'Identità checkpoint {key} incoerente')
            completed = checkpoint['completed']
            if not 0 <= completed <= len(texts) or (completed and not partial.exists()):
                raise ValueError(f'Checkpoint {key} incoerente')
            if partial.exists():
                matrix = np.load(partial, mmap_mode='r+', allow_pickle=False)
                if matrix.shape != (len(texts), dim):
                    raise ValueError(f'Dimensioni checkpoint {key} incoerenti')
            else:
                matrix = np.lib.format.open_memmap(partial, mode='w+', dtype=np.float32, shape=(len(texts), dim))
            for start in range(completed, len(texts), batch_size):
                end = min(start + batch_size, len(texts))
                batch = [model_config['prefix'] + t for t in texts[start:end]]
                encoded = model.encode(batch, batch_size=batch_size, normalize_embeddings=True,
                                       convert_to_numpy=True, show_progress_bar=False, prompt='')
                if encoded.shape != (end - start, dim) or not np.isfinite(encoded).all() or not np.linalg.norm(encoded, axis=1).all():
                    raise ValueError(f'Output {key} non valido al batch {start}')
                matrix[start:end] = encoded
                matrix.flush()
                write_json(progress, {'completed': end, 'identity': identity})
                if start == completed or end % (batch_size * 50) == 0 or end == len(texts):
                    print(f'{key}: {end}/{len(texts)} parole', flush=True)
            del matrix
            partial.replace(final)
            write_json(folder / 'manifest.json', {'identity': identity, 'sha256': sha(final)})
        finally:
            del model
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    return np.load(final, mmap_mode='r', allow_pickle=False), {**identity, 'sha256': sha(final), 'cache': str(folder)}
