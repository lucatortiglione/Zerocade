#!/usr/bin/env python3
"""ZeroContext: EuroDense-435M e BGE-M3 Italian su giochi.sqlite3.

Genera embeddings L2-normalizzati per l'unione di context__vocab e
context__secrets, mantenendo ID originali e assegnando un indice di matrice
stabile ad ogni parola. Non scrive mai nel database.

Esempi:
    py zerocontext_models_italiani.py --inspect
    py zerocontext_models_italiani.py --model eurodense
    py zerocontext_models_italiani.py --model bge-m3-italian --target mare
    py zerocontext_models_italiani.py --model both --batch-size 8

Dipendenze: pip install -U numpy torch sentence-transformers transformers
EuroDense richiede trust_remote_code=True: rivedere il repository prima dell'uso.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

VERSION = "1.0"
MODELS = {
    "eurodense": {
        "repo": "OPI-PIB/EuroDense-435M",
        "revision": "f85d99364d912ea5512dc9b629b27802b7caf564",
        "out": "eurodense_435m",
        "prefix": "Instruct: Retrieve semantically similar text.\nQuery: ",
        "trust_remote_code": True,
    },
    "bge-m3-italian": {
        "repo": "albertobarnabo/bge-m3-italian",
        "revision": "f38acb8fc0bb15c910da5b44f0c93eb1c7df3b1f",
        "out": "bge_m3_italian",
        "prefix": "",
        "trust_remote_code": False,
    },
}
TABLES = {"guess": "context__vocab", "secret": "context__secrets"}


class ConfigurationError(RuntimeError):
    """Errore con istruzioni leggibili dall'utente."""


def normalize_word(value: object) -> str:
    """Normalizza per confronto; NON lemmatizza e NON elimina i plurali."""
    if not isinstance(value, str):
        return ""
    return unicodedata.normalize("NFC", value.strip()).casefold()


