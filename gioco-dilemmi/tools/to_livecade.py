"""Convert the questions (data/domande.db) into a Livecade "Would You Rather" import CSV.

Livecade imports one language per file (CSV UTF-8, max 16 MB / 20,000 rows) and
does not publish the column names of each game. The reliable way is to export the
Would You Rather bank from the Livecade dashboard first and pass it as --template:
the header is copied from it and our fields are mapped onto its columns.

Usage:
  python tools/to_livecade.py data/domande_master.csv --lang it --out data/livecade/wyr_it.csv
  python tools/to_livecade.py data/domande_master.csv --lang it --template export_it.csv \
      --map tools/livecade_map.json --out data/livecade/wyr_it.csv
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter

from domande import DB, load

DEFAULT_HEADER = ["ref", "source", "language", "option_a", "option_b", "category", "difficulty"]

# Our categories -> Livecade category values. Livecade lists 14 categories (food, money,
# fantasy, survival, dilemmas, ...) but not their exact spellings: check them against
# an export and override with --map {"category_values": {...}}.
DEFAULT_CATEGORY_VALUES = {
    "cibo": "food", "soldi": "money", "fantasia": "fantasy", "sopravvivenza": "survival",
    "viaggi": "travel", "scuola_lavoro": "school", "social_tech": "social", "sport": "sports",
    "tempo": "time travel", "amici_famiglia": "friends", "dilemmi": "dilemmas", "assurde": "funny",
}
DEFAULT_DIFFICULTY_VALUES = {"light": "light", "tough": "tough"}

# Field roles we can fill, and how to recognise them in an unknown header.
ROLE_PATTERNS = [
    ("ref", r"^ref$"),
    ("source", r"^source$"),
    ("language", r"lang|locale"),
    ("option_a", r"(option|choice|answer|opt)[ _-]?(a|1)$|^a$|^1$|first|left"),
    ("option_b", r"(option|choice|answer|opt)[ _-]?(b|2)$|^b$|^2$|second|right"),
    ("category", r"categ"),
    ("difficulty", r"diffic|intens|level|tone"),
]
MAX_OPTION_LEN = 70  # longer options get cramped on a portrait stream overlay


def detect_roles(header):
    roles = {}
    for col in header:
        key = col.strip().lower()
        for role, pattern in ROLE_PATTERNS:
            if role not in roles.values() and re.search(pattern, key):
                roles[col] = role
                break
    return roles


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("db", nargs="?", default=DB, help="the questions database (default data/domande.db)")
    ap.add_argument("--lang", required=True, help="language code, e.g. it or en (needs <lang>_a/<lang>_b columns)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--template", help="a CSV exported from Livecade (same game and language)")
    ap.add_argument("--map", help='JSON: {"columns": {"Header": "role"}, "category_values": {...}, "difficulty_values": {...}}')
    ap.add_argument("--include-explicit", action="store_true", help="also export rows marked esplicita=1")
    args = ap.parse_args()

    overrides = json.load(open(args.map, encoding="utf-8")) if args.map else {}
    cat_values = {**DEFAULT_CATEGORY_VALUES, **overrides.get("category_values", {})}
    diff_values = {**DEFAULT_DIFFICULTY_VALUES, **overrides.get("difficulty_values", {})}

    template_rows = []
    if args.template:
        with open(args.template, encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            header = reader.fieldnames or []
            template_rows = list(reader)
    else:
        header = DEFAULT_HEADER
    roles = detect_roles(header)
    roles.update(overrides.get("columns", {}))

    missing = [r for r in ("option_a", "option_b", "language") if r not in roles.values()]
    if missing:
        sys.exit(f"cannot map {missing} onto header {header}; pass --map with a 'columns' entry")
    unmapped = [c for c in header if c not in roles]
    if unmapped:
        print(f"note: columns left empty: {unmapped}", file=sys.stderr)

    # Values already used in the exported bank tell us the real category/difficulty spellings.
    known = {role: Counter(r.get(col, "") for r in template_rows) for col, role in roles.items()
             if role in ("category", "difficulty")}

    dilemmas = load(args.db)
    if not any(args.lang in d["testi"] for d in dilemmas):
        sys.exit(f"{args.db} has no {args.lang} text")
    out_rows, problems, seen = [], [], set()
    for d in dilemmas:
        if d["esplicita"] and not args.include_explicit:
            continue
        a, b = d["testi"].get(args.lang, ("", ""))
        if not a or not b:
            problems.append(f"{d['id']}: missing {args.lang} text")
            continue
        if (a.lower(), b.lower()) in seen:
            problems.append(f"{d['id']}: duplicate of an earlier row")
            continue
        seen.add((a.lower(), b.lower()))
        for text in (a, b):
            if len(text) > MAX_OPTION_LEN:
                problems.append(f"{d['id']}: option longer than {MAX_OPTION_LEN} chars: {text!r}")
        values = {
            "ref": "", "source": "", "language": args.lang, "option_a": a, "option_b": b,
            "category": cat_values.get(d["categoria"], d["categoria"]),
            "difficulty": diff_values.get(d["difficolta"], d["difficolta"]),
        }
        out_rows.append({col: values.get(role, "") for col, role in roles.items()})

    for col, role in roles.items():
        if role in known and known[role]:
            ours = {r[col] for r in out_rows} - set(known[role])
            if ours:
                problems.append(f"{role} values not present in the Livecade export: {sorted(ours)} "
                                f"(export uses {sorted(v for v in known[role] if v)})")

    with open(args.out, "w", encoding="utf-8-sig", newline="") as fh:  # Excel-style "CSV UTF-8"
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(out_rows)
    print(f"{len(out_rows)} rows -> {args.out}  columns: {header}")
    for p in problems:
        print("warning:", p, file=sys.stderr)


if __name__ == "__main__":
    main()
