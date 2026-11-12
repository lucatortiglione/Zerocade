"""The ZeroQuizz questions (quizzland in the code) live in data/domande.db (SQLite): the
Zerocade server reads them from there at start. This tool fills the database from a CSV and
writes it back to one, for anyone who edits the questions in a spreadsheet; any SQLite editor
(DB Browser for SQLite) works on the file directly too.

Usage:
  python tools/domande.py import domande.csv   replaces every question in data/domande.db
  python tools/domande.py export domande.csv   writes them all out, same columns
  python tools/domande.py stats                counts per category and difficulty, and problems

CSV columns (UTF-8): id, categoria, difficolta (1 easy, 2 medium, 3 hard), ordine_fisso (1: the
answers are never shuffled, e.g. Primo/Secondo/Terzo), attiva (0 keeps it out of the game),
domanda, a, b, c, d (two to four answers: leave c and d empty for fewer), giusta (the letter of
the right answer), spiegazione (shown with the answer; may be empty).

Schema:
  domande(id, categoria, difficolta, testo, spiegazione, ordine_fisso, attiva, ordine)
      ordine keeps the file's order
  opzioni(domanda, posizione, testo, giusta)
      one row per answer, posizione 0-3 (A-D), exactly one with giusta = 1
Never reuse the id of a deleted question: the answers Zerocade saves are tied to it, and to
the position of the answer chosen.
"""
import argparse
import csv
import os
import sys
from collections import Counter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DB = os.path.join(ROOT, "data", "domande.db")

# The questions live in the games' database (database/giochi.sqlite3), schema quizz: data/domande.db, the path
# used here, means that schema (ZEROCADE_GIOCHI_DB=legacy goes back to the old file).
sys.path.insert(0, os.path.join(ROOT, "..", "database"))
import giochi  # noqa: E402
LETTERS = "abcd"

SCHEMA = """
CREATE TABLE IF NOT EXISTS domande (
  id TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  difficolta INTEGER NOT NULL CHECK (difficolta IN (1, 2, 3)),
  testo TEXT NOT NULL CHECK (trim(testo) <> ''),
  spiegazione TEXT NOT NULL DEFAULT '',
  ordine_fisso INTEGER NOT NULL DEFAULT 0 CHECK (ordine_fisso IN (0, 1)),
  attiva INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1)),
  ordine INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS opzioni (
  domanda TEXT NOT NULL REFERENCES domande(id) ON DELETE CASCADE,
  posizione INTEGER NOT NULL CHECK (posizione BETWEEN 0 AND 3),
  testo TEXT NOT NULL CHECK (trim(testo) <> ''),
  giusta INTEGER NOT NULL DEFAULT 0 CHECK (giusta IN (0, 1)),
  PRIMARY KEY (domanda, posizione)
);
CREATE UNIQUE INDEX IF NOT EXISTS opzioni_una_giusta ON opzioni (domanda) WHERE giusta = 1;
PRAGMA user_version = 1;
"""


def connect(path=DB):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    db = giochi.connect(path)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    return db


def load(path=DB):
    """Every question in order: {id, categoria, difficolta, ordine_fisso, attiva, domanda,
    spiegazione, opzioni: [text, ...], giusta: index}."""
    if not giochi.exists(path):
        sys.exit(f"{path} not found: create it with  python tools/domande.py import <file.csv>")
    db = giochi.connect(f"file:{path}?mode=ro", uri=True)
    out = {}
    for row in db.execute(
        "SELECT id, categoria, difficolta, ordine_fisso, attiva, testo, spiegazione FROM domande ORDER BY ordine"
    ):
        out[row[0]] = {
            "id": row[0],
            "categoria": row[1],
            "difficolta": row[2],
            "ordine_fisso": bool(row[3]),
            "attiva": bool(row[4]),
            "domanda": row[5],
            "spiegazione": row[6],
            "opzioni": [],
            "giusta": None,
        }
    for qid, pos, text, right in db.execute("SELECT domanda, posizione, testo, giusta FROM opzioni ORDER BY domanda, posizione"):
        q = out[qid]
        q["opzioni"].append(text)
        if right:
            q["giusta"] = len(q["opzioni"]) - 1
    db.close()
    return list(out.values())


def problems_of(q):
    """What would keep a question out of the game (the server skips it too)."""
    found = []
    if not 2 <= len(q["opzioni"]) <= 4:
        found.append(f"{len(q['opzioni'])} answers, not 2 to 4")
    if q["giusta"] is None:
        found.append("no right answer")
    if len({o.strip().lower() for o in q["opzioni"]}) < len(q["opzioni"]):
        found.append("two answers are the same")
    return found


