"""Reimporta gli indici dei due generatori, preservando i vettori attivi.

Accetta solo indici identici al corpus attivo, anche nell'ordine: inventari
diversi richiedono la pubblicazione congiunta di parole e vettori tramite
gioco-zerocontext/script/publish_context.py. Crea sempre un backup SQLite.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from filelock import FileLock


ROOT = Path(__file__).resolve().parent.parent


def read_index(directory: Path):
    with (directory / "vocab_index.csv").open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    words = []
    secrets = []
    for idx, row in enumerate(rows):
        if int(row["matrix_index"]) != idx or not row["word"].strip():
            raise ValueError("Indice non contiguo o parola vuota")
        if row["in_context__vocab"] != "1" or row["in_context__secrets"] not in {"0", "1"}:
            raise ValueError("Ruoli non compatibili con il corpus attivo")
        words.append((idx, row["word"]))
        if row["in_context__secrets"] == "1":
            secrets.append(row["word"])
    if len({w for _, w in words}) != len(words):
        raise ValueError("Parole duplicate")
    if len(words) != manifest["vocab_size"] or len(secrets) != manifest["secret_words"]:
        raise ValueError("Manifest e indice non corrispondono")
    return words, sorted(secrets)


def inventory(con):
    return (
        list(con.execute("SELECT idx,word FROM context__vocab ORDER BY idx")),
        [r[0] for r in con.execute("SELECT word FROM context__secrets ORDER BY word")],
    )


def table_digests(con):
    """Confronta tutte le tabelle, comprese quelle degli altri giochi."""
    result = {}
    for (name,) in con.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        quoted = '"' + name.replace('"', '""') + '"'
        columns = len(con.execute(f"PRAGMA table_info({quoted})").fetchall())
        order = ",".join(str(i + 1) for i in range(columns))
        digest = hashlib.sha256()
        for row in con.execute(f"SELECT * FROM {quoted} ORDER BY {order}"):
            digest.update(repr(row).encode("utf-8"))
            digest.update(b"\n")
        result[name] = digest.hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, action="append", required=True)
    parser.add_argument("--db", type=Path, default=ROOT / "database/giochi.sqlite3")
    parser.add_argument("--backup-root", type=Path,
                        default=ROOT / "gioco-zerocontext/.cache/backups")
    args = parser.parse_args()
    expected = read_index(args.source[0])
    for source in args.source[1:]:
        if read_index(source) != expected:
            raise ValueError("I generatori non hanno lo stesso inventario")
    lock_path = ROOT / "gioco-zerocontext/data/publish.lock"
    with FileLock(str(lock_path), timeout=0):
        with closing(sqlite3.connect(args.db.resolve().as_uri() + "?mode=ro", uri=True)) as original:
            if inventory(original) != expected:
                raise ValueError("Inventario diverso: usare il publisher completo con vettori allineati")
            backup = args.backup_root / datetime.now(timezone.utc).strftime("python-words-%Y%m%dT%H%M%S%fZ")
            backup.mkdir(parents=True)
            with closing(sqlite3.connect(backup / "giochi.sqlite3")) as copy:
                original.backup(copy)
                if copy.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise ValueError("Backup non integro")
        with closing(sqlite3.connect(args.db, timeout=30)) as con:
            con.execute("PRAGMA foreign_keys=ON")
            con.execute("BEGIN IMMEDIATE")
            try:
                if inventory(con) != expected:
                    raise ValueError("Inventario cambiato durante il backup: importazione annullata")
                before = table_digests(con)
                con.execute("PRAGMA defer_foreign_keys=ON")
                con.execute("DELETE FROM context__secrets")
                con.execute("DELETE FROM context__vocab")
                con.executemany("INSERT INTO context__vocab(idx,word) VALUES (?,?)", expected[0])
                con.executemany("INSERT INTO context__secrets(word) VALUES (?)", ((w,) for w in expected[1]))
                if con.execute("PRAGMA foreign_key_check").fetchall():
                    raise ValueError("Riferimenti non validi: importazione annullata")
                if table_digests(con) != before:
                    raise ValueError("Contenuto logico diverso dopo la reimportazione")
                if con.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise ValueError("Database non integro: importazione annullata")
                con.commit()
            except BaseException:
                con.rollback()
                raise
        receipt = {
            "imported_at_utc": datetime.now(timezone.utc).isoformat(),
            "sources": [str(p.resolve()) for p in args.source],
            "database": str(args.db.resolve()), "backup": str(backup / "giochi.sqlite3"),
            "words": len(expected[0]), "secrets": len(expected[1]),
            "replaced_tables": ["context__vocab", "context__secrets"],
            "logical_change": False, "all_tables_unchanged": True,
            "vectors_replaced": False,
        }
        (backup / "import.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
