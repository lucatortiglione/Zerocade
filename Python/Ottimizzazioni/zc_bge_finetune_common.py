#!/usr/bin/env python3
"""Fine-tuning BGE-M3 Italian con LoRA: CoSENT o AnglE e valutazione separata.
Dataset CSV reali di similarità italiana: sentence1,sentence2,score.
Dev non deve essere usato come test; train/dev/test non devono sovrapporsi.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
from collections import Counter

BASE_MODEL = "albertobarnabo/bge-m3-italian"
BASE_REVISION = "f38acb8fc0bb15c910da5b44f0c93eb1c7df3b1f"


def load_lora_weights_strict(model, checkpoint, adapter_name="default"):
    """Carica tutti e soli i pesi LoRA A/B, verificando nomi, forme e valori.

    Transformers 5.3 non rimuove il prefisso PEFT base_model.model per XLM-R;
    il loader automatico lascia quindi l'adapter non addestrato. La conversione
    esplicita riguarda soltanto la serializzazione, senza modificare i pesi.
    """
    import torch
    from safetensors.torch import load_file
    saved = load_file(str(Path(checkpoint) / "adapter_model.safetensors"), device="cpu")
    target = model.transformers_model
    parameters = dict(target.named_parameters())
    expected = {k for k in parameters
                if any(f".{kind}.{adapter_name}." in k for kind in ("lora_A", "lora_B"))}
    mapped = {}
    for key, value in saved.items():
        name = key.removeprefix("base_model.model.")
        for kind in ("lora_A", "lora_B"):
            name = name.replace(f".{kind}.weight", f".{kind}.{adapter_name}.weight")
        if name in mapped:
            raise ValueError(f"Peso LoRA duplicato: {name}")
        mapped[name] = value
    if not expected or set(mapped) != expected:
        raise ValueError(f"Pesi LoRA non allineati: mancanti={expected-set(mapped)}, "
                         f"inattesi={set(mapped)-expected}")
    with torch.no_grad():
        for name, value in mapped.items():
            param = parameters[name]
            if param.shape != value.shape or not torch.isfinite(value).all():
                raise ValueError(f"Peso LoRA non valido: {name}")
            copied = value.to(device=param.device, dtype=param.dtype)
            param.copy_(copied)
            if not torch.equal(param, copied):
                raise RuntimeError(f"Copia LoRA non esatta: {name}")
    model.set_adapter(adapter_name)
    return {"tensors": len(mapped), "parameters": sum(v.numel() for v in mapped.values()),
            "loader": "strict-peft-prefix-conversion-v1"}


def read_supervision(path, score_max=5.0):
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        if not {"sentence1", "sentence2", "score"}.issubset(r.fieldnames or []):
            raise ValueError(f"{path}: richieste sentence1,sentence2,score")
        output = []
        for row in r:
            a, b = row["sentence1"].strip(), row["sentence2"].strip()
            if not a or not b:
                continue
            score = float(row["score"])
            if not 0 <= score <= score_max:
                raise ValueError(f"{path}: score {score} fuori [0,{score_max}]")
            output.append((a, b, score / score_max))
    if len(output) < 3:
        raise ValueError(f"{path}: servono almeno tre coppie")
    return output


def pair_keys(rows):
    return {tuple(sorted((a.casefold(), b.casefold()))) for a, b, _ in rows}


def train(loss_name: str):
    p = argparse.ArgumentParser(description=f"LoRA {loss_name} su BGE-M3 Italian")
    p.add_argument("--train-csv", required=True,
                   help="CSV supervisionato: sentence1,sentence2,score")
    p.add_argument("--dev-csv", required=True,
                   help="Validazione separata dal training")
    p.add_argument("--test-csv", default=None, help="Test finale indipendente, opzionale")
    p.add_argument("--out", default=f"models/bge_m3_italian_lora_{loss_name.lower()}")
    p.add_argument("--score-max", type=float, default=5.0)
    p.add_argument("--batch-size", type=int, default=4)
    p.add_argument("--accumulation", type=int, default=4)
    p.add_argument("--epochs", type=float, default=2.0)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--max-seq-length", type=int, default=128)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--lora-r", type=int, default=8)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    args = p.parse_args()
    if min(args.batch_size, args.accumulation, args.max_seq_length, args.lora_r) < 1 or args.score_max <= 0:
        p.error("Batch, accumulation, max_seq_length, LoRA r e score_max devono essere positivi")
    if args.epochs <= 0 or args.lr <= 0:
        p.error("Epochs e lr devono essere positivi")
    train_rows = read_supervision(args.train_csv, args.score_max)
    dev_rows = read_supervision(args.dev_csv, args.score_max)
    test_rows = read_supervision(args.test_csv, args.score_max) if args.test_csv else None
    t, d = pair_keys(train_rows), pair_keys(dev_rows)
    if t & d:
        raise ValueError(f"Leakage: {len(t & d)} coppie condivise tra train e dev")
    if test_rows:
        s = pair_keys(test_rows)
        if (t | d) & s:
            raise ValueError(f"Leakage: {len((t | d) & s)} coppie del test viste durante train/dev")
    if len({v for _, _, v in train_rows}) < 2:
        raise ValueError("Il dataset di training deve avere almeno 2 livelli di similarità")
    import torch
    from datasets import Dataset
    from peft import LoraConfig, TaskType
    from sentence_transformers import (SentenceTransformer, SentenceTransformerTrainer,
                                       SentenceTransformerTrainingArguments, losses)
    from sentence_transformers.evaluation import EmbeddingSimilarityEvaluator
    from transformers import set_seed
    set_seed(args.seed)
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA non rilevata: installa PyTorch con supporto alla RTX 5070")
    device = None if args.device == "auto" else args.device
    print(f"Caricamento {BASE_MODEL} (la prima volta scarica i pesi)...")
    model = SentenceTransformer(BASE_MODEL, revision=BASE_REVISION,
                                **({"device": device} if device else {}))
    model.max_seq_length = args.max_seq_length
    model.add_adapter(LoraConfig(
        task_type=TaskType.FEATURE_EXTRACTION, inference_mode=False,
        r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=0.05,
        target_modules=["query", "value"], bias="none"
    ))
    ds = Dataset.from_dict({"sentence1": [a for a, _, _ in train_rows],
                            "sentence2": [b for _, b, _ in train_rows],
                            "score": [float(v) for _, _, v in train_rows]})
    evaluator = EmbeddingSimilarityEvaluator(
        sentences1=[a for a, _, _ in dev_rows],
        sentences2=[b for _, b, _ in dev_rows],
        scores=[v for _, _, v in dev_rows],
        name="dev", similarity_fn_names=["cosine"], write_csv=False,
        batch_size=args.batch_size
    )
    # L'evaluator inizializza primary_metric soltanto dopo la prima valutazione.
    dev_before = evaluator(model)
    metric = evaluator.primary_metric
    if not metric:
        raise RuntimeError("L'evaluator non ha impostato la metrica di validazione")
    print("Metrica di selezione modello:", metric)
    if loss_name == "CoSENT":
        loss_fn = losses.CoSENTLoss(model)
    elif loss_name == "AnglE":
        loss_fn = losses.AnglELoss(model)
    else:
        raise ValueError(loss_name)
    out = Path(args.out)
    if out.exists() and any(out.iterdir()):
        raise FileExistsError(f"La cartella {out} contiene già dei file: scegli un'altra --out")
    args_train = SentenceTransformerTrainingArguments(
        output_dir=str(out), num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.accumulation,
        learning_rate=args.lr, warmup_ratio=0.1,
        bf16=torch.cuda.is_available() and torch.cuda.is_bf16_supported(),
        fp16=torch.cuda.is_available() and not torch.cuda.is_bf16_supported(),
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        eval_strategy="epoch", save_strategy="epoch", save_total_limit=2,
        load_best_model_at_end=False, metric_for_best_model=f"eval_{metric}",
        greater_is_better=True, report_to="none", seed=args.seed,
        logging_steps=10
    )
    trainer = SentenceTransformerTrainer(
        model=model, args=args_train, train_dataset=ds,
        loss=loss_fn, evaluator=evaluator
    )
    print("Valutazione dev prima del training:", dev_before)
    trainer.train()
    if not trainer.state.best_model_checkpoint:
        raise RuntimeError("Nessun checkpoint selezionato sul dev")
    reload_report = load_lora_weights_strict(model, trainer.state.best_model_checkpoint)
    out.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(out / "best_model"))
    dev_after = evaluator(model)
    print("Valutazione dev dopo training:", dev_after)
    if test_rows:
        test_eval = EmbeddingSimilarityEvaluator(
            sentences1=[a for a, _, _ in test_rows],
            sentences2=[b for _, b, _ in test_rows],
            scores=[v for _, _, v in test_rows],
            name="test", similarity_fn_names=["cosine"], write_csv=False,
            batch_size=args.batch_size
        )
        print("TEST finale (solo una volta dopo selezione):", test_eval(model))
    (out / "experiment.json").write_text(json.dumps({
        "base_model": BASE_MODEL, "base_revision": BASE_REVISION,
        "loss": loss_name, "adapter": "LoRA",
        "train_csv": args.train_csv, "dev_csv": args.dev_csv, "test_csv": args.test_csv,
        "train_pairs": len(train_rows), "dev_pairs": len(dev_rows),
        "test_pairs": len(test_rows) if test_rows else 0,
        "batch_size": args.batch_size, "learning_rate": args.lr,
        "accumulation": args.accumulation, "seed": args.seed,
        "lora_r": args.lora_r, "lora_alpha": args.lora_alpha,
        "dev_before": dev_before, "dev_after": dev_after,
        "best_metric": trainer.state.best_metric,
        "best_model_checkpoint": trainer.state.best_model_checkpoint,
        "checkpoint_reload": reload_report,
        "epochs": args.epochs, "max_seq_length": args.max_seq_length,
        "score_max": args.score_max
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Risultati salvati in:", out)
