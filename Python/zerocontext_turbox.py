#!/usr/bin/env python3
"""ZeroContext: embeddings Model2Vec per i lessici SQLite del gioco.

Eseguire con Python >=3.10. Questo file viene distribuito come script autonomo
per uno specifico modello Hugging Face.

Esempi:
    python zerocontext_turbox.py --inspect
    python zerocontext_turbox.py --db giochi.sqlite3
    python zerocontext_turbox.py --target "mare" --top 25
    python zerocontext_turbox.py --force

Dipendenze: pip install -U model2vec numpy
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

MODEL_REPO = "C10X/Qwen3-Embedding-TurboX"
DEFAULT_OUTPUT = "outputs/turbox"
VERSION = "1.0"
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


def fingerprint(words, metadata, selected_cols) -> str:
    digest = hashlib.sha256()
    digest.update((MODEL_REPO + VERSION).encode())
    digest.update(json.dumps(selected_cols, sort_keys=True).encode())
    for word in words:
        record = metadata[word]
        digest.update(json.dumps(
            [word, record['guess_ids'], record['secret_ids']],
            ensure_ascii=False, sort_keys=True, default=str
        ).encode('utf-8'))
        digest.update(b'\n')
    return digest.hexdigest()


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


def build_embeddings(out: Path, words: list[str], metadata, selected_cols: dict,
                     invalid_counts: dict, digest: str, batch_size: int) -> dict:
    from model2vec import StaticModel

    out.mkdir(parents=True, exist_ok=True)
    matrix_path = out / 'embeddings.npy'
    temporary = out / 'embeddings.partial.npy'
    print(f"\nCaricamento {MODEL_REPO} (download automatico alla prima esecuzione)...")
    model = StaticModel.from_pretrained(MODEL_REPO)

    if temporary.exists():
        temporary.unlink()
    total = len(words)
    bad = []
    mmap = None
    try:
        for start in range(0, total, batch_size):
            batch = words[start:start + batch_size]
            encoded = np.asarray(model.encode(batch), dtype=np.float32)
            if encoded.ndim != 2 or encoded.shape[0] != len(batch):
                raise RuntimeError(f"Dimensione imprevista per il batch {start}: {encoded.shape}")
            if mmap is None:
                mmap = np.lib.format.open_memmap(
                    temporary, mode='w+', dtype=np.float32,
                    shape=(total, encoded.shape[1])
                )
            if encoded.shape[1] != mmap.shape[1]:
                raise RuntimeError('Dimensioni degli embeddings non costanti.')

            norms = np.linalg.norm(encoded, axis=1, keepdims=True)
            valid = np.isfinite(encoded).all(axis=1) & (norms[:, 0] > 1e-12)
            bad.extend(words[start + j] for j in np.where(~valid)[0])
            encoded[~valid] = 0
            encoded[valid] /= norms[valid]
            mmap[start:start + len(batch)] = encoded
            print(f"  {min(start + len(batch), total):,}/{total:,} parole", end='\r', flush=True)
        mmap.flush()
    except BaseException:
        del mmap
        if temporary.exists():
            temporary.unlink()
        raise
    del mmap
    print()
    temporary.replace(matrix_path)
    save_index(out / 'vocab_index.csv', words, metadata)
    if bad:
        (out / 'invalid_embeddings.txt').write_text('\n'.join(bad) + '\n', encoding='utf-8')
        print(f"ATTENZIONE: {len(bad)} vettori nulli/non validi (vedi invalid_embeddings.txt).")
    manifest = {
        'version': VERSION, 'model_repo': MODEL_REPO, 'created_at_utc': datetime.now(timezone.utc).isoformat(),
        'fingerprint': digest, 'vocab_size': total,
        'guessable_words': sum(bool(metadata[w]['guess_ids']) for w in words),
        'secret_words': sum(bool(metadata[w]['secret_ids']) for w in words),
        'embedding_dim': int(np.load(matrix_path, mmap_mode='r').shape[1]),
        'dtype': 'float32', 'l2_normalized': True,
        'sqlite_tables': TABLES, 'sqlite_word_columns': selected_cols,
        'skipped_empty_or_nontext_rows': invalid_counts,
        'invalid_embedding_count': len(bad),
        'embedding_file': 'embeddings.npy', 'index_file': 'vocab_index.csv',
        'ranking_scope': 'context__vocab + parola bersaglio',
        'warning': 'Non trattare i punteggi come confrontabili fra modelli differenti.'
    }
    (out / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8'
    )
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description=f"ZeroContext SQLite → embeddings statici con {MODEL_REPO}"
    )
    parser.add_argument('--db', default='giochi.sqlite3', help='Percorso del database SQLite')
    parser.add_argument('--output', default=DEFAULT_OUTPUT, help='Cartella artefatti')
    parser.add_argument('--vocab-column', help='Colonna parole in context__vocab (auto per default)')
    parser.add_argument('--secrets-column', help='Colonna parole in context__secrets (auto per default)')
    parser.add_argument('--inspect', action='store_true', help='Mostra schema e colonna scelta, senza scaricare modelli')
    parser.add_argument('--batch-size', type=int, default=512, help='Parole per batch (default 512)')
    parser.add_argument('--force', action='store_true', help='Ricrea gli embeddings anche se già aggiornati')
    parser.add_argument('--target', help='Mostra i vicini per una parola segreta (dopo la build)')
    parser.add_argument('--top', type=int, default=30, help='Numero vicini da mostrare')
    parser.add_argument('--allow-nonsecret-target', action='store_true', help='Permetti test su parole non segrete')
    args = parser.parse_args()
    if args.batch_size < 1 or args.top < 1:
        parser.error('--batch-size e --top devono essere maggiori di zero')

    db = Path(args.db)
    out = Path(args.output)
    try:
        with connect_readonly(db) as conn:
            if args.inspect:
                print_schema(conn, args.vocab_column, args.secrets_column)
                return 0
            words, metadata, cols, skipped = load_lexicon(
                conn, args.vocab_column, args.secrets_column
            )
        digest = fingerprint(words, metadata, cols)
        guess_count = sum(bool(metadata[w]['guess_ids']) for w in words)
        secret_count = sum(bool(metadata[w]['secret_ids']) for w in words)
        print(f"DB: {db.resolve()}")
        print(f"Colonne: {cols}")
        print(f"Parole uniche totali: {len(words):,} | tentativi: {guess_count:,} | segrete: {secret_count:,}")
        print(f"Righe saltate (vuote/non testuali): {skipped}")
        manifest_path = out / 'manifest.json'
        cached = False
        if not args.force and manifest_path.exists() and (out / 'embeddings.npy').exists() and (out / 'vocab_index.csv').exists():
            try:
                old = json.loads(manifest_path.read_text(encoding='utf-8'))
                cached = (old.get('fingerprint') == digest and old.get('model_repo') == MODEL_REPO)
            except (OSError, ValueError):
                cached = False
        if cached:
            print(f"Cache aggiornata, nessun download o ricalcolo: {out}")
        else:
            result = build_embeddings(out, words, metadata, cols, skipped, digest, args.batch_size)
            print(f"Embeddings pronti: {out / 'embeddings.npy'} "
                  f"({result['vocab_size']:,} × {result['embedding_dim']})")
        if args.target:
            show_neighbors(out, args.target, args.top, args.allow_nonsecret_target)
        else:
            print('Per vedere i vicini: python zerocontext_turbox.py --target "mare" --top 25')
        return 0
    except (ConfigurationError, sqlite3.Error, OSError, ImportError) as exc:
        print(f"ERRORE: {exc}", file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
