"""Confronto riproducibile Model2Vec su STS22.v2, solo test italiano.

Eseguire con Python/.venv-mteb dopo aver installato requirements-mteb.txt.
Non legge o modifica il DB del gioco. Non calcola la media MTEB completa.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import mteb
import numpy as np
from huggingface_hub import snapshot_download
from mteb.cache import ResultCache
from mteb.models.abs_encoder import AbsEncoder
from mteb.models.model_meta import ModelMeta, ScoringFunction


MODELS = {
    "turbox": ("C10X/Qwen3-Embedding-TurboX", "e0aa588c1cf9900a47679c497ecaccce113c1d69"),
    "harrier_m2v": ("rahulydc/harrier-m2v", "058d189598b134788bb6cf06beaa12e16b3deb1a"),
}
DATASET_REVISION = "d31f33a128469b20e357535c39b82fb3c3f6f2bd"


class StaticMTEBEncoder(AbsEncoder):
    """Stesso encoder StaticModel usato dai due generatori di vettori."""

    def __init__(self, repo: str, revision: str):
        from model2vec import StaticModel
        snapshot = Path(snapshot_download(
            repo_id=repo, revision=revision,
            allow_patterns=["config.json", "tokenizer.json", "model.safetensors"],
        ))
        self.artifact_hashes = {}
        for name in ("config.json", "tokenizer.json", "model.safetensors"):
            with (snapshot / name).open("rb") as stream:
                self.artifact_hashes[name] = hashlib.file_digest(stream, "sha256").hexdigest()
        self.model = StaticModel.from_pretrained(snapshot)
        self.mteb_model_meta = ModelMeta.create_empty({
            "name": repo, "revision": revision,
            "embed_dim": self.model.dim, "framework": ["NumPy", "safetensors"],
            "similarity_fn_name": ScoringFunction.COSINE,
            "use_instructions": False, "reference": f"https://huggingface.co/{repo}",
        })

    def encode(self, inputs, *, task_metadata, hf_split, hf_subset,
               prompt_type=None, **kwargs):
        sentences = [text for batch in inputs for text in batch["text"]]
        vectors = np.asarray(self.model.encode(sentences), dtype=np.float32)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        if not np.isfinite(vectors).all() or (norms <= 0).any():
            raise ValueError("Embedding nullo o non finito nel benchmark")
        return vectors / norms


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "outputs/mteb")
    parser.add_argument("--models", nargs="+", choices=MODELS, default=list(MODELS))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Single task only; not an overall MTEB leaderboard score",
        "task": "STS22.v2", "subset": "it", "split": "test",
        "metric": "cosine_spearman", "display_scale": "raw correlation multiplied by 100",
        "dataset": "mteb/sts22-crosslingual-sts", "dataset_revision": DATASET_REVISION,
        "packages": {name: importlib.metadata.version(name) for name in
                     ("mteb", "model2vec", "numpy", "datasets", "torch")},
        "encoding": "StaticModel.encode default tokenization and pooling, float32 L2, no prompt",
        "models": {},
    }
    for name in args.models:
        repo, revision = MODELS[name]
        print(f"Valutazione {repo} @ {revision}", flush=True)
        tasks = mteb.get_tasks(tasks=["STS22.v2"], languages=["ita"],
                               exclusive_language_filter=True, eval_splits=["test"])
        if len(tasks) != 1 or tasks[0].hf_subsets != ["it"]:
            raise ValueError("Il benchmark deve contenere soltanto il sottoinsieme italiano")
        if tasks[0].metadata.dataset["revision"] != DATASET_REVISION:
            raise ValueError("La revisione del dataset MTEB e' cambiata")
        tasks[0].load_data()
        test_pairs = len(tasks[0].dataset["it"]["test"])
        encoder = StaticMTEBEncoder(repo, revision)
        start = time.perf_counter()
        result = mteb.evaluate(
            encoder, tasks, cache=ResultCache(args.output / "cache"),
            overwrite_strategy="always", co2_tracker=False, raise_error=True,
            encode_kwargs={"batch_size": 512}, show_progress_bar=False,
            public_only=True, num_proc=1,
        )
        result.to_disk(args.output / f"{name}.json")
        scores = result.task_results[0].scores["test"]
        if len(scores) != 1 or scores[0]["hf_subset"] != "it":
            raise ValueError("Risultati inattesi: occorre solo il test italiano")
        score = float(scores[0]["main_score"])
        report["models"][name] = {
            "repo": repo, "revision": revision,
            "cosine_spearman": score, "score_100": score * 100,
            "seconds": time.perf_counter() - start,
            "artifact_sha256": encoder.artifact_hashes,
            "test_pairs": test_pairs,
            "all_scores": scores[0],
        }
        (args.output / "summary.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{name}: Spearman={score:.8f}; punteggio={score * 100:.4f}/100", flush=True)
        del encoder


if __name__ == "__main__":
    main()
