"""Check every level pack (M2). Exits with status 1 if any level fails.

Usage:
  npm run wordgen -w @zerocade/server -- --write [N]   writes levels 1..N into data/levels/it
  python script/validate_levels.py

The server generates its levels on the fly (apps/server/src/wordgen); the packs are written
only to check the generator from outside.

A level fails when, in its grid or in one of its DDA variants (easy, expert; a variant may
be missing, then the standard grid is played):
  - a word leaves the grid, or two words disagree on a cell;
  - a word cannot be built from the wheel letters;
  - the grid holds a run of 2+ letters (across or down) that is not a declared word;
  - the grid is not connected;
  - a grid word is not a "main" lexicon word, an extra is not in the lexicon, or either
    is on the blocklist; an extra is also a grid word;
  - grid words and extras together are not exactly the valid words the wheel makes;
  - the first word does not use every wheel letter (the full word), or the wheel spells it,
    clockwise or not; a copy of a wheel letter no grid word needs;
  - the wheel has fewer or more letters than curve.json allows, or the grid is too big;
  - a tree grid (archetype C), or one of its variants, has more cycles than its archetype
    allows;
  - a variant is not on its side of the standard grid by curve.json variants.minGap points
    of simulated difficulty (unless the standard grid is at the top of the scale);
  - the secret word is not a valid word of the wheel, is in one of the grids, or the wheel
    spells it;
  - ids are not 1..N in order, or a letter set comes back within REPEAT_GAP levels (each
    level is generated on its own, so far apart a wheel may repeat).
How far each grid's simulated difficulty lands from its target is counted, not failed.
"""
import json
import os
import sys
from collections import Counter, defaultdict

from common import LANG, MIN_LEN, is_blocked, load_blocklist, load_lexicon, path

with open(path("script", "curve.json"), encoding="utf-8") as fh:
    CURVE = json.load(fh)

REPEAT_GAP = 50


def can_build(word, letters):
    return not Counter(word) - Counter(letters)


def made_from(letters, by_sig):
    """Every valid word built from some of the wheel letters (each sub-multiset once)."""
    chars = sorted(letters)
    out = set()

    def walk(start, acc):
        if len(acc) >= MIN_LEN:
            out.update(by_sig.get(acc, ()))
        for i in range(start, len(chars)):
            if i > start and chars[i] == chars[i - 1]:
                continue
            walk(i + 1, acc + chars[i])

    walk(0, "")
    return out


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


def variants(level):
    return {name: v for name, v in level.get("variants", {}).items() if v}


def check_level(level, lexicon, blocklist, by_sig):
    letters = level["letters"]
    lo, hi = CURVE["wheel"]
    errors = [] if lo <= len(letters) <= hi else [f"{len(letters)} wheel letters"]
    made = made_from(letters, by_sig)
    errors += check_grid(level, letters, lexicon, blocklist, made)
    gap = CURVE["variants"]["minGap"] - 0.1  # D_sim is rounded to 0.1
    dsim = level.get("metrics", {}).get("dsim")
    for name, variant in variants(level).items():
        errors += [f"{name}: {e}" for e in check_grid(variant, letters, lexicon, blocklist, made)]
        theirs = variant.get("metrics", {}).get("dsim")
        if dsim is not None and theirs is not None:
            apart = dsim - theirs if name == "easy" else theirs - dsim
            if apart < gap and not (name == "expert" and dsim >= 100):
                errors.append(f"{name}: D_sim {theirs} is not {CURVE['variants']['minGap']} points from {dsim}")
    secret = level.get("secret")
    if secret:
        in_grids = {w["w"] for g in [level, *variants(level).values()] for w in g["words"]}
        ring = letters * 2
        if not can_build(secret, letters):
            errors.append(f"secret {secret} is not on the wheel")
        if secret not in lexicon or is_blocked(secret, blocklist):
            errors.append(f"secret {secret} is not a valid word")
        if secret in in_grids:
            errors.append(f"secret {secret} is in a grid")
        if secret in ring or secret in ring[::-1]:
            errors.append(f"the wheel spells the secret {secret}")
    archetype = level.get("metrics", {}).get("archetype")
    if archetype and CURVE["archetypes"][archetype]["hardCycles"]:
        for name, grid in [("standard", level), *variants(level).items()]:
            cycles = grid["metrics"]["cycles"]
            if cycles > CURVE["archetypes"][archetype]["maxCycles"]:
                errors.append(f"{name}: {cycles} cycles in a grid of archetype {archetype}")
    return errors


def check_grid(level, letters, lexicon, blocklist, made):
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
    left_out = made - grid_words - set(level["extras"])
    if left_out:
        errors.append(f"{len(left_out)} words of the wheel are neither in the grid nor extras: {' '.join(sorted(left_out)[:5])}")
    ring = letters * 2
    first = level["words"][0]["w"] if level["words"] else ""
    if len(first) != len(letters):
        errors.append(f"the first word {first} does not use every wheel letter")
    elif first in ring or first in ring[::-1]:
        errors.append(f"the wheel spells {first}")
    need = Counter()
    for word in grid_words:
        for ch, k in Counter(word).items():
            need[ch] = max(need[ch], k)
    idle = Counter(letters) - need
    if idle:
        errors.append(f"wheel letters no grid word needs: {''.join(sorted(idle.elements()))}")
    return errors


def validate():
    lexicon = load_lexicon()
    blocklist = load_blocklist()
    by_sig = defaultdict(list)
    for word in lexicon:
        if not is_blocked(word, blocklist):
            by_sig["".join(sorted(word))].append(word)
    folder = path("data", "levels", LANG)
    packs = sorted(f for f in os.listdir(folder) if f.startswith("pack_") and f.endswith(".json"))
    failures, expected, sigs = 0, 1, {}
    repeats = 0
    landed = defaultdict(list)
    offered = Counter()
    for name in packs:
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            doc = json.load(fh)
        for level in doc["levels"]:
            errors = check_level(level, lexicon, blocklist, by_sig)
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
            for grid in ("standard", "easy", "expert"):
                if grid == "standard":
                    metrics = level.get("metrics")
                else:
                    metrics = (level.get("variants", {}).get(grid) or {}).get("metrics")
                # A missing variant counts as a miss.
                landed[grid].append(bool(metrics) and abs(metrics["dsim"] - metrics["target"]) <= CURVE["tolerance"])
                offered[grid] += bool(metrics)
    total = expected - 1
    print(f"{total} levels in {len(packs)} packs, {failures} with errors, {repeats} wheels seen before")
    for grid, hits in landed.items():
        print(f"  {grid}: {offered[grid]} made, {sum(hits)}/{len(hits)} within ±{CURVE['tolerance']} of their target difficulty")
    return failures == 0 and total > 0


if __name__ == "__main__":
    sys.exit(0 if validate() else 1)
