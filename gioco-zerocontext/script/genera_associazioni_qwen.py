"""Associazioni di Qwen per le segrete senza quelle verificate (vedi riordino/qwen_cli.py)."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # con python -I la cartella dello script non è nel percorso

from riordino.qwen_cli import main

if __name__ == '__main__':
    raise SystemExit(main())
