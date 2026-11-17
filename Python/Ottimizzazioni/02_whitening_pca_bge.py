#!/usr/bin/env python3
"""PCA con whitening parziale: alpha=1 PCA, alpha=0 whitening completo.
Esempio: py 02_whitening_pca_bge.py --dims 512 --alpha 0.5
"""
import argparse
import numpy as np
from zc_bge_common import (fit_subset, load_artifact, matrix_sanity,
                           save_transform, optional_benchmark, show_neighbors)

def apply_pca_whitening(x, mean, components, variance, alpha, floor):
    scores = (x - mean) @ components.T
    # Varianza^((alpha - 1)/2): alpha=1 -> sola PCA, alpha=0 -> whitening.
    scale = np.maximum(variance, floor) ** ((alpha - 1.0) / 2.0)
    return scores * scale

def main():
    p = argparse.ArgumentParser(description="PCA e whitening regolarizzato BGE-M3 Italian")
    p.add_argument("--input", default="outputs/bge_m3_italian")
    p.add_argument("--out", default=None)
    p.add_argument("--dims", type=int, default=512)
    p.add_argument("--alpha", type=float, default=0.5)
    p.add_argument("--floor-ratio", type=float, default=1e-3,
                   help="Soglia relativa rispetto alla massima varianza PCA")
    p.add_argument("--fit-samples", type=int, default=30000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--pairs-csv")
    p.add_argument("--target")
    p.add_argument("--top", type=int, default=20)
    args = p.parse_args()
    matrix, rows, words = load_artifact(args.input)
    matrix_sanity(matrix)
    if not (1 <= args.dims < min(matrix.shape[1],
                                   args.fit_samples if args.fit_samples > 0 else len(matrix))):
        p.error("--dims deve essere positiva e inferiore alle dimensioni del fit e del modello")
    if not 0 <= args.alpha <= 1 or not 0 < args.floor_ratio <= 1:
        p.error("--alpha in [0,1] e --floor-ratio in (0,1]")
    from sklearn.decomposition import PCA
    fit = fit_subset(matrix, args.fit_samples, args.seed)
    pca = PCA(n_components=args.dims, svd_solver="randomized", random_state=args.seed)
    pca.fit(fit)
    mean = pca.mean_.astype(np.float32)[None, :]
    components = pca.components_.astype(np.float32)
    variance = pca.explained_variance_.astype(np.float32)
    floor = max(float(variance[0]) * args.floor_ratio, 1e-10)
    out = args.out or f"outputs/bge_whitening_{args.dims}d_alpha_{args.alpha:g}"
    saved = save_transform(out, rows, matrix, args.dims,
              lambda b: apply_pca_whitening(b, mean, components, variance, args.alpha, floor),
              metadata={"technique": "PCA_partial_whitening", "alpha": args.alpha,
                        "dims": args.dims, "variance_floor": floor,
                        "fit_samples": len(fit), "source": str(args.input)},
              params={"mean": mean, "components": components,
                      "variance": variance, "alpha": np.asarray(args.alpha),
                      "floor": np.asarray(floor)})
    print("Salvato:", saved)
    new, _, _ = load_artifact(out)
    optional_benchmark(matrix, new, words, args.pairs_csv)
    if args.target:
        show_neighbors(new, words, args.target, args.top, rows)

if __name__ == "__main__":
    main()
