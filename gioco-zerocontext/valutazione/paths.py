"""Percorsi predefiniti. I dati git-ignored (raw 2.0, vettori, cache Morph-it!) si leggono da DATA_ROOT."""
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# Radice dei dati: la stessa del repository, salvo ZEROCADE_EVAL_DATA_ROOT (utile in un worktree, che non ha i dati ignorati da Git).
DATA_ROOT = Path(os.environ.get('ZEROCADE_EVAL_DATA_ROOT') or REPO)

RAW2 = DATA_ROOT / 'database' / 'parole_ita_raw_2.0.sqlite3'
GIOCHI = DATA_ROOT / 'database' / 'giochi.sqlite3'
PIPELINE_B = DATA_ROOT / 'database' / 'ZeroContext_Associazioni_PipelineB.sqlite3'
RIORDINO = DATA_ROOT / 'database' / 'ZeroContext_Associazioni_Riordino.sqlite3'
RESULTS = DATA_ROOT / 'database' / 'ZeroContext_Valutazione.sqlite3'
VECTORS_DIR = DATA_ROOT / 'gioco-zerocontext' / 'data'
MORPHIT = DATA_ROOT / 'gioco-zerocontext' / '.cache' / 'morphit_048.txt'
REPORTS = REPO / 'gioco-zerocontext' / 'reports'
