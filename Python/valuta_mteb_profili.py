"""STS22 italiano sulle matrici del gioco con un encoder testuale comune.

Protocollo wordmean-full-v1: NFC/casefold, sequenze alfabetiche Unicode,
testi interi, media uniforme per occorrenza delle parole presenti nel DB,
OOV ignorate, normalizzazione L2. Nessun parametro appreso o scelto sul test.
Questo adattatore non e' l'encoder nativo dei modelli TurboX/Harrier.
"""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

import mteb
from mteb.cache import ResultCache
from mteb.models.abs_encoder import AbsEncoder
from mteb.models.model_meta import ModelMeta, ScoringFunction
import numpy as np
from scipy.stats import spearmanr
from sklearn.metrics.pairwise import paired_cosine_distances

from valuta_mteb import DATASET_REVISION

ROOT = Path(__file__).resolve().parent.parent
PROFILES = ("original", "turbox", "harrier")
PROTOCOL = "wordmean-full-v1"
TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)


def file_sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class WordMeanEncoder(AbsEncoder):
    def __init__(self, db, data_dir, profile):
        if profile not in PROFILES:
            raise ValueError("Profilo non riconosciuto")
        schema = "context_" + profile
        with closing(sqlite3.connect(Path(db).resolve().as_uri() + "?mode=ro", uri=True)) as con:
            if con.execute("SELECT value FROM zerodb_meta WHERE name='verified'").fetchone() != ("1",):
                raise ValueError("DB non verificato")
            self.meta = {k: json.loads(v) for k, v in con.execute(f"SELECT name,value FROM {schema}__meta")}
            rows = list(con.execute(f"SELECT idx,word FROM {schema}__vocab ORDER BY idx"))
        self.words = [w for _, w in rows]
        if rows != list(enumerate(self.words)) or len(set(self.words)) != len(self.words):
            raise ValueError("Indice non contiguo o duplicato")
        if self.meta["vector_format"] != "float32":
            raise ValueError("Questo protocollo richiede le matrici float32 del gioco")
        name = self.meta["vectors_file"]
        if not re.fullmatch(r"vectors\.[a-f0-9]{64}\.bin", name):
            raise ValueError("Nome del file vettoriale non valido")
        path = Path(data_dir) / name
        self.vector_sha = file_sha(path)
        if self.vector_sha != self.meta["vectors_sha256"]:
            raise ValueError("SHA256 dei vettori diverso dal DB")
        shape = (len(self.words), self.meta["dim"])
        if path.stat().st_size != int(np.prod(shape)) * 4:
            raise ValueError("Dimensioni non allineate")
        self.matrix = np.memmap(path, mode="r", dtype="<f4", shape=shape)
        if not np.isfinite(self.matrix).all() or np.max(np.abs(np.linalg.norm(self.matrix, axis=1) - 1)) > 1e-4:
            raise ValueError("Matrice non finita o non normalizzata")
        self.index = {w: i for i, w in enumerate(self.words)}
        self.stats = {"texts": 0, "tokens": 0, "covered_tokens": 0, "oov_tokens": 0}
        self.vocab_sha = hashlib.sha256(("\n".join(self.words) + "\n").encode("utf-8")).hexdigest()
        revision = hashlib.sha256((PROTOCOL + self.vector_sha + self.vocab_sha).encode()).hexdigest()
        self.mteb_model_meta = ModelMeta.create_empty({
            "name": f"Zerocade/context-{profile}-{PROTOCOL}", "revision": revision,
            "embed_dim": self.meta["dim"], "framework": ["NumPy"],
            "similarity_fn_name": ScoringFunction.COSINE, "use_instructions": False,
        })

    def encode_texts(self, sentences, record=False):
        result = []
        for text in sentences:
            tokens = TOKEN.findall(unicodedata.normalize("NFC", text).casefold())
            ids = [self.index[w] for w in tokens if w in self.index]
            if not ids:
                raise ValueError("Testo privo di parole coperte: non si escludono coppie dal test")
            vector = self.matrix[ids].mean(axis=0, dtype=np.float64)
            norm = np.linalg.norm(vector)
            if not np.isfinite(norm) or norm <= 0:
                raise ValueError("Media vettoriale nulla o non finita")
            result.append((vector / norm).astype(np.float32))
            if record:
                self.stats["texts"] += 1
                self.stats["tokens"] += len(tokens)
                self.stats["covered_tokens"] += len(ids)
                self.stats["oov_tokens"] += len(tokens) - len(ids)
        return np.asarray(result)

    def encode(self, inputs, *, task_metadata, hf_split, hf_subset, prompt_type=None, **kwargs):
        return self.encode_texts([text for batch in inputs for text in batch["text"]], record=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=ROOT / "database/giochi.sqlite3")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "gioco-zerocontext/data")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "outputs/mteb_profili")
    parser.add_argument("--profiles", nargs="+", choices=PROFILES, default=list(PROFILES))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    db_sha = file_sha(args.db)
    report = {"created_at_utc": datetime.now(timezone.utc).isoformat(), "protocol": PROTOCOL,
              "protocol_description": __doc__, "script_sha256": file_sha(__file__),
              "scope": "Single task, custom word-mean sentence encoder; not an overall MTEB score or native model score",
              "task": "STS22.v2", "subset": "it", "split": "test", "metric": "cosine_spearman",
              "dataset_revision": DATASET_REVISION, "database_sha256_before": db_sha,
              "packages": {name: importlib.metadata.version(name) for name in ("mteb", "numpy", "scipy", "datasets")},
              "profiles": {}}
    first_vocab = None
    for profile in args.profiles:
        print(f"Valutazione profilo {profile}: {PROTOCOL}", flush=True)
        task = mteb.get_tasks(tasks=["STS22.v2"], languages=["ita"],
                              exclusive_language_filter=True, eval_splits=["test"])[0]
        if task.hf_subsets != ["it"] or task.metadata.dataset["revision"] != DATASET_REVISION:
            raise ValueError("Dataset diverso dal protocollo fissato")
        task.load_data()
        dataset = task.dataset["it"]["test"]
        encoder = WordMeanEncoder(args.db, args.data_dir, profile)
        if first_vocab is not None and encoder.vocab_sha != first_vocab:
            raise ValueError("I profili non hanno lo stesso vocabolario")
        first_vocab = encoder.vocab_sha
        left = encoder.encode_texts(dataset["sentence1"])
        right = encoder.encode_texts(dataset["sentence2"])
        # Same cosine definition as STS22's evaluator, including float32 ties.
        # Recompute Spearman independently from the original labels and text rows.
        cosines = 1 - paired_cosine_distances(left, right)
        independent = float(spearmanr(cosines, dataset["score"]).statistic)
        pairs = len(dataset)
        predictions = [{"id": row["id"], "label": row["score"], "cosine": float(cosine)}
                       for row, cosine in zip(dataset, cosines)]
        result = mteb.evaluate(encoder, [task], cache=ResultCache(args.output / "cache"),
                               overwrite_strategy="always", co2_tracker=False, raise_error=True,
                               encode_kwargs={"batch_size": 512}, show_progress_bar=False,
                               public_only=True, num_proc=1)
        result.to_disk(args.output / f"{profile}.json")
        scores = result.task_results[0].scores["test"]
        if len(scores) != 1 or scores[0]["hf_subset"] != "it":
            raise ValueError("Il risultato include altri sottoinsiemi")
        score = float(scores[0]["main_score"])
        if not np.isfinite(score) or abs(score - independent) > 1e-8:
            raise ValueError("Il controllo indipendente di Spearman non coincide con MTEB")
        report["profiles"][profile] = {
            "cosine_spearman": score, "score_100": score * 100, "test_pairs": pairs,
            "independent_spearman": independent, "dim": encoder.meta["dim"],
            "vectors_file": encoder.meta["vectors_file"], "vectors_sha256": encoder.vector_sha,
            "vocab_sha256": encoder.vocab_sha, "corpus_revision": encoder.meta.get("corpus_revision"),
            "coverage": {**encoder.stats, "token_coverage": encoder.stats["covered_tokens"] / encoder.stats["tokens"]},
            "all_scores": scores[0],
        }
        (args.output / f"{profile}_predictions.json").write_text(json.dumps(predictions, indent=2) + "\n", encoding="utf-8")
        report["database_unchanged"] = file_sha(args.db) == db_sha
        if not report["database_unchanged"]:
            raise ValueError("Il DB e' cambiato durante il benchmark")
        (args.output / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{profile}: {score * 100:.4f}/100; {pairs} coppie; copertura token {100 * encoder.stats['covered_tokens'] / encoder.stats['tokens']:.2f}%", flush=True)
        del encoder


if __name__ == "__main__":
    main()
