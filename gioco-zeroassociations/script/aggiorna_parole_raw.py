"""Crea e aggiorna parole_ita_raw_2.0.sqlite3 con le parole uniche di tutte le fonti.

Nessun limite di righe, filtro di frequenza o scarto editoriale. Conserva la provenienza;
non esegue la pubblicazione delle banche di gioco né la generazione di associazioni.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sqlite3

from filelock import FileLock

from collect_prompt_sources import checksum, download
from inventory_updates import decide_update, fetch_current, register_sources
from prompt_database import DEFAULT_DB, ROOT
from prompt_inventory import CACHE, KINDS, REGISTRY, import_source, initialize_inventory, status
from sqlite_prompt_runtime import SQLite


def load_sources(registry):
    sources = json.loads(Path(registry).read_text(encoding="utf-8"))
    if not sources or len({s["id"] for s in sources}) != len(sources):
        raise ValueError("Registro vuoto o ID fonte duplicati")
    for source in sources:
        if source["kind"] not in KINDS:
            raise ValueError(f"Formato non supportato: {source['id']}")
        for field in ("name", "url", "license", "attribution"):
            if not source.get(field):
                raise ValueError(f"Fonte {source['id']}: manca {field}")
    return sources


def full_wordfreq(source, cache):
    """Il registro contiene un CSV locale: rigenerarlo dall'intera lista large."""
    import csv
    from wordfreq import iter_wordlist
    directory = Path(cache) / "raw-wordfreq"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "frequency_ranks_it_full.csv"
    temporary = path.with_suffix(".csv.part")
    count = 0
    with temporary.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["lemma", "rank"])
        for count, word in enumerate(iter_wordlist("it", wordlist="large"), 1):
            writer.writerow([word, count])
    if not count:
        raise ValueError("La lista italiana wordfreq è vuota")
    temporary.replace(path)
    return {**source, "local_path": str(path.resolve()),
            "revision": importlib.metadata.version("wordfreq"), "wordlist": "large"}


def collect_all(db, sources, cache, report_path, backup):
    """API storica per il primo RAW; il task CLI usa parole_raw_v2.collect_all."""
    results, commits = [], {}
    report = {"started_at_utc": datetime.now(timezone.utc).isoformat(),
              "database": str(db.file), "schema": db.schema or "raw-standalone",
              "backup": str(backup) if backup else None, "selected_sources": len(sources),
              "row_limit": None, "zipf_filter": None, "gameplay_publication": False,
              "attempts": results, "all_sources_completed": False}

    def save():
        temporary = report_path.with_suffix(".json.part")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
        temporary.replace(report_path)

    save()
    for number, source in enumerate(sources, 1):
        print(f"[{number}/{len(sources)}] {source['name']}", flush=True)
        try:
            if source["id"] == "wordfreq-it-local":
                source = full_wordfreq(source, cache)
            effective, path = fetch_current(db, source, Path(cache), commits)
            license_path = None
            if effective.get("license_url"):
                key = hashlib.sha256(effective["license_url"].encode()).hexdigest()
                license_path = Path(cache) / "raw-licenses" / key / "LICENSE.txt"
                download(effective["license_url"], license_path)
            result = import_source(db, effective, path)
            if result["status"] == "PENDING":
                result = {**result, **decide_update(
                    db, result["update_id"], "APPLY",
                    "Aggiornamento del solo inventario RAW richiesto dal task ZeroCade : Aggiornamento parole RAW",
                    "task:aggiornamento-parole-raw",
                )}
            result.update({"effective_url": effective["url"], "cache_path": str(path),
                           "download_sha256": checksum(path), "revision": effective.get("revision")})
            if license_path:
                result["license_file"] = str(license_path)
            # DEFERRED/DISCARDED rimangono decisioni persistenti: il download è comunque acquisito.
        except Exception as error:
            result = {"source": source["id"], "status": "FAILED", "error": str(error)}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
        save()
    report["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
    report["all_sources_completed"] = len(results) == len(sources) and all(r["status"] != "FAILED" for r in results)
    report["inventory"] = status(db)
    save()
    return report


def main(argv=None):
    from parole_raw_v2 import DEFAULT_DB as V2_DB, WordDatabase, collect_all as collect_v2
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=V2_DB)
    parser.add_argument("--registry", type=Path, default=REGISTRY)
    parser.add_argument("--cache", type=Path, default=CACHE)
    parser.add_argument("--report", type=Path, default=ROOT / "reports/aggiornamento_parole_raw_2.0.json")
    parser.add_argument("--backup-root", type=Path, default=ROOT / "database-backups")
    parser.add_argument("--seed-from", type=Path, help="Importa le parole già raccolte nel vecchio RAW, senza decisioni editoriali")
    parser.add_argument("--initialize-only", action="store_true", help="Crea il DB e importa l'eventuale raccolta locale senza download")
    parser.add_argument("--cleanup-only", action="store_true", help="Ripulisce il DB locale senza scaricare le fonti")
    parser.add_argument("--plan", action="store_true", help="Mostra tutte le fonti senza download o scritture nel DB")
    args = parser.parse_args(argv)
    sources = load_sources(args.registry)
    if args.plan:
        print(json.dumps({"task": "ZeroCade : Aggiornamento parole RAW", "sources": sources,
                          "selected_sources": len(sources), "row_limit": None,
                          "database": str(args.db.resolve()), "words_table": "parole",
                          "editorial_exclusions": False}, ensure_ascii=False, indent=2))
        return 0
    from parole_raw_v2 import LEGACY_DB
    if args.db.resolve() == LEGACY_DB.resolve() or '#' in str(args.db):
        raise ValueError('Il task aggiorna il secondo database RAW 2.0, non quello originale')
    args.db.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    with FileLock(str(args.db.resolve())+".raw-update.lock", timeout=0):
        backup = None
        if args.db.exists():
            backup = args.backup_root / f"parole_raw_2.0-{stamp}.sqlite3"
            backup.parent.mkdir(parents=True, exist_ok=True)
            print("Backup consistente:", backup, flush=True)
            with closing(sqlite3.connect(args.db.resolve().as_uri()+"?mode=ro", uri=True)) as original:
                with closing(sqlite3.connect(backup)) as target:
                    original.backup(target)
                    if target.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                        raise ValueError("Backup RAW non integro")
        with closing(WordDatabase(args.db)) as db:
            db.register(sources)
            seed = db.seed_from(args.seed_from) if args.seed_from else None
            cleanup = db.clean_existing()
            if args.initialize_only or args.cleanup_only:
                # Le fonti tolte dal registro perché davano parole straniere escono anche dal DB (17/11/2026).
                pruning = db.prune_sources([s['id'] for s in sources])
                initialized = {'database':str(db.file),'words_table':'parole',
                               'download_performed':False,'seed':seed,'cleanup':cleanup,'source_pruning':pruning,**db.counts()}
                args.report.write_text(json.dumps(initialized,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
                print(json.dumps(initialized,ensure_ascii=False))
                return 0
            report = collect_v2(db, sources, args.cache, args.report, backup, full_wordfreq)
            report['source_pruning'] = db.prune_sources([s['id'] for s in sources])
            report['inventory'] = db.counts()
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print("Rapporto:", args.report, flush=True)
    return 0 if report["all_sources_completed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
