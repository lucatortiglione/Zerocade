"""Generate the levels (M2) into data/levels/it/pack_NNN.json, 100 levels per file.

Usage: python tools/generate_levels.py
Reads lexicon/it/words.tsv and tools/curve.json. Deterministic: the same lexicon and
curve always give the same levels, and every level records the seed it was built with.

The curve only ever gets harder: more wheel letters, more grid words, less common words.
For each level:
  1. pick a seed word with the curve's number of letters, never reusing a letter set, and
     preferring one whose letters still make enough words no earlier grid has used;
  2. list the grid ("main") words, common enough for this level, that can be built from
     its letters;
  3. keep the seed (or its most common anagram) plus others, up to the curve's word count:
     new words first, common ones more likely; a word from an earlier grid only when the
     letters leave no other choice. Every other valid word becomes an extra;
  4. lay them out as a crossword, with backtracking: every word crosses another on a
     shared letter and parallel words never touch; the best of several layouts wins
     (more crossings, smaller box, landscape-ish to fit the overlay);
  5. shuffle the wheel so the full-length word (and as few other grid words as possible)
     does not read around it.
tools/validate_levels.py checks the result.
"""
import json
import math
import os
import random
import sys
from collections import defaultdict
from itertools import combinations

from common import LANG, MIN_LEN, load_lexicon, path

with open(path("tools", "curve.json"), encoding="utf-8") as fh:
    CURVE = json.load(fh)

PACK_SIZE = 100
LAYOUT_ATTEMPTS = 8
SUBSET_ATTEMPTS = 40
NODE_LIMIT = 3000
SEED_LOOKAHEAD = 40  # seeds weighed per level when none can do with new words only
TARGET_ASPECT = 1.3  # cols / rows of the grid area on the 1080 x 1920 overlay

signature = lambda word: "".join(sorted(word))


def params(level):
    """(letters, words, least frequency of a grid word) the curve asks for at this level."""
    lo_zipf, hi_zipf = CURVE["minZipf"]
    min_zipf = round(lo_zipf + (hi_zipf - lo_zipf) * (level - 1) / max(1, CURVE["levels"] - 1), 2)
    start = 1
    for stage in CURVE["stages"]:
        if level <= stage["to"]:
            lo, hi = stage["words"]
            t = (level - start) / max(1, stage["to"] - start)
            return stage["letters"], round(lo + (hi - lo) * t), min_zipf
        start = stage["to"] + 1
    raise ValueError(f"level {level} is past the curve")


class Lexicon:
    def __init__(self):
        self.words = load_lexicon()
        self.by_sig = defaultdict(list)
        for word in self.words:
            self.by_sig[signature(word)].append(word)

    def zipf(self, word):
        return self.words[word][0]

    def is_main(self, word):
        return self.words[word][1] == "main"

    def sub_words(self, letters):
        """Every lexicon word (MIN_LEN+ letters) that can be built from these letters."""
        found = set()
        for n in range(MIN_LEN, len(letters) + 1):
            for combo in set(combinations(sorted(letters), n)):
                found.update(self.by_sig.get("".join(combo), ()))
        return found


# --- Layout ---

H, V = "H", "V"
STEP = {H: (0, 1), V: (1, 0)}


