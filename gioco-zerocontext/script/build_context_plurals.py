"""Estrae i plurali dei sostantivi da Morph-it! per le risposte vincenti di ZeroContext.

Non richiede vettori o database. Genera il dizionario incluso nell'overlay, anche
per plurali irregolari e forme che non hanno un proprio vettore nel vocabolario.
Fonte: Morph-it! 0.4.8, Marco Baroni ed Eros Zanchetta, CC BY-SA 2.0.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
WORD = re.compile(r"[a-zàèéìòù]{2,20}\Z")


def noun_plurals(text: str) -> dict[str, list[str]]:
    rows = [line.split("\t") for line in text.splitlines() if line.count("\t") == 2]
    singulars = {
        lemma for form, lemma, tag in rows
        if tag.startswith("NOUN-") and tag.endswith(":s")
        and form == lemma and WORD.fullmatch(lemma)
    }
    plurals: dict[str, set[str]] = {}
    for form, lemma, tag in rows:
        if (lemma in singulars and tag.startswith("NOUN-") and tag.endswith(":p")
                and form != lemma and WORD.fullmatch(form)):
            plurals.setdefault(lemma, set()).add(form)
    return {lemma: sorted(forms) for lemma, forms in sorted(plurals.items())}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--morphit", type=Path, default=HERE / ".cache/morphit_048.txt")
    parser.add_argument("--out", type=Path, default=HERE.parent / "apps/overlay/src/games/contextPlurals.json")
    args = parser.parse_args()
    source = args.morphit.read_bytes()
    plurals = noun_plurals(source.decode("utf-8"))
    if not plurals:
        raise SystemExit("Nessuna coppia singolare/plurale: verificare il file Morph-it!")
    payload = {
        "source": {
            "name": "Morph-it! 0.4.8",
            "authors": "Marco Baroni, Eros Zanchetta (2004-2009)",
            "license": "CC-BY-SA-2.0",
            "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/",
            "url": "https://raw.githubusercontent.com/giodegas/morphit-lemmatizer/b99d75d774367e4bedc5c5f339dec384777488ff/master/morph-it_048_utf8.txt",
            "sha256": hashlib.sha256(source).hexdigest(),
            "derivation": "Only noun lemmas attested as singular, with their attested plural forms; invariant forms omitted.",
        },
        "plurals": plurals,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(plurals)} sostantivi, {sum(map(len, plurals.values()))} plurali: {args.out}")


if __name__ == "__main__":
    main()
