"""Pubblica nel gioco gli output Model2Vec, con backup e controlli strutturali.

I risultati semantici sono registrati nel rapporto: questa importazione diretta
non dichiara di avere superato i collaudi della pipeline BGE/retrofitting.
"""

from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys
import tempfile

import numpy as np

from importa_parole_zerocontext import read_index

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "gioco-zerocontext/script"))
sys.path.insert(0, str(ROOT / "database/script"))
from context_semantic_sources import digest, load_game, readonly, sha, write_json
from publish_context import active_vectors, publish
from schemadb import SchemaDb

VERSION = "context-model2vec-import-1"


def semantic_audit(matrix, words):
    index = {w: i for i, w in enumerate(words)}
    results = []
    for target, limits in (
        ("spiaggia", {"mare": 29, "sabbia": 29}),
        ("fotografo", {"fotoreporter": 99, "pittore": 149}),
    ):
        if not {target, *limits} <= index.keys():
            continue
        order = np.argsort(-(matrix @ matrix[index[target]]), kind="stable")
        ranks = np.empty(len(words), dtype=np.int64)
        ranks[order] = np.arange(len(words))
        results.append({
            "target": target, "rank_base": 0,
            "ranks": {w: int(ranks[index[w]]) for w in limits},
            "maximum_rank": limits,
            "passed": all(ranks[index[w]] <= limit for w, limit in limits.items()),
            "top10": [words[i] for i in order[:10]],
        })
    return {"checks": results, "passed": all(r["passed"] for r in results) if results else None}


