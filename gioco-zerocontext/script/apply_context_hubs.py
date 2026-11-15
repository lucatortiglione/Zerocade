"""Aggiunge ai dati pubblicati di ZeroContext la penalità di genericità (hubness.py) senza rigenerare i vettori.

build_context_data.py la calcola a ogni generazione; questo script porta i dati già pubblicati alla stessa regola
(gli ingressi della generazione completa non sono sempre disponibili). Scrive la tabella context__hubs, il campo
hubs di data/links.json e hub_strength nei metadati. Prima copia la versione attuale in .cache/backups.

Uso:  python script/apply_context_hubs.py [--strength 0.5] [--dry-run]
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import sqlite3
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'database' / 'script'))
import giochi  # noqa: E402
from hubness import STRENGTH, hub_penalties  # noqa: E402
from prune_context_vocab import CACHE, DATA, current  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--strength', type=float, default=STRENGTH)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    vocab, secrets, links, meta = current()
    dim = int(meta['dim'])
    q = np.fromfile(DATA / 'vectors.bin', dtype=np.int8)
    if q.size != len(vocab) * dim:
        raise SystemExit('vectors.bin non corrisponde al vocabolario')
    q = q.reshape(len(vocab), dim)
    hubs = hub_penalties(q, args.strength)
    print(f'parole {len(vocab)}  penalità: media {hubs.mean():.0f}, minima {hubs.min()}, massima {hubs.max()} '
          f'(link_boost {meta.get("link_boost")})')
    if args.dry_run:
        return
    backup = CACHE / 'backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup.mkdir(parents=True)
    with closing(sqlite3.connect(giochi.FILE)) as source, closing(sqlite3.connect(backup / 'giochi.sqlite3')) as target:
        source.backup(target)
    for name in ('meta.json', 'links.json'):
        if (DATA / name).exists():
            shutil.copy2(DATA / name, backup / name)
    new_meta = {**meta, 'hub_strength': args.strength}
    giochi.write_context(vocab, secrets, new_meta, links, hubs.tolist())
    (DATA / 'meta.json').write_text(json.dumps(new_meta, indent=2) + '\n', encoding='utf-8')
    grouped: dict[str, list[int]] = {}
    for s, w in links:
        grouped.setdefault(str(s), []).append(w)
    (DATA / 'links.json').write_text(json.dumps({'boost': meta.get('link_boost', 0), 'links': grouped, 'hubs': hubs.tolist()}) + '\n',
                                     encoding='utf-8')
    print(f'Penalità scritte; copia della versione precedente in {backup}')


if __name__ == '__main__':
    main()
