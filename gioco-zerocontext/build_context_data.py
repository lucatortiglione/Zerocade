"""Prepara i dati di gioco di ZeroContext: parole segrete, parole giocabili e vettori.

Ingressi:
  .cache/fasttext_it_*.{txt,npy}        da fetch_vectors.py (vettori fastText italiani)
  zerocontext-it-bank.csv, -meta.csv    banca delle parole segrete (build_context_bank.py)
  ../gioco-zeroassociations/resources/frequency_ranks_it.csv  frequenze (wordfreq)

Uscite, in data/ (versionate: le legge il server di Zerocade, senza Python a runtime):
  vocab.txt    le parole giocabili: ogni tentativo in chat è valido solo se è qui
  vectors.bin  una riga per parola di vocab.txt: DIM interi con segno (int8), già
               centrati e normalizzati, quindi il prodotto scalare ordina come il coseno
  secrets.txt  le parole che possono essere segrete (fascia base/comune/Livecade)
  meta.json    numero di parole e dimensioni

A ogni round il gioco ordina tutto vocab.txt per vicinanza alla parola segreta:
la posizione è il punteggio di ogni tentativo (1 = la più vicina).

Uso:  python build_context_data.py [--vocab 60000] [--probe spiaggia pizza ...]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "database"))
import giochi  # noqa: E402

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
DATA = HERE / "data"
FREQ = HERE.parent / "gioco-zeroassociations" / "resources" / "frequency_ranks_it.csv"
BANK = HERE / "zerocontext-it-bank.csv"
META = HERE / "zerocontext-it-bank-meta.csv"
WORD = re.compile(r"^[a-zàèéìòù]{3,16}$")
SECRET_TIERS = {"livecade", "base", "comune"}


def load_vectors() -> dict[str, np.ndarray]:
    words = (CACHE / "fasttext_it_words.txt").read_text(encoding="utf-8").split("\n")
    mat = np.load(CACHE / "fasttext_it_vectors.npy")
    out: dict[str, np.ndarray] = {}
    for i, w in enumerate(words):
        if w not in out and WORD.match(w):
            out[w] = i
    return out, mat


def build_vocab(index: dict[str, int], bank: list[str], size: int) -> list[str]:
    """Le parole giocabili: le più frequenti che hanno un vettore fastText, più la banca delle segrete."""
    vocab: list[str] = []
    seen: set[str] = set()

    def add(w: str) -> None:
        if w in index and w not in seen:
            seen.add(w)
            vocab.append(w)

    with FREQ.open(encoding="utf-8", newline="") as fh:
        rows = csv.reader(fh)
        next(rows)
        for lemma, rank in rows:
            if int(rank) > size * 2:
                break
            if WORD.match(lemma) and len(vocab) < size:
                add(lemma)
    for w in bank:  # ogni parola segreta deve essere anche giocabile
        add(w)
    return sorted(vocab)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vocab", type=int, default=60_000, help="parole giocabili più frequenti (più la banca)")
    ap.add_argument("--probe", nargs="*", default=["spiaggia", "pizza", "ospedale"])
    args = ap.parse_args()

    index, mat = load_vectors()
    with BANK.open(encoding="utf-8-sig", newline="") as fh:
        bank = [r["word"] for r in csv.DictReader(fh)]
    with META.open(encoding="utf-8-sig", newline="") as fh:
        tier = {r["word"]: r["tier"] for r in csv.DictReader(fh)}

    vocab = build_vocab(index, bank, args.vocab)
    seen = set(vocab)

    vecs = mat[[index[w] for w in vocab]].astype(np.float32)
    vecs -= vecs.mean(axis=0)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    scale = 127 / np.percentile(np.abs(vecs), 99.99)
    q = np.clip(np.rint(vecs * scale), -127, 127).astype(np.int8)

    secrets = sorted(w for w in bank if w in seen and tier.get(w) in SECRET_TIERS)
    DATA.mkdir(exist_ok=True)
    (DATA / "vectors.bin").write_bytes(q.tobytes())
    # Le parole (nell'ordine dei vettori) e le segrete vanno nel DB dei giochi, schema context
    # (database/giochi.sqlite3); i vettori, 18 MB, restano in data/vectors.bin.
    giochi.write_context(vocab, secrets, {"words": len(vocab), "dim": int(q.shape[1]), "secrets": len(secrets)})
    print(f"vocab {len(vocab)}  segrete {len(secrets)}  vectors.bin {q.nbytes / 1e6:.1f} MB")

    qf = q.astype(np.float32)
    for probe in args.probe:
        if probe not in seen:
            print(probe, "non in vocab")
            continue
        sims = qf @ qf[vocab.index(probe)]
        top = np.argsort(-sims)[1:16]
        print(probe, "->", ", ".join(vocab[i] for i in top))


if __name__ == "__main__":
    main()
