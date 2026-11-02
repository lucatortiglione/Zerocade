"""Helpers shared by the lexicon builder and the level validator. The level generator is
TypeScript, in the Zerocade server (apps/server/src/wordgen; GENERATORE.md).

ZeroWords is played in Italian only: the lexicon lives in lexicon/it and the level packs the
generator writes for checking in data/levels/it (the folders keep the language in their name).
"""
import os
import unicodedata

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LANG = "it"
# Words of 4 to 10 letters: 3-letter words are left out everywhere, in grids and in chat.
MIN_LEN = 4
MAX_LEN = 10


def path(*parts):
    return os.path.join(ROOT, *parts)


def fold(word):
    """CITTÀ -> CITTA: upper case, accents folded onto the base letter (decision 1 of the TODO).

    Returns '' when anything but letters A-Z is left (apostrophes, hyphens, digits)."""
    base = "".join(c for c in unicodedata.normalize("NFD", word.upper()) if not unicodedata.combining(c))
    return base if base.isascii() and base.isalpha() else ""


def load_blocklist():
    """(exact words, prefixes) from lexicon/blocklist_it.txt."""
    exact, prefixes = set(), []
    with open(path("lexicon", f"blocklist_{LANG}.txt"), encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().upper()
            if not line or line.startswith("#"):
                continue
            if line.endswith("*"):
                prefixes.append(line[:-1])
            else:
                exact.add(line)
    return exact, tuple(prefixes)


def is_blocked(word, blocklist):
    exact, prefixes = blocklist
    return word in exact or word.startswith(prefixes)


def load_lexicon():
    """word -> (zipf frequency, 'main' | 'extra') from lexicon/it/words.tsv."""
    out = {}
    with open(path("lexicon", LANG, "words.tsv"), encoding="utf-8") as fh:
        next(fh)
        for line in fh:
            word, zipf, tier = line.rstrip("\n").split("\t")
            out[word] = (float(zipf), tier)
    return out
