#!/usr/bin/env python3
"""Validatore CSV Word Association IT - specifica v3.4 (solo stdlib).

Validazione strutturale e individuazione di ANOMALIE, non una prova di
correttezza semantica, difficolta', univocita' delle soluzioni o autenticita'
CUID. Codice 0 = nessun errore; 1 = errori; 2 = argomenti errati.

Esempi:
    python validate_word_association_it_v3_4.py lotto.csv
    python validate_word_association_it_v3_4.py dataset.csv --min-rows 10001
    python validate_word_association_it_v3_4.py dataset.csv --report-json qa_report.json
    python validate_word_association_it_v3_4.py dataset.csv --strict-warnings
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path
import re
import unicodedata

HEADER = ["ref", "source", "language", "prompt", "words"]
TOKEN = re.compile(r"[a-zàèéìòù]+\Z")
CUID_SHAPE = re.compile(r"c[a-z0-9]{24}\Z")
STOP_ASSOCIATIONS = {
    "bello", "brutto", "grande", "piccolo", "buono", "cattivo",
    "alto", "basso", "nuovo", "vecchio", "cosa", "oggetto", "persona",
    "gente", "uomo", "donna", "italia", "italiano", "mondo", "vita",
    "luogo", "posto", "tempo", "modo", "tipo", "parte", "fatto",
    "esempio",
}


def normalized(value: str) -> str:
    """Chiave di confronto; NON modifica il valore originale nel CSV."""
    return unicodedata.normalize("NFC", value).casefold()


def similar_prefix(a: str, b: str, length: int = 5) -> bool:
    """Solo euristica: stesse 5 lettere iniziali NON provano una radice comune."""
    return len(a) >= length + 1 and len(b) >= length + 1 and a[:length] == b[:length]


def validate(path: Path, min_rows: int = 0, max_frequency_ratio: float = 0.01,
             max_messages: int = 30) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    counts: Counter[str] = Counter()
    frequency: Counter[str] = Counter()
    prompts: dict[str, int] = {}
    refs: dict[str, int] = {}
    signatures: dict[tuple[str, ...], int] = {}
    six_index: dict[tuple[str, ...], list[tuple[int, str]]] = defaultdict(list)
    seen_pairs: set[tuple[int, int]] = set()
    rows = 0
    complete_rows = 0

    def issue(level: str, kind: str, message: str) -> None:
        counts[f"{level}:{kind}"] += 1
        destination = errors if level == "ERRORE" else warnings
        if len(destination) < max_messages:
            destination.append(message)

    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, strict=True)
            header = next(reader, None)
            if header != HEADER:
                issue("ERRORE", "intestazione", f"Intestazione {header!r}; attesa {HEADER!r}")
                return _report(path, rows, complete_rows, counts, errors, warnings, frequency)

            for line_no, cells in enumerate(reader, start=2):
                rows += 1
                if len(cells) != len(HEADER):
                    issue("ERRORE", "numero_colonne", f"Riga {line_no}: {len(cells)} colonne, attese 5")
                    continue
                complete_rows += 1
                ref, source, language, prompt, words_raw = cells
                clues = words_raw.split("|")
                label = f"Riga {line_no} [{prompt}]"

                if not CUID_SHAPE.fullmatch(ref):
                    issue("ERRORE", "ref_formato", f"{label}: ref {ref!r} non conforme a ^c[a-z0-9]{{24}}$")
                if ref in refs:
                    issue("ERRORE", "ref_duplicato", f"{label}: stesso ref della riga {refs[ref]}")
                else:
                    refs[ref] = line_no

                if source != "platform":
                    issue("ERRORE", "source", f"{label}: source={source!r}; atteso 'platform'")
                if language != "it":
                    issue("ERRORE", "language", f"{label}: language={language!r}; atteso 'it'")
                if not TOKEN.fullmatch(prompt):
                    issue("ERRORE", "prompt_formato", f"{label}: prompt non ammissibile (una parola minuscola)")
                if unicodedata.normalize("NFC", prompt) != prompt:
                    issue("ERRORE", "unicode_nfc", f"{label}: prompt non normalizzato NFC")

                prompt_key = normalized(prompt)
                if prompt_key in prompts:
                    issue("ERRORE", "prompt_duplicato", f"{label}: bersaglio già presente alla riga {prompts[prompt_key]}")
                else:
                    prompts[prompt_key] = line_no

                if len(clues) != 7:
                    issue("ERRORE", "numero_indizi", f"{label}: {len(clues)} indizi, attesi esattamente 7")
                clues_norm = [normalized(c) for c in clues]
                if len(set(clues_norm)) != len(clues_norm):
                    issue("ERRORE", "indizi_duplicati", f"{label}: indizi ripetuti nella stessa riga")
                if prompt_key in clues_norm:
                    issue("ERRORE", "autorisposta", f"{label}: il prompt compare fra gli indizi")

                for clue in clues:
                    if not TOKEN.fullmatch(clue):
                        issue("ERRORE", "indizio_formato", f"{label}: indizio non ammissibile {clue!r}")
                    if unicodedata.normalize("NFC", clue) != clue:
                        issue("ERRORE", "unicode_nfc", f"{label}: indizio non normalizzato {clue!r}")
                    if normalized(clue) in STOP_ASSOCIATIONS:
                        issue("ERRORE", "parola_vietata", f"{label}: indizio tappabuchi {clue!r}")
                frequency.update(set(clues_norm))  # numero di righe, non token grezzi

                # POSSIBILI parentela morfologiche: richiedono revisione linguistica.
                suspects = [(prompt, c) for c in clues if similar_prefix(prompt_key, normalized(c))]
                suspects.extend((a, b) for a, b in combinations(clues_norm, 2)
                                if similar_prefix(a, b))
                if suspects:
                    issue("AVVISO", "radice_presunta", f"{label}: verificare possibili radici comuni: {suspects[:3]}")

                signature = tuple(sorted(clues_norm))
                if signature in signatures:
                    issue("ERRORE", "set_identico", f"{label}: stesso insieme di indizi della riga {signatures[signature]}")
                else:
                    signatures[signature] = line_no
                if len(clues) == 7 and len(set(clues_norm)) == 7:
                    for subset in combinations(signature, 6):
                        for other_line, other_prompt in six_index[subset]:
                            pair = (other_line, line_no)
                            if pair not in seen_pairs:
                                seen_pairs.add(pair)
                                issue("AVVISO", "quasi_duplicato", f"{label}: 6+ indizi in comune con riga {other_line} [{other_prompt}]")
                        six_index[subset].append((line_no, prompt))

    except (OSError, UnicodeError, csv.Error) as exc:
        issue("ERRORE", "lettura", f"Errore di lettura o parsing CSV: {exc}")

    if rows < min_rows:
        issue("ERRORE", "numero_righe", f"Righe trovate: {rows}; minimo richiesto: {min_rows}")
    # Sui lotti piccoli il rapporto e' statisticamente poco utile.
    if rows >= 1000:
        for clue, count in frequency.most_common():
            if count / rows > max_frequency_ratio:
                issue("AVVISO", "frequenza_globale", f"{clue!r}: {count}/{rows} righe ({count / rows:.2%}) oltre {max_frequency_ratio:.2%}")

    return _report(path, rows, complete_rows, counts, errors, warnings, frequency)


def _report(path: Path, rows: int, complete_rows: int, counts: Counter,
            errors: list[str], warnings: list[str], frequency: Counter) -> dict:
    return {
        "file": str(path),
        "righe": rows,
        "righe_con_cinque_colonne": complete_rows,
        "errori": sum(v for k, v in counts.items() if k.startswith("ERRORE:")),
        "avvisi": sum(v for k, v in counts.items() if k.startswith("AVVISO:")),
        "conteggi_per_tipo": dict(sorted(counts.items())),
        "esempi_errori": errors,
        "esempi_avvisi": warnings,
        "indizi_piu_frequenti": frequency.most_common(15),
        "limiti": ["Controlla la forma degli ID ma NON la loro autenticita' CUID.",
                   "Non certifica semantica, difficolta', ortografia lessicale o univocita' della soluzione."],
    }




def inspect_qa_register(csv_path: Path, qa_paths: list[Path], require_qa: bool = False, max_examples: int = 30) -> dict:
    """Confronta verbali QA locali v3.4 con CSV: NON certifica giudizi semantici."""
    dataset = {}
    with csv_path.open('r', encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        for row in reader:
            if row.get('prompt'):
                dataset[normalized(row['prompt'])] = row.get('words', '').split('|')

    errors, warnings = [], []
    unique_reports = {}
    accepted = 0
    review = 0
    for path in qa_paths:
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            errors.append(f'{path.name}: impossibile leggere verbale QA: {exc}')
            continue
        if not isinstance(data, dict) or data.get('schema_version') != 'word-association-qa-3.4':
            errors.append(f'{path.name}: schema QA non valido o non supportato')
            continue
        prompt = data.get('prompt')
        if not isinstance(prompt, str):
            errors.append(f'{path.name}: bersaglio non valido')
            continue
        key = normalized(prompt)
        if key in unique_reports:
            errors.append(f'{path.name}: duplicato di verbale QA per {prompt} ({unique_reports[key]})')
            continue
        unique_reports[key] = path.name
        if key not in dataset:
            errors.append(f'{path.name}: bersaglio {prompt!r} assente dal CSV')
            continue
        if data.get('words') != dataset[key]:
            errors.append(f'{path.name}: indizi diversi dal CSV per {prompt}')
            continue
        decision = data.get('decision')
        technical = data.get('technical') or {}
        blind = data.get('blind_test') or {}
        review_data = data.get('semantic_review') or {}
        notes = review_data.get('rationale')
        total = review_data.get('total_100')
        if decision == 'IDONEO_REVISIONE_FINALE':
            accepted += 1
            # Verifica la coerenza formale del verbale: i giudizi restano umani.
            valid = (technical.get('passed') is True
                     and not technical.get('errors')
                     and blind.get('completed') is True
                     and blind.get('exact_match_after_seven') is True
                     and review_data.get('equivalent_competitors') == 'no'
                     and data.get('safety_review') == 'conforme'
                     and isinstance(total, (int, float)) and total >= 85
                     and isinstance(notes, str) and len(notes.strip()) >= 20)
            if technical.get('warnings') and technical.get('warnings_reviewed') is not True:
                valid = False
            ratings = review_data.get('ratings')
            weights = {'Riconducibilità': 35, 'Pertinenza': 25, 'Difficoltà': 20,
                       'Originalità': 10, 'Familiarità': 10}
            if not isinstance(ratings, dict) or any(
                name not in ratings or not isinstance(ratings[name], dict)
                or ratings[name].get('peso') != weight
                or not isinstance(ratings[name].get('voto'), (int, float))
                or not 0 <= ratings[name]['voto'] <= 5
                for name, weight in weights.items()
            ):
                valid = False
            elif abs(round(sum(ratings[k]['voto'] * w / 5 for k, w in weights.items()), 1) - total) > 0.11:
                valid = False
            if not valid:
                errors.append(f'{path.name}: verbale con esito idoneo ma campi o criteri incoerenti')
        elif decision == 'DA_RIVEDERE':
            review += 1
            if require_qa:
                errors.append(f'{path.name}: {prompt} non idoneo nel registro QA')
        else:
            errors.append(f'{path.name}: decisione QA non riconosciuta ({decision!r})')

    missing = [name for name in dataset if name not in unique_reports]
    if missing and require_qa:
        errors.append(f'Mancano {len(missing)} verbali QA; esempi: {missing[:8]}')
    elif missing:
        warnings.append(f'{len(missing)} parole del CSV non hanno verbale QA; esempi: {missing[:8]}')
    return {
        'registri_qa_caricati': len(qa_paths),
        'prompt_con_verbale': len(unique_reports),
        'idonei_dichiarati': accepted,
        'da_rivedere': review,
        'senza_verbale': len(missing),
        'errori': len(errors),
        'avvisi': len(warnings),
        'esempi_errori': errors[:max_examples],
        'esempi_avvisi': warnings[:max_examples],
        'nota': 'Controlla coerenza dei verbali, NON validità del giudizio umano, indipendenza dei revisori o κ di Cohen.'
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv", type=Path, help="File CSV finale a 5 colonne")
    ap.add_argument("--min-rows", type=int, default=0, help="Minimo righe: 10001 per il rilascio finale")
    ap.add_argument("--max-frequency-ratio", type=float, default=0.01, help="Soglia avvisi frequenza (default 0.01)")
    ap.add_argument("--max-messages", type=int, default=30, help="Messaggi di esempio per severita' (default 30)")
    ap.add_argument("--report-json", type=Path, help="Salva rapporto strutturato in JSON")
    ap.add_argument("--strict-warnings", action="store_true", help="Restituisci exit code 1 anche in presenza di avvisi")
    qa = ap.add_mutually_exclusive_group()
    qa.add_argument("--qa-json", type=Path, help="Verifica un verbale JSON esportato dalla dashboard v3.4")
    qa.add_argument("--qa-dir", type=Path, help="Verifica i verbali JSON contenuti in una cartella")
    ap.add_argument("--require-qa", action="store_true", help="Richiede un verbale QA idoneo per OGNI prompt nel CSV")
    args = ap.parse_args()
    if args.min_rows < 0 or not 0 < args.max_frequency_ratio <= 1 or args.max_messages < 0:
        ap.error("Parametri numerici non validi")
    if args.require_qa and not (args.qa_json or args.qa_dir):
        ap.error("--require-qa richiede --qa-dir o --qa-json")

    report = validate(args.csv, args.min_rows, args.max_frequency_ratio, args.max_messages)
    print(f"FILE: {report['file']}\nRIGHE: {report['righe']:,} (con 5 colonne: {report['righe_con_cinque_colonne']:,})")
    print(f"ERRORI: {report['errori']:,}\nAVVISI: {report['avvisi']:,}")
    for kind, count in report["conteggi_per_tipo"].items():
        print(f"  {kind}: {count:,}")
    for label, key in (("ERRORI", "esempi_errori"), ("AVVISI", "esempi_avvisi")):
        if report[key]:
            print(f"\n{label} (primi {len(report[key])}):")
            for item in report[key]:
                print(" -", item)
    print("\nIndizi piu' frequenti:", report["indizi_piu_frequenti"][:10])
    print("\nATTENZIONE: zero errori NON certifica qualita' semantica o difficolta'.")
    qa_errors = 0
    if args.qa_json or args.qa_dir:
        if args.qa_dir and not args.qa_dir.is_dir():
            ap.error(f"Cartella QA non trovata: {args.qa_dir}")
        qa_files = sorted(args.qa_dir.glob('*.json')) if args.qa_dir else [args.qa_json]
        try:
            qa_report = inspect_qa_register(args.csv, qa_files, args.require_qa, args.max_messages)
        except (OSError, UnicodeError, csv.Error) as exc:
            ap.error(f"Impossibile confrontare il registro QA con il dataset: {exc}")
        report['registro_qa'] = qa_report
        qa_errors = qa_report['errori']
        print(f"\nREGISTRO QA: {qa_report['prompt_con_verbale']} verbali, "
              f"{qa_report['idonei_dichiarati']} idonei dichiarati, "
              f"{qa_report['da_rivedere']} da rivedere, "
              f"{qa_report['senza_verbale']} mancanti, "
              f"{qa_errors} errori nel registro")
        for item in qa_report['esempi_errori'][:10]: print(' -', item)
        for item in qa_report['esempi_avvisi'][:3]: print(' -', item)
        print('Questo controllo NON dimostra che le valutazioni umane siano corrette.')
    if args.report_json:
        try:
            args.report_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Rapporto JSON: {args.report_json}")
        except OSError as exc:
            ap.error(f"Impossibile scrivere il rapporto JSON: {exc}")
    return 1 if report["errori"] or qa_errors or (args.strict_warnings and report["avvisi"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
