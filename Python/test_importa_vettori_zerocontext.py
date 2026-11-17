import csv
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import numpy as np

from importa_vettori_zerocontext import prepare, publish, sha, SchemaDb
from giochi import CONTEXT_SCHEMA


class ImportVectorsTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        root = Path(self.folder.name)
        self.db, self.data, self.source, self.run = root / "giochi.sqlite3", root / "game/data", root / "source", root / "run"
        self.data.mkdir(parents=True)
        self.source.mkdir()
        self.words = ["caldo", "freddo", "tiepido"]
        self.old = np.zeros((3, 300), np.float32)
        self.old[:, 0] = 1
        self.old.tofile(self.data / "vectors.bin")
        schema = root / "context.sqlite3"
        with closing(sqlite3.connect(schema)) as c, c:
            c.executescript(CONTEXT_SCHEMA + """
                CREATE TABLE targets(word TEXT PRIMARY KEY REFERENCES vocab(word),
                ordinary INTEGER NOT NULL,special INTEGER NOT NULL,legacy INTEGER NOT NULL,
                details TEXT NOT NULL CHECK(json_valid(details))) STRICT, WITHOUT ROWID;
            """)
            c.executemany("INSERT INTO vocab VALUES (?,?)", enumerate(self.words))
            c.executemany("INSERT INTO secrets VALUES (?)", [("caldo",), ("freddo",)])
            c.executemany("INSERT INTO hubs VALUES (?,0)", [(0,), (1,), (2,)])
            c.executemany("INSERT INTO targets VALUES (?,1,0,1,?)",
                          [(w, json.dumps({"density100": .6, "bridges4": 20})) for w in self.words[:2]])
            meta = {"words": 3, "secrets": 2, "dim": 300, "pipeline": "context-semantic-1",
                    "vector_format": "float32", "link_boost": 0, "vectors_sha256": sha(self.data / "vectors.bin")}
            c.executemany("INSERT INTO meta VALUES (?,?)", [(k, json.dumps(v)) for k, v in meta.items()])
        SchemaDb(self.db, {}, "UNUSED").import_schema(schema, "context")
        other = root / "other.sqlite3"
        with closing(sqlite3.connect(other)) as c, c:
            c.execute("CREATE TABLE words(word TEXT PRIMARY KEY)")
            c.execute("INSERT INTO words VALUES ('preservata')")
        SchemaDb(self.db, {}, "UNUSED").import_schema(other, "other")
        SchemaDb(self.db, {}, "UNUSED").mark_verified()
        self.new = np.zeros((3, 256), np.float32)
        self.new[np.arange(3), np.arange(3)] = 1
        np.save(self.source / "embeddings.npy", self.new)
        self.manifest = {"model_repo": "rahulydc/harrier-m2v", "embedding_file": "embeddings.npy",
                         "index_file": "vocab_index.csv", "invalid_embedding_count": 0,
                         "embedding_dim": 256, "vocab_size": 3, "secret_words": 2,
                         "dtype": "float32", "l2_normalized": True}
        (self.source / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        self.write_csv()

    def write_csv(self, secrets=("caldo", "freddo")):
        with (self.source / "vocab_index.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(["matrix_index", "word", "in_context__vocab", "in_context__secrets"])
            writer.writerows((i, w, 1, int(w in secrets)) for i, w in enumerate(self.words))

    def test_publish_exact_matrix_backup_geometry_and_other_games(self):
        prepare(self.source, self.db, self.data, self.run)
        receipt = publish(self.run, self.db, self.data, server_url=None)
        self.assertTrue(receipt["published_to_live"])
        with closing(sqlite3.connect(self.db)) as c:
            meta = {k: json.loads(v) for k, v in c.execute("SELECT * FROM context__meta")}
            self.assertEqual((meta["dim"], meta["embedding_model"]), (256, "rahulydc/harrier-m2v"))
            self.assertFalse(meta["special_rounds_enabled"])
            self.assertEqual(c.execute("SELECT * FROM other__words").fetchall(), [("preservata",)])
            self.assertEqual(c.execute("PRAGMA foreign_key_check").fetchall(), [])
            details = json.loads(c.execute("SELECT details FROM context__targets LIMIT 1").fetchone()[0])
            self.assertNotIn("density100", details)
            self.assertEqual(details["previous_embedding_geometry"]["density100"], .6)
            self.assertEqual(details["embedding_geometry"]["status"], "not_recomputed")
        actual = np.fromfile(self.data / meta["vectors_file"], dtype="<f4").reshape(3, 256)
        np.testing.assert_array_equal(actual, self.new)
        with closing(sqlite3.connect(Path(receipt["backup"]) / "giochi.sqlite3")) as c:
            self.assertEqual(json.loads(c.execute("SELECT value FROM context__meta WHERE name='dim'").fetchone()[0]), 300)
        np.testing.assert_array_equal(np.fromfile(Path(receipt["backup"]) / "vectors.bin", dtype="<f4").reshape(3, 300), self.old)

    def test_invalid_vectors_leave_database_untouched(self):
        original = sha(self.db)
        self.new[0] = 0
        np.save(self.source / "embeddings.npy", self.new)
        with self.assertRaisesRegex(ValueError, "normalizzati"):
            prepare(self.source, self.db, self.data, self.run)
        self.assertEqual(sha(self.db), original)

    def test_secret_substitution_with_same_count_is_rejected(self):
        original = sha(self.db)
        self.write_csv(("caldo", "tiepido"))
        with self.assertRaisesRegex(ValueError, "inventario"):
            prepare(self.source, self.db, self.data, self.run)
        self.assertEqual(sha(self.db), original)

    def test_tampered_candidate_cannot_publish(self):
        original = sha(self.db)
        prepare(self.source, self.db, self.data, self.run)
        with (self.run / "vectors.bin").open("ab") as stream:
            stream.write(b"x")
        with self.assertRaisesRegex(ValueError, "integro"):
            publish(self.run, self.db, self.data, server_url=None)
        self.assertEqual(sha(self.db), original)


if __name__ == "__main__":
    unittest.main()
