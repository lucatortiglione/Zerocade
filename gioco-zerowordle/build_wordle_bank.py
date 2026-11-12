"""Costruisce le parole di ZeroWordle dall'inventario lessicale di prompt_raw.sqlite3.

Parte dai termini di 5, 6, 7 e 8 lettere dell'inventario (gioco-zeroassociations/prompt_raw.sqlite3,
aperto in sola lettura) e per ogni lunghezza N li divide in due elenchi, in data/ (versionati: li legge il server):

  solutions-N.txt  le parole che possono essere la soluzione: lemmi italiani comuni, attestati da
                 più dizionari, senza accenti, né nomi propri, né parole volgari o marginali
  words-N.txt      le parole ammesse come tentativo: le soluzioni più ogni forma italiana
                 attestata da almeno due fonti (plurali, coniugazioni, parole rare)
  meta.json        i conteggi per lunghezza

Le parole sono in minuscolo, a-z. Un tentativo con accento ("città") vale come "citta": le parole
con accento sono ammesse come tentativo ma mai come soluzione.

Uso:  python build_wordle_bank.py [--db PERCORSO] [--report] [--sample 40]
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import random
import re
import sys
import sqlite3
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "database"))
import giochi  # noqa: E402
DATA = HERE / "data"
ROOT = HERE.parent
DEFAULT_DB = ROOT / "gioco-zeroassociations" / "prompt_raw.sqlite3"
EXCLUSIONS = HERE / "wordle_exclusions.txt"

# Le regole sulle fonti e sulle etichette sono quelle della banca di ZeroContext.
_spec = importlib.util.spec_from_file_location("context_bank", ROOT / "gioco-zerocontext" / "build_context_bank.py")
bank = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bank)

LETTERS = "a-zàèéìòù"
LENGTHS = range(5, 9)

# Soglie di familiarità per la soluzione (rango wordfreq, frequenza OpenSubtitles).
SOLUTION_WF_RANK, SOLUTION_OS_FREQ = 100_000, 15
# Fonti che attestano una forma italiana (le stesse della banca di ZeroContext, più il correttore).
FORMS = bank.DICT | {"libreoffice-it-dictionary"}
FOREIGN = set("jkwxy")


def fold(word: str) -> str:
    return unicodedata.normalize("NFD", word).encode("ascii", "ignore").decode()


def collect(db: Path, length: int) -> dict[str, dict]:
    con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    snapshots = dict(con.execute("select id,source_key from inventory_snapshots"))
    terms = [
        r[0]
        for r in con.execute(
            "select prompt from inventory_terms where length(prompt)=? and prompt glob ?",
            (length, "".join(f"[{LETTERS}]" for _ in range(length))),
        )
    ]
    feats: dict[str, dict] = {}
    query = (
        "select snapshot_id,role,pos,lemma,details_json from inventory_attestations where prompt=?"
    )
    for prompt in terms:
        f = {"lemma": set(), "infl": set(), "inflL": {}, "prop": set(), "src": set(), "tags": {}, "kinds": set()}
        for sid, role, pos, lemma, details in con.execute(query, (prompt,)):
            source = snapshots[sid]
            fam = "ud" if source.startswith("ud-") else source
            f["src"].add(fam)
            if role == "lemma":
                k = bank.kind(source, pos)
                f["lemma"].add(fam)
                if k != "?":
                    f["kinds"].add((k, fam))
                if source == "nvdb-de-mauro-2016":
                    f["nvdb"] = pos
                elif source.startswith("kaikki"):
                    d = json.loads(details)
                    f["tags"].setdefault(source, []).append([s.get("tags", []) for s in d.get("senses", [])])
            elif role == "inflected_form":
                f["infl"].add(fam)
                f["inflL"].setdefault(lemma, set()).add(fam)
            elif role == "proper_name":
                f["prop"].add(fam)
            elif role == "frequency_form":
                d = json.loads(details)
                if "rank" in d:
                    f["wf"] = d["rank"]
                if "frequency" in d:
                    f["os"] = d["frequency"]
        feats[prompt] = f
    con.close()
    return feats


def families(f: dict, names: set[str]) -> set[str]:
    return f["lemma"] & names


def verdict(word: str, f: dict) -> tuple[bool, str]:
    """(ammessa come tentativo, motivo o 'soluzione' / 'tentativo')."""
    dict_lemma = f["lemma"] & bank.DICT
    dict_any = (f["lemma"] | f["infl"]) & FORMS
    if f["prop"] and len(f["prop"]) >= len(dict_any | f["lemma"]) and not dict_lemma:
        return False, "nome_proprio"
    attested = len(dict_any) >= 2 or ("wf" in f and f["wf"] <= 250_000 and len(dict_any) >= 1)
    if not attested:
        return False, "poco_attestata"
    if not word.isascii():
        return True, "tentativo_accentata"
    # Soluzione: lemma comune, in almeno due dizionari, non volgare né marginale.
    if len(dict_lemma) < 2:
        return True, "tentativo_flessa"
    other = [fams for lemma, fams in f["inflL"].items() if lemma != word]
    if other and max(len(x) for x in other) >= len(dict_lemma):
        return True, "tentativo_flessa"  # forma di un altro lemma (steso, valgo, possa)
    if FOREIGN & set(word):
        return True, "tentativo_straniera"
    if bank.tagged(f, bank.OFFENSIVE) or bank.tagged(f, bank.MARGINAL):
        return True, "tentativo_marginale"
    if len(f["prop"]) >= len(dict_lemma):
        return True, "tentativo_nome_proprio"
    kinds = {k for k, _ in f["kinds"]}
    if not kinds & {"N", "A"} and not (word.endswith(("are", "ere", "ire")) and "V" in kinds):
        return True, "tentativo_non_lessicale"
    common = f.get("wf", 10**9) <= SOLUTION_WF_RANK and f.get("os", 0) >= SOLUTION_OS_FREQ
    basic = f.get("nvdb") is not None and f.get("wf", 10**9) <= 120_000
    if not (common or basic):
        return True, "tentativo_poco_frequente"
    return True, "soluzione"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--sample", type=int, default=0, help="stampa un campione casuale di soluzioni")
    args = ap.parse_args()

    excluded = set()
    if EXCLUSIONS.exists():
        excluded = {w for line in EXCLUSIONS.read_text(encoding="utf-8").splitlines() for w in line.split("#")[0].split()}

    DATA.mkdir(exist_ok=True)
    meta: dict[str, dict] = {}
    samples: dict[int, tuple[set[str], set[str]]] = {}
    reasons = collections.Counter()
    for length in LENGTHS:
        feats = collect(args.db, length)
        solutions: set[str] = set()
        guesses: set[str] = set()
        for word, f in feats.items():
            ok, why = verdict(word, f)
            reasons[(length, why)] += 1
            if not ok:
                continue
            guesses.add(fold(word))
            if why == "soluzione" and word not in excluded:
                solutions.add(word)
        guesses |= solutions
        meta[str(length)] = {"solutions": len(solutions), "words": len(guesses)}
        samples[length] = (solutions, guesses)
        print(f"{length} lettere: termini {len(feats)}  soluzioni {len(solutions)}  tentativi ammessi {len(guesses)}")
    # Le liste vanno nel DB dei giochi, schema wordle (database/giochi.sqlite3): lo legge il server.
    giochi.write_wordle({n: (sorted(s), sorted(g)) for n, (s, g) in samples.items()}, meta)
    if args.report:
        for (length, why), n in sorted(reasons.items()):
            print(length, why, n)
    if args.sample:
        rng = random.Random(1)
        for length, (solutions, guesses) in samples.items():
            print(length, "soluzioni:", " ".join(rng.sample(sorted(solutions), min(args.sample, len(solutions)))))
            rest = sorted(guesses - solutions)
            print(length, "solo tentativi:", " ".join(rng.sample(rest, min(args.sample, len(rest)))))


if __name__ == "__main__":
    main()
