"""Build lexicon/it/words.tsv (M1): the words the game accepts, with frequency and tier.

Usage: python tools/build_lexicon.py <morph-it_048.txt>

Needs `pip install wordfreq` (code Apache 2.0, data CC BY-SA 4.0) for the frequencies.
Sources, licences and versions are in lexicon/it/SOURCE; the source file itself is not
kept in the repository.

Each word is upper case A-Z, 4-10 letters, accents folded (CITTÀ -> CITTA). Every form
Morph-it! knows is kept, however rare: whatever valid Italian word chat finds counts.
Tiers:
  main   common enough to be placed in a grid (the level generator raises the bar level
         after level, see tools/curve.json);
  extra  valid but rare (or accented, or a verb with an attached pronoun):
         accepted from chat as an extra word, never placed in a grid.
Words in lexicon/blocklist_it.txt are left out entirely; words in
lexicon/it/not_in_grid.txt (names, loanwords, interjections) are extras at most.
"""
import sys

from common import LANG, MAX_LEN, MIN_LEN, fold, is_blocked, load_blocklist, path

# Zipf 3 = about once per million words. A grid word needs at least MAIN_ZIPF; the first
# levels ask for much more (tools/curve.json).
MAIN_ZIPF = 2.5

# Morph-it! tags never accepted: proper nouns, punctuation, symbols, abbreviations,
# interjections, emoticons.
SKIP_POS = {"NPR", "PON", "SENT", "SYM", "ABL", "INT", "SMI"}
CLITICS = {"mi", "ti", "ci", "vi", "si", "lo", "la", "li", "le", "ne", "gli",
           "me", "te", "ce", "ve", "se", "glie", "glielo", "gliela", "glieli", "gliele", "gliene"}


def english_noise(form):
    """wordfreq's Italian counts include English text from the web: ARE, HOME, BLUE…
    A form clearly more common in English than in Italian is not trusted as a grid word."""
    from wordfreq import zipf_frequency
    en, it = zipf_frequency(form, "en"), zipf_frequency(form, "it")
    return en >= 3.5 and en - it >= 1.0


# Italian words end in a vowel, but for these. Abbreviations and loanwords (BTP, DNA,
# BLOG, GIRL, JUVE) fail the shape checks below and stay extras.
CONSONANT_ENDINGS = {"CON", "PER", "NON", "BEN", "MAL", "PUR", "TAL", "QUAL", "DEL", "NEL", "COL", "SUL",
                     "DAL", "GAS", "BAR", "BUS", "SUD", "NORD", "EST", "OVEST", "FILM", "SPORT", "TRAM",
                     "BEL", "GRAN", "BUON"}
INITIAL_CLUSTERS = {"BL", "BR", "CH", "CL", "CR", "DR", "FL", "FR", "GH", "GL", "GN", "GR", "PL", "PR", "PS",
                    "PN", "TR", "QU", "SB", "SC", "SD", "SF", "SG", "SL", "SM", "SN", "SP", "SR", "ST", "SV", "SZ"}
VOWELS = set("AEIOU")
# A proper noun's frequency counts the name too (Luca, Rosa, Marco): such a word is a grid
# word only when it is also a very common noun, adjective or adverb.
NAME_ZIPF = 4.6


def italian_shape(key):
    if set(key) & set("JKWXY") or not set(key) & VOWELS:
        return False
    if key[-1] not in VOWELS and key not in CONSONANT_ENDINGS:
        return False
    return key[0] in VOWELS or key[1] in VOWELS or key[:2] in INITIAL_CLUSTERS


def italian(source):
    """key -> [best zipf, main?] from Morph-it! (Latin-1, form<TAB>lemma<TAB>tag)."""
    from wordfreq import zipf_frequency
    forms = {}  # key -> {'zipf', 'plain', 'accented', 'main', 'content', 'name'}
    with open(source, encoding="latin-1") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 3:
                continue
            form, _lemma, tag = parts
            pos, _, feats = tag.partition(":")
            key = fold(form)
            if not MIN_LEN <= len(key) <= MAX_LEN:
                continue
            cur = forms.setdefault(key, {"word": False, "zipf": 0.0, "plain": 0.0, "accented": 0.0,
                                         "main": False, "content": False, "name": False})
            if pos == "NPR":
                cur["name"] = True
                continue
            if pos in SKIP_POS or form != form.lower():
                continue
            cur["word"] = True
            zipf = zipf_frequency(form, "it")
            cur["zipf"] = max(cur["zipf"], zipf)
            if form.isascii():
                cur["plain"] = max(cur["plain"], zipf)
            else:
                cur["accented"] = max(cur["accented"], zipf)
            clitic = any(f in CLITICS for f in feats.split("+"))
            if zipf >= MAIN_ZIPF and form.isascii() and not clitic and not english_noise(form):
                cur["main"] = True
                cur["content"] = cur["content"] or pos.startswith(("NOUN", "ADJ", "ADV"))
    words = {}
    for key, f in forms.items():
        if not f["word"]:
            continue  # only ever a proper noun, a symbol or an interjection
        main = f["main"] and italian_shape(key)
        # CITTA, PERCHE, META: most people write (and look for) the accented word.
        main = main and f["plain"] >= f["accented"]
        if f["name"]:
            main = main and f["content"] and f["zipf"] >= NAME_ZIPF
        words[key] = [f["zipf"], main]
    return words


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    words = italian(sys.argv[1])
    blocklist = load_blocklist()
    with open(path("lexicon", LANG, "not_in_grid.txt"), encoding="utf-8") as fh:
        not_in_grid = {w for line in fh if not line.startswith("#") for w in line.upper().split()}
    rows, blocked = [], 0
    for key, (zipf, main_tier) in sorted(words.items()):
        if is_blocked(key, blocklist):
            blocked += 1
            continue
        main_tier = main_tier and key not in not_in_grid
        rows.append(f"{key}\t{zipf:.2f}\t{'main' if main_tier else 'extra'}\n")
    out = path("lexicon", LANG, "words.tsv")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("word\tzipf\ttier\n")
        fh.writelines(rows)
    mains = sum(r.endswith("main\n") for r in rows)
    print(f"{len(rows)} words ({mains} main, {len(rows) - mains} extra), {blocked} blocked -> {out}")


if __name__ == "__main__":
    main()
