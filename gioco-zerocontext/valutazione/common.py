"""Funzioni comuni: apertura dei database in sola lettura e normalizzazione delle parole."""
from __future__ import annotations

import hashlib
from pathlib import Path
import sqlite3
import unicodedata


def norm(word: str) -> str:
    return unicodedata.normalize('NFC', word).lower()


def connect_ro(path: Path) -> sqlite3.Connection:
    """Apre un database SQLite in sola lettura. Va chiuso subito dopo l'uso (closing): su Windows una connessione aperta
    impedisce di cancellare o sostituire il file."""
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def sha256_file(path: Path, chunk: int = 1 << 24) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(chunk), b''):
            digest.update(block)
    return digest.hexdigest()
