#!/usr/bin/env python3
"""Rigenera tutti i vettori del lessico con un adapter LoRA addestrato.

Carica esplicitamente la base alla revisione fissata e l'adapter salvato:
non dipende dal riconoscimento automatico dei checkpoint PEFT.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from zc_bge_common import load_artifact, normalize
from zc_bge_finetune_common import BASE_MODEL, BASE_REVISION, load_lora_weights_strict


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", required=True, help="Cartella best_model del training")
    p.add_argument("--input", default="Python/outputs/bge_m3_italian")
    p.add_argument("--out", required=True)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--chunk-size", type=int, default=2048)
    p.add_argument("--max-seq-length", type=int, default=64)
    p.add_argument("--device", default="cuda", choices=["cpu", "cuda"])
    args = p.parse_args()
    if min(args.batch_size, args.chunk_size, args.max_seq_length) < 1:
        p.error("Batch, chunk e max_seq_length devono essere positivi")
    source, rows, words = load_artifact(args.input)
    model_dir, out = Path(args.model), Path(args.out)
    configs = list(model_dir.rglob("adapter_config.json"))
    if len(configs) != 1:
        raise ValueError(f"Atteso un adapter salvato, trovati {len(configs)}")
    adapter_dir = configs[0].parent
    weights = list(adapter_dir.glob("adapter_model.safetensors"))
    if len(weights) != 1:
        raise ValueError("Richiesti pesi adapter in formato safetensors")
    config = json.loads(configs[0].read_text(encoding="utf-8"))
    if config.get("base_model_name_or_path") != BASE_MODEL:
        raise ValueError("La base dell'adapter non corrisponde a BGE-M3 Italian")
    if (out / "embeddings.npy").exists():
        raise FileExistsError(out / "embeddings.npy")

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(BASE_MODEL, revision=BASE_REVISION, device=args.device)
    model.max_seq_length = args.max_seq_length
    from peft import LoraConfig
    model.add_adapter(LoraConfig.from_pretrained(str(adapter_dir)), adapter_name="trained")
    reload_report = load_lora_weights_strict(model, adapter_dir, "trained")
    if model.active_adapters() != ["trained"]:
        raise RuntimeError("Adapter addestrato non attivo")

    def encode(texts):
        return normalize(np.asarray(model.encode(
            texts, batch_size=args.batch_size, convert_to_numpy=True,
            normalize_embeddings=True, show_progress_bar=False,
        ), dtype=np.float32))

    # Prova funzionale: disabilitare LoRA deve cambiare effettivamente i vettori.
    probes = ["cane", "gatto", "amore", "città", "scienza"]
    adapted = encode(probes)
    model.disable_adapters()
    try:
        unadapted = encode(probes)
    finally:
        model.enable_adapters()
    adapter_effect = float(np.max(np.abs(adapted - unadapted)))
    if not np.isfinite(adapter_effect) or adapter_effect <= 1e-7:
        raise RuntimeError("L'adapter caricato non modifica gli embeddings")
    print(f"Adapter attivo; differenza massima sui probe: {adapter_effect:.8f}", flush=True)

    out.mkdir(parents=True, exist_ok=True)
    tmp = out / "embeddings.partial.npy"
    shape = (len(words), source.shape[1])
    matrix = np.lib.format.open_memmap(tmp, mode="w+", dtype=np.float32, shape=shape)
    try:
        for start in range(0, len(words), args.chunk_size):
            batch = words[start:start + args.chunk_size]
            vectors = encode(batch)
            if vectors.shape != (len(batch), shape[1]):
                raise ValueError(f"Forma inattesa: {vectors.shape}")
            matrix[start:start + len(batch)] = vectors
            print(f"  {start + len(batch):,}/{len(words):,}", flush=True)
        matrix.flush()
    except BaseException:
        del matrix
        tmp.unlink(missing_ok=True)
        raise
    del matrix
    tmp.replace(out / "embeddings.npy")
    shutil.copy2(Path(args.input) / "vocab_index.csv", out / "vocab_index.csv")
    (out / "manifest.json").write_text(json.dumps({
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "technique": "lora", "model_repo": BASE_MODEL, "model_revision": BASE_REVISION,
        "adapter": str(adapter_dir.resolve()), "adapter_sha256": sha256(weights[0]),
        "adapter_config": config, "adapter_probe_max_abs_difference": adapter_effect,
        "checkpoint_reload": reload_report,
        "input": args.input, "vocab_size": len(words), "embedding_dim": shape[1],
        "max_seq_length": args.max_seq_length, "prefix": "", "l2_normalized": True,
        "matrix_sha256": sha256(out / "embeddings.npy"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Banca rigenerata:", out, flush=True)


if __name__ == "__main__":
    main()
