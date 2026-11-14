"""Scarica i vettori fastText italiani (cc.it.300) solo per le parole più frequenti.

Il file completo (facebook/fasttext-it-vectors, model.bin) pesa ~7 GB, ma il formato
fastText mette prima il dizionario (parole in ordine di frequenza) e poi la matrice dei
vettori nello stesso ordine: basta leggere in streaming l'inizio del file e fermarsi dopo
le prime N parole.

Uscita (cartella cache, di default .cache/ accanto allo script, ignorata da Git):
  fasttext_it_words.txt   le N parole, una per riga, in ordine di frequenza
  fasttext_it_vectors.npy matrice N x 300 float16

Uso:  python script/fetch_vectors.py [--words 300000]
"""
from __future__ import annotations

import argparse
import struct
import urllib.request
from pathlib import Path

import numpy as np

URL = "https://huggingface.co/facebook/fasttext-it-vectors/resolve/main/model.bin"
HERE = Path(__file__).resolve().parent.parent
CACHE = HERE / ".cache"
MAGIC = 793712314


class Reader:
    def __init__(self, resp):
        self.resp = resp
        self.buf = b""
        self.pos = 0
        self.total = 0

    def _fill(self) -> bool:
        chunk = self.resp.read(1 << 20)
        if not chunk:
            return False
        self.buf = self.buf[self.pos:] + chunk
        self.pos = 0
        return True

    def read(self, n: int) -> bytes:
        while len(self.buf) - self.pos < n:
            if not self._fill():
                raise EOFError("flusso terminato prima del previsto")
        out = self.buf[self.pos:self.pos + n]
        self.pos += n
        self.total += n
        return out

    def cstring(self) -> bytes:
        while True:
            end = self.buf.find(b"\0", self.pos)
            if end >= 0:
                out = self.buf[self.pos:end]
                self.total += end + 1 - self.pos
                self.pos = end + 1
                return out
            if not self._fill():
                raise EOFError("flusso terminato nel dizionario")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--words", type=int, default=300_000)
    ap.add_argument("--out", type=Path, default=CACHE)
    args = ap.parse_args()
    args.out.mkdir(exist_ok=True)

    req = urllib.request.Request(URL, headers={"User-Agent": "zerocade-context-build"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        r = Reader(resp)
        magic, version = struct.unpack("<ii", r.read(8))
        if magic != MAGIC:
            raise SystemExit(f"formato inatteso: magic {magic}")
        dim, *_rest = struct.unpack("<12i", r.read(48))
        r.read(8)  # t (double)
        size, nwords, nlabels, ntokens, prune = struct.unpack("<iiiqq", r.read(4 + 4 + 4 + 8 + 8))
        print(f"versione {version}, dim {dim}, parole {nwords}")
        words = []
        for i in range(nwords):
            w = r.cstring()
            r.read(9)  # conteggio int64 + tipo int8
            if i < args.words:
                words.append(w.decode("utf-8", "replace"))
            if i % 250_000 == 0:
                print(f"dizionario {i}/{nwords}")
        if prune > 0:
            r.read(8 * prune)  # pruneidx (-1 se assente)
        r.read(1)  # quant_input
        m, n = struct.unpack("<qq", r.read(16))
        print(f"matrice {m}x{n}")
        take = min(args.words, nwords)
        mat = np.empty((take, n), dtype=np.float16)
        for i in range(take):
            mat[i] = np.frombuffer(r.read(4 * n), dtype="<f4")
            if i % 50_000 == 0:
                print(f"vettori {i}/{take}")

    (args.out / "fasttext_it_words.txt").write_text("\n".join(words), encoding="utf-8")
    np.save(args.out / "fasttext_it_vectors.npy", mat)
    print("fatto:", take, "parole")


if __name__ == "__main__":
    main()
