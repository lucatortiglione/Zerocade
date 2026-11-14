"""Scarica i vettori italiani di ConceptNet Numberbatch 19.08 (la seconda fonte di ZeroContext).

Il file multilingue (numberbatch-19.08.txt.gz) pesa 3,2 GB compressi: una riga per termine, `/c/<lingua>/<termine>`
seguito da 300 numeri, in ordine di lingua. Lo si legge in streaming, si tengono solo le righe `/c/it/` di una
parola sola e ci si ferma appena il blocco italiano è finito (prima della fine del file).

Uscita (cartella cache, di default .cache/ accanto allo script, ignorata da Git):
  numberbatch_it_words.txt    le parole italiane, una per riga
  numberbatch_it_vectors.npy  matrice N x 300 float16, nello stesso ordine

Uso:  python script/fetch_numberbatch.py
"""
from __future__ import annotations

import argparse
import gzip
import re
import time
import urllib.request
from pathlib import Path

import numpy as np

URL = "https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/numberbatch-19.08.txt.gz"
HERE = Path(__file__).resolve().parent.parent
CACHE = HERE / ".cache"
PREFIX = b"/c/it/"
WORD = re.compile(r"^[a-zàèéìòù]+$")
# Righe non italiane di fila dopo il blocco italiano prima di fermarsi: l'ordine è per lingua, basta un margine.
AFTER = 1000


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=CACHE)
    args = ap.parse_args()
    args.out.mkdir(exist_ok=True)

    words: list[str] = []
    rows: list[np.ndarray] = []
    seen = 0
    after = 0
    started = time.monotonic()
    with urllib.request.urlopen(URL, timeout=60) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        with gzip.GzipFile(fileobj=resp) as lines:
            header = lines.readline().split()
            dim = int(header[1])
            print(f"termini {int(header[0])}, dim {dim}", flush=True)
            for n, line in enumerate(lines):
                if n % 500_000 == 0 and n:
                    print(f"righe {n}  italiane {len(words)}  {time.monotonic() - started:.0f} s", flush=True)
                if not line.startswith(PREFIX):
                    if words:
                        after += 1
                        if after >= AFTER:
                            break
                    continue
                after = 0
                seen += 1
                term, _, rest = line.partition(b" ")
                word = term[len(PREFIX):].decode("utf-8", "replace")
                if not WORD.match(word):
                    continue
                vec = np.array(rest.split(), dtype=np.float32)
                if vec.shape[0] != dim:
                    continue
                words.append(word)
                rows.append(vec.astype(np.float16))
    if not words:
        raise SystemExit("nessuna riga /c/it/ trovata: il file ha cambiato formato?")

    (args.out / "numberbatch_it_words.txt").write_text("\n".join(words), encoding="utf-8")
    np.save(args.out / "numberbatch_it_vectors.npy", np.vstack(rows))
    print(f"fatto: {len(words)} parole italiane di {seen} termini /c/it/ (file di {total / 1e9:.1f} GB, letto in parte)")


if __name__ == "__main__":
    main()
