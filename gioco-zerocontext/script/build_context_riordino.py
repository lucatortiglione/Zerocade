"""Costruisce il riordino dei candidati della Pipeline B (vedi riordino/ e il README di ZeroContext)."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # con python -I la cartella dello script non è nel percorso

from riordino.cli import main

if __name__ == '__main__':
    raise SystemExit(main())
