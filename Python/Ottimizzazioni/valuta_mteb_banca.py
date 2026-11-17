"""Valuta una matrice ottimizzata con lo stesso protocollo delle banche originali."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import numpy as np
from valuta_mteb_profili import WordMeanEncoder, PROTOCOL, file_sha
from valuta_mteb_italiani import evaluate, model_meta


class ArtifactEncoder(WordMeanEncoder):
    def __init__(self, folder, name):
        self.matrix = np.load(folder / "embeddings.npy", mmap_mode="r", allow_pickle=False)
        with (folder / "vocab_index.csv").open(encoding="utf-8-sig", newline="") as f:
            self.rows = list(csv.DictReader(f))
        self.words = [row["word"] for row in self.rows]
        if [int(r["matrix_index"]) for r in self.rows] != list(range(len(self.rows))):
            raise ValueError("Indice non contiguo")
        if self.matrix.ndim != 2 or self.matrix.shape[0] != len(self.words) or self.matrix.dtype != np.float32:
            raise ValueError("Matrice non allineata all'indice float32")
        self.meta = {"dim": self.matrix.shape[1]}
        self.index = {w: i for i, w in enumerate(self.words)}
        if len(self.index) != len(self.words):
            raise ValueError("Parole duplicate")
        self.norm_error = 0.0
        for start in range(0, len(self.words), 2048):
            chunk = self.matrix[start:start+2048]
            if not np.isfinite(chunk).all():
                raise ValueError("Vettori non finiti")
            self.norm_error = max(self.norm_error, float(np.max(np.abs(np.linalg.norm(chunk, axis=1)-1))))
        if self.norm_error > 1e-4:
            raise ValueError("Vettori nulli o non normalizzati")
        self.vocab_sha = hashlib.sha256(("\n".join(self.words)+"\n").encode()).hexdigest()
        self.vector_sha = file_sha(folder / "embeddings.npy")
        self.stats = {"texts": 0, "tokens": 0, "covered_tokens": 0, "oov_tokens": 0}
        self.mteb_model_meta = model_meta("Zerocade/" + name + "-" + PROTOCOL,
                                        self.vector_sha, self.meta["dim"]).model_copy(update={"framework": ["NumPy"]})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    baseline = json.loads((Path(__file__).resolve().parent.parent / "outputs/mteb_profili/summary.json").read_text(encoding="utf-8"))
    encoder = ArtifactEncoder(args.input, args.name)
    if encoder.vocab_sha != baseline["profiles"]["original"]["vocab_sha256"]:
        raise ValueError("Vocabolario diverso da quello del confronto originale")
    original_index = Path(__file__).resolve().parent.parent / "outputs/bge_m3_italian/vocab_index.csv"
    with original_index.open(encoding="utf-8-sig", newline="") as f:
        expected = list(csv.DictReader(f))
    if encoder.rows != expected:
        raise ValueError("Indici o ruoli delle parole cambiati")
    report = evaluate(encoder, args.out, args.name)
    report.update({"name": args.name, "protocol": PROTOCOL, "task": "STS22.v2", "subset": "it", "split": "test",
                   "evaluated_at_utc": datetime.now(timezone.utc).isoformat(),
                   "input": str(args.input.resolve()), "dim": encoder.meta["dim"], "words": len(encoder.words),
                   "secrets": sum(r["in_context__secrets"] == "1" for r in encoder.rows),
                   "maximum_norm_error": encoder.norm_error, "coverage": encoder.stats,
                   "vocab_sha256": encoder.vocab_sha, "matrix_sha256": encoder.vector_sha,
                   "delta_original": report["score_100"] - baseline["profiles"]["original"]["score_100"]})
    if report["test_pairs"] != 407 or report["coverage"]["texts"] != 814:
        raise ValueError("Test incompleto")
    (args.out / "score.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("name", "score_100", "dim", "words", "secrets", "delta_original")}), flush=True)


if __name__ == "__main__":
    main()
