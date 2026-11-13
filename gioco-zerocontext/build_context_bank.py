"""Costruisce la banca italiana estesa di ZeroContext.

Parte dall'esportazione Livecade (livecade-context-it-bank.csv, mai modificata)
e aggiunge i sostantivi italiani comuni ricavati dall'inventario lessicale di
ZeroAssociazioni (schema raw di database/parole_ita_raw.sqlite3, aperto in sola lettura).

Uscite, nella cartella di questo script:
  zerocontext-it-bank-aggiunte.csv  solo le parole nuove, da integrare al CSV Livecade
  zerocontext-it-bank.csv           Livecade + aggiunte già uniti
  zerocontext-it-bank-meta.csv      una riga per parola con fascia e prove usate
I primi due hanno il formato dell'esportazione Livecade: ref,source,language,word.

Uso:  python build_context_bank.py [--db PERCORSO] [--report]
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "gioco-zeroassociations"))
import unified_db  # noqa: E402

# L'inventario: lo schema raw del DB di lavoro (database/parole_ita_raw.sqlite3#raw).
DEFAULT_DB = unified_db.address("raw")
LIVECADE_CSV = HERE / "livecade-context-it-bank.csv"
EXCLUSIONS = HERE / "context_bank_exclusions.txt"
OUT_CSV = HERE / "zerocontext-it-bank.csv"
OUT_ADDED = HERE / "zerocontext-it-bank-aggiunte.csv"
HEADER = ["ref", "source", "language", "word"]
OUT_META = HERE / "zerocontext-it-bank-meta.csv"

# Stessa forma delle parole Livecade: una parola, minuscola, 4-14 lettere.
WORD = re.compile(r"^[a-zàèéìòù]{4,14}$")

# Soglie di familiarità, tarate sulla banca Livecade: il 95% delle sue parole ha
# rango wordfreq <= 62.000 e frequenza OpenSubtitles >= 64.
COMMON_WF_RANK, COMMON_OS_FREQ = 30_000, 150
EXTENDED_WF_RANK, EXTENDED_OS_FREQ = 60_000, 60

# Fonti che attestano il lemma con la parte del discorso.
DICT = {
    "kaikki-itwiktionary", "kaikki-enwiktionary-it", "kaikki-frwiktionary-it",
    "kaikki-dewiktionary-it", "kaikki-eswiktionary-it", "morphit-048-mirror",
    "omw-multiwordnet-it", "nvdb-de-mauro-2016", "itaoa-montefinese-2019",
}
MORPHIT = "morphit-048-mirror"
OFFENSIVE = {"vulgar", "offensive", "derogatory", "slur"}
MARGINAL = OFFENSIVE | {
    "pejorative", "archaic", "obsolete", "dated", "literary", "poetic", "rare",
    "uncommon", "regional", "dialectal", "Tuscany", "historical", "alt-of",
    "alternative", "abbreviation", "misspelling", "form-of", "outdated",
}


def kind(source: str, pos: str) -> str:
    p = pos.lower()
    if source == "nvdb-de-mauro-2016":
        return "N" if "s." in p else "O"
    if p in ("noun", "n") or p.startswith("noun"):
        return "N"
    if p in ("adj", "a", "s") or p.startswith("adj"):
        return "A"
    if p in ("verb", "v") or p[:3] in ("ver", "aux", "mod", "cau"):
        return "V"
    return "?" if p == "" else "O"


def collect(db: Path) -> dict[str, dict]:
    """Un solo passaggio sulle attestazioni: prove per parola."""
    # Uno schema del DB di lavoro o un file a sé: l'SQL resta quello con i nomi senza prefisso (unified_db).
    con = unified_db.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    snapshots = dict(con.execute("select id,source_key from inventory_snapshots"))
    feats: dict[str, dict] = {}
    query = "select prompt,snapshot_id,role,pos,lemma,details_json from inventory_attestations"
    for prompt, sid, role, pos, lemma, details in con.execute(query):
        if not WORD.match(prompt):
            continue
        source = snapshots[sid]
        fam = "ud" if source.startswith("ud-") else source
        f = feats.get(prompt)
        if f is None:
            f = feats[prompt] = {
                "N": set(), "A": set(), "V": set(), "O": set(), "src": set(),
                "inflN": {}, "inflO": set(), "prop": set(), "tags": {},
                "udN": 0, "udX": 0,
            }
        f["src"].add(fam)
        if role == "lemma":
            k = kind(source, pos)
            if k != "?":
                f[k].add(fam)
            if fam == "ud":
                f["udN" if k == "N" else "udX"] += 1
            elif source == "nvdb-de-mauro-2016":
                f["nvdb"] = pos
            elif source == "itaoa-montefinese-2019":
                f["aoa"] = json.loads(details).get("aoa_mean")
            elif source.startswith("kaikki") and k == "N":
                d = json.loads(details)
                senses = [s.get("tags", []) for s in d.get("senses", [])]
                f["tags"].setdefault(source, []).append(senses)
        elif role == "inflected_form":
            if kind(source, pos) == "N":
                f["inflN"].setdefault(lemma, set()).add(fam)
            else:
                f["inflO"].add(fam)
                if fam == "ud":
                    f["udX"] += 1
        elif role == "proper_name":
            f["prop"].add(fam)
        elif role == "frequency_form":
            d = json.loads(details)
            # Una parola può comparire più volte nella stessa lista (per esempio "ﬂare", con la legatura, e "flare"):
            # vale il rango migliore e la frequenza più alta, qualunque sia l'ordine delle righe.
            if "rank" in d:
                f["wf"] = min(f.get("wf", d["rank"]), d["rank"])
            if "frequency" in d:
                f["os"] = max(f.get("os", d["frequency"]), d["frequency"])
    con.close()
    return feats


def tagged(f: dict, tagset: set[str]) -> bool:
    """Vero se, nella maggioranza dei Wikizionari, il primo significato
    nominale (o tutti i significati) porta una delle etichette date."""
    bad = total = 0
    for entries in f["tags"].values():
        senses = entries[0]
        if not senses:
            continue
        total += 1
        if set(senses[0]) & tagset or all(set(s) & tagset for s in senses):
            bad += 1
    return total > 0 and bad * 2 > total


def noun_dominant(f: dict, nouns: set[str], adjs: set[str]) -> bool:
    if f["udN"] + f["udX"] >= 3:
        return f["udN"] > f["udX"]
    return len(adjs) * 2 <= len(nouns)


def decide(word: str, f: dict) -> str:
    """Restituisce la fascia ('base', 'comune', 'esteso') o '-motivo'."""
    nouns, adjs = f["N"] & DICT, f["A"] & DICT
    if not nouns:
        return "-non_sostantivo"
    if tagged(f, OFFENSIVE):
        return "-volgare"
    nvdb = f.get("nvdb", "")
    if nvdb.startswith("s."):
        return "base"
    if nvdb:
        return "base" if len(nouns) >= 3 and noun_dominant(f, nouns, adjs) else "-uso_non_nominale"
    if tagged(f, MARGINAL):
        return "-marginale"
    other_lemmas = [fams for lemma, fams in f["inflN"].items() if lemma != word]
    if other_lemmas and max(len(x) for x in other_lemmas) >= len(nouns):
        return "-forma_flessa"
    if len(nouns) < 2:
        return "-una_sola_fonte"
    if len(f["prop"]) >= len(nouns):
        return "-nome_proprio"
    if adjs and not noun_dominant(f, nouns, adjs):
        return "-uso_non_nominale"
    if f["V"] & DICT and word.endswith(("are", "ere", "ire", "rre", "rsi")):
        return "-uso_non_nominale"
    if "aoa" in f:
        return "base"
    # Omografi di forme verbali o lemmi marginali: serve il riscontro di
    # Morph-it!, oppure tre dizionari concordi senza omografia verbale.
    if MORPHIT not in nouns and (f["inflO"] or len(nouns) < 3):
        return "-sostantivo_debole"
    wf, os_ = f.get("wf", 10**9), f.get("os", 0)
    if wf <= COMMON_WF_RANK and os_ >= COMMON_OS_FREQ:
        return "comune"
    if wf <= EXTENDED_WF_RANK and os_ >= EXTENDED_OS_FREQ:
        return "esteso"
    return "-poco_frequente"


def load_exclusions() -> set[str]:
    if not EXCLUSIONS.exists():
        return set()
    lines = EXCLUSIONS.read_text(encoding="utf-8").splitlines()
    return {word for line in lines for word in line.split("#")[0].split()}


def ref_for(word: str) -> str:
    """Identificativo stabile: stessa parola, stesso ref a ogni rigenerazione."""
    n = int.from_bytes(hashlib.sha256(f"zerocontext:it:{word}".encode()).digest()[:16], "big")
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return "zc" + out.rjust(25, "0")[-23:]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--report", action="store_true", help="stampa i conteggi dei motivi di esclusione")
    args = ap.parse_args()

    with LIVECADE_CSV.open(encoding="utf-8", newline="") as fh:
        livecade = list(csv.DictReader(fh))
    have = {r["word"] for r in livecade}
    excluded = load_exclusions()
    feats = collect(args.db)

    verdicts = {w: decide(w, f) for w, f in feats.items()}
    added = sorted(
        w for w, v in verdicts.items()
        if not v.startswith("-") and w not in have and w not in excluded
    )

    new_rows = [[ref_for(w), "zerocade", "it", w] for w in added]
    old_rows = [[r[k] for k in HEADER] for r in livecade]
    for path, rows in ((OUT_ADDED, new_rows), (OUT_CSV, old_rows + new_rows)):
        # utf-8-sig: senza BOM Excel mostra "crudeltÃ" al posto di "crudeltà".
        with path.open("w", encoding="utf-8-sig", newline="") as fh:
            out = csv.writer(fh, lineterminator="\r\n")  # come l'esportazione Livecade
            out.writerow(HEADER)
            out.writerows(rows)

    with OUT_META.open("w", encoding="utf-8-sig", newline="") as fh:
        out = csv.writer(fh, lineterminator="\n")
        out.writerow(["word", "source", "tier", "wordfreq_rank", "opensubtitles_freq",
                      "nvdb", "aoa", "noun_sources"])
        for w in sorted(have | set(added)):
            f = feats.get(w, {})
            tier = "livecade" if w in have else verdicts[w]
            out.writerow([w, "platform" if w in have else "zerocade", tier,
                          f.get("wf", ""), f.get("os", ""), f.get("nvdb", ""),
                          f.get("aoa", ""), len(f.get("N", set()) & DICT)])

    tiers = collections.Counter(verdicts[w] for w in added)
    print(f"Livecade: {len(livecade)}  aggiunte: {len(added)}  totale: {len(livecade) + len(added)}")
    print("fasce aggiunte:", dict(tiers))
    print("escluse a mano:", sum(1 for w in excluded if not verdicts.get(w, "-").startswith("-") and w not in have))
    if args.report:
        reasons = collections.Counter(v for v in verdicts.values() if v.startswith("-"))
        print("motivi di esclusione:", dict(reasons))
        kept = sum(1 for r in livecade if not verdicts.get(r["word"], "-").startswith("-"))
        print(f"parole Livecade che i filtri avrebbero scelto da soli: {kept}/{len(livecade)}")


if __name__ == "__main__":
    main()
