#!/usr/bin/env python3
"""Confronto prompt lessicali/definizioni per BGE-M3 Italian.
Input: stessa vocab_index.csv generata da giochi.sqlite3 nel pacchetto precedente.
ATTENZIONE: migliora o peggiora le classiche relazioni tra parole, non garantisce STS.
Esempi:
  py 04_prompt_context_bge.py --mode lemma --target mare
  py 04_prompt_context_bge.py --mode multi --batch-size 8
  py 04_prompt_context_bge.py --mode definitions --definitions-csv definizioni.csv
"""
import argparse
import csv
import json
from pathlib import Path
import numpy as np
from zc_bge_common import (MODEL_ID, load_artifact, normalize,
                           optional_benchmark, show_neighbors)

TEMPLATES = {
    "bare": ["{word}"],
    "lemma": ["Il lemma italiano «{word}»."],
    "neutral": ["Il termine italiano «{word}» indica un concetto."],
    "multi": ["{word}", "Il lemma italiano «{word}».",
              "Il termine italiano «{word}» indica un concetto."],
}


def read_definitions(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not {"word", "definition"}.issubset(reader.fieldnames or []):
            raise ValueError("Il CSV deve contenere le colonne word,definition")
        return {r["word"].strip().casefold(): r["definition"].strip()
                for r in reader if r["word"].strip() and r["definition"].strip()}


def main():
    p = argparse.ArgumentParser(description="Prompt/definizioni BGE-M3 Italian")
    p.add_argument("--input", default="outputs/bge_m3_italian")
    p.add_argument("--out", default=None)
    p.add_argument("--mode", choices=[*TEMPLATES, "definitions"], default="multi")
    p.add_argument("--definitions-csv")
    p.add_argument("--missing-definition", choices=["error", "bare"], default="error")
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--chunk-size", type=int, default=128)
    p.add_argument("--max-seq-length", type=int, default=128)
    p.add_argument("--device", default=None)
    p.add_argument("--pairs-csv")
    p.add_argument("--target")
    p.add_argument("--top", type=int, default=20)
    args = p.parse_args()
    if min(args.batch_size, args.chunk_size, args.max_seq_length) < 1:
        p.error("Batch, chunk e max-seq-length devono essere positivi")
    original, rows, words = load_artifact(args.input)
    definitions = {}
    if args.mode == "definitions":
        if not args.definitions_csv:
            p.error("Con --mode definitions devi fornire --definitions-csv")
        definitions = read_definitions(args.definitions_csv)
        missing = [w for w in words if w.casefold() not in definitions]
        if missing and args.missing_definition == "error":
            p.error(f"Mancano {len(missing)} definizioni, per esempio: {missing[:5]}. "
                    "Usa --missing-definition bare per il fallback esplicito.")
        print(f"Definizioni presenti: {len(words)-len(missing)} / {len(words)}")
    from sentence_transformers import SentenceTransformer
    print(f"Caricamento modello {MODEL_ID} (download automatico se assente)...")
    kwargs = {"device": args.device} if args.device else {}
    revision = "f38acb8fc0bb15c910da5b44f0c93eb1c7df3b1f"
    model = SentenceTransformer(MODEL_ID, revision=revision, **kwargs)
    model.max_seq_length = args.max_seq_length
    out = Path(args.out or f"outputs/bge_prompt_{args.mode}")
    if (out / "embeddings.npy").exists():
        raise FileExistsError(f"Output già esistente: {out}. Specifica --out.")
    out.mkdir(parents=True, exist_ok=True)
    tmp = out / "embeddings.partial.npy"
    d = original.shape[1]
    mm = np.lib.format.open_memmap(tmp, mode="w+", shape=(len(words), d), dtype=np.float32)
    try:
        for start in range(0, len(words), args.chunk_size):
            ws = words[start:start+args.chunk_size]
            templates = TEMPLATES.get(args.mode)
            if args.mode == "definitions":
                prompts = [f"{w}: {definitions[w.casefold()]}" if w.casefold() in definitions
                           else w for w in ws]
                batches = [prompts]
            else:
                batches = [[template.format(word=w) for w in ws]
                           for template in templates]
            accum = np.zeros((len(ws), d), dtype=np.float32)
            for inputs in batches:
                vectors = np.asarray(model.encode(
                    inputs, batch_size=args.batch_size, convert_to_numpy=True,
                    normalize_embeddings=True, show_progress_bar=False
                ), dtype=np.float32)
                if vectors.shape != accum.shape:
                    raise ValueError("Dimensione embeddings inattesa")
                accum += vectors
            mm[start:start+len(ws)] = normalize(accum)
            if start == 0 or start % 2048 < args.chunk_size:
                print(f"  {start+len(ws):,}/{len(words):,}", flush=True)
        mm.flush()
    except BaseException:
        del mm
        tmp.unlink(missing_ok=True)
        raise
    del mm
    tmp.replace(out / "embeddings.npy")
    # Copia indice senza reinterpretare i collegamenti SQLite.
    import shutil
    shutil.copy2(Path(args.input) / "vocab_index.csv", out / "vocab_index.csv")
    (out / "manifest.json").write_text(json.dumps({
        "model_repo": MODEL_ID, "technique": "prompt_context",
        "model_revision": revision,
        "mode": args.mode, "input": args.input, "dim": d,
        "max_seq_length": args.max_seq_length,
        "definitions_csv": args.definitions_csv,
        "missing_definition": args.missing_definition,
        "lexicon_size": len(words), "l2_normalized": True
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Salvato:", out / "embeddings.npy")
    new, _, _ = load_artifact(out)
    optional_benchmark(original, new, words, args.pairs_csv)
    if args.target:
        show_neighbors(new, words, args.target, args.top, rows)

if __name__ == "__main__":
    main()
