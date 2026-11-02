"""The Bivio questions live in data/domande.db (SQLite): the Zerocade server reads them
from there, and so does tools/to_livecade.py. This tool fills the database from a CSV and
writes it back to one, for anyone who edits the questions in a spreadsheet.

Usage:
  python tools/domande.py import domande.csv   replaces every question in data/domande.db
  python tools/domande.py export domande.csv   writes them all out, same columns
  python tools/domande.py stats                counts per category, difficulty and language

CSV columns: id, categoria, difficolta, esplicita, then <lingua>_a and <lingua>_b for each
language (it_a, it_b, en_a, en_b; another language is two more columns). UTF-8.

Schema:
  dilemmi(id, categoria, difficolta, esplicita, ordine)   ordine keeps the file's order
  testi(dilemma, lingua, a, b)                            one row per dilemma and language
Never reuse the id of a deleted question: the votes Zerocade saves are tied to it.
"""
import argparse
import csv
import os
import re
import sqlite3
import sys
from collections import Counter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DB = os.path.join(ROOT, "data", "domande.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS dilemmi (
  id TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  difficolta TEXT NOT NULL,
  esplicita INTEGER NOT NULL DEFAULT 0 CHECK (esplicita IN (0, 1)),
  ordine INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS testi (
  dilemma TEXT NOT NULL REFERENCES dilemmi(id) ON DELETE CASCADE,
  lingua TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  PRIMARY KEY (dilemma, lingua)
);
"""


def connect(path=DB):
    db = sqlite3.connect(path)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    return db


def languages(names):
    """Italian first (the fallback when a dilemma lacks a language), then the others A-Z."""
    return sorted(set(names), key=lambda lang: (lang != "it", lang))


def load(path=DB):
    """Every dilemma in order: {id, categoria, difficolta, esplicita, testi: {lingua: (a, b)}}."""
    if not os.path.exists(path):
        sys.exit(f"{path} not found: create it with  python tools/domande.py import <file.csv>")
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    out = {}
    for row in db.execute("SELECT id, categoria, difficolta, esplicita FROM dilemmi ORDER BY ordine"):
        out[row[0]] = {"id": row[0], "categoria": row[1], "difficolta": row[2], "esplicita": bool(row[3]), "testi": {}}
    for dilemma, lang, a, b in db.execute("SELECT dilemma, lingua, a, b FROM testi"):
        out[dilemma]["testi"][lang] = (a, b)
    db.close()
    for d in out.values():
        d["testi"] = {lang: d["testi"][lang] for lang in languages(d["testi"])}
    return list(out.values())


def import_csv(src):
    with open(src, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = list(reader)
    missing = [c for c in ("id", "categoria", "difficolta", "esplicita") if c not in header]
    if missing:
        sys.exit(f"{src}: missing columns {missing}")
    langs = [h[:-2] for h in header if re.fullmatch(r"[a-z]{2,3}_a", h) and f"{h[:-2]}_b" in header]
    if not langs:
        sys.exit(f"{src}: no <lingua>_a / <lingua>_b column pair")

    problems, ids = [], Counter(r["id"].strip() for r in rows if r["id"].strip())
    problems += [f"id {i} appears {n} times" for i, n in ids.items() if n > 1]
    for r in rows:
        if r["esplicita"].strip() not in ("0", "1"):
            problems.append(f"{r['id']}: esplicita is {r['esplicita']!r}, not 0 or 1")
    if problems:
        sys.exit("\n".join(problems))

    db = connect()
    before = {row[0] for row in db.execute("SELECT id FROM dilemmi")}
    with db:
        db.execute("DELETE FROM testi")
        db.execute("DELETE FROM dilemmi")
        order = 0
        for r in rows:
            qid = r["id"].strip()
            if not qid:
                continue
            order += 1
            db.execute(
                "INSERT INTO dilemmi (id, categoria, difficolta, esplicita, ordine) VALUES (?, ?, ?, ?, ?)",
                (qid, r["categoria"].strip(), r["difficolta"].strip(), int(r["esplicita"]), order),
            )
            for lang in langs:
                a, b = r[f"{lang}_a"].strip(), r[f"{lang}_b"].strip()
                if a and b:
                    db.execute("INSERT INTO testi (dilemma, lingua, a, b) VALUES (?, ?, ?, ?)", (qid, lang, a, b))
    db.execute("VACUUM")
    db.close()
    gone = sorted(before - set(ids))
    print(f"{order} dilemmi, lingue {', '.join(languages(langs))} -> {DB}")
    if gone:
        print(f"note: {len(gone)} id no longer present (their saved votes stay): {', '.join(gone)}")


def export_csv(dst):
    dilemmas = load()
    langs = languages(lang for d in dilemmas for lang in d["testi"])
    header = ["id", "categoria", "difficolta", "esplicita"] + [f"{lang}_{side}" for lang in langs for side in "ab"]
    with open(dst, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(header)
        for d in dilemmas:
            texts = [t for lang in langs for t in d["testi"].get(lang, ("", ""))]
            writer.writerow([d["id"], d["categoria"], d["difficolta"], int(d["esplicita"])] + texts)
    print(f"{len(dilemmas)} dilemmi -> {dst}")


def stats():
    dilemmas = load()
    print(f"{len(dilemmas)} dilemmi, {sum(d['esplicita'] for d in dilemmas)} espliciti")
    for name, key in (("categoria", lambda d: [d["categoria"]]), ("difficolta", lambda d: [d["difficolta"]]), ("lingua", lambda d: list(d["testi"]))):
        counts = Counter(v for d in dilemmas for v in key(d))
        print(f"{name}: " + ", ".join(f"{k} {n}" for k, n in sorted(counts.items())))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)
    sub.add_parser("import", help="replace the questions with those of a CSV").add_argument("csv")
    sub.add_parser("export", help="write the questions to a CSV").add_argument("csv")
    sub.add_parser("stats", help="counts per category, difficulty and language")
    args = ap.parse_args()
    if args.command == "import":
        import_csv(args.csv)
    elif args.command == "export":
        export_csv(args.csv)
    else:
        stats()
