"""Divisione fissa delle segrete in «misura» e «sviluppo».

La regola non cambia mai: il ranking e ogni lavoro per migliorarlo usano solo lo sviluppo, la misura serve
a controllare (spec, sezione 6.1).
"""
from __future__ import annotations

import hashlib
import unicodedata
from typing import Literal

SPLIT_RULE = "sha256-utf8-mod5-eq0"

Split = Literal['misura', 'sviluppo']


def is_measure(word: str) -> bool:
    digest = hashlib.sha256(unicodedata.normalize('NFC', word).lower().encode('utf-8')).hexdigest()
    return int(digest, 16) % 5 == 0


def split_of(word: str) -> Split:
    return 'misura' if is_measure(word) else 'sviluppo'


def subsets(split: str, has_gold: bool, group: str) -> list[str]:
    """Le chiavi dei sottoinsiemi a cui appartiene una segreta: tutte, con/senza associazioni, gruppo di raw 2.0."""
    return [f'{split}:tutte', f'{split}:{"con_associazioni" if has_gold else "senza_associazioni"}', f'{split}:{group}']