class Grid:
    def __init__(self):
        self.cells = {}  # (r, c) -> [letter, set of directions]
        self.placed = []  # (word, r, c, d)

    def fits(self, word, r, c, d, max_rows, max_cols):
        """Number of crossings if the word can go here, else -1."""
        dr, dc = STEP[d]
        if (r - dr, c - dc) in self.cells or (r + dr * len(word), c + dc * len(word)) in self.cells:
            return -1
        crossings = 0
        for i, ch in enumerate(word):
            rr, cc = r + dr * i, c + dc * i
            cell = self.cells.get((rr, cc))
            if cell:
                if cell[0] != ch or d in cell[1]:
                    return -1
                crossings += 1
            elif (rr + dc, cc + dr) in self.cells or (rr - dc, cc - dr) in self.cells:
                return -1
        if self.placed and not crossings:
            return -1
        rows, cols = self.box_with(word, r, c, d)
        if rows > max_rows or cols > max_cols:
            return -1
        return crossings

    def box_with(self, word, r, c, d):
        dr, dc = STEP[d]
        rs = [k[0] for k in self.cells] + [r, r + dr * (len(word) - 1)]
        cs = [k[1] for k in self.cells] + [c, c + dc * (len(word) - 1)]
        return max(rs) - min(rs) + 1, max(cs) - min(cs) + 1

    def spots(self, word, max_rows, max_cols):
        """Every legal placement crossing what is already on the grid."""
        out = set()
        for (rr, cc), (ch, dirs) in self.cells.items():
            if len(dirs) != 1:
                continue
            d = V if H in dirs else H
            dr, dc = STEP[d]
            for i, wc in enumerate(word):
                if wc == ch:
                    out.add((rr - dr * i, cc - dc * i, d))
        scored = []
        # Sorted: the set holds 'H'/'V' strings, whose hash (and so the order) changes per run.
        for r, c, d in sorted(out):
            crossings = self.fits(word, r, c, d, max_rows, max_cols)
            if crossings > 0:
                rows, cols = self.box_with(word, r, c, d)
                scored.append((crossings, rows * cols, r, c, d))
        return scored

    def put(self, word, r, c, d):
        dr, dc = STEP[d]
        added = []
        for i, ch in enumerate(word):
            key = (r + dr * i, c + dc * i)
            if key not in self.cells:
                self.cells[key] = [ch, set()]
                added.append(key)
            self.cells[key][1].add(d)
        self.placed.append((word, r, c, d))
        return added

    def take(self, added):
        word, r, c, d = self.placed.pop()
        dr, dc = STEP[d]
        for i in range(len(word)):
            self.cells[(r + dr * i, c + dc * i)][1].discard(d)
        for key in added:
            del self.cells[key]


def layout(words, rng, max_rows, max_cols):
    """The best of a few randomised backtracking layouts, or None."""
    best = None
    for _ in range(LAYOUT_ATTEMPTS):
        order = [words[0]] + sorted(words[1:], key=lambda w: (-len(w), rng.random()))
        grid = Grid()
        grid.put(order[0], 0, 0, H if rng.random() < 0.75 else V)
        nodes = 0

        def place(i):
            nonlocal nodes
            if i == len(order):
                return True
            spots = grid.spots(order[i], max_rows, max_cols)
            rng.shuffle(spots)
            spots.sort(key=lambda s: (-s[0], s[1]))
            for _crossings, _area, r, c, d in spots[:4]:
                nodes += 1
                if nodes > NODE_LIMIT:
                    return False
                added = grid.put(order[i], r, c, d)
                if place(i + 1):
                    return True
                grid.take(added)
            return False

        if not place(1):
            continue
        rows = max(k[0] for k in grid.cells) - min(k[0] for k in grid.cells) + 1
        cols = max(k[1] for k in grid.cells) - min(k[1] for k in grid.cells) + 1
        crossings = sum(len(d) == 2 for _ch, d in grid.cells.values())
        score = crossings * 3 - rows * cols * 0.12 - abs(math.log(cols / rows / TARGET_ASPECT)) * 4
        if not best or score > best[0]:
            r0 = min(k[0] for k in grid.cells)
            c0 = min(k[1] for k in grid.cells)
            placed = [{"w": w, "r": r - r0, "c": c - c0, "d": d} for w, r, c, d in grid.placed]
            best = (score, rows, cols, crossings, placed)
    return best


# --- Levels ---

def wheel_order(letters, full_word, grid_words, rng):
    """Letters around the wheel, reading as few grid words as possible (clockwise or not),
    and never the full-length word when there is any way to avoid it."""
    order = list(letters)
    best = None
    for _ in range(500):
        rng.shuffle(order)
        ring = "".join(order) * 2
        back = ring[::-1]
        penalty = sum((100 if w == full_word else len(w)) for w in grid_words if w in ring or w in back)
        if best is None or penalty < best[0]:
            best = (penalty, "".join(order))
        if not penalty:
            break
    return best[1]