def import_csv(src):
    with open(src, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = [r for r in reader if (r.get("id") or "").strip()]
    required = ["id", "categoria", "difficolta", "domanda", "a", "b", "giusta"]
    missing = [c for c in required if c not in header]
    if missing:
        sys.exit(f"{src}: missing columns {missing}")

    problems = []
    ids = Counter(r["id"].strip() for r in rows)
    problems += [f"id {i} appears {n} times" for i, n in ids.items() if n > 1]
    parsed = []
    for r in rows:
        qid = r["id"].strip()
        answers = [(r.get(letter) or "").strip() for letter in LETTERS]
        # Two to four answers, in order: no gap before the last one.
        while answers and not answers[-1]:
            answers.pop()
        right = (r["giusta"] or "").strip().lower()
        flag = lambda name, default: (r.get(name) or default).strip()
        q = {
            "id": qid,
            "categoria": r["categoria"].strip().lower(),
            "difficolta": r["difficolta"].strip(),
            "ordine_fisso": flag("ordine_fisso", "0"),
            "attiva": flag("attiva", "1"),
            "domanda": r["domanda"].strip(),
            "spiegazione": (r.get("spiegazione") or "").strip(),
            "opzioni": answers,
            "giusta": LETTERS.index(right) if right in LETTERS and LETTERS.index(right) < len(answers) else None,
        }
        if "" in answers:
            problems.append(f"{qid}: an empty answer before the last one")
        if q["difficolta"] not in ("1", "2", "3"):
            problems.append(f"{qid}: difficolta is {q['difficolta']!r}, not 1, 2 or 3")
        for name in ("ordine_fisso", "attiva"):
            if q[name] not in ("0", "1"):
                problems.append(f"{qid}: {name} is {q[name]!r}, not 0 or 1")
        if not q["domanda"]:
            problems.append(f"{qid}: no question text")
        if not q["categoria"]:
            problems.append(f"{qid}: no category")
        problems += [f"{qid}: {p}" for p in problems_of(q)]
        parsed.append(q)
    if problems:
        sys.exit("\n".join(problems))

    db = connect()
    before = {row[0] for row in db.execute("SELECT id FROM domande")}
    with db:
        db.execute("DELETE FROM opzioni")
        db.execute("DELETE FROM domande")
        for order, q in enumerate(parsed, start=1):
            db.execute(
                "INSERT INTO domande (id, categoria, difficolta, testo, spiegazione, ordine_fisso, attiva, ordine)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (q["id"], q["categoria"], int(q["difficolta"]), q["domanda"], q["spiegazione"], int(q["ordine_fisso"]), int(q["attiva"]), order),
            )
            for pos, text in enumerate(q["opzioni"]):
                db.execute(
                    "INSERT INTO opzioni (domanda, posizione, testo, giusta) VALUES (?, ?, ?, ?)",
                    (q["id"], pos, text, int(pos == q["giusta"])),
                )
    db.execute("VACUUM")
    db.close()
    gone = sorted(before - set(ids))
    print(f"{len(parsed)} domande -> {DB}")
    if gone:
        print(f"note: {len(gone)} id no longer present (their saved answers stay): {', '.join(gone)}")


def export_csv(dst):
    questions = load()
    header = ["id", "categoria", "difficolta", "ordine_fisso", "attiva", "domanda", "a", "b", "c", "d", "giusta", "spiegazione"]
    with open(dst, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(header)
        for q in questions:
            answers = (q["opzioni"] + ["", "", "", ""])[:4]
            right = LETTERS[q["giusta"]].upper() if q["giusta"] is not None else ""
            writer.writerow(
                [q["id"], q["categoria"], q["difficolta"], int(q["ordine_fisso"]), int(q["attiva"]), q["domanda"]]
                + answers
                + [right, q["spiegazione"]]
            )
    print(f"{len(questions)} domande -> {dst}")


def stats():
    questions = load()
    active = [q for q in questions if q["attiva"]]
    print(f"{len(questions)} domande, {len(active)} attive")
    for name, key in (("categoria", "categoria"), ("difficolta", "difficolta")):
        counts = Counter(q[key] for q in active)
        print(f"{name}: " + ", ".join(f"{k} {n}" for k, n in sorted(counts.items())))
    right = Counter(LETTERS[q["giusta"]].upper() for q in active if q["giusta"] is not None and q["ordine_fisso"])
    if right:
        print("giusta (ordine fisso): " + ", ".join(f"{k} {n}" for k, n in sorted(right.items())))
    for q in questions:
        for p in problems_of(q):
            print(f"! {q['id']}: {p}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)
    sub.add_parser("import", help="replace the questions with those of a CSV").add_argument("csv")
    sub.add_parser("export", help="write the questions to a CSV").add_argument("csv")
    sub.add_parser("stats", help="counts per category and difficulty, and problems")
    args = ap.parse_args()
    if args.command == "import":
        import_csv(args.csv)
    elif args.command == "export":
        export_csv(args.csv)
    else:
        stats()
