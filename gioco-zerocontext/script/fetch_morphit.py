"""Scarica Morph-it! 0.4.8, il lessico morfologico dell'italiano: forma, lemma e tratti (genere, numero, modo…).

ZeroContext lo usa per tenere tra le parole giocabili solo le forme base (sostantivi al singolare, aggettivi al
maschile singolare, verbi all'infinito) e per far valere «spiagge» come «spiaggia» quando la chat la scrive.

La copia è la stessa che usa l'inventario di ZeroAssociazioni (fonte morphit-048-mirror): un indirizzo fisso su
GitHub, in UTF-8. Morph-it! è di Marco Baroni ed Eros Zanchetta (2004-2009), CC BY-SA 2.0 oppure GNU LGPL.

Uscita (cartella cache, di default .cache/ accanto allo script, ignorata da Git):
  morphit_048.txt   una riga per forma: forma <tab> lemma <tab> tratti

Uso:  python script/fetch_morphit.py
"""
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

URL = (
    "https://raw.githubusercontent.com/giodegas/morphit-lemmatizer/"
    "b99d75d774367e4bedc5c5f339dec384777488ff/master/morph-it_048_utf8.txt"
)
HERE = Path(__file__).resolve().parent.parent
CACHE = HERE / ".cache"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=CACHE)
    args = ap.parse_args()
    args.out.mkdir(exist_ok=True)
    with urllib.request.urlopen(URL, timeout=60) as resp:
        body = resp.read()
    text = body.decode("utf-8")
    rows = sum(1 for line in text.splitlines() if line.count("\t") == 2)
    if rows < 400_000:
        raise SystemExit(f"solo {rows} righe forma/lemma/tratti: il file ha cambiato formato?")
    (args.out / "morphit_048.txt").write_text(text, encoding="utf-8", newline="\n")
    print(f"fatto: {rows} forme, {len(body) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
