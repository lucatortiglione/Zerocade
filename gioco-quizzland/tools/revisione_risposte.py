"""Controlli sull'intero catalogo e applicazione delle decisioni editoriali registrate.

  python tools/revisione_risposte.py audit
  python tools/revisione_risposte.py apply
  python tools/revisione_risposte.py restore

Non decide la correttezza dal solo risultato di una regex. Le segnalazioni automatiche
sono una coda di lettura; solo correzioni-risposte.json può modificare il database.
Ogni decisione conserva la domanda completa prima e dopo. Apply/restore verificano
la preimmagine, sono idempotenti e creano un backup SQLite prima della transazione.
Le versioni intermedie registrate consentono di affinare una revisione già applicata
senza perdere il ripristino del testo originale né accettare modifiche sconosciute.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

import domande

DATA = Path(domande.ROOT) / "data"
DECISIONS = DATA / "correzioni-risposte.json"
CONTEXT = DATA / "verifica-contesto.json"
FIELDS = ("id", "categoria", "difficolta", "ordine_fisso", "attiva", "domanda", "spiegazione", "opzioni", "giusta")


def decisions():
    doc = json.loads(DECISIONS.read_text(encoding="utf-8"))
    entries = doc["decisioni"]
    for qid, entry in entries.items():
        before, after = entry["prima"], entry["dopo"]
        if before["id"] != qid or after["id"] != qid:
            raise ValueError(f"ID incoerente: {qid}")
        for q in (before, after, *entry.get("versioni_precedenti", [])):
            if q["id"] != qid or len(q["opzioni"]) != len(before["opzioni"]):
                raise ValueError(f"Storico incoerente: {qid}")
            problems = domande.problems_of(q)
            if problems:
                raise ValueError(f"{qid}: {problems}")
        if len(before["opzioni"]) != len(after["opzioni"]):
            raise ValueError(f"{qid}: non cambiare il numero delle posizioni")
        if not entry["motivo"] or entry["azione"] not in ("correggi", "escludi"):
            raise ValueError(f"Decisione incompleta: {qid}")
        if entry["azione"] == "escludi" and after["attiva"]:
            raise ValueError(f"Esclusione ancora attiva: {qid}")
    return entries


def same(a, b):
    return all(a.get(k) == b.get(k) for k in FIELDS)


def fingerprint(q):
    return hashlib.sha256(json.dumps(q, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def change(db_path, restore=False):
    entries = decisions()
    current = {q["id"]: q for q in domande.load(str(db_path))}
    pending = []
    for qid, entry in entries.items():
        before, after = (entry["dopo"], entry["prima"]) if restore else (entry["prima"], entry["dopo"])
        existing = current.get(qid)
        if existing is None:
            raise ValueError(f"Domanda assente: {qid}")
        if same(existing, after):
            continue
        accepted = [before, *entry.get("versioni_precedenti", [])]
        if not any(same(existing, version) for version in accepted):
            raise ValueError(f"{qid}: modificata da un'altra revisione; nessun dato sovrascritto")
        pending.append(after)
    if not pending:
        print("Nessuna modifica: tutte le decisioni sono già nello stato richiesto.")
        return
    # The backups stay in gioco-quizzland/data, whatever the database.
    backup_dir = Path(domande.ROOT) / "data" / "backup-revisione"
    backup_dir.mkdir(exist_ok=True)
    backup_path = backup_dir / ("domande-" + datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".db")
    with closing(sqlite3.connect(db_path)) as db, closing(sqlite3.connect(backup_path)) as backup:
        db.backup(backup)
    with closing(domande.connect(db_path)) as db, db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("BEGIN IMMEDIATE")
        # Recheck after acquiring the write lock, in case another editor changed the DB.
        locked = {q["id"]: q for q in domande.load(str(db_path))}
        if any(not same(locked[q["id"]], current[q["id"]]) for q in pending):
            raise ValueError("Il database è cambiato durante la preparazione; operazione annullata")
        for q in pending:
            # The right answer is a column of the question (its position); the answers are found by the question's
            # number. The foreign key from giusta to the answers is checked at commit.
            db.execute("UPDATE domande SET testo=?, spiegazione=?, attiva=?, ordine_fisso=?, giusta=? WHERE id=?",
                       (q["domanda"], q["spiegazione"], int(q["attiva"]), int(q["ordine_fisso"]), q["giusta"], q["id"]))
            for pos, option in enumerate(q["opzioni"]):
                db.execute("UPDATE opzioni SET testo=? WHERE domanda=(SELECT n FROM domande WHERE id=?) AND posizione=?",
                           (option, q["id"], pos))
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Verifica integrità fallita: transazione annullata")
    print(f"{'Ripristinate' if restore else 'Applicate'} {len(pending)} decisioni. Backup: {backup_path}")


def editorial_rows(rows):
    """Preserve the reviewed wording/exclusions when fonti.py regenerates the CSV.

    Match the source text and answer set before applying, to avoid masking a later source
    correction. The database positions in the editorial record are kept unchanged.
    """
    if not DECISIONS.exists():
        return rows
    entries = decisions()
    for row in rows:
        entry = entries.get(row[0])
        if not entry:
            continue
        old = [s for s in row[6:10] if s]
        versions = (entry["prima"], entry["dopo"], *entry.get("versioni_precedenti", []))
        if not any(row[5] == q["domanda"] and sorted(old) == sorted(q["opzioni"]) for q in versions):
            raise ValueError(f"{row[0]}: fonte modificata dopo la revisione; riconciliare la decisione")
        q = entry["dopo"]
        row[3], row[4], row[5] = int(q["ordine_fisso"]), int(q["attiva"]), q["domanda"]
        row[6:10] = q["opzioni"] + [""] * (4 - len(q["opzioni"]))
        row[10], row[11] = domande.LETTERS[q["giusta"]].upper(), q["spiegazione"]
    return rows


def flags(q):
    out = domande.problems_of(q)
    text = " ".join([q["domanda"], *q["opzioni"]])
    if re.search(r"\b(?:figura|tabella|immagine|diagramma|grafico) (?:seguente|sottostante|qui sotto|riportat[oa])\b", text, re.I):
        out.append("Possibile supporto visivo assente")
    if any(re.search(r"\b(?:tutt[ei]|nessun[oa]) (?:le|i|delle|dei) precedenti\b|\b[A-D] e [A-D]\b", o) for o in q["opzioni"]):
        out.append("Opzioni dipendenti dalla posizione")
    if q["id"].startswith(("arc-", "obqa-")):
        if any(re.search(r"\b(?:unicorni?|magia|magico|magici|maghi|demoni|elfi|alieni|fate|viagg(?:io|i) nel tempo|teletrasporto)\b", o, re.I) for o in q["opzioni"]):
            out.append("Possibile distrattore fantastico in domanda scientifica")
        if any(o.casefold() in ("udienza", "messa", "dom", "in esecuzione", "metro a bastoncino", "muscoloso") for o in q["opzioni"]):
            out.append("Possibile traduzione fuori contesto")
    # Keep punctuation/signs: C != C++, -40 != +40, and mathematical symbols are answers.
    normalized = [re.sub(r"\s+", " ", unicodedata.normalize("NFKC", o)).strip().casefold().rstrip(".") for o in q["opzioni"]]
    if len(set(normalized)) != len(normalized):
        out.append("Alternative equivalenti salvo spazi, maiuscole o punto finale")
    return list(dict.fromkeys(out))


def audit(db_path):
    entries = decisions()
    context = json.loads(CONTEXT.read_text(encoding="utf-8"))["domande"] if CONTEXT.exists() else {}
    questions = domande.load(str(db_path))
    coverage, pending = [], []
    for q in questions:
        entry = entries.get(q["id"])
        review = context.get(q["id"])
        review_valid = bool(review and review["sha256"] == fingerprint(q))
        applied_entry = bool(entry and same(q, entry["dopo"]))
        findings = flags(q)
        coverage.append({"id": q["id"], "sha256": fingerprint(q), "attiva": q["attiva"],
                         "controllo": "lettura_contestuale" if review_valid else "decisione_editoriale" if applied_entry else "solo_controlli_automatici",
                         "decisione_applicata": same(q, entry["dopo"]) if entry else None,
                         "lettura_contestuale_valida": review_valid,
                         "revisione_contestuale_obsoleta": bool(review and not review_valid),
                         "segnalazioni": findings})
        if findings and q["attiva"]:
            pending.append({**q, "segnalazioni": findings})
    count = Counter(e["azione"] for e in entries.values())
    applied = sum(row["decisione_applicata"] is True for row in coverage)
    read = sum(row["controllo"] != "solo_controlli_automatici" for row in coverage)
    confirmed = sum(row["lettura_contestuale_valida"] and row["id"] not in entries for row in coverage)
    outdated = sum(row["revisione_contestuale_obsoleta"] for row in coverage)
    report = {"data": "2026-11-06", "domande_controllate_automaticamente": len(questions),
              "decisioni_editoriali": len(entries), "corrette": count["correggi"], "escluse": count["escludi"],
              "decisioni_applicate": applied,
              "domande_lette_nel_contesto": read, "confermate_senza_modifiche": confirmed,
              "da_leggere_nel_contesto": len(questions) - read,
              "letture_da_ripetere_dopo_modifiche": outdated,
              "attive": sum(q["attiva"] for q in questions), "segnalazioni_residue": pending,
              "limite": "I controlli automatici non verificano la correttezza fattuale o la coerenza semantica. La lettura contestuale comprende domanda, tutte le alternative e chiave, ma non equivale alla verifica documentale indipendente di ogni fatto. Le righe con solo_controlli_automatici restano da leggere.",
              "copertura": coverage}
    (DATA / "audit-risposte.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Revisione del contesto delle domande e delle risposte", "", "6 novembre 2026.", "",
             f"Controlli automatici su **{len(questions):,} domande**. Decisioni editoriali registrate: **{count['correggi']} correzioni**, **{count['escludi']} esclusioni reversibili**. Applicate al database: **{applied}/{len(entries)}**.", "",
             f"Domande attive: **{report['attive']:,}**. Segnalazioni automatiche residue su domande attive: **{len(pending)}**.", "",
             f"Domande lette nel contesto, comprese le precedenti decisioni editoriali applicate: **{read:,}/{len(questions):,}**. Confermate senza modifiche: **{confirmed}**. Ancora da leggere: **{len(questions) - read:,}**. Letture invalidate da modifiche successive: **{outdated}**.", "",
             "## Ambito effettivo", "",
             "Sono stati controllati struttura, unicità delle alternative, riferimenti mancanti, distrattori fantastici nel contesto scientifico e traduzioni sospette. I candidati sono stati letti insieme a domanda, alternative, chiave e originale disponibile; le correzioni sono registrate per ID.", "",
             "**Non è una verifica semantica e fattuale individuale completa delle 26.715 domande.** Il registro distingue letture contestuali, decisioni editoriali e soli controlli automatici. L’assenza di una segnalazione non certifica una domanda. Una lettura perde validità se cambia il contenuto della domanda o delle risposte.", "",
             "La precedente revisione per pubblico italiano resta separata: qui non si escludono domande per argomento, provenienza o difficoltà.", "",
             "## Riproducibilità", "",
             "- `correzioni-risposte.json`: motivo, testo e tutte le opzioni prima/dopo, chiave e fonti consultate; le versioni precedenti conservano le revisioni intermedie.",
             "- `verifica-contesto.json`: letture contestuali registrate, incluse le conferme senza modifiche, con impronta del testo verificato.",
             "- `fonti/openbookqa/contesto-originale.json`: quesiti originali e fatti di supporto della fonte; usati per ricostruire l’intento, non assunti come garanzia di correttezza.",
             "- `audit-risposte.json`: una riga per ogni ID e impronta del contenuto controllato.",
             "- `backup-revisione/`: backup SQLite precedente a ogni applicazione o ripristino.",
             "- `python gioco-quizzland/tools/revisione_risposte.py apply`: applica le decisioni; rifiuta modifiche concorrenti.",
             "- `python gioco-quizzland/tools/revisione_risposte.py restore`: ripristina solo le decisioni di questo registro, se non modificate nel frattempo.",
             "- `python gioco-quizzland/tools/revisione_risposte.py audit`: rigenera il controllo dell’intero catalogo.", "",
             "Il CSV rigenerato da `fonti.py csv` conserva queste correzioni e disattivazioni. Il server carica le domande all’avvio: riavviarlo per utilizzare il catalogo aggiornato.", "",
             "## Interventi", "", "| ID | Azione | Motivo |", "| --- | --- | --- |"]
    for qid, e in entries.items():
        lines.append(f"| {qid} | {e['azione']} | {e['motivo'].replace('|', '/')} |")
    (DATA / "REVISIONE-RISPOSTE.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("copertura", "segnalazioni_residue")}, ensure_ascii=False))
    print(f"Segnalazioni residue: {len(pending)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("audit", "apply", "restore"))
    parser.add_argument("--db", type=Path, default=Path(domande.DB))
    args = parser.parse_args()
    if args.command == "audit":
        audit(args.db)
    else:
        change(args.db, restore=args.command == "restore")