def qi(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def connect_readonly(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise ConfigurationError(f"Database non trovato: {path.resolve()}")
    uri = path.resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    return conn


def columns_of(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    present = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?", (table,)
    ).fetchone()
    if not present:
        options = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")]
        raise ConfigurationError(
            f"Tabella '{table}' non trovata. Tabelle presenti: {', '.join(options) or '(nessuna)'}"
        )
    cols = conn.execute(f"PRAGMA table_info({qi(table)})").fetchall()
    if not cols:
        raise ConfigurationError(f"Non riesco a leggere le colonne di '{table}'.")
    return cols


def detect_word_column(conn: sqlite3.Connection, table: str, specified: str | None) -> str:
    cols = columns_of(conn, table)
    names = {row['name'] for row in cols}
    if specified:
        if specified not in names:
            raise ConfigurationError(
                f"Colonna '{specified}' non presente in {table}. Colonne: {', '.join(sorted(names))}"
            )
        return specified

    scores: list[tuple[float, str]] = []
    for col in cols:
        name = str(col['name'])
        lower = name.casefold()
        typ = str(col['type'] or '').upper()
        if not any(x in typ for x in ('TEXT', 'CHAR', 'CLOB', 'VARCHAR')) and typ:
            continue
        if lower in {'id', 'uuid', 'hash', 'language', 'lingua', 'categoria', 'category',
                     'definition', 'definizione', 'descrizione', 'description', 'hint',
                     'created_at', 'updated_at', 'note', 'notes', 'type', 'tipo'}:
            continue
        score = 0.0
        if lower in {'parola', 'word', 'lemma', 'termine', 'vocabolo', 'term', 'testo',
                     'secret', 'segreta', 'soluzione', 'target', 'entry'}:
            score += 100
        if any(x in lower for x in ('parol', 'word', 'lemma', 'term', 'vocab', 'secret',
                                     'segre', 'soluz', 'target')):
            score += 45
        if any(x in lower for x in ('normaliz', 'normalized', 'folded')):
            score -= 5
        if any(x in lower for x in ('defini', 'descr', 'spieg', 'hint', 'indiz', 'note', 'slug')):
            score -= 70
        # Campionamento leggero e non distruttivo.
        sample_sql = f"SELECT {qi(name)} FROM {qi(table)} WHERE {qi(name)} IS NOT NULL LIMIT 60"
        try:
            sample = [row[0] for row in conn.execute(sample_sql)]
        except sqlite3.DatabaseError:
            sample = []
        text_values = [v.strip() for v in sample if isinstance(v, str) and v.strip()]
        if text_values:
            compact = sum(1 for v in text_values if len(v) <= 45 and len(v.split()) <= 3)
            score += 25 * compact / len(text_values)
            score += 5 * len(text_values) / max(1, len(sample))
        if not text_values and score < 80:
            continue
        scores.append((score, name))

    if not scores:
        raise ConfigurationError(
            f"Nessuna colonna testuale candidata in {table}. "
            "Usa --inspect e --vocab-column / --secrets-column."
        )
    scores.sort(key=lambda x: (-x[0], x[1]))
    best = scores[0]
    if len(scores) > 1 and best[0] - scores[1][0] < 10:
        alternatives = ', '.join(f'{name} ({score:.0f})' for score, name in scores[:5])
        raise ConfigurationError(
            f"Colonna delle parole ambigua in '{table}': {alternatives}. "
            "Specificala con --vocab-column o --secrets-column."
        )
    return best[1]


def print_schema(conn: sqlite3.Connection, vocab_col: str | None, secrets_col: str | None) -> None:
    for role, table in TABLES.items():
        print(f"\n[{table}] ({'tentativi ammessi' if role == 'guess' else 'parole segrete'})")
        cols = columns_of(conn, table)
        for col in cols:
            print(f"  - {col['name']} ({col['type'] or 'tipo non dichiarato'})"
                  f"{' [PK]' if col['pk'] else ''}")
        count = conn.execute(f"SELECT COUNT(*) FROM {qi(table)}").fetchone()[0]
        print(f"  Righe: {count:,}")
        try:
            chosen = detect_word_column(
                conn, table, vocab_col if role == 'guess' else secrets_col
            )
            print(f"  Colonna scelta per le parole: {chosen}")
            few = conn.execute(f"SELECT {qi(chosen)} FROM {qi(table)} LIMIT 5").fetchall()
            print("  Esempi:", [r[0] for r in few])
        except ConfigurationError as exc:
            print(f"  ATTENZIONE: {exc}")


def table_entries(conn: sqlite3.Connection, table: str, word_col: str):
    cols = columns_of(conn, table)
    pk_cols = [r['name'] for r in sorted(cols, key=lambda r: r['pk']) if r['pk']]
    # Se disponibile, conserva la chiave primaria originale; altrimenti ROWID.
    if pk_cols:
        id_exprs = ', '.join(qi(x) for x in pk_cols)
        sql = f"SELECT {id_exprs}, {qi(word_col)} FROM {qi(table)}"
        for row in conn.execute(sql):
            key = row[0] if len(pk_cols) == 1 else list(row[:len(pk_cols)])
            yield key, row[len(pk_cols)]
    else:
        sql = f"SELECT rowid, {qi(word_col)} FROM {qi(table)}"
        try:
            for row in conn.execute(sql):
                yield row[0], row[1]
        except sqlite3.OperationalError as exc:
            raise ConfigurationError(
                f"La tabella {table} non ha PK e non permette rowid: "
                "serve una colonna identificativa."
            ) from exc


def load_lexicon(conn: sqlite3.Connection, vocab_col: str | None,
                 secrets_col: str | None):
    metadata = defaultdict(lambda: {"guess_ids": [], "secret_ids": []})
    selected_cols: dict[str, str] = {}
    invalid_counts = {"guess": 0, "secret": 0}

    for role, table in TABLES.items():
        specified = vocab_col if role == "guess" else secrets_col
        col = detect_word_column(conn, table, specified)
        selected_cols[table] = col
        for row_id, value in table_entries(conn, table, col):
            word = normalize_word(value)
            if not word:
                invalid_counts[role] += 1
                continue
            # La riga conserva entrambi i ruoli; niente sostituzione con il lemma.
            metadata[word][role + "_ids"].append(row_id)

    words = sorted(metadata)
    guess_count = sum(bool(metadata[w]["guess_ids"]) for w in words)
    secret_count = sum(bool(metadata[w]["secret_ids"]) for w in words)
    if not guess_count:
        raise ConfigurationError("La tabella context__vocab non contiene parole leggibili.")
    if not secret_count:
        raise ConfigurationError("La tabella context__secrets non contiene parole leggibili.")
    # Evita ricalcoli inutili se SQLite restituisce righe in ordine differente.
    for record in metadata.values():
        record['guess_ids'].sort(key=lambda x: json.dumps(x, ensure_ascii=False, default=str))
        record['secret_ids'].sort(key=lambda x: json.dumps(x, ensure_ascii=False, default=str))
    return words, metadata, selected_cols, invalid_counts



def save_index(path: Path, words: list[str], metadata) -> None:
    with path.open('w', encoding='utf-8', newline='') as file:
        writer = csv.writer(file)
        writer.writerow([
            'matrix_index', 'word', 'in_context__vocab', 'in_context__secrets',
            'vocab_source_ids_json', 'secrets_source_ids_json'
        ])
        for index, word in enumerate(words):
            entry = metadata[word]
            writer.writerow([
                index, word, int(bool(entry['guess_ids'])),
                int(bool(entry['secret_ids'])),
                json.dumps(entry['guess_ids'], ensure_ascii=False, default=str),
                json.dumps(entry['secret_ids'], ensure_ascii=False, default=str),
            ])




def fingerprint(words, metadata, selected_cols, spec: dict, max_seq_length: int) -> str:
    digest = hashlib.sha256()
    digest.update(json.dumps({
        "spec": spec, "code_version": VERSION, "columns": selected_cols,
        "max_seq_length": max_seq_length,
    }, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    for word in words:
        record = metadata[word]
        digest.update(json.dumps(
            [word, record["guess_ids"], record["secret_ids"]],
            ensure_ascii=False, sort_keys=True, default=str
        ).encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def _load_transformer(spec: dict, device: str = "auto", max_seq_length: int = 64):
    from sentence_transformers import SentenceTransformer
    from huggingface_hub import snapshot_download
    snapshot = Path(snapshot_download(
        spec["repo"], revision=spec["revision"],
        allow_patterns=["*.json", "model.safetensors", "1_Pooling/*", "2_Normalize/*",
                        "configuration.py", "modeling.py"],
    ))
    if spec["trust_remote_code"]:
        reviewed = {
            "configuration.py": "04d09df14840fec32e4403bf679774fed2888fb710e3fccdfce6cb88b07da85f",
            "modeling.py": "b85c8f043c8bdd299f3df86aaf1510b1bd14d3667a53e5ec580360f44be114db",
        }
        for name, expected in reviewed.items():
            with (snapshot / name).open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                    raise ConfigurationError("Codice EuroDense diverso dalla revisione esaminata")
    kwargs = {"trust_remote_code": spec["trust_remote_code"]}
    if spec["trust_remote_code"]:
        # The reviewed implementation supports padded eager attention without
        # xformers. Keep its weights/pooling; only select the supported backend.
        kwargs["config_kwargs"] = {"unpad_inputs": False, "use_memory_efficient_attention": False}
    if device != "auto":
        kwargs["device"] = device
    model = SentenceTransformer(str(snapshot), **kwargs)
    if spec["trust_remote_code"]:
        target = model[0].auto_model
        import inspect
        if (not hasattr(target, "get_extended_attention_mask") or
                "device" not in inspect.signature(target.get_extended_attention_mask).parameters):
            import types
            import torch
            def extended_mask(self, mask, input_shape, device=None, dtype=None):
                if getattr(self.config, "is_decoder", False) or mask.ndim not in (2, 3):
                    raise ConfigurationError("Maschera EuroDense non supportata")
                mask = mask[:, None, None, :] if mask.ndim == 2 else mask[:, None, :, :]
                dtype = dtype or self.dtype
                return (1.0 - mask.to(dtype=dtype)) * torch.finfo(dtype).min
            target.get_extended_attention_mask = types.MethodType(extended_mask, target)
    # Per singole parole + prefisso, 64 token sono sufficienti nella maggior
    # parte dei casi; lasciare configurabile per esperimenti successivi.
    if max_seq_length:
        actual = model.max_seq_length
        if actual is None or actual > max_seq_length:
            model.max_seq_length = max_seq_length
    return model


def _encode(model, words: list[str], prefix: str, batch_size: int) -> np.ndarray:
    if not words:
        raise ValueError("Occorre almeno una parola.")
    inputs = [prefix + w for w in words]
    vectors = np.asarray(model.encode(
        inputs, batch_size=batch_size, convert_to_numpy=True,
        show_progress_bar=False, normalize_embeddings=False
    ), dtype=np.float32)
    if vectors.ndim != 2 or vectors.shape[0] != len(words):
        raise RuntimeError(f"Shape embeddings non valida: {vectors.shape}")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    valid = np.isfinite(vectors).all(axis=1) & (norms[:, 0] > 1e-12)
    vectors[~valid] = 0.0
    vectors[valid] /= norms[valid]
    return vectors


def carica_eurodense(device: str = "auto", max_seq_length: int = 64):
    """Scarica (se necessario) EuroDense-435M e lo carica una volta sola."""
    return _load_transformer(MODELS["eurodense"], device, max_seq_length)


def carica_bge_m3_italian(device: str = "auto", max_seq_length: int = 64):
    """Scarica (se necessario) BGE-M3 Italian e lo carica una volta sola."""
    return _load_transformer(MODELS["bge-m3-italian"], device, max_seq_length)


def embeddings_eurodense(parole: list[str], model=None, batch_size: int = 16,
                         device: str = "auto") -> np.ndarray:
    """Vettori L2 EuroDense; per la similarita' applica il prefisso del modello."""
    if model is None:
        model = carica_eurodense(device)
    return _encode(model, parole, MODELS["eurodense"]["prefix"], batch_size)


def embeddings_bge_m3_italian(parole: list[str], model=None, batch_size: int = 16,
                              device: str = "auto") -> np.ndarray:
    """Vettori dense L2 BGE-M3 Italian; non utilizza teste sparse/ColBERT."""
    if model is None:
        model = carica_bge_m3_italian(device)
    return _encode(model, parole, MODELS["bge-m3-italian"]["prefix"], batch_size)


def _atomic_json(path: Path, data: dict) -> None:
    tmp = path.with_name(path.name + ".tmp")
    content = json.dumps(data, indent=2, ensure_ascii=False)
    for attempt in range(10):
        try:
            tmp.write_text(content, encoding="utf-8")
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == 9:
                raise
            # Windows scanners/readers can briefly hold the destination open.
            time.sleep(min(0.05 * 2 ** attempt, 1.0))


def build_embeddings(out: Path, words: list[str], metadata, selected_cols: dict,
                     invalid_counts: dict, digest: str, batch_size: int, spec: dict,
                     device: str = "auto", max_seq_length: int = 64,
                     force: bool = False) -> dict:
    """Build riprendibile: checkpoint per batch e salvataggio senza modificare SQLite."""
    out.mkdir(parents=True, exist_ok=True)
    matrix_path = out / "embeddings.npy"
    temp_path = out / "embeddings.partial.npy"
    progress_path = out / "progress.json"
    print(f"Caricamento {spec['repo']} (download automatico la prima volta)...")
    model = _load_transformer(spec, device=device, max_seq_length=max_seq_length)
    total = len(words)
    if force:
        temp_path.unlink(missing_ok=True)
        progress_path.unlink(missing_ok=True)
    mmap = None
    next_index = 0
    if temp_path.is_file() and progress_path.is_file():
        try:
            state = json.loads(progress_path.read_text(encoding="utf-8"))
            mm = np.load(temp_path, mmap_mode="r+")
            if (state.get("fingerprint") == digest and
                state.get("model_repo") == spec["repo"] and
                state.get("next_index", -1) >= 0 and
                state.get("next_index", -1) <= total and
                mm.ndim == 2 and mm.shape[0] == total and mm.dtype == np.float32):
                mmap = mm
                del mm
                next_index = int(state["next_index"])
                print(f"Ripresa checkpoint: {next_index:,}/{total:,} parole")
            else:
                del mm
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            pass
    if mmap is None:
        temp_path.unlink(missing_ok=True)
        progress_path.unlink(missing_ok=True)

    try:
        for start in range(next_index, total, batch_size):
            batch = words[start:start+batch_size]
            vectors = _encode(model, batch, spec["prefix"], batch_size)
            if mmap is None:
                mmap = np.lib.format.open_memmap(
                    temp_path, mode="w+", dtype=np.float32,
                    shape=(total, vectors.shape[1])
                )
            if vectors.shape[1] != mmap.shape[1]:
                raise RuntimeError("La dimensione dell'embedding e' cambiata tra batch.")
            mmap[start:start+len(batch)] = vectors
            mmap.flush()
            _atomic_json(progress_path, {
                "fingerprint": digest, "model_repo": spec["repo"],
                "next_index": start+len(batch)
            })
            if start == 0 or (start // batch_size) % 25 == 0 or start + len(batch) >= total:
                print(f"  {start+len(batch):,}/{total:,} parole", flush=True)
    finally:
        if mmap is not None:
            mmap.flush()
            del mmap
        del model

    # La ricerca dei vettori invalidi e' effettuata sull'artefatto completo.
    mmap = np.load(temp_path, mmap_mode="r")
    invalid = np.flatnonzero(~np.isfinite(mmap).all(axis=1) |
                                 (np.linalg.norm(mmap, axis=1) < 1e-12))
    bad = [words[i] for i in invalid]
    dim = mmap.shape[1]
    del mmap
    if bad:
        (out / "invalid_embeddings.txt").write_text(
            "\n".join(bad) + "\n", encoding="utf-8")
    else:
        (out / "invalid_embeddings.txt").unlink(missing_ok=True)
    temp_path.replace(matrix_path)
    save_index(out / "vocab_index.csv", words, metadata)
    manifest = {
        "version": VERSION,
        "model_repo": spec["repo"],
        "model_revision": spec["revision"],
        "generator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "fingerprint": digest,
        "vocab_size": total,
        "guessable_words": sum(bool(metadata[w]["guess_ids"]) for w in words),
        "secret_words": sum(bool(metadata[w]["secret_ids"]) for w in words),
        "embedding_dim": dim,
        "dtype": "float32",
        "l2_normalized": True,
        "input_prefix": spec["prefix"],
        "max_seq_length": max_seq_length,
        "sqlite_tables": TABLES,
        "sqlite_word_columns": selected_cols,
        "skipped_empty_or_nontext_rows": invalid_counts,
        "invalid_embedding_count": len(bad),
        "embedding_file": "embeddings.npy",
        "index_file": "vocab_index.csv",
        "ranking_scope": "context__vocab + parola bersaglio",
        "warning": "Punteggi non confrontabili direttamente fra modelli; validare su parole italiane."
    }
    _atomic_json(out / "manifest.json", manifest)
    progress_path.unlink(missing_ok=True)
    return manifest



def show_neighbors(out: Path, target: str, top: int, allow_nonsecret: bool) -> None:
    manifest_path = out / 'manifest.json'
    if not manifest_path.exists():
        raise ConfigurationError('Nessuna matrice generata; lancia prima lo script senza --target.')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    matrix = np.load(out / 'embeddings.npy', mmap_mode='r')
    words = []
    guessable = []
    secret = []
    with (out / 'vocab_index.csv').open(encoding='utf-8', newline='') as file:
        for row in csv.DictReader(file):
            words.append(row['word'])
            guessable.append(row['in_context__vocab'] == '1')
            secret.append(row['in_context__secrets'] == '1')
    lookup = {w: i for i, w in enumerate(words)}
    word = normalize_word(target)
    if word not in lookup:
        raise ConfigurationError(f"'{target}' non presente in context__secrets o context__vocab.")
    target_index = lookup[word]
    if not secret[target_index] and not allow_nonsecret:
        raise ConfigurationError(
            f"'{target}' non è in context__secrets. Usa --allow-nonsecret-target per testarlo comunque."
        )
    # Il ranking comprende soltanto le parole ammesse in context__vocab,
    # più il target stesso se compare solo tra i segreti.
    eligible = np.asarray(guessable, dtype=bool)
    eligible[target_index] = True
    norms = np.linalg.norm(matrix[target_index])
    if norms <= 1e-12 or not np.isfinite(norms):
        raise ConfigurationError(f"Embedding non valido per '{word}'.")
    scores = np.asarray(matrix @ matrix[target_index], dtype=np.float32)
    scores[~eligible] = -np.inf
    scores[~np.isfinite(scores)] = -np.inf
    # Ordinamento stabile: in caso di punteggio uguale, ordine alfabetico
    # (words è già ordinato). Nessuna garanzia di rank 1 per il bersaglio
    # se esistono embeddings identici, ma il target ha coseno teorico 1.
    order = np.argsort(-scores, kind='stable')
    shown = 0
    print(f"\nModello: {manifest['model_repo']}")
    print(f"Bersaglio: {word} | vicini fra parole ammesse in context__vocab")
    print(f"{'Rango':>6}  {'Parola':<32} {'Coseno':>9}")
    print('-' * 54)
    for rank, i in enumerate(order, start=1):
        if not np.isfinite(scores[i]):
            break
        if i == target_index:
            continue
        print(f"{rank:>6}  {words[i]:<32} {scores[i]:>9.5f}")
        shown += 1
        if shown >= top:
            break



def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="ZeroContext SQLite: embeddings EuroDense o BGE-M3 Italian"
    )
    parser.add_argument("--model", choices=["eurodense", "bge-m3-italian", "both"],
                        default="eurodense")
    parser.add_argument("--db", default="giochi.sqlite3")
    parser.add_argument("--output-root", default="outputs")
    parser.add_argument("--vocab-column", default=None)
    parser.add_argument("--secrets-column", default=None)
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-seq-length", type=int, default=64)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--target", default=None)
    parser.add_argument("--top", type=int, default=30)
    parser.add_argument("--allow-nonsecret-target", action="store_true")
    args = parser.parse_args(argv)
    if args.batch_size < 1 or args.max_seq_length < 1 or args.top < 1:
        parser.error("batch-size, max-seq-length e top devono essere > 0")
    selected = list(MODELS) if args.model == "both" else [args.model]
    try:
        with connect_readonly(Path(args.db)) as conn:
            if args.inspect:
                print_schema(conn, args.vocab_column, args.secrets_column)
                return 0
            words, metadata, cols, skipped = load_lexicon(
                conn, args.vocab_column, args.secrets_column
            )
        print(f"Parole uniche: {len(words):,} | Colonne: {cols}")
        for name in selected:
            spec = MODELS[name]
            out = Path(args.output_root) / spec["out"]
            digest = fingerprint(words, metadata, cols, spec, args.max_seq_length)
            manifest_path = out / "manifest.json"
            cached = False
            if (not args.force
                and not (out / "embeddings.partial.npy").exists()
                and not (out / "progress.json").exists()
                and all(p.exists() for p in (
                    manifest_path, out / "embeddings.npy", out / "vocab_index.csv"
                ))):
                try:
                    old = json.loads(manifest_path.read_text(encoding="utf-8"))
                    cached = (old.get("fingerprint") == digest and
                              old.get("model_repo") == spec["repo"])
                except (OSError, ValueError):
                    pass
            if cached:
                print(f"Cache valida, niente download/ricalcolo: {out}")
            else:
                result = build_embeddings(
                    out, words, metadata, cols, skipped, digest,
                    args.batch_size, spec, device=args.device,
                    max_seq_length=args.max_seq_length, force=args.force
                )
                print(f"Salvato: {out / 'embeddings.npy'} "
                      f"({result['vocab_size']:,} x {result['embedding_dim']})")
            if args.target:
                show_neighbors(out, args.target, args.top, args.allow_nonsecret_target)
        if not args.target:
            print(f'Per cercare i vicini: py zerocontext_models_italiani.py --model {selected[0]} --target "mare" --top 30')
        return 0
    except (ConfigurationError, sqlite3.Error, OSError, ImportError, RuntimeError, ValueError) as exc:
        print(f"ERRORE: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
