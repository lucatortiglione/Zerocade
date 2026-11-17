"""Controlli del task RAW senza rete e senza toccare i database del progetto."""
import contextlib
import csv
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import aggiorna_parole_raw as raw
from inventory_updates import decide_term
from prompt_inventory import initialize_inventory
from sqlite_prompt_runtime import CACHE as SQLITE_CACHE, SQLite


def source(key="fixture", path=None):
    return {"id": key, "name": key, "kind": "wordlist", "url": "https://example.invalid/list.txt",
            "license": "Test fixture", "attribution": "Test",
            **({"local_path": str(path)} if path else {})}


class RawTaskTests(unittest.TestCase):
    def test_every_source_is_attempted_even_after_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            inputs = [source("first"), source("broken"), source("last")]
            def fetch(db, config, cache, commits):
                if config["id"] == "broken":
                    raise OSError("fixture download failed")
                return config, folder / config["id"]
            db = SimpleNamespace(file=folder / "raw.sqlite3", schema="raw")
            with (patch.object(raw, "fetch_current", side_effect=fetch) as fetched,
                  patch.object(raw, "import_source", side_effect=lambda db, s, p: {"source": s["id"], "status": "IMPORTED"}),
                  patch.object(raw, "checksum", return_value="fixture-sha"),
                  patch.object(raw, "status", return_value={}), contextlib.redirect_stdout(io.StringIO())):
                report = raw.collect_all(db, inputs, folder, folder / "report.json", None)
            self.assertEqual(fetched.call_count, 3)
            self.assertEqual([r["status"] for r in report["attempts"]], ["IMPORTED", "FAILED", "IMPORTED"])
            self.assertFalse(report["all_sources_completed"])
            saved = json.loads((folder / "report.json").read_text(encoding="utf-8"))
            self.assertEqual(len(saved["attempts"]), 3)
            self.assertFalse(saved["gameplay_publication"])

    def test_deferred_update_is_not_overridden(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            db = SimpleNamespace(file=folder / "raw.sqlite3", schema="raw")
            with (patch.object(raw, "fetch_current", return_value=(source(), folder / "list")),
                  patch.object(raw, "import_source", return_value={"source": "fixture", "status": "DEFERRED"}),
                  patch.object(raw, "checksum", return_value="sha"), patch.object(raw, "status", return_value={}),
                  patch.object(raw, "decide_update") as decision, contextlib.redirect_stdout(io.StringIO())):
                report = raw.collect_all(db, [source()], folder, folder / "report.json", None)
            decision.assert_not_called()
            self.assertTrue(report["all_sources_completed"])
            self.assertEqual(report["attempts"][0]["status"], "DEFERRED")

    def test_full_wordfreq_uses_large_list_without_frequency_filter(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch("wordfreq.iter_wordlist", return_value=iter(["casa", "rarissima", "città"])) as words:
                effective = raw.full_wordfreq(source("wordfreq-it-local"), folder)
            words.assert_called_once_with("it", wordlist="large")
            with Path(effective["local_path"]).open(encoding="utf-8", newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual([r["lemma"] for r in rows], ["casa", "rarissima", "città"])
            self.assertEqual([r["rank"] for r in rows], ["1", "2", "3"])

    def test_plan_does_not_open_database_or_download(self):
        with tempfile.TemporaryDirectory() as folder:
            registry = Path(folder) / "sources.json"
            registry.write_text(json.dumps([source()]), encoding="utf-8")
            output = io.StringIO()
            with (patch.object(raw, "SQLite") as database, patch.object(raw, "fetch_current") as fetch,
                  contextlib.redirect_stdout(output)):
                self.assertEqual(raw.main(["--registry", str(registry), "--plan"]), 0)
            database.assert_not_called()
            fetch.assert_not_called()
            self.assertEqual(json.loads(output.getvalue())["selected_sources"], 1)

    @unittest.skipUnless((SQLITE_CACHE / "sqlite3.exe").exists(), "Runtime SQLite ufficiale assente")
    def test_real_import_applies_raw_changes_and_preserves_word_decision(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            folder = Path(folder)
            db = SQLite(folder / "raw.sqlite3")
            initialize_inventory(db)
            wordlist = folder / "list.txt"
            config = source(path=wordlist)
            wordlist.write_text("casa\nalbero\n", encoding="utf-8")
            first = raw.collect_all(db, [config], folder, folder / "first.json", None)
            self.assertEqual(first["attempts"][0]["status"], "IMPORTED")
            decide_term(db, "casa", "DISCARDED", "Decisione da conservare", "fixture-user")
            wordlist.write_text("casa\nfiore\nrarissima\n", encoding="utf-8")
            second = raw.collect_all(db, [config], folder, folder / "second.json", None)
            self.assertEqual(second["attempts"][0]["status"], "APPLIED")
            self.assertEqual(db.run("SELECT decision FROM inventory_term_decisions WHERE prompt='casa';", rows=True), [{"decision": "DISCARDED"}])
            self.assertEqual(db.run("SELECT prompt FROM inventory_terms WHERE prompt='rarissima';", rows=True), [{"prompt": "rarissima"}])
            self.assertEqual(db.run("SELECT count(*) AS n FROM inventory_snapshots;", rows=True)[0]["n"], 2)


if __name__ == "__main__":
    unittest.main()
