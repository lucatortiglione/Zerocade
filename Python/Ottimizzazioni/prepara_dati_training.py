"""STS-B italiano train/dev, senza sovrapposizioni testuali con STS22 test."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys
import unicodedata

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from datasets import load_dataset
import mteb
from valuta_mteb import DATASET_REVISION

SOURCE = "PhilipMay/stsb_multi_mt"
REVISION = "3acaa3dd8c91649e0b8e627ffad891f059e47c8c"


def canonical(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def texts(rows):
    return {canonical(s) for a, b, _ in rows for s in (a, b)}


def unique(rows):
    groups = {}
    for a, b, score in rows:
        if not a.strip() or not b.strip() or not math.isfinite(score) or not 0 <= score <= 5:
            raise ValueError("Testi o punteggi non validi")
        key = tuple(sorted((canonical(a), canonical(b))))
        if key not in groups:
            groups[key] = [a, b, []]
        groups[key][2].append(score)
    return [(a, b, statistics.fmean(scores)) for a, b, scores in groups.values()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    out = parser.parse_args().out
    if out.exists() and any(out.iterdir()):
        raise FileExistsError(f"La cartella {out} contiene già dei file")
    out.mkdir(parents=True, exist_ok=True)
    ds = load_dataset(SOURCE, "it", revision=REVISION)
    task = mteb.get_tasks(tasks=["STS22.v2"], languages=["ita"], exclusive_language_filter=True, eval_splits=["test"])[0]
    assert task.metadata.dataset["revision"] == DATASET_REVISION
    task.load_data()
    test = [(r["sentence1"], r["sentence2"], float(r["score"])) for r in task.dataset["it"]["test"]]
    blocked = texts(test)
    dev_raw = [(r["sentence1"], r["sentence2"], float(r["similarity_score"])) for r in ds["dev"]]
    train_raw = [(r["sentence1"], r["sentence2"], float(r["similarity_score"])) for r in ds["train"]]
    dev = unique([r for r in dev_raw if not texts([r]) & blocked])
    train_blocked = blocked | texts(dev)
    train = unique([r for r in train_raw if not texts([r]) & train_blocked])
    assert not texts(train) & texts(dev)
    assert not (texts(train) | texts(dev)) & texts(test)
    assert len(test) == 407 and len(train) > 100 and len(dev) > 100
    hashes = {}
    for name, rows in [("train", train), ("dev", dev), ("sts22_test", test)]:
        path = out / f"{name}.csv"
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["sentence1", "sentence2", "score"])
            writer.writerows(rows)
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    report = {"source": SOURCE, "revision": REVISION, "language": "it",
              "limitation": "Machine-translated Italian sentences; human similarity labels inherited from the original English STS-B.",
              "train_pairs": len(train), "dev_pairs": len(dev), "test_sts22_pairs": len(test),
              "original_train_pairs": len(train_raw), "original_dev_pairs": len(dev_raw),
              "filter": "NFKC/casefold/whitespace canonicalization; no text shared across train/dev/STS22 test; repeated or reversed pairs averaged within split",
              "csv_sha256": hashes, "no_shared_texts": True,
              "test_dataset_revision": DATASET_REVISION,
              "stsb_test_used": False}
    (out / "provenance.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
