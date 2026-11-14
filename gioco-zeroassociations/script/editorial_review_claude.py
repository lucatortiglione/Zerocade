"""Revisione editoriale di Claude su un intervallo dei candidati congelati, separata da quella di ChatGPT.

Usa lo stesso elenco congelato (completion_20261109_editorial/candidates.jsonl), ma scrive in
una cartella propria: le due revisioni lavorano su intervalli disgiunti e non si sovrascrivono.

sheet   scheda compatta da leggere: indice, parola, POS, frequenza, segnalazioni e sensi
check   controlla le bozze (una riga per indice) senza registrare nulla
record  unisce le bozze di un intervallo completo in un file di decisioni verificabile
import  importa le decisioni nella raccolta (review_prompts.import_decisions), poi rigenera
        gli schemi filtrati (con le voci valide) e scartati
import-chatgpt  importa un lotto annotato da ChatGPT e rimasto senza importazione, a nome di
        ChatGPT; le righe corrette dal coordinatore entrano a nome di Claude

Riga di bozza (JSONL), con la parola ripetuta per intercettare indici sbagliati:
  {"i":7900,"w":"newsletter","d":"V","p":"NOUN","c":"109","s":"Bollettino informativo...","r":"facoltativo"}
  {"i":7901,"w":"platone","d":"R","k":"proper","n":"nota facoltativa"}
  {"i":7902,"w":"choc","d":"D","k":"sense"}
Ogni decisione è del revisore: nessuna categoria, senso o esito viene dedotto automaticamente.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from prompt_database import ROOT, digest, load_categories

CANDIDATES = ROOT/'prompt-staging/reviews/completion_20261109_editorial/candidates.jsonl'
FOLDER = ROOT/'prompt-staging/reviews/completion_20261109_claude'
REVIEWER = 'Claude Opus 5.5 (Anthropic) — revisione editoriale LLM'
REASONS = {
    'generic': 'Voce troppo generica in questo uso: non identifica un nucleo di associazioni proprio e riconoscibile.',
    'rare': 'Il senso attestato è specialistico o poco familiare e non risulta riconoscibile senza un tema visibile.',
    'form': 'La forma proposta non offre un lemma autonomo o una categoria grammaticale adatta nel senso considerato.',
    'proper': 'È un nome proprio, o una voce che vale soprattutto come nome proprio: non è un nome comune adatto come prompt.',
    'foreign': 'Forestierismo non adattato o poco diffuso in italiano: non è riconoscibile come prompt italiano.',
    'offensive': 'Il significato proposto è un epiteto offensivo o una designazione discriminatoria inadatta al catalogo del gioco.',
    'sensitive': 'Tema sensibile per un gioco in diretta (direttive §9): come prompt inviterebbe risposte esplicite, '
                 'volgari, cruente o discriminatorie.',
    'sense': 'Occorre risolvere il contrasto fra significati quotidiani concorrenti prima di scegliere il senso del prompt.',
    'category': 'Il senso è riconoscibile ma nessuna categoria del catalogo risulta abbastanza coerente.',
    'safety': 'Tema identitario o discriminatorio delicato (direttive §9): l\'idoneità per la chat in diretta va decisa '
              'da una revisione umana.',
}
REJECT = {'generic', 'rare', 'form', 'proper', 'foreign', 'offensive', 'sensitive'}
DEFER = {'sense', 'category', 'safety'}


def candidates() -> list[dict]:
    return [json.loads(line) for line in CANDIDATES.read_text(encoding='utf-8').splitlines() if line.strip()]


def span(start: int, end: int) -> str:
    return f'{start:05d}_{end:05d}'


def sheet(start: int, end: int, output: Path) -> dict:
    from prompt_policy import load_prompt_policy
    loans = set(load_prompt_policy()['common_loanwords'])
    rows = candidates()
    if not 0 <= start < end <= len(rows):
        raise ValueError('Intervallo non valido')
    lines = []
    for i in range(start, end):
        c = rows[i]
        senses = c.get('dictionary_senses') or ([[c['pos'].lower(), c['gloss']]] if c['gloss'].strip() else [])
        text = ' | '.join(f'{chr(65+j)}) {p}: {g[:150]}' for j, (p, g) in enumerate(senses)) or '(nessuna definizione)'
        flags = ','.join(f for f in c['flags'] if f != 'frequenza_da_forma_verbale')
        # PRESTITO: forestierismo presente in common_loanwords (anche se il filtro lo classifica come 'it').
        lang = ' PRESTITO' if c['language'] != 'it' or c['prompt'] in loans else ''
        lines.append(f"{i}\t{c['prompt']}\t{c['pos_all']}\tz{c['zipf']}{lang}\t{flags}\t{text}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    return {'output': str(output), 'rows': len(lines)}


def read_drafts(paths: list[Path]) -> dict[int, dict]:
    rows: dict[int, dict] = {}
    for path in paths:
        for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if not line.strip():
                continue
            row = json.loads(line)
            row['_file'] = f'{path.name}:{n}'
            if row.get('i') in rows:
                raise ValueError(f"Indice duplicato {row.get('i')}: {rows[row['i']]['_file']} e {row['_file']}")
            rows[row.get('i')] = row
    return rows


def check_row(row: dict, cands: list[dict], catalog: dict) -> str | None:
    i = row.get('i')
    if type(i) is not int or not 0 <= i < len(cands):
        return 'indice non valido'
    if row.get('w') != cands[i]['prompt']:
        return f"la parola non corrisponde all'indice (atteso {cands[i]['prompt']!r})"
    d = row.get('d')
    if d == 'V':
        if row.get('p') not in {'NOUN', 'VERB', 'ADJ'}:
            return 'POS mancante'
        if row.get('c') not in catalog:
            return 'categoria assente dal catalogo'
        sense = row.get('s')
        if not isinstance(sense, str) or len(sense.strip()) < 15 or 'definizione mancante' in sense.lower():
            return 'senso mancante o troppo breve (almeno 15 caratteri)'
        if row.get('r') is not None and (not isinstance(row['r'], str) or len(row['r'].strip()) < 25):
            return 'motivazione troppo breve (almeno 25 caratteri) o da omettere'
    elif d == 'R':
        if row.get('k') not in REJECT:
            return 'motivo di scarto sconosciuto'
    elif d == 'D':
        if row.get('k') not in DEFER:
            return 'motivo di rinvio sconosciuto'
    else:
        return 'decisione non valida'
    if row.get('n') is not None and (not isinstance(row['n'], str) or len(row['n'].strip()) < 8):
        return 'nota troppo breve o da omettere'
    return None


def check(paths: list[Path], start: int | None = None, end: int | None = None) -> dict:
    cands = candidates()
    catalog = load_categories()
    rows = read_drafts(paths)
    errors = [f"{r['_file']} [{i}]: {e}" for i, r in rows.items() if (e := check_row(r, cands, catalog))]
    result = {'rows': len(rows), 'errors': errors[:50], 'error_count': len(errors),
              'decisions': dict(Counter(r.get('d') for r in rows.values()))}
    if start is not None and end is not None:
        expected = set(range(start, end))
        result['missing'] = sorted(expected - set(rows))[:50]
        result['outside'] = sorted(set(rows) - expected)[:50]
    return result


def drafts_for(start: int, end: int) -> list[Path]:
    paths = []
    for path in sorted((FOLDER/'drafts').glob('*.jsonl')):
        a, b = (int(x) for x in path.stem.split('_')[:2])
        if a < end and b > start:
            if a < start or b > end:
                raise ValueError(f'Bozza a cavallo dell\'intervallo: {path.name}')
            paths.append(path)
    return paths


def corrections(cands: list[dict], catalog: dict) -> dict[int, dict]:
    """Correzioni del coordinatore (corrections/*.jsonl): sostituiscono la riga di bozza con lo stesso indice,
    per uniformare i criteri fra i revisori. La bozza originale resta su disco."""
    paths = sorted((FOLDER/'corrections').glob('*.jsonl'))
    rows = read_drafts(paths) if paths else {}
    errors = [f"{r['_file']} [{i}]: {e}" for i, r in rows.items() if (e := check_row(r, cands, catalog))]
    if errors:
        raise ValueError('Correzioni non valide:\n'+'\n'.join(errors[:30]))
    return rows


def to_decision(row: dict, c: dict, catalog: dict) -> dict:
    """Dalla riga di bozza alla riga di decisione di review_prompts.import_decisions."""
    decision = {'prompt': c['prompt'], 'decision': {'V': 'verified', 'R': 'rejected', 'D': 'deferred'}[row['d']]}
    if row['d'] == 'V':
        sense = row['s'].strip()
        category = catalog[row['c']]['category_name']
        decision.update(category_id=row['c'], pos=row['p'], sense=sense,
            prompt_rationale=(row.get('r') or '').strip() or
                f'Confermato il significato familiare di «{c["prompt"]}»: {sense.rstrip(".")}. '
                'Il controllo riguarda questo senso, non altri usi della voce.',
            category_rationale=f'Il significato selezionato «{sense.rstrip(".")}» appartiene al dominio «{category}».')
    else:
        note = (row.get('n') or '').strip()
        decision['reason'] = REASONS[row['k']] + (' ' + note if note else '')
    return decision


def record(start: int, end: int) -> dict:
    cands = candidates()
    catalog = load_categories()
    paths = drafts_for(start, end)
    report = check(paths, start, end)
    if report['error_count'] or report['missing'] or report['outside']:
        raise ValueError('Bozze non registrabili: '+json.dumps(report, ensure_ascii=False))
    rows = read_drafts(paths)
    fixes = {i: r for i, r in corrections(cands, catalog).items() if start <= i < end}
    replaced = {i: rows[i] for i in fixes}
    rows.update(fixes)
    paths += sorted({FOLDER/'corrections'/r['_file'].split(':')[0] for r in fixes.values()})
    file_hash = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    out = []
    for i in range(start, end):
        row, c = rows[i], cands[i]
        decision = to_decision(row, c, catalog)
        decision['editorial_review'] = {'reviewer': REVIEWER, 'method': 'llm_editorial_review',
            'candidate_index': i, 'candidate_sha256': digest(c), 'source_pos': c['pos'],
            'source_gloss': c['gloss'], 'draft_file': row['_file'].split(':')[0],
            'draft_sha256': file_hash[row['_file'].split(':')[0]],
            'recorded_at': datetime.now(timezone.utc).isoformat(), 'human_review': False,
            'independent_gameplay_qa': False}
        if i in replaced:
            decision['editorial_review']['replaces_draft'] = {k: v for k, v in replaced[i].items() if k != '_file'} | {
                'file': replaced[i]['_file']}
        out.append(decision)
    path = FOLDER/f'decisions_{span(start, end)}.jsonl'
    path.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in out), encoding='utf-8')
    return {'output': str(path), 'rows': len(out), 'corrected': len(fixes),
            'decisions': dict(Counter(r['decision'] for r in out))}


def import_groups(groups: dict[str, list[dict]], label: str, report: Path) -> dict:
    """Importa le decisioni, un gruppo per revisore, poi rigenera prompt_filtrati e prompt_scartati."""
    from review_prompts import import_decisions, pending
    from filter_prompts import build
    from prompt_database import DEFAULT_DB
    from sqlite_prompt_runtime import SQLite
    every = [r for rows in groups.values() for r in rows]
    still = {c['prompt'] for c in pending(only={r['prompt'] for r in every})}
    backup = ROOT/'database-backups'/('review_state_before_'+label+'_'+
                                      datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')+'.sql')
    SQLite(DEFAULT_DB).dump(backup, ['prompt_validations', 'prompt_validation_heads',
                                     'inventory_term_decisions', 'inventory_decision_history'])
    result = {'source_review_state_backup': str(backup), 'by_reviewer': {},
              'superseded_by_existing_decision': [r['prompt'] for r in every if r['prompt'] not in still]}
    for reviewer, rows in groups.items():
        todo = [{k: v for k, v in r.items() if k != 'editorial_review'} for r in rows if r['prompt'] in still]
        if todo:
            imported = import_decisions(todo, reviewer, 'llm_editorial_review')
            result['by_reviewer'][reviewer] = {'decisions': dict(Counter(r['decision'] for r in todo)), **imported}
    built = build()
    result['filtered_db'] = {k: built[k] for k in ('output', 'kept', 'validated_prompts', 'discarded_prompts')}
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return result


def import_range(start: int, end: int) -> dict:
    path = FOLDER/f'decisions_{span(start, end)}.jsonl'
    rows = [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
    return import_groups({REVIEWER: rows}, 'claude_'+span(start, end), FOLDER/f'import_{span(start, end)}.json')


CHATGPT = ROOT/'prompt-staging/reviews/completion_20261109_editorial'


def import_chatgpt(start: int, end: int) -> dict:
    """Importa un lotto annotato da ChatGPT (script/editorial_prompt_chunks.py) e non ancora importato, a nome di ChatGPT.
    Le righe corrette dal coordinatore (corrections/*.jsonl) entrano invece a nome di Claude."""
    cands = candidates()
    catalog = load_categories()
    rows = [json.loads(line) for line in (CHATGPT/'annotations'/f'{span(start, end)}.jsonl')
            .read_text(encoding='utf-8').splitlines() if line.strip()]
    fixes = {i: r for i, r in corrections(cands, catalog).items() if start <= i < end}
    groups: dict[str, list[dict]] = {f'ChatGPT — revisione editoriale completa, lotto {start}-{end-1}': [], REVIEWER: []}
    seen = set()
    for row in rows:
        i = row['editorial_review']['candidate_index']
        if not start <= i < end or row['prompt'] != cands[i]['prompt'] or i in seen:
            raise ValueError(f'Riga di ChatGPT incoerente con i candidati: {i} {row["prompt"]}')
        seen.add(i)
        if i in fixes:
            groups[REVIEWER].append(to_decision(fixes[i], cands[i], catalog))
        else:
            groups[next(iter(groups))].append(row)
    if seen != set(range(start, end)):
        raise ValueError('Lotto di ChatGPT incompleto')
    result = import_groups(groups, 'chatgpt_'+span(start, end), CHATGPT/f'import_{span(start, end)}.json')
    result['corrected_by_claude'] = {cands[i]['prompt']: fixes[i] for i in fixes}
    return result


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    for name in ('sheet', 'record', 'import', 'import-chatgpt'):
        p = sub.add_parser(name)
        p.add_argument('--start', type=int, required=True)
        p.add_argument('--end', type=int, required=True)
        if name == 'sheet':
            p.add_argument('--output', type=Path)
    c = sub.add_parser('check')
    c.add_argument('files', type=Path, nargs='+')
    c.add_argument('--start', type=int)
    c.add_argument('--end', type=int)
    args = ap.parse_args(argv)
    if args.command == 'sheet':
        result = sheet(args.start, args.end, args.output or FOLDER/'sheets'/f'{span(args.start, args.end)}.tsv')
    elif args.command == 'check':
        result = check(args.files, args.start, args.end)
    elif args.command == 'record':
        result = record(args.start, args.end)
    elif args.command == 'import-chatgpt':
        result = import_chatgpt(args.start, args.end)
    else:
        result = import_range(args.start, args.end)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
