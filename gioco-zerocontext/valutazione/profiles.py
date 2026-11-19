"""Profili di vettori: quelli pubblicati nel gioco (originale, ABTT, pipeline_b) e i candidati non ancora pubblicati."""
from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
import json
from pathlib import Path
import sqlite3
from typing import Literal

import numpy as np

from valutazione import paths
from valutazione.common import connect_ro, sha256_file

# Lo stesso minimo di apps/server/src/context-pipeline.ts (PIPELINE_MIN_PINNED).
PIPELINE_MIN_PINNED = 100
# profilo -> schema di giochi.sqlite3 (packages/shared/src/contextProfiles.ts): pipeline_b ha i vettori dell'originale.
SCHEMAS = {'original': 'context_original', 'abtt': 'context_abtt', 'pipeline_b': 'context_original'}


@dataclass
class Profile:
    name: str
    words: list[str]
    index: dict[str, int]
    vectors: np.ndarray          # float32 (n, dim), vettori unitari; può essere una mappa in memoria sola lettura
    sha256: str
    pinned: dict[int, list[int]] | None = None   # segreta -> parole messe subito dopo di lei, nell'ordine dell'export


def _index(words: list[str]) -> dict[str, int]:
    # Come `new Map(vocab.map((w, i) => [w, i]))` del server: con un doppione vince l'ultima.
    return {w: i for i, w in enumerate(words)}


def _vectors(file: Path, n: int, dim: int) -> np.ndarray:
    if file.stat().st_size != n * dim * 4:
        raise ValueError(f'{file.name}: {file.stat().st_size} byte, attesi {n * dim * 4} ({n} parole × {dim} float32)')
    return np.memmap(file, dtype='<f4', mode='r', shape=(n, dim))


def load_published(name: Literal['original', 'abtt', 'pipeline_b'], giochi: Path = paths.GIOCHI,
                   vectors_dir: Path = paths.VECTORS_DIR, pipeline_b: Path = paths.PIPELINE_B,
                   min_pinned: int = PIPELINE_MIN_PINNED) -> Profile:
    if name not in SCHEMAS:
        raise ValueError(f'Profilo sconosciuto: {name}')
    schema = SCHEMAS[name]
    with closing(connect_ro(giochi)) as con:
        meta = {k: json.loads(v) for k, v in con.execute(f'SELECT name, value FROM {schema}__meta')}
        words = [w for (w,) in con.execute(f'SELECT word FROM {schema}__vocab ORDER BY idx')]
    if meta.get('vector_format') != 'float32':
        raise ValueError(f"{schema}: formato dei vettori {meta.get('vector_format')!r}, il valutatore legge solo float32")
    if meta.get('links') or meta.get('hub_strength'):
        raise ValueError(f'{schema}: collegamenti o hub attivi, il ranking non è un puro coseno e non coinciderebbe con il gioco')
    n, dim = len(words), int(meta['dim'])
    if int(meta['words']) != n:
        raise ValueError(f"{schema}: il vocabolario ha {n} parole, i metadati {meta['words']}")
    file = vectors_dir / meta['vectors_file']
    vectors = _vectors(file, n, dim)
    sha = sha256_file(file)
    if sha != meta['vectors_sha256']:
        raise ValueError(f"{file.name}: SHA-256 {sha} diverso da quello registrato ({meta['vectors_sha256']})")
    pinned = None
    if name == 'pipeline_b':
        try:
            pinned = load_pinned(pipeline_b, words, min_pinned)
        except (OSError, sqlite3.Error, ValueError) as error:
            raise ValueError(f'Esportazione della Pipeline B non disponibile ({pipeline_b.name}): {error}') from error
    return Profile(name, words, _index(words), vectors, sha, pinned)


def load_candidate(name: str, vectors: Path, vocab: Path, dim: int) -> Profile:
    """Un profilo non ancora pubblicato: file float32 di vettori unitari e un vocabolario con una parola per riga."""
    words = vocab.read_text(encoding='utf-8').split('\n')
    if words and words[-1] == '':
        words.pop()
    return Profile(name, words, _index(words), _vectors(vectors, len(words), dim), sha256_file(vectors), None)


def load_pinned(file: Path, words: list[str], min_pinned: int = PIPELINE_MIN_PINNED) -> dict[int, list[int]]:
    """Le parole che l'export della Pipeline B mette subito dopo ogni segreta, con le regole di loadPipelineAssociations
    (apps/server/src/context-pipeline.ts): solo parole del vocabolario, senza doppioni né la segreta stessa, e le
    segrete con meno di `min_pinned` parole non si giocano."""
    with closing(connect_ro(file)) as con:
        columns = {c[1] for c in con.execute("PRAGMA table_info('semantic_pair_scores')")}
        if 'rank' not in columns:
            raise ValueError("l'export non ha la colonna rank")
        row = con.execute("SELECT value FROM pipeline_meta WHERE name = 'model_version'").fetchone()
        if not row or not row[0]:
            raise ValueError("l'export non ha model_version")
        index = _index(words)
        in_vocabulary = {lid: index[lemma] for lid, lemma in con.execute('SELECT lexeme_id, lemma FROM lexemes')
                         if lemma in index}
        pinned: dict[int, list[int]] = {}
        current, secret, seen, found, rows = None, 0, set(), [], 0

        def flush():
            if current is not None and rows and len(found) >= min_pinned:
                pinned[secret] = found

        scan = con.execute('SELECT source_lexeme_id, target_lexeme_id FROM semantic_pair_scores '
                           'WHERE model_version = ? ORDER BY source_lexeme_id, rank', (row[0],))
        for source, target in scan:
            if source not in in_vocabulary:
                continue
            if source != current:
                flush()
                current, secret = source, in_vocabulary[source]
                seen, found, rows = {secret}, [], 0
            rows += 1
            i = in_vocabulary.get(target)
            if i is not None and i not in seen:
                seen.add(i)
                found.append(i)
        flush()
    return pinned
