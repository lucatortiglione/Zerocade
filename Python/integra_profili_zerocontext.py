"""Integra originale, TurboX e Harrier nel DB giochi senza cambiare il corpus classico."""
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile

from filelock import FileLock
from importa_vettori_zerocontext import ROOT, prepare, load_game, sha, SchemaDb, write_json
from importa_parole_zerocontext import table_digests


def main():
    database = ROOT / "database/giochi.sqlite3"
    data = ROOT / "gioco-zerocontext/data"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    work = ROOT / "gioco-zerocontext/.cache/profiles" / stamp
    work.mkdir(parents=True)
    turbo_db = ROOT / "database/giochi_turbox.sqlite3"
    harrier_db = ROOT / "database/giochi_harrier.sqlite3"
    # The named TurboX DB may still point to the original vectors. Correct the
    # candidate from the actual script output; never relabel the original matrix.
    turbo = load_game(turbo_db)
    if turbo[2].get("embedding_model") != "C10X/Qwen3-Embedding-TurboX":
        prepare(ROOT / "Python/outputs/turbox", turbo_db, data, work / "turbox")
        turbo_db = work / "turbox/giochi.sqlite3"
        vector_hash = sha(work / "turbox/vectors.bin")
        target = data / f"vectors.{vector_hash}.bin"
        if not target.exists():
            shutil.copy2(work / "turbox/vectors.bin", target.with_suffix(".bin.part"))
            target.with_suffix(".bin.part").replace(target)
    sources = {"original": database, "turbox": turbo_db, "harrier": harrier_db}
    expected = {"turbox": "C10X/Qwen3-Embedding-TurboX", "harrier": "rahulydc/harrier-m2v"}
    original = load_game(database)
    if original[2].get("embedding_model"):
        raise ValueError("Il DB corrente non e' il corpus originale: scegliere una copia originale verificata")
    report = {"created_at_utc": datetime.now(timezone.utc).isoformat(), "profiles": {}}
    with FileLock(str(data / "publish.lock"), timeout=0), tempfile.TemporaryDirectory(prefix="context-profiles-") as tmp:
        schemas = {}
        for profile, source in sources.items():
            words, secrets, meta, *_ = load_game(source)
            if words != original[0] or set(secrets) != set(original[1]):
                raise ValueError(f"Inventario o segrete non allineati: {profile}")
            if profile in expected and meta.get("embedding_model") != expected[profile]:
                raise ValueError(f"Modello non corrispondente: {profile}")
            vector = data / meta["vectors_file"]
            if sha(vector) != meta["vectors_sha256"]:
                raise ValueError(f"Vettori non integri: {profile}")
            schema = Path(tmp) / f"{profile}.sqlite3"
            SchemaDb(source, {}, "UNUSED").export_schema("context", schema)
            schemas[profile] = schema
            report["profiles"][profile] = {"source": str(source), "source_sha256": sha(source),
                "words": len(words), "secrets": len(secrets), "dim": meta["dim"],
                "vectors_file": meta["vectors_file"], "vectors_sha256": meta["vectors_sha256"]}
        backup = ROOT / "gioco-zerocontext/.cache/backups" / f"profiles-{stamp}"
        backup.mkdir(parents=True)
        with closing(sqlite3.connect(database)) as con, closing(sqlite3.connect(backup / "giochi.sqlite3")) as copy:
            con.backup(copy)
            before = {k: v for k, v in table_digests(con).items() if not k.startswith(("context_original__", "context_turbox__", "context_harrier__", "zerodb_"))}
        for record in report["profiles"].values():
            shutil.copy2(data / record["vectors_file"], backup / record["vectors_file"])
        for profile, schema in schemas.items():
            SchemaDb(database, {}, "UNUSED").import_schema(schema, f"context_{profile}")
        with closing(sqlite3.connect(database)) as con:
            after = {k: v for k, v in table_digests(con).items() if not k.startswith(("context_original__", "context_turbox__", "context_harrier__", "zerodb_"))}
            if before != after or con.execute("PRAGMA quick_check").fetchall() != [("ok",)] or con.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Verifica integrazione fallita; backup conservato")
        report["backup"] = str(backup)
        report["existing_tables_unchanged"] = True
        write_json(work / "integration.json", report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