def prepare(source: Path, game_db: Path, data_dir: Path, run: Path):
    source, game_db, data_dir, run = (Path(p).resolve() for p in (source, game_db, data_dir, run))
    # Detect changed files before consuming a matrix generated alongside an index.
    source_hashes = {name: sha(source / name) for name in ("manifest.json", "vocab_index.csv", "embeddings.npy")}
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("embedding_file") != "embeddings.npy" or
            manifest.get("index_file") != "vocab_index.csv" or
            manifest.get("invalid_embedding_count") != 0 or
            not isinstance(manifest.get("model_repo"), str) or not manifest["model_repo"]):
        raise ValueError("Manifest non valido o embedding invalidi dichiarati")
    rows, secrets = read_index(source)
    words = [w for _, w in rows]
    if rows != list(enumerate(words)):
        raise ValueError("Indice non contiguo")
    before = load_game(game_db)
    if words != before[0] or set(secrets) != set(before[1]):
        raise ValueError("Il DB e' cambiato rispetto all'inventario esportato: rigenerare lo script Python")
    matrix = np.load(source / "embeddings.npy", mmap_mode="r", allow_pickle=False)
    dim = manifest["embedding_dim"]
    if (dim not in {256, 300} or matrix.shape != (len(words), dim) or
            matrix.dtype != np.dtype("float32") or manifest.get("dtype") != "float32" or
            manifest.get("l2_normalized") is not True):
        raise ValueError("Matrice non compatibile con il runtime float32")
    for start in range(0, len(words), 4096):
        batch = matrix[start:start + 4096]
        if not np.isfinite(batch).all() or np.any(np.abs(np.linalg.norm(batch, axis=1) - 1) > 1e-4):
            raise ValueError("Matrice con valori non finiti, nulli o non normalizzati")
    run.mkdir(parents=True, exist_ok=False)
    # Raw little-endian float32, identico all'NPY senza intestazione.
    np.asarray(matrix, dtype="<f4").tofile(run / "vectors.bin")
    if any(sha(source / name) != value for name, value in source_hashes.items()):
        raise ValueError("Output modificato durante l'importazione: riprovare a generazione conclusa")
    vector_hash = sha(run / "vectors.bin")
    quality = semantic_audit(matrix, words)
    del batch, matrix
    index = {w: i for i, w in enumerate(words)}
    pools = {
        "version": "context-semantic-1", "ordinary": sorted(index[w] for w in secrets),
        "special": [], "domains": {}, "curatedOrdinary": [],
        "compatibility": sorted(index[w] for w in secrets),
    }
    links = {"boost": 0, "links": {}, "hubs": [0] * len(words),
             "vector_format": "float32", "dim": dim, "semantic": pools}
    meta = {**before[2], "words": len(words), "secrets": len(secrets), "dim": dim,
            "links": 0, "link_boost": 0, "hub_strength": 0,
            "vector_format": "float32", "pipeline": "context-semantic-1",
            "vector_pipeline": VERSION, "embedding_model": manifest["model_repo"],
            "embedding_source_sha256": source_hashes,
            "embedding_quality": "passed" if quality["passed"] is True else "regressions_detected" if quality["passed"] is False else "not_evaluated",
            "embedding_geometry_recomputed": False,
            "ordinary": len(secrets), "special": 0, "legacy_preserved": len(secrets),
            "special_rounds_enabled": False,
            "vectors_file": f"vectors.{vector_hash}.bin", "vectors_sha256": vector_hash}
    meta.pop("corpus_revision", None)
    (run / "vocab.txt").write_text("\n".join(words) + "\n", encoding="utf-8")
    (run / "secrets.txt").write_text("\n".join(secrets) + "\n", encoding="utf-8")
    write_json(run / "links.json", links)
    write_json(run / "meta.json", meta)
    with closing(readonly(game_db)) as original, closing(sqlite3.connect(run / "giochi.sqlite3")) as candidate:
        original.backup(candidate)
    with tempfile.TemporaryDirectory(prefix="context-model2vec-") as folder:
        schema = Path(folder) / "context.sqlite3"
        SchemaDb(run / "giochi.sqlite3", {}, "UNUSED_CONTEXT_LEGACY").export_schema("context", schema)
        with closing(sqlite3.connect(schema)) as con, con:
            con.execute("PRAGMA foreign_keys=ON")
            con.execute("BEGIN")
            con.execute("PRAGMA defer_foreign_keys=ON")
            con.execute("DELETE FROM secrets")
            con.execute("DELETE FROM vocab")
            con.executemany("INSERT INTO vocab VALUES (?,?)", rows)
            con.executemany("INSERT INTO secrets VALUES (?)", ((w,) for w in secrets))
            con.execute("DELETE FROM links")
            con.execute("DELETE FROM hubs")
            con.executemany("INSERT INTO hubs VALUES (?,0)", ((i,) for i in range(len(words))))
            con.execute("DELETE FROM meta")
            con.executemany("INSERT INTO meta VALUES (?,?)", ((k, json.dumps(v)) for k, v in meta.items()))
            for word, raw in con.execute("SELECT word,details FROM targets").fetchall():
                details = json.loads(raw)
                geometry = {k: details.pop(k) for k in ("density100", "bridges4", "bridges38") if k in details}
                if geometry:
                    details["previous_embedding_geometry"] = {"vectors_sha256": before[2].get("vectors_sha256"), **geometry}
                details["embedding_geometry"] = {"vectors_sha256": vector_hash, "status": "not_recomputed"}
                details["legacy_exception"] = True
                con.execute("UPDATE targets SET ordinary=1,special=0,legacy=1,details=? WHERE word=?",
                            (json.dumps(details, ensure_ascii=False), word))
            if con.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Riferimenti non validi nel candidato")
        SchemaDb(run / "giochi.sqlite3", {}, "UNUSED_CONTEXT_LEGACY").import_schema(schema, "context")
    inputs = {k: digest(v) for k, v in zip(
        ("vocab", "secrets", "meta", "links", "hubs", "reviewed_senses", "verified_pairs"), before)}
    inputs["vectors_sha256"] = sha(active_vectors(before[2], data_dir))
    write_json(run / "source_manifest.json", manifest)
    write_json(run / "quality.json", {"structural_passed": True, "semantic": quality})
    artifacts = {name: sha(run / name) for name in
                 ("giochi.sqlite3", "vectors.bin", "vocab.txt", "secrets.txt", "links.json", "meta.json", "source_manifest.json", "quality.json")}
    report = {"kind": "context_model2vec_import", "version": VERSION, "pilot": False,
              "created_at_utc": datetime.now(timezone.utc).isoformat(),
              "source": str(source), "source_sha256": source_hashes,
              "model": manifest["model_repo"], "inputs": inputs, "artifacts": artifacts,
              "words": len(words), "secrets": len(secrets), "dim": dim,
              "quality": {"structural_passed": True, "semantic": quality},
              "geometry_recomputed": False,
              "activation_policy": "Direct import requested by user; semantic findings retained in report"}
    write_json(run / "report.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "Python/outputs/harrier_m2v")
    parser.add_argument("--db", type=Path, default=ROOT / "database/giochi.sqlite3")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "gioco-zerocontext/data")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--server-url", default="http://127.0.0.1:3001")
    args = parser.parse_args()
    run = args.output or ROOT / "gioco-zerocontext/.cache/model2vec-imports" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    report = prepare(args.source, args.db, args.data_dir, run)
    result = {"run": str(run), "quality": report["quality"]}
    if not args.prepare_only:
        result["publication"] = publish(run, args.db, args.data_dir, server_url=args.server_url)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
