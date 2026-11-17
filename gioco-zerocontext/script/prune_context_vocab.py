"""Toglie dai dati pubblicati di ZeroContext le parole che il vocabolario non deve più avere (i plurali puri, decisione
del 15/11/2026), senza rigenerare i vettori.

build_context_data.py li esclude già a ogni generazione; questo script porta i dati pubblicati alla stessa regola senza
rifarli da capo (gli ingressi della generazione completa, banca e frequenze, non sono sempre disponibili). Le parole
rimaste tengono i loro vettori: tra loro l'ordine di vicinanza non cambia, le posizioni salgono solo perché davanti ci
sono meno parole. Le parole segrete escluse escono anche dalle segrete; i collegamenti si rinumerano.

Uso:  python script/prune_context_vocab.py [--dry-run]
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'database' / 'script'))
import giochi  # noqa: E402
from context_vocabulary import pure_plurals  # noqa: E402

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / 'data'
CACHE = HERE / '.cache'
RAW = HERE.parent / 'database' / 'parole_ita_raw.sqlite3'


def prune(vocab: list[str], vectors: np.ndarray, secrets: list[str], links: list[tuple[int, int]], excluded: set[str]):
    """Vocabolario, vettori, segrete e collegamenti senza le parole `excluded`, nello stesso ordine."""
    keep = [i for i, w in enumerate(vocab) if w not in excluded]
    renumber = {old: new for new, old in enumerate(keep)}
    return ([vocab[i] for i in keep], vectors[keep], [s for s in secrets if s not in excluded],
            sorted((renumber[s], renumber[w]) for s, w in links if s in renumber and w in renumber))


def current_hubs() -> list[int] | None:
    """Le penalità di genericità pubblicate, nell'ordine del vocabolario (None se il DB non le ha)."""
    with closing(sqlite3.connect(giochi.FILE.resolve().as_uri() + '?mode=ro', uri=True)) as con:
        if not con.execute("SELECT 1 FROM sqlite_schema WHERE name = 'context__hubs'").fetchone():
            return None
        return [p for p, in con.execute('SELECT penalty FROM context__hubs ORDER BY idx')]


def current() -> tuple[list[str], list[str], list[tuple[int, int]], dict]:
    with closing(sqlite3.connect(giochi.FILE.resolve().as_uri() + '?mode=ro', uri=True)) as con:
        vocab = [w for w, in con.execute('SELECT word FROM context__vocab ORDER BY idx')]
        secrets = [w for w, in con.execute('SELECT word FROM context__secrets ORDER BY word')]
        links = [(s, w) for s, w in con.execute('SELECT secret_idx, word_idx FROM context__links')]
        meta = {k: json.loads(v) for k, v in con.execute('SELECT name, value FROM context__meta')}
    return vocab, secrets, links, meta


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--dry-run', action='store_true', help='conta e mostra, senza scrivere nulla')
    args = ap.parse_args()
    vocab, secrets, links, meta = current()
    from publish_context import active_vectors
    source_vectors = active_vectors(meta, DATA)
    raw = np.fromfile(source_vectors, dtype=np.int8)
    dim = int(meta['dim'])
    if raw.size != len(vocab) * dim:
        raise SystemExit(f'vectors.bin ({raw.size} valori) non corrisponde a {len(vocab)} parole x {dim}')
    vectors = raw.reshape(len(vocab), dim)
    excluded = pure_plurals(vocab, RAW)
    new_vocab, new_vectors, new_secrets, new_links = prune(vocab, vectors, secrets, links, set(excluded))
    hubs = current_hubs()
    # Le penalità restano quelle delle parole rimaste, come i vettori (non si ricalcolano per un vicinato un po' più piccolo).
    new_hubs = None if hubs is None else [h for w, h in zip(vocab, hubs) if w not in excluded]
    removed_secrets = sorted(set(secrets) - set(new_secrets))
    print(f'parole {len(vocab)} -> {len(new_vocab)} (-{len(vocab) - len(new_vocab)} plurali puri)')
    print(f'segrete {len(secrets)} -> {len(new_secrets)} (tolte: {", ".join(removed_secrets) or "nessuna"})')
    print(f'collegamenti {len(links)} -> {len(new_links)}')
    if args.dry_run or len(new_vocab) == len(vocab):
        return
    backup = CACHE / 'backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup.mkdir(parents=True)
    with closing(sqlite3.connect(giochi.FILE)) as source, closing(sqlite3.connect(backup / 'giochi.sqlite3')) as target:
        source.backup(target)
    for name in ('vectors.bin', 'vocab.txt', 'secrets.txt', 'meta.json', 'links.json'):
        if (DATA / name).exists():
            shutil.copy2(DATA / name, backup / name)
    new_meta = {**meta, 'words': len(new_vocab), 'secrets': len(new_secrets), 'links': len(new_links)}
    if source_vectors.name != 'vectors.bin':
        shutil.copy2(source_vectors, backup / source_vectors.name)
    for key in ('vectors_file', 'vectors_sha256', 'corpus_revision'):
        new_meta.pop(key, None)  # questo generatore storico scrive il proprio vectors.bin
    (DATA / 'vectors.bin.part').write_bytes(np.ascontiguousarray(new_vectors).tobytes())
    giochi.write_context(new_vocab, new_secrets, new_meta, new_links, new_hubs)
    (DATA / 'vectors.bin.part').replace(DATA / 'vectors.bin')
    (DATA / 'vocab.txt').write_text('\n'.join(new_vocab) + '\n', encoding='utf-8', newline='\n')
    (DATA / 'secrets.txt').write_text('\n'.join(new_secrets) + '\n', encoding='utf-8', newline='\n')
    (DATA / 'meta.json').write_text(json.dumps(new_meta, indent=2) + '\n', encoding='utf-8')
    grouped: dict[str, list[int]] = {}
    for s, w in new_links:
        grouped.setdefault(str(s), []).append(w)
    (DATA / 'links.json').write_text(json.dumps({'boost': meta.get('link_boost', 0), 'links': grouped,
                                                **({'hubs': new_hubs} if new_hubs is not None else {})}) + '\n', encoding='utf-8')
    report = {'updated_at': datetime.now(timezone.utc).isoformat(), 'kind': 'pruned', 'previous_words': len(vocab),
              'words': len(new_vocab), 'removed_pure_plurals': len(excluded), 'removed_secrets': removed_secrets,
              'secrets': len(new_secrets), 'links': len(new_links), 'dim': dim,
              'policy': 'Plurali puri fuori dal vocabolario (context_vocabulary.pure_plurals), vettori invariati.',
              'vocab_sha256': hashlib.sha256(('\n'.join(new_vocab) + '\n').encode()).hexdigest(),
              'vectors_sha256': hashlib.sha256(np.ascontiguousarray(new_vectors).tobytes()).hexdigest(), 'backup': str(backup)}
    (HERE / 'reports').mkdir(exist_ok=True)
    (HERE / 'reports/vocabulary_prune.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Pubblicate {len(new_vocab)} parole; copia della versione precedente in {backup}')


if __name__ == '__main__':
    main()