def choose_words(lex, seed_letters, count, rng):
    """Grid words (full-length word first) and the extras, for one letter set; None if too few."""
    valid = lex.sub_words(seed_letters)
    # Sorted, so equal frequencies break ties the same way on every run: a set of strings
    # iterates in a different order in every Python process.
    mains = sorted(w for w in valid if lex.is_main(w))
    full = [w for w in mains if len(w) == len(seed_letters)]
    if not full or len(mains) < count:
        return None
    full.sort(key=lambda w: -lex.zipf(w))
    others = sorted((w for w in mains if w != full[0]), key=lambda w: -lex.zipf(w))
    return full[0], others, valid


def build_level(lex, level_id, seed_word, count):
    rng = random.Random(f"{level_id}:{seed_word}")
    letters = signature(seed_word)
    picked = choose_words(lex, letters, count, rng)
    if not picked:
        return None
    full, others, valid = picked
    pool = others[: max(count * 2, count + 4)]
    max_rows, max_cols = CURVE["maxRows"], CURVE["maxCols"]
    for _ in range(SUBSET_ATTEMPTS):
        # Common words first, with some variety; no more than half of them 3 letters long.
        weights = [lex.zipf(w) ** 2 * rng.random() for w in pool]
        ranked = [w for _, w in sorted(zip(weights, pool), reverse=True)]
        chosen, short = [], 0
        for w in ranked:
            if len(chosen) == count - 1:
                break
            if len(w) == 3 and short >= (count - 1) // 2:
                continue
            short += len(w) == 3
            chosen.append(w)
        if len(chosen) < count - 1:
            return None
        words = [full] + chosen
        best = layout(words, rng, max_rows, max_cols)
        if best:
            _score, rows, cols, crossings, placed = best
            grid_words = {p["w"] for p in placed}
            extras = sorted((w for w in valid if w not in grid_words), key=lambda w: (len(w), w))
            return {
                "id": level_id,
                "letters": wheel_order(letters, full, grid_words, rng),
                "rows": rows,
                "cols": cols,
                "seed": seed_word,
                "words": placed,
                "extras": extras,
                "metrics": {
                    "letters": len(letters),
                    "words": len(placed),
                    "avgZipf": round(sum(lex.zipf(w) for w in sorted(grid_words)) / len(grid_words), 2),
                    "crossings": crossings,
                },
            }
    return None


def generate():
    lex = Lexicon()
    rng = random.Random(f"incastro:{LANG}")
    # Seed candidates per length: one per letter set, common words first with some shuffle.
    seeds = defaultdict(list)
    seen_sig = set()
    for word, (zipf, tier) in sorted(lex.words.items(), key=lambda kv: -kv[1][0]):
        sig = signature(word)
        if tier == "main" and zipf >= CURVE["seedMinZipf"] and sig not in seen_sig:
            seen_sig.add(sig)
            seeds[len(word)].append((zipf + rng.random() * 0.8, word))
    for n in seeds:
        seeds[n] = [w for _, w in sorted(seeds[n], reverse=True)]

    used = set()
    levels = []
    for level_id in range(1, CURVE["levels"] + 1):
        letters, count = params(level_id)
        level = None
        for word in seeds[letters]:
            if signature(word) in used:
                continue
            level = build_level(lex, level_id, word, count)
            if level:
                used.add(signature(word))
                break
            used.add(signature(word))  # never fits this curve: do not try it again
        if not level:
            sys.exit(f"no seed left for level {level_id} ({letters} letters, {count} words)")
        levels.append(level)
        if level_id % 50 == 0:
            print(f"  {level_id} levels", flush=True)

    out_dir = path("data", "levels", LANG)
    os.makedirs(out_dir, exist_ok=True)
    for old in os.listdir(out_dir):
        if old.startswith("pack_") and old.endswith(".json"):
            os.remove(os.path.join(out_dir, old))
    for start in range(0, len(levels), PACK_SIZE):
        pack = start // PACK_SIZE + 1
        doc = {"version": 1, "language": LANG, "pack": pack, "levels": levels[start : start + PACK_SIZE]}
        with open(os.path.join(out_dir, f"pack_{pack:03d}.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
    print(f"{len(levels)} levels in {math.ceil(len(levels) / PACK_SIZE)} packs -> {out_dir}")


if __name__ == "__main__":
    generate()
