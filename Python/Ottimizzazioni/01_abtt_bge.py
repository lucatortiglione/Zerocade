#!/usr/bin/env python3
"""ABTT: rimuove 0..k componenti principali dai vettori BGE-M3 Italian.
Esempio: py 01_abtt_bge.py --remove 3 --fit-samples 30000
"""
import argparse
from pathlib import Path
import numpy as np
from zc_bge_common import (fit_subset, load_artifact, matrix_sanity,
                           save_transform, optional_benchmark, show_neighbors)

def apply_abtt(x, mean, components):
    centered = x - mean
    if len(components):
        centered = centered - (centered @ components.T) @ components
    return centered

def main():
    p = argparse.ArgumentParser(description="ABTT sperimentale su BGE-M3 Italian")
    p.add_argument("--input", default="outputs/bge_m3_italian")
    p.add_argument("--out", default=None)
    p.add_argument("--remove", type=int, default=3)
    p.add_argument("--fit-samples", type=int, default=30000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--pairs-csv", help="CSV di valutazione lessicale: word1,word2,score")
    p.add_argument("--target", help="Mostra primi vicini semantici")
    p.add_argument("--top", type=int, default=20)
    args = p.parse_args()
    matrix, rows, words = load_artifact(args.input)
    matrix_sanity(matrix)
    d = matrix.shape[1]
    if not 0 <= args.remove < min(d, args.fit_samples if args.fit_samples > 0 else len(matrix)):
        p.error(f"--remove deve essere fra 0 e {d-1} e inferiore alla dimensione del fit")
    fit = fit_subset(matrix, args.fit_samples, args.seed)
    mean = fit.mean(axis=0, keepdims=True)
    if args.remove:
        from sklearn.decomposition import PCA
        estimator = PCA(n_components=args.remove, svd_solver="randomized", random_state=args.seed)
        estimator.fit(fit)
        components = estimator.components_.astype(np.float32)
    else:
        components = np.empty((0, d), dtype=np.float32)
    out = args.out or f"outputs/bge_abtt_remove_{args.remove}"
    saved = save_transform(out, rows, matrix, d,
             lambda b: apply_abtt(b, mean, components),
             metadata={"technique": "ABTT", "removed_components": args.remove,
                       "fit_samples": len(fit), "source": str(args.input)},
             params={"mean": mean, "components": components})
    print("Salvato:", saved)
    new_matrix, _, _ = load_artifact(out)
    optional_benchmark(matrix, new_matrix, words, args.pairs_csv)
    if args.target:
        show_neighbors(new_matrix, words, args.target, args.top, rows)

if __name__ == "__main__":
    main()
