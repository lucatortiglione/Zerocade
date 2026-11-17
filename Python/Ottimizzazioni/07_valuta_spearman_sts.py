#!/usr/bin/env python3
"""Misura Spearman su coppie di frasi italiane (STS, test held-out).
Formato CSV: sentence1,sentence2,score.
Valuta BGE-M3 Italian puro, ABTT, PCA-whitening e/o ensemble.
È distinto dal benchmark lessicale fra singole parole fornito dagli script 01..04.
Esempi:
 py 07_valuta_spearman_sts.py --csv sts_test.csv --mode raw
 py 07_valuta_spearman_sts.py --csv sts_test.csv --mode abtt --transform outputs/bge_abtt_remove_3/transform.npz
 py 07_valuta_spearman_sts.py --csv sts_test.csv --mode pca --transform outputs/bge_whitening_512d_alpha_0.5/transform.npz
 py 07_valuta_spearman_sts.py --csv sts_test.csv --mode ensemble --weight-bge 0.6
"""
import argparse
import csv
import json
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr
from zc_bge_common import MODEL_ID, normalize

EURO_MODEL_ID = "OPI-PIB/EuroDense-435M"
BGE_REVISION = "f38acb8fc0bb15c910da5b44f0c93eb1c7df3b1f"
EURO_PREFIX = "Instruct: Retrieve semantically similar text.\nQuery: "


def read_sts(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not {"sentence1", "sentence2", "score"}.issubset(reader.fieldnames or []):
            raise ValueError("Richieste colonne sentence1,sentence2,score")
        pairs = []
        for row in reader:
            if row["sentence1"].strip() and row["sentence2"].strip():
                pairs.append((row["sentence1"].strip(), row["sentence2"].strip(),
                              float(row["score"])))
    if len(pairs) < 3:
        raise ValueError("Servono almeno 3 coppie STS")
    return pairs


def encode_texts(model, texts, batch_size):
    return normalize(np.asarray(model.encode(texts, batch_size=batch_size,
                                            convert_to_numpy=True,
                                            normalize_embeddings=False,
                                            show_progress_bar=True), dtype=np.float32))


def apply_transformation(data, mode, path):
    if mode == "raw":
        return data
    if not path:
        raise ValueError("Con ABTT/PCA occorre --transform <cartella>/transform.npz")
    with np.load(path, allow_pickle=False) as p:
        mean = p["mean"]
        if mode == "abtt":
            comp = p["components"]
            centered = data - mean
            return normalize(centered - (centered @ comp.T) @ comp)
        if mode == "pca":
            comp, variance = p["components"], p["variance"]
            alpha, floor = float(p["alpha"]), float(p["floor"])
            z = (data - mean) @ comp.T
            z *= np.maximum(variance, floor) ** ((alpha - 1) / 2)
            return normalize(z)
    raise ValueError(mode)


def evaluate(cosines, gold, label):
    score = float(spearmanr(gold, cosines).statistic)
    if not np.isfinite(score):
        raise ValueError("Spearman non definito: osservazioni o predizioni costanti")
    print(f"{label:<25s}: {score:.5f} / {score*100:.2f} punti")
    return score


def main():
    p = argparse.ArgumentParser(description="Spearman STS frasi italiane")
    p.add_argument("--csv", required=True, help="CSV test reale: sentence1,sentence2,score")
    p.add_argument("--mode", choices=["raw", "abtt", "pca", "ensemble"], default="raw")
    p.add_argument("--transform", default=None)
    p.add_argument("--weight-bge", type=float, default=0.5)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--max-seq-length", type=int, default=128)
    p.add_argument("--out-json", default=None)
    args = p.parse_args()
    if not 0 <= args.weight_bge <= 1:
        p.error("--weight-bge deve essere tra 0 e 1")
    pairs = read_sts(args.csv)
    unique_text = list(dict.fromkeys([x for a, b, _ in pairs for x in (a, b)]))
    lookup = {text: i for i, text in enumerate(unique_text)}
    idx1 = np.array([lookup[a] for a, b, _ in pairs])
    idx2 = np.array([lookup[b] for a, b, _ in pairs])
    gold = np.array([score for _, _, score in pairs], dtype=np.float32)
    from sentence_transformers import SentenceTransformer
    print("Caricamento BGE-M3 Italian e codifica dei testi...")
    bge = SentenceTransformer(MODEL_ID, revision=BGE_REVISION)
    bge.max_seq_length = args.max_seq_length
    emb = encode_texts(bge, unique_text, args.batch_size)
    base_sim = (emb[idx1] * emb[idx2]).sum(axis=1)
    base_score = evaluate(base_sim, gold, "BGE originale")
    if args.mode == "ensemble":
        print("Caricamento EuroDense (richiede trust_remote_code=True):")
        euro = SentenceTransformer(EURO_MODEL_ID, trust_remote_code=True)
        euro.max_seq_length = args.max_seq_length
        ee = encode_texts(euro, [EURO_PREFIX + s for s in unique_text], args.batch_size)
        euro_sim = (ee[idx1] * ee[idx2]).sum(axis=1)
        sims = args.weight_bge * base_sim + (1 - args.weight_bge) * euro_sim
    else:
        transformed = apply_transformation(emb, args.mode, args.transform)
        sims = (transformed[idx1] * transformed[idx2]).sum(axis=1)
    new_score = evaluate(sims, gold, args.mode)
    print(f"Delta Spearman × 100: {(new_score-base_score)*100:+.3f}")
    if args.out_json:
        Path(args.out_json).write_text(json.dumps({"csv": args.csv,
            "model": MODEL_ID, "model_revision": BGE_REVISION,
            "max_seq_length": args.max_seq_length, "batch_size": args.batch_size,
            "protocol": "native-sentence-cosine",
            "mode": args.mode, "n_pairs": len(pairs),
            "spearman_base": base_score, "spearman_variant": new_score,
            "delta_points": (new_score-base_score)*100}, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
