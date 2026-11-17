#!/usr/bin/env python3
"""Ensemble pesato BGE-M3 Italian + EuroDense, su stessi lemmi e stessi ID.
Rappresentazione concatena sqrt(w) * vettore BGE e sqrt(1-w) * vettore EuroDense.
I prodotti scalari dei vettori risultanti equivalgono ESATTAMENTE alla somma
pesata dei coseni, senza imporre che i due spazi abbiano coordinate comparabili.
Esempio: py 03_ensemble_bge_eurodense.py --weight-bge 0.6 --target mare
"""
import argparse
import numpy as np
from zc_bge_common import (load_artifact, matrix_sanity, normalize, save_transform,
                           optional_benchmark, show_neighbors)

def main():
    p = argparse.ArgumentParser(description="Ensemble BGE-M3 Italian + EuroDense")
    p.add_argument("--bge", default="outputs/bge_m3_italian")
    p.add_argument("--euro", default="outputs/eurodense_435m")
    p.add_argument("--out", default=None)
    p.add_argument("--weight-bge", type=float, default=0.5)
    p.add_argument("--pairs-csv")
    p.add_argument("--target")
    p.add_argument("--top", type=int, default=20)
    args = p.parse_args()
    if not 0 <= args.weight_bge <= 1:
        p.error("--weight-bge deve essere fra 0 e 1")
    bge, rows, words = load_artifact(args.bge)
    euro, euro_rows, euro_words = load_artifact(args.euro)
    matrix_sanity(bge); matrix_sanity(euro)
    if set(words) != set(euro_words):
        miss = set(words) ^ set(euro_words)
        raise ValueError(f"Vocabolari diversi: {len(miss)} parole non coincidenti. Ricostruisci entrambe le matrici.")
    euro_lookup = {w: i for i, w in enumerate(euro_words)}
    euro_order = np.array([euro_lookup[w] for w in words], dtype=np.int64)
    # Evita collisioni tra dizionario bersagli e quello tentativi.
    euro_by_word = {row["word"]: row for row in euro_rows}
    for bge_row in rows:
        er = euro_by_word[bge_row["word"]]
        for name in ("in_context__vocab", "in_context__secrets"):
            if bge_row.get(name) != er.get(name):
                raise ValueError(f"Metadati diversi su '{bge_row['word']}' ({name})")
    w = args.weight_bge
    out = args.out or f"outputs/ensemble_bge_euro_w_{w:.2f}"
    from pathlib import Path
    cursor = [0]
    def sequential_fusion(x_chunk):
        start = cursor[0]
        end = start + len(x_chunk)
        cursor[0] = end
        e_chunk = np.asarray(euro[euro_order[start:end]], dtype=np.float32)
        a = normalize(x_chunk)
        b = normalize(e_chunk)
        return np.concatenate([np.sqrt(w) * a, np.sqrt(1-w) * b], axis=1)
    saved = save_transform(out, rows, bge, bge.shape[1] + euro.shape[1], sequential_fusion,
              metadata={"technique": "weighted_concat_cosine_ensemble", "weight_bge": w,
                        "weight_eurodense": 1-w, "bge_source": args.bge, "euro_source": args.euro,
                        "remark": "Cosine equivale a w*cos(BGE)+(1-w)*cos(EuroDense)."})
    print("Salvato:", saved)
    new, _, _ = load_artifact(out)
    optional_benchmark(bge, new, words, args.pairs_csv)
    if args.target:
        show_neighbors(new, words, args.target, args.top, rows)

if __name__ == "__main__":
    main()
