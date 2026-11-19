"""Valutazione della qualità delle posizioni di ZeroContext.

  python script/evaluate_context_ranking.py campione
  python script/evaluate_context_ranking.py valuta --profilo original --giudice no
  python script/evaluate_context_ranking.py ricalcola

Progetto: docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md. Il codice è in valutazione/.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # con python -I la cartella dello script non è nel percorso

from valutazione.cli import main

if __name__ == '__main__':
    raise SystemExit(main())
