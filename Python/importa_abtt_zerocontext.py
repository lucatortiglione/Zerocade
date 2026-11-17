"""Importa la banca ABTT come profilo e ritira TurboX/Harrier, con backup.

Mantiene la matrice float32 esatta e tutti gli indici/parole del profilo originale.
La sostituzione dei profili SQLite avviene in un'unica transazione.
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

from filelock import FileLock
import numpy as np

from importa_parole_zerocontext import table_digests
from Ottimizzazioni.zc_bge_common import load_artifact

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "database/script"))
sys.path.insert(0, str(ROOT / "gioco-zerocontext/script"))
from schemadb import SchemaDb
from context_semantic_sources import readonly, sha, write_json

RETIRED = ("context_turbox", "context_harrier")


def inventory(con, schema):
    return (list(con.execute(f"SELECT idx,word FROM {schema}__vocab ORDER BY idx")),
            [r[0] for r in con.execute(f"SELECT word FROM {schema}__secrets ORDER BY word")])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--db", type=Path, default=ROOT / "database/giochi.sqlite3")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "gioco-zerocontext/data")
    args = parser.parse_args()
    source, database, data_dir = args.source.resolve(), args.db.resolve(), args.data_dir.resolve()
    hashes = {name: sha(source / name) for name in ("embeddings.npy", "vocab_index.csv", "manifest.json")}
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    score = json.loads((source.parent / "mteb/01_abtt/score.json").read_text(encoding="utf-8"))
    if (manifest.get("technique") != "ABTT" or manifest.get("l2_normalized") is not True
            or score["matrix_sha256"] != hashes["embeddings.npy"]
            or score["protocol"] != "wordmean-full-v1"):
        raise ValueError("La matrice non corrisponde alla banca ABTT valutata")
    matrix, rows, words = load_artifact(source)
    secrets = sorted(r["word"] for r in rows if r["in_context__secrets"] == "1")
    if (matrix.dtype != np.float32 or matrix.shape != (len(words), 1024)
            or manifest["embedding_dim"] != 1024 or len(words) != score["words"]
            or len(secrets) != score["secrets"]
            or any(r["in_context__vocab"] != "1" or r["in_context__secrets"] not in ("0", "1") for r in rows)):
        raise ValueError("Matrice o ruoli ABTT non validi")
    for start in range(0, len(words), 2048):
        batch = matrix[start:start + 2048]
        if not np.isfinite(batch).all() or np.any(np.abs(np.linalg.norm(batch, axis=1)-1) > 1e-4):
            raise ValueError("Vettori ABTT non finiti o non normalizzati")
    expected = (list(enumerate(words)), secrets)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run = ROOT / "gioco-zerocontext/.cache/abtt-imports" / stamp
    backup = ROOT / "gioco-zerocontext/.cache/backups" / f"abtt-{stamp}"
    with FileLock(str(data_dir / "publish.lock"), timeout=0):
        run.mkdir(parents=True)
        backup.mkdir(parents=True)
        with closing(readonly(database)) as original:
            if inventory(original, "context_original") != expected:
                raise ValueError("Inventario ABTT diverso da quello originale del gioco")
            with closing(sqlite3.connect(backup / "giochi.sqlite3")) as target:
                original.backup(target)
            old_metadata = {}
            for schema in ("context_original", *RETIRED):
                if original.execute("SELECT 1 FROM sqlite_schema WHERE name=?", (schema+"__meta",)).fetchone():
                    old_metadata[schema] = {k: json.loads(v) for k, v in original.execute(f"SELECT name,value FROM {schema}__meta")}
            for meta in old_metadata.values():
                name = meta["vectors_file"]
                vector = (data_dir / name).resolve()
                if vector.parent != data_dir or vector.name != f"vectors.{meta['vectors_sha256']}.bin":
                    raise ValueError("Percorso vettori precedente non valido")
                if not (backup / name).exists():
                    shutil.copy2(vector, backup / name)
                if sha(backup / name) != meta["vectors_sha256"]:
                    raise ValueError("Backup dei vettori precedenti non valido")
            before = table_digests(original)
        with closing(readonly(backup / "giochi.sqlite3")) as copy:
            if copy.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise ValueError("Backup SQLite non integro")
        print("Backup creato:", backup, flush=True)
        candidate = run / "context_abtt.sqlite3"
        schema_db = SchemaDb(database, {}, "UNUSED_CONTEXT_ABTT")
        schema_db.export_schema("context_original", candidate)
        raw = run / "vectors.bin"
        np.asarray(matrix, dtype="<f4").tofile(raw)
        vector_sha = sha(raw)
        vector_name = f"vectors.{vector_sha}.bin"
        if raw.stat().st_size != len(words) * 1024 * 4:
            raise ValueError("Dimensione del file vettori non valida")
        revision = hashlib.sha256((hashes["vocab_index.csv"]+":"+vector_sha).encode()).hexdigest()
        meta = {**old_metadata["context_original"], "dim": 1024, "links": 0,
                "link_boost": 0, "hub_strength": 0, "vector_format": "float32",
                "vectors_file": vector_name, "vectors_sha256": vector_sha,
                "corpus_revision": revision, "vector_pipeline": "context-abtt-import-1",
                "embedding_model": "albertobarnabo/bge-m3-italian + ABTT",
                "embedding_source_sha256": hashes, "embedding_geometry_recomputed": False,
                "embedding_technique": manifest,
                "embedding_benchmark": {"task": "STS22.v2", "subset": "it", "split": "test",
                                        "protocol": score["protocol"], "spearman_100": score["score_100"]},
                "special_rounds_enabled": False, "special": 0, "ordinary": len(secrets),
                "legacy_preserved": len(secrets)}
        if len(meta) > 32:
            raise ValueError("Troppi campi metadata per il runtime")
        with closing(sqlite3.connect(candidate)) as con, con:
            con.execute("PRAGMA foreign_keys=ON")
            con.execute("DELETE FROM links")
            con.execute("UPDATE hubs SET penalty=0")
            con.execute("DELETE FROM meta")
            con.executemany("INSERT INTO meta VALUES (?,?)", ((k, json.dumps(v)) for k, v in meta.items()))
            for word, raw_detail in con.execute("SELECT word,details FROM targets").fetchall():
                detail = json.loads(raw_detail)
                previous = {k: detail.pop(k) for k in ("density100", "bridges4", "bridges38") if k in detail}
                if previous:
                    detail["previous_embedding_geometry"] = {"vectors_sha256": old_metadata["context_original"]["vectors_sha256"], **previous}
                detail["embedding_geometry"] = {"vectors_sha256": vector_sha, "status": "not_recomputed"}
                detail["legacy_exception"] = True
                con.execute("UPDATE targets SET ordinary=1,special=0,legacy=1,details=? WHERE word=?",
                            (json.dumps(detail, ensure_ascii=False), word))
            if con.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Riferimenti non validi nel candidato")
        destination = data_dir / vector_name
        if destination.exists():
            if sha(destination) != vector_sha:
                raise ValueError("File vettori esistente con hash diverso")
        else:
            shutil.copy2(raw, destination)
        if sha(destination) != vector_sha or any(sha(source / n) != value for n, value in hashes.items()):
            raise ValueError("File modificati durante l'importazione")
        with closing(sqlite3.connect(database.as_uri(), uri=True, timeout=30, isolation_level=None)) as con:
            con.execute("PRAGMA foreign_keys=OFF")
            con.execute("ATTACH DATABASE ? AS src", (candidate.as_uri()+"?mode=ro",))
            con.execute("BEGIN IMMEDIATE")
            try:
                if table_digests(con) != before:
                    raise ValueError("DB cambiato dopo il backup")
                schema_db._copy_in(con, "context_abtt", candidate)
                for retired in RETIRED:
                    for kind in ("trigger", "view", "index", "table"):
                        for (name,) in con.execute("SELECT name FROM zerodb_objects WHERE schema=? AND type=?", (retired, kind)).fetchall():
                            quoted = (retired+"__"+name).replace('"', '""')
                            con.execute(f'DROP {kind.upper()} IF EXISTS "{quoted}"')
                    con.execute("DELETE FROM zerodb_objects WHERE schema=?", (retired,))
                    con.execute("DELETE FROM zerodb_schemas WHERE name=?", (retired,))
                after = table_digests(con)
                preserved = {k: v for k, v in before.items() if k not in ("zerodb_objects", "zerodb_schemas")
                             and not any(k.startswith(s+"__") for s in RETIRED)}
                if any(after.get(k) != v for k, v in preserved.items()):
                    raise ValueError("Una tabella da conservare è cambiata")
                if inventory(con, "context_abtt") != expected:
                    raise ValueError("Parole o segrete cambiate nell'importazione")
                if con.execute("PRAGMA foreign_key_check").fetchall() or con.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                    raise ValueError("Verifica integrità SQLite fallita")
                con.execute("COMMIT")
            except BaseException:
                con.execute("ROLLBACK")
                raise
        report = {"imported_at_utc": datetime.now(timezone.utc).isoformat(), "database": str(database),
                  "schema": "context_abtt", "retired_schemas": list(RETIRED), "backup": str(backup),
                  "words": len(words), "secrets": len(secrets), "dim": 1024,
                  "vectors_file": vector_name, "vectors_sha256": vector_sha,
                  "source_sha256": hashes, "mteb_spearman_100": score["score_100"],
                  "preserved_tables": len(preserved), "preserved_table_digests": preserved,
                  "foreign_key_check": "passed", "quick_check": "passed"}
        write_json(run / "import.json", report)
        write_json(backup / "import.json", report)
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
