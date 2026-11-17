#!/usr/bin/env python3
"""Componenti condivisi per esperimenti BGE-M3 Italian / ZeroContext.

Input atteso: outputs/bge_m3_italian/{embeddings.npy,vocab_index.csv,manifest.json}
Non altera giochi.sqlite3 né gli artefatti originali.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np

MODEL_ID = "albertobarnabo/bge-m3-italian"


def load_artifact(folder: str | Path):
    folder = Path(folder)
    matrix_file = folder / "embeddings.npy"
    csv_file = folder / "vocab_index.csv"
    if not matrix_file.is_file() or not csv_file.is_file():
        raise FileNotFoundError(
            f"Attesi {matrix_file} e {csv_file}. Genera prima gli embeddings."
        )
    x = np.load(matrix_file, mmap_mode="r", allow_pickle=False)
    if x.ndim != 2 or not np.issubdtype(x.dtype, np.floating):
        raise ValueError("La matrice deve essere 2D e di tipo float.")
    rows = []
    with csv_file.open(encoding="utf-8-sig", newline="") as stream:
        for entry in csv.DictReader(stream):
            rows.append(entry)
    if len(rows) != x.shape[0]:
        raise ValueError(f"Indici non allineati: {len(rows)} parole, {len(x)} vettori")
    expected = set(range(len(rows)))
    actual = {int(row["matrix_index"]) for row in rows}
    if actual != expected:
        raise ValueError("matrix_index duplicato o non consecutivo nel CSV.")
    rows.sort(key=lambda row: int(row["matrix_index"]))
    words = [row["word"] for row in rows]
    if len(set(words)) != len(words):
        raise ValueError("Le parole nell'indice non sono univoche.")
    return x, rows, words


def normalize(x: np.ndarray, epsilon: float = 1e-12) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    if not np.isfinite(x).all() or np.any(norms <= epsilon):
        raise ValueError("Vettori non finiti o con norma nulla: correggi la matrice.")
    return x / np.maximum(norms, epsilon)


def matrix_sanity(x, sample=2048) -> None:
    if len(x) < 2:
        raise ValueError("Occorrono almeno due vettori.")
    rng = np.random.default_rng(42)
    selected = rng.choice(len(x), size=min(sample, len(x)), replace=False)
    normalize(np.asarray(x[selected], dtype=np.float32))


def fit_subset(x, max_samples: int, seed: int = 42) -> np.ndarray:
    if max_samples <= 0 or max_samples >= len(x):
        ids = np.arange(len(x))
    else:
        ids = np.sort(np.random.default_rng(seed).choice(len(x), max_samples, replace=False))
    result = np.asarray(x[ids], dtype=np.float32)
    normalize(result)
    return result


def save_transform(folder, index_rows, x_source, dim: int,
                   transform: Callable[[np.ndarray], np.ndarray],
                   *, metadata: dict, chunk_size: int = 2048,
                   params: dict | None = None) -> Path:
    """Scrive una matrice separata senza sovrascrivere il modello originale."""
    folder = Path(folder)
    if (folder / "embeddings.npy").exists():
        raise FileExistsError(f"Esiste già {folder / 'embeddings.npy'}; usa un'altra --out.")
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / "embeddings.partial.npy"
    mm = np.lib.format.open_memmap(tmp, mode="w+", dtype=np.float32,
                                   shape=(len(x_source), dim))
    try:
        for begin in range(0, len(x_source), chunk_size):
            stop = min(begin + chunk_size, len(x_source))
            converted = transform(np.asarray(x_source[begin:stop], dtype=np.float32))
            if converted.shape != (stop - begin, dim):
                raise RuntimeError(f"Forma inattesa: {converted.shape}")
            mm[begin:stop] = normalize(converted)
        mm.flush()
    except BaseException:
        del mm
        tmp.unlink(missing_ok=True)
        raise
    del mm
    tmp.replace(folder / "embeddings.npy")
    with (folder / "vocab_index.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(index_rows[0]))
        writer.writeheader()
        writer.writerows(index_rows)
    with (folder / "manifest.json").open("w", encoding="utf-8") as stream:
        json.dump({"created_utc": datetime.now(timezone.utc).isoformat(),
                   "embedding_dim": dim, "vocab_size": len(x_source),
                   "l2_normalized": True, **metadata}, stream, ensure_ascii=False, indent=2)
    if params:
        np.savez(folder / "transform.npz", **params)
    return folder / "embeddings.npy"


def read_pairs(path: str | Path):
    """CSV con word1,word2,score, punteggi numerici di giudici umani."""
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        expected = {"word1", "word2", "score"}
        if not expected.issubset(set(reader.fieldnames or [])):
            raise ValueError(f"{path}: richieste le colonne word1,word2,score")
        pairs = [(r["word1"].strip().casefold(), r["word2"].strip().casefold(), float(r["score"]))
                 for r in reader if r["word1"].strip() and r["word2"].strip()]
    if len(pairs) < 3:
        raise ValueError("Occorrono almeno 3 coppie valutate per calcolare Spearman.")
    return pairs


def lexical_spearman(matrix, words, pairs, label=""):
    from scipy.stats import spearmanr
    index = {word.casefold(): i for i, word in enumerate(words)}
    gold, predictions = [], []
    skipped = 0
    for a, b, rating in pairs:
        if a not in index or b not in index:
            skipped += 1
            continue
        va = np.asarray(matrix[index[a]], dtype=np.float32)
        vb = np.asarray(matrix[index[b]], dtype=np.float32)
        na, nb = np.linalg.norm(va), np.linalg.norm(vb)
        if min(na, nb) < 1e-12 or not np.isfinite(va).all() or not np.isfinite(vb).all():
            skipped += 1
            continue
        gold.append(rating)
        predictions.append(float(np.dot(va, vb) / (na * nb)))
    if len(gold) < 3 or len(set(gold)) < 2:
        raise ValueError("Poche coppie valide o giudizi tutti uguali; Spearman non definito.")
    score = float(spearmanr(gold, predictions).statistic)
    if not np.isfinite(score):
        raise ValueError("Spearman non definito (predizioni costanti).")
    print(f"Spearman {label}: {score:.5f} ({score*100:.2f}/100), "+
          f"{len(gold)} coppie valutate, {skipped} escluse")
    return score


def show_neighbors(x, words, target, top=20, index_rows=None):
    lookup = {w.casefold(): i for i, w in enumerate(words)}
    target = target.strip().casefold()
    if target not in lookup:
        raise ValueError(f"Parola '{target}' non presente nel vocabolario")
    i = lookup[target]
    v = np.asarray(x[i], dtype=np.float32)
    sims = np.asarray(x @ v, dtype=np.float32)
    if index_rows is not None:
        eligible = np.array([r.get("in_context__vocab", "1") == "1" for r in index_rows])
        sims[~eligible] = -np.inf
    sims[i] = -np.inf
    order = np.argsort(-sims, kind="stable")[:top]
    for rank, j in enumerate(order, 1):
        print(f"{rank:4d}. {words[j]:<28s} {sims[j]:.5f}")


def optional_benchmark(original, result, words, path):
    if path:
        pairs = read_pairs(path)
        before = lexical_spearman(original, words, pairs, "BGE originale")
        after = lexical_spearman(result, words, pairs, "modificato")
        print(f"Delta Spearman x100: {(after-before)*100:+.3f}")
