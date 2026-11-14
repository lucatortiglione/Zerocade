"""Import a Livecade "Would You Rather" CSV into the questions database (database/ZeroDubbi.sqlite3).

The reverse of script/to_livecade.py: the columns are recognised the same way (and --map
takes the same JSON file), Livecade's category and difficulty values are turned back into
ours (food -> cibo, ...). A Livecade file holds one language: the language column says which,
or --lang when the file has none.

Each new question gets the next free id (b0121, b0122, ...; an id is never reused). A
question already in the database in that language, also with A and B swapped, or twice in
the file, is skipped. Questions only in Italian are played only by Italian streams.

Usage:
  python script/from_livecade.py export_it.csv --dry-run          what would be imported
  python script/from_livecade.py export_it.csv
  python script/from_livecade.py export_en.csv --lang en --map tools/livecade_map.json \\
      --category assurde --difficulty light
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter

from domande import DB, connect
from to_livecade import DEFAULT_CATEGORY_VALUES, DEFAULT_DIFFICULTY_VALUES, MAX_OPTION_LEN, detect_roles

TRUE = {"1", "true", "yes", "si", "sì", "y", "x"}
# Livecade's difficulty words we have seen or expect, besides our own values.
DIFFICULTY_SYNONYMS = {"easy": "light", "mild": "light", "fun": "light", "hard": "tough", "deep": "tough", "intense": "tough"}
EXPLICIT_COLUMN = re.compile(r"explicit|nsfw|adult|spicy|18")


def norm(value):
    """Food, food , TIME_TRAVEL, time-travel -> food, time travel."""
    return re.sub(r"[\s_-]+", " ", value.strip().lower())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", help="a Livecade Would You Rather CSV (an export, or a file from to_livecade.py)")
    ap.add_argument("--db", default=DB, help="the questions database (default: database/ZeroDubbi.sqlite3)")
    ap.add_argument("--lang", help="language code (it, en, ...) when the file has no language column")
    ap.add_argument("--map", help='JSON: {"columns": {"Header": "role"}, "category_values": {...}, "difficulty_values": {...}}, as for to_livecade.py')
    ap.add_argument("--category", default="dilemmi", help="our category for Livecade values we do not know (default dilemmi)")
    ap.add_argument("--difficulty", default="light", choices=["light", "tough"], help="for Livecade values we do not know (default light)")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    overrides = json.load(open(args.map, encoding="utf-8")) if args.map else {}
    ours = sorted(DEFAULT_CATEGORY_VALUES)
    if args.category not in ours:
        sys.exit(f"--category must be one of: {', '.join(ours)}")
    # The map says ours -> theirs; read it the other way round.
    to_category = {norm(theirs): mine for mine, theirs in {**DEFAULT_CATEGORY_VALUES, **overrides.get("category_values", {})}.items()}
    to_category.update({norm(mine): mine for mine in ours})
    to_difficulty = {norm(theirs): mine for mine, theirs in {**DEFAULT_DIFFICULTY_VALUES, **overrides.get("difficulty_values", {})}.items()}
    to_difficulty.update({k: v for k, v in DIFFICULTY_SYNONYMS.items() if k not in to_difficulty})

    with open(args.csv, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = list(reader)
    roles = detect_roles(header)
    roles.update(overrides.get("columns", {}))
    col = {role: name for name, role in roles.items()}
    missing = [r for r in ("option_a", "option_b") if r not in col]
    if missing:
        sys.exit(f"cannot find {missing} in header {header}; pass --map with a 'columns' entry")
    if "language" not in col and not args.lang:
        sys.exit("the file has no language column: pass --lang")
    explicit_col = next((h for h in header if h not in roles and EXPLICIT_COLUMN.search(h.lower())), None)

    db = connect(args.db)
    known = {}  # language -> {(a, b) lower case}
    for lang, a, b in db.execute("SELECT lingua, a, b FROM testi"):
        known.setdefault(lang, set()).add((a.lower(), b.lower()))
    numbers = [int(m.group(1)) for (qid,) in db.execute("SELECT id FROM dilemmi") if (m := re.fullmatch(r"b(\d+)", qid))]
    next_id = max(numbers, default=0) + 1
    order = (db.execute("SELECT max(ordine) FROM dilemmi").fetchone()[0] or 0) + 1

    new, problems = [], []
    skipped = Counter()
    unknown = {"category": Counter(), "difficulty": Counter()}
    for line, row in enumerate(rows, start=2):
        lang = (row.get(col["language"], "") if "language" in col else "").strip().lower() or (args.lang or "")
        if not re.fullmatch(r"[a-z]{2,3}", lang):
            problems.append(f"line {line}: language {lang!r} is not a code like it or en")
            continue
        a, b = row.get(col["option_a"], "").strip(), row.get(col["option_b"], "").strip()
        if not a or not b:
            skipped["empty option"] += 1
            continue
        seen = known.setdefault(lang, set())
        if (a.lower(), b.lower()) in seen or (b.lower(), a.lower()) in seen:
            skipped["already there"] += 1
            continue
        seen.add((a.lower(), b.lower()))
        raw_category = norm(row.get(col["category"], "")) if "category" in col else ""
        category = to_category.get(raw_category)
        if not category:
            unknown["category"][raw_category or "(empty)"] += 1
            category = args.category
        raw_difficulty = norm(row.get(col["difficulty"], "")) if "difficulty" in col else ""
        difficulty = to_difficulty.get(raw_difficulty)
        if not difficulty:
            unknown["difficulty"][raw_difficulty or "(empty)"] += 1
            difficulty = args.difficulty
        explicit = int(norm(row.get(explicit_col, "")) in TRUE) if explicit_col else 0
        for text in (a, b):
            if len(text) > MAX_OPTION_LEN:
                problems.append(f"line {line}: option longer than {MAX_OPTION_LEN} chars, cramped on the overlay: {text!r}")
        new.append((f"b{next_id:04d}", category, difficulty, explicit, order, lang, a, b))
        next_id += 1
        order += 1

    if not args.dry_run and new:
        with db:
            for qid, category, difficulty, explicit, ordine, lang, a, b in new:
                db.execute(
                    "INSERT INTO dilemmi (id, categoria, difficolta, esplicita, ordine) VALUES (?, ?, ?, ?, ?)",
                    (qid, category, difficulty, explicit, ordine),
                )
                db.execute("INSERT INTO testi (dilemma, lingua, a, b) VALUES (?, ?, ?, ?)", (qid, lang, a, b))
    db.close()

    verb = "would import" if args.dry_run else "imported"
    span = f" ({new[0][0]}..{new[-1][0]})" if new else ""
    print(f"{len(rows)} rows: {verb} {len(new)}{span}, skipped {sum(skipped.values())} {dict(skipped) if skipped else ''}".rstrip())
    if new:
        langs = Counter(q[5] for q in new)
        cats = Counter(q[1] for q in new)
        print("  languages: " + ", ".join(f"{k} {n}" for k, n in sorted(langs.items())))
        print("  categories: " + ", ".join(f"{k} {n}" for k, n in sorted(cats.items())))
    for what, counts in unknown.items():
        if counts:
            fallback = args.category if what == "category" else args.difficulty
            print(f"  unknown {what} values -> {fallback}: " + ", ".join(f"{k!r} {n}" for k, n in counts.most_common()))
            print(f"    map them with --map {{\"{what}_values\": {{\"<ours>\": \"<Livecade>\"}}}}")
    if explicit_col:
        print(f"  explicit flag read from column {explicit_col!r}: {sum(q[3] for q in new)} explicit")
    for p in problems[:20]:
        print(f"  {p}")
    if len(problems) > 20:
        print(f"  ... {len(problems) - 20} more")
    if not args.dry_run and new:
        print(f"-> {args.db}  (restart Zerocade to play them)")


if __name__ == "__main__":
    main()
