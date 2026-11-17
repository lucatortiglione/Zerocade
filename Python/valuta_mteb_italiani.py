"""STS22 italiano per gli output BGE-M3 Italian ed EuroDense.

Valuta le banche con wordmean-full-v1 (come originale/TurboX/Harrier)
e i modelli contestuali con input fino a 512 token, senza modificare il DB.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import gc
import hashlib
import importlib.metadata
import json
from pathlib import Path

import mteb
from mteb.cache import ResultCache
from mteb.models.abs_encoder import AbsEncoder
from mteb.models.model_meta import ModelMeta, ScoringFunction
import numpy as np
import torch

from valuta_mteb import DATASET_REVISION
from valuta_mteb_profili import WordMeanEncoder, PROTOCOL, file_sha
from zerocontext_models_italiani import MODELS, _load_transformer, _encode


def model_meta(name, revision, dim, instructions=False):
    return ModelMeta.create_empty({"name": name, "revision": revision, "embed_dim": dim,
        "framework": ["PyTorch"], "similarity_fn_name": ScoringFunction.COSINE,
        "use_instructions": instructions})


class ExportedWordMean(WordMeanEncoder):
    def __init__(self, folder, name):
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        self.meta = {"dim": manifest["embedding_dim"], "vectors_file": "embeddings.npy"}
        self.matrix = np.load(folder / "embeddings.npy", mmap_mode="r", allow_pickle=False)
        with (folder / "vocab_index.csv").open(encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        if [int(r["matrix_index"]) for r in rows] != list(range(len(rows))):
            raise ValueError("Indice non contiguo")
        self.words = [r["word"] for r in rows]
        self.index = {w: i for i, w in enumerate(self.words)}
        if (len(self.index) != len(rows) or self.matrix.shape != (len(rows), self.meta["dim"]) or
                self.matrix.dtype != np.dtype("float32") or manifest["invalid_embedding_count"]):
            raise ValueError("Output non valido o non allineato")
        if not np.isfinite(self.matrix).all() or np.max(np.abs(np.linalg.norm(self.matrix, axis=1) - 1)) > 1e-4:
            raise ValueError("Norme o valori della matrice non validi")
        self.vocab_sha = hashlib.sha256(("\n".join(self.words) + "\n").encode()).hexdigest()
        self.vector_sha = file_sha(folder / "embeddings.npy")
        self.stats = {"texts": 0, "tokens": 0, "covered_tokens": 0, "oov_tokens": 0}
        self.mteb_model_meta = model_meta(f"Zerocade/{name}-{PROTOCOL}", self.vector_sha, self.meta["dim"]).model_copy(update={"framework": ["NumPy"]})


class DenseEncoder(AbsEncoder):
    def __init__(self, spec, device, batch_size, max_length):
        self.spec, self.batch_size = spec, batch_size
        self.model = _load_transformer(spec, device, max_length)
        self.mteb_model_meta = model_meta(spec["repo"], spec["revision"],
            self.model.get_sentence_embedding_dimension(), bool(spec["prefix"]))

    def encode(self, inputs, *, task_metadata, hf_split, hf_subset, prompt_type=None, **kwargs):
        texts = [text for batch in inputs for text in batch["text"]]
        result = _encode(self.model, texts, self.spec["prefix"], self.batch_size)
        if (np.linalg.norm(result, axis=1) < 1e-12).any():
            raise ValueError("Un testo STS22 ha prodotto un vettore nullo")
        return result


def evaluate(encoder, output, name):
    tasks = mteb.get_tasks(tasks=["STS22.v2"], languages=["ita"],
                          exclusive_language_filter=True, eval_splits=["test"])
    if len(tasks) != 1 or tasks[0].hf_subsets != ["it"] or tasks[0].metadata.dataset["revision"] != DATASET_REVISION:
        raise ValueError("Task o dataset diverso dal confronto precedente")
    tasks[0].load_data()
    pairs = len(tasks[0].dataset["it"]["test"])
    result = mteb.evaluate(encoder, tasks, cache=ResultCache(output / "cache"),
                           overwrite_strategy="always", co2_tracker=False, raise_error=True,
                           encode_kwargs={"batch_size": 8}, show_progress_bar=False,
                           public_only=True, num_proc=1)
    result.to_disk(output / f"{name}.json")
    scores = result.task_results[0].scores["test"]
    if len(scores) != 1 or scores[0]["hf_subset"] != "it":
        raise ValueError("Risultati non limitati al sottoinsieme italiano")
    score = float(scores[0]["main_score"])
    if not np.isfinite(score):
        raise ValueError("Score non finito")
    return {"score_100": score * 100, "cosine_spearman": score, "test_pairs": pairs, "all_scores": scores[0]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", choices=MODELS, default=["bge-m3-italian", "eurodense"])
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--output-root", type=Path, default=Path(__file__).parent / "outputs")
    args = parser.parse_args()
    output = args.output_root / "mteb_italiani"
    output.mkdir(parents=True, exist_ok=True)
    report = {"created_at_utc": datetime.now(timezone.utc).isoformat(),
              "task": "STS22.v2", "subset": "it", "split": "test", "dataset_revision": DATASET_REVISION,
              "scope": "Single task; not an overall MTEB leaderboard score",
              "packages": {n: importlib.metadata.version(n) for n in ("mteb", "torch", "transformers", "sentence-transformers", "numpy")},
              "device": torch.cuda.get_device_name(0) if args.device == "cuda" else "cpu",
              "wordmean_protocol": PROTOCOL, "native_max_length": args.max_length, "models": {}}
    summary_path = output / "summary.json"
    if summary_path.exists():
        previous = json.loads(summary_path.read_text(encoding="utf-8"))
        comparable = ("task", "subset", "split", "dataset_revision", "wordmean_protocol", "native_max_length", "packages")
        if all(previous.get(key) == report[key] for key in comparable):
            report["models"] = previous.get("models", {})
    baseline_path = args.output_root / "mteb_profili/summary.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8")) if baseline_path.exists() else None
    for name in args.models:
        spec = MODELS[name]
        folder = args.output_root / spec["out"]
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("model_revision") != spec["revision"]:
            raise ValueError("Output generato con una revisione diversa o non registrata")
        encoder = ExportedWordMean(folder, name)
        if baseline and encoder.vocab_sha != baseline["profiles"]["original"]["vocab_sha256"]:
            raise ValueError("Vocabolario diverso dalla banca originale del benchmark")
        print(f"MTEB banca {name}: {PROTOCOL}", flush=True)
        wordmean = evaluate(encoder, output, name + "_wordmean")
        wordmean["coverage"] = encoder.stats
        wordmean["vocab_sha256"] = encoder.vocab_sha
        hashes = {f: file_sha(folder / f) for f in ("manifest.json", "vocab_index.csv", "embeddings.npy")}
        del encoder
        gc.collect()
        report["models"][name] = {"repo": spec["repo"], "revision": spec["revision"],
                                  "artifact_sha256": hashes, "wordmean": wordmean,
                                  "evaluated_at_utc": datetime.now(timezone.utc).isoformat()}
        (output / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{name} banca: {wordmean['score_100']:.4f}/100", flush=True)
        print(f"MTEB modello {name}: encoder contestuale, limite {args.max_length} token", flush=True)
        encoder = DenseEncoder(spec, args.device, args.batch_size, args.max_length)
        native = evaluate(encoder, output, name + f"_native{args.max_length}")
        native["input_prefix_both_sides"] = spec["prefix"]
        native["max_length"] = args.max_length
        report["models"][name]["native"] = native
        (output / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{name} modello: {native['score_100']:.4f}/100", flush=True)
        del encoder
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
