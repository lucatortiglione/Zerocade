"""Check every level pack (M2). Exits with status 1 if any level fails.

Usage:
  npm run wordgen -w @zerocade/server -- --write [N]   writes levels 1..N into data/levels/it
  python tools/validate_levels.py

The server generates its levels on the fly (apps/server/src/wordgen); the packs are written
only to check the generator from outside.

A level fails when, in its grid or in one of its DDA variants (easy, expert):
  - a word leaves the grid, or two words disagree on a cell;
  - a word cannot be built from the wheel letters;
  - the grid holds a run of 2+ letters (across or down) that is not a declared word;
  - the grid is not connected;
  - a grid word is not a "main" lexicon word, an extra is not in the lexicon, or either
    is on the blocklist; an extra is also a grid word;
  - the first word is not the longest, or the wheel spells it, clockwise or not;
  - the wheel has fewer or more letters than curve.json allows, or the grid is too big;
  - a tree grid (archetype C) has more cycles than its archetype allows;
  - ids are not 1..N in order, or a letter set comes back within REPEAT_GAP levels (each
    level is generated on its own, so far apart a wheel may repeat).
How far each grid's simulated difficulty lands from its target is counted, not failed.
"""
import json
import os
import sys
from collections import Counter, defaultdict

from common import LANG, is_blocked, load_blocklist, load_lexicon, path

with open(path("tools", "curve.json"), encoding="utf-8") as fh:
    CURVE = json.load(fh)

REPEAT_GAP = 50


def can_build(word, letters):
    return not Counter(word) - Counter(letters)


def runs(grid, rows, cols):
    """Every maximal run of 2+ letters: (word, r, c, direction)."""
    out = []
    for r in range(rows):
        c = 0
        while c < cols:
            if (r, c) in grid:
                start = c
                while (r, c) in grid:
                    c += 1
                if c - start >= 2:
                    out.append(("".join(grid[(r, k)] for k in range(start, c)), r, start, "H"))
            c += 1
    for c in range(cols):
        r = 0
        while r < rows:
            if (r, c) in grid:
                start = r
                while (r, c) in grid:
                    r += 1
                if r - start >= 2:
                    out.append(("".join(grid[(k, c)] for k in range(start, r)), start, c, "V"))
            r += 1
    return out


def check_level(level, lexicon, blocklist):
    letters = level["letters"]
    lo, hi = CURVE["wheel"]
    errors = [] if lo <= len(letters) <= hi else [f"{len(letters)} wheel letters"]
    errors += check_grid(level, letters, lexicon, blocklist)
    for name, variant in level.get("variants", {}).items():
        errors += [f"{name}: {e}" for e in check_grid(variant, letters, lexicon, blocklist)]
    archetype = level.get("metrics", {}).get("archetype")
    if archetype and CURVE["archetypes"][archetype]["hardCycles"]:
        cycles = level["metrics"]["cycles"]
        if cycles > CURVE["archetypes"][archetype]["maxCycles"]:
            errors.append(f"{cycles} cycles in a grid of archetype {archetype}")
    return errors


def check_grid(level, letters, lexicon, blocklist):
    """The checks on one grid: the level's own, or one of its variants on the same wheel."""
    errors = []
    rows, cols = level["rows"], level["cols"]
    if rows > CURVE["maxRows"] or cols > CURVE["maxCols"]:
        errors.append(f"grid {rows}x{cols} is too big")
    grid = {}
    declared = set()
    for w in level["words"]:
        word, r, c, d = w["w"], w["r"], w["c"], w["d"]
        declared.add((word, r, c, d))
        if not can_build(word, letters):
            errors.append(f"{word} is not on the wheel")
        if lexicon.get(word, (0, ""))[1] != "main":
            errors.append(f"{word} is not a main word")
        if is_blocked(word, blocklist):
            errors.append(f"{word} is blocked")
        for i, ch in enumerate(word):
            cell = (r, c + i) if d == "H" else (r + i, c)
            if not (0 <= cell[0] < rows and 0 <= cell[1] < cols):
                errors.append(f"{word} leaves the grid")
                break
            if grid.setdefault(cell, ch) != ch:
                errors.append(f"{word} clashes at {cell}")
    for run in runs(grid, rows, cols):
        if run not in declared:
            errors.append(f"unintended word {run[0]} at {run[1]},{run[2]} {run[3]}")
    if grid:
        start = next(iter(grid))
        seen, todo = {start}, [start]
        while todo:
            r, c = todo.pop()
            for nb in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if nb in grid and nb not in seen:
                    seen.add(nb)
                    todo.append(nb)
        if len(seen) != len(grid):
            errors.append("grid is not connected")
    grid_words = {w["w"] for w in level["words"]}
    for word in level["extras"]:
        if word not in lexicon or is_blocked(word, blocklist):
            errors.append(f"extra {word} is not a valid word")
        elif word in grid_words:
            errors.append(f"extra {word} is also in the grid")
        elif not can_build(word, letters):
            errors.append(f"extra {word} is not on the wheel")
    ring = letters * 2
    first = level["words"][0]["w"] if level["words"] else ""
    if any(len(w["w"]) > len(first) for w in level["words"]):
        errors.append(f"the first word {first} is not the longest")
    elif first in ring or first in ring[::-1]:
        errors.append(f"the wheel spells {first}")
    return errors


def validate():
    lexicon = load_lexicon()
    blocklist = load_blocklist()
    folder = path("data", "levels", LANG)
    packs = sorted(f for f in os.listdir(folder) if f.startswith("pack_") and f.endswith(".json"))
    failures, expected, sigs = 0, 1, {}
    repeats = 0
    landed = defaultdict(list)
    for name in packs:
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            doc = json.load(fh)
        for level in doc["levels"]:
            errors = check_level(level, lexicon, blocklist)
            if level["id"] != expected:
                errors.append(f"id {level['id']}, expected {expected}")
            expected = level["id"] + 1
            sig = "".join(sorted(level["letters"]))
            if sig in sigs:
                repeats += 1
                if level["id"] - sigs[sig] < REPEAT_GAP:
                    errors.append(f"letters {sig} already used by level {sigs[sig]}")
            sigs[sig] = level["id"]
            for e in errors:
                print(f"{name} level {level['id']}: {e}")
            failures += bool(errors)
            for grid, metrics in [("standard", level.get("metrics"))] + [
                (v, level["variants"][v]["metrics"]) for v in level.get("variants", {})
            ]:
                if metrics and "dsim" in metrics:
                    landed[grid].append(abs(metrics["dsim"] - metrics["target"]) <= CURVE["tolerance"])
    total = expected - 1
    print(f"{total} levels in {len(packs)} packs, {failures} with errors, {repeats} wheels seen before")
    for grid, hits in landed.items():
        print(f"  {grid}: {sum(hits)}/{len(hits)} within ±{CURVE['tolerance']} of their target difficulty")
    return failures == 0 and total > 0


if __name__ == "__main__":
    sys.exit(0 if validate() else 1)
