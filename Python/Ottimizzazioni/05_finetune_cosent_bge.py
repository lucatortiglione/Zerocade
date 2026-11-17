#!/usr/bin/env python3
"""Fine-tuning LoRA con CoSENTLoss per BGE-M3 Italian.
py 05_finetune_cosent_bge.py --train-csv train.csv --dev-csv dev.csv
"""
from zc_bge_finetune_common import train
if __name__ == "__main__":
    train("CoSENT")
