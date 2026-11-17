"""Recupera un training concluso il cui reload automatico PEFT non ha caricato i pesi."""
import argparse
import json
from pathlib import Path

from zc_bge_finetune_common import (BASE_MODEL, BASE_REVISION,
                                   load_lora_weights_strict, read_supervision)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--training-dir", type=Path, required=True)
    args = parser.parse_args()
    root = args.training_dir
    experiment_path = root / "experiment.json"
    experiment = json.loads(experiment_path.read_text(encoding="utf-8"))
    checkpoint = Path(experiment["best_model_checkpoint"])
    verified = root / "best_model_verified"
    if verified.exists():
        raise FileExistsError(verified)
    from peft import LoraConfig
    from sentence_transformers import SentenceTransformer
    from sentence_transformers.evaluation import EmbeddingSimilarityEvaluator
    model = SentenceTransformer(BASE_MODEL, revision=BASE_REVISION, device="cuda")
    model.max_seq_length = experiment["max_seq_length"]
    model.add_adapter(LoraConfig.from_pretrained(str(checkpoint)))
    report = load_lora_weights_strict(model, checkpoint)
    dev = read_supervision(experiment["dev_csv"], experiment["score_max"])
    evaluator = EmbeddingSimilarityEvaluator(
        [a for a, _, _ in dev], [b for _, b, _ in dev], [s for _, _, s in dev],
        name="dev", similarity_fn_names=["cosine"], write_csv=False,
        batch_size=experiment["batch_size"],
    )
    metrics = evaluator(model)
    delta = float(metrics[evaluator.primary_metric] - experiment["best_metric"])
    if abs(delta) > 0.002:
        raise RuntimeError(f"Il checkpoint ricaricato non riproduce il dev: delta={delta}")
    model.save(str(verified))
    experiment["dev_after_failed_automatic_reload"] = experiment["dev_after"]
    experiment["dev_after"] = metrics
    experiment["checkpoint_reload"] = report
    experiment["verified_model_path"] = str(verified.resolve())
    experiment["verified_dev_delta_from_checkpoint"] = delta
    experiment_path.write_text(json.dumps(experiment, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"checkpoint": str(checkpoint), "verified_model": str(verified),
                      "dev": metrics, "delta": delta, "reload": report}), flush=True)


if __name__ == "__main__":
    main()
