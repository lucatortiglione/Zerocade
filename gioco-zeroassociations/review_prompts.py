"""Validazione dei prompt filtrati: dallo schema filtrati allo schema validi del DB di lavoro.

Un prompt filtrato è solo un candidato. Diventa valido con un verbale verified-prompt-1
(validated_prompt_database.py): senso familiare, categoria del catalogo, lingua, cinque
verifiche e tre motivazioni, con il nome di chi ha revisionato. Questo script:

pending           elenca i candidati non ancora validati né scartati, nell'ordine di revisione
                  (vocabolario di base, età di acquisizione, frequenza);
import-decisions  trasforma le decisioni di un revisore (JSONL: una riga per prompt) in verbali:
                  senso, categoria e due motivazioni sono del revisore; frequenza, NVdB, età di
                  acquisizione e provenienza vengono dai dati. I prompt validi entrano nella
                  raccolta (prompt_validations), quelli scartati o rimandati diventano decisioni
                  sulla voce (DISCARDED/DEFERRED); poi si rigenera lo schema validi;
llm-review        fa decidere l'LLM locale (resources/local_llm_policy.json) e importa;
refresh           dopo nuove parole dalle fonti: rifà lo schema filtrati, fa rivedere all'LLM
                  locale le sole parole nuove (se il server è attivo), aggiorna lo schema validi.

Riga di decisione:
  {"prompt": "gatto", "decision": "verified", "pos": "NOUN", "sense": "Piccolo felino domestico",
   "category_id": "046", "prompt_rationale": "...", "category_rationale": "..."}
  {"prompt": "cosa", "decision": "rejected", "reason": "Troppo generica: nessuna associazione propria."}
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import unified_db
import sys
import urllib.request

from prompt_database import (DEFAULT_DB, ROOT, digest, directives_hash, load_categories, required_text)
from semantic_rules import SEMANTIC_POLICY
from sqlite_prompt_runtime import SQLite
from validated_prompt_database import PROMPT_CHECKS, VALIDATED_DB, register_reviews, sync_validated, validate_record

FILTERED_DB = unified_db.address('filtrati')
LLM_POLICY = ROOT/'resources/local_llm_policy.json'
DEFAULT_ENDPOINT = 'http://127.0.0.1:19472'
DECISIONS = {'verified', 'rejected', 'deferred'}
EVIDENCE_SOURCES = ('kaikki-itwiktionary', 'wordfreq-it-local', 'nvdb-de-mauro-2016', 'itaoa-montefinese-2019')


def today():
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def read_only(path: Path) -> sqlite3.Connection:
    db = unified_db.connect(f'file:{Path(path).resolve().as_posix()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def done_prompts(raw: Path) -> set[str]:
    """Già validati (prompt_validation_heads) o già scartati/rimandati nella raccolta."""
    db = read_only(raw)
    try:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
        done = set()
        if 'prompt_validation_heads' in tables:
            done |= {r[0] for r in db.execute('SELECT prompt FROM prompt_validation_heads')}
        if 'inventory_term_decisions' in tables:
            done |= {r[0] for r in db.execute(
                "SELECT prompt FROM inventory_term_decisions WHERE decision IN ('DISCARDED','DEFERRED')")}
        return done
    finally:
        db.close()


def pending(raw: Path = DEFAULT_DB, filtered: Path = FILTERED_DB, limit: int | None = None,
            only: set[str] | None = None) -> list[dict]:
    done = done_prompts(raw)
    db = read_only(filtered)
    try:
        out = []
        for row in db.execute('SELECT * FROM review_order'):
            if row['prompt'] in done or (only is not None and row['prompt'] not in only): continue
            full = db.execute('SELECT * FROM filtered_prompts WHERE prompt = ?', (row['prompt'],)).fetchone()
            out.append({k: full[k] for k in full.keys() if k != 'status'} | {'flags': json.loads(full['flags'])})
            if limit and len(out) >= limit: break
        return out
    finally:
        db.close()


def evidence_for(raw: Path, prompt: str, candidate: dict) -> list[dict]:
    """La provenienza del verbale: le fonti della raccolta che attestano la voce, con l'hash dell'istantanea."""
    db = read_only(raw)
    try:
        items = []
        for snapshot, key, sha, config in db.execute(
                'SELECT id, source_key, sha256, source_config_json FROM inventory_snapshots WHERE source_key IN (%s)'
                % ','.join('?'*len(EVIDENCE_SOURCES)), EVIDENCE_SOURCES):
            if key == 'nvdb-de-mauro-2016' and not candidate.get('nvdb'): continue
            if key == 'itaoa-montefinese-2019' and candidate.get('aoa') is None: continue
            if key == 'kaikki-itwiktionary' and not db.execute(
                    'SELECT 1 FROM inventory_attestations WHERE prompt = ? AND snapshot_id = ? LIMIT 1', (prompt, snapshot)).fetchone():
                continue
            source = json.loads(config)
            note = {'kaikki-itwiktionary': 'Voce del Wikizionario: categorie e definizioni consultate per il senso.',
                    'wordfreq-it-local': f"Frequenza Zipf {candidate['zipf']} (wordfreq).",
                    'nvdb-de-mauro-2016': 'Presente nel Nuovo vocabolario di base della lingua italiana.',
                    'itaoa-montefinese-2019': f"Età media di acquisizione {candidate.get('aoa')} anni."}[key]
            items.append({'source_id': key, 'source_url': source.get('url') or source.get('local_path', ''),
                          'url': (f'https://it.wiktionary.org/wiki/{prompt}' if key == 'kaikki-itwiktionary'
                                  else source.get('url') or source.get('local_path', '')),
                          'license': source.get('license', ''), 'attribution': source.get('attribution', ''),
                          'scope': 'prompt_familiarity_and_sense', 'note': note, 'snapshot_sha256': sha})
        return items
    finally:
        db.close()


def familiarity_rationale(c: dict) -> str:
    parts = [f"frequenza Zipf {c['zipf']}"]
    if c.get('nvdb'): parts.append('nel Nuovo vocabolario di base di De Mauro')
    if c.get('aoa') is not None: parts.append(f"imparata in media a {c['aoa']} anni (ItAoA)")
    return 'Parola familiare: ' + ', '.join(parts) + '.'


def build_record(decision: dict, candidate: dict, evidence: list[dict], reviewer: str, method: str) -> dict:
    record = {
        'schema': 'verified-prompt-1', 'prompt': candidate['prompt'], 'pos': decision['pos'],
        'sense_description': decision['sense'].strip(), 'category_id': decision['category_id'],
        'prompt_language': candidate['language'],
        'review': {
            'decision': 'verified', 'reviewer': reviewer, 'method': method, 'reviewed_at': today(),
            'human_review': method == 'human_editorial_review', 'independent_gameplay_qa': False,
            'directives_sha256': directives_hash(), 'policy_version': SEMANTIC_POLICY,
            'checks': {check: True for check in PROMPT_CHECKS},
            'prompt_rationale': decision['prompt_rationale'].strip(),
            'category_rationale': decision['category_rationale'].strip(),
            'familiarity_rationale': familiarity_rationale(candidate),
        },
        'evidence': evidence,
        'automatic_filter': {k: candidate.get(k) for k in ('zipf', 'nvdb', 'aoa', 'flags', 'pos_all')},
    }
    record['content_sha256'] = digest(record)
    return record


def import_decisions(rows: list[dict], reviewer: str, method: str = 'llm_editorial_review',
                     raw: Path = DEFAULT_DB, filtered: Path = FILTERED_DB, destination: Path = VALIDATED_DB) -> dict:
    """Verbali per i validi, decisioni per gli scartati; poi lo schema validi. Tutto o niente."""
    if method not in {'llm_editorial_review', 'human_editorial_review'}: raise ValueError('Metodo di revisione non valido')
    if not required_text(reviewer): raise ValueError('Indicare chi ha revisionato')
    candidates = {c['prompt']: c for c in pending(raw, filtered, only={r.get('prompt') for r in rows})}
    categories = load_categories()
    records, decisions, errors = [], [], []
    for row in rows:
        prompt = row.get('prompt')
        try:
            if prompt not in candidates: raise ValueError('non è tra i candidati da rivedere')
            if row.get('decision') not in DECISIONS: raise ValueError('decisione non valida')
            if row['decision'] == 'verified':
                if row.get('pos') not in {'NOUN', 'VERB', 'ADJ'}: raise ValueError('pos mancante')
                if not required_text(row.get('sense'), 15): raise ValueError('senso mancante (almeno 15 caratteri)')
                if row.get('category_id') not in categories: raise ValueError('categoria assente dal catalogo')
                for field in ('prompt_rationale', 'category_rationale'):
                    if not required_text(row.get(field), 25): raise ValueError(field+' mancante (almeno 25 caratteri)')
                record = build_record(row, candidates[prompt], evidence_for(raw, prompt, candidates[prompt]), reviewer, method)
                validate_record(record)
                records.append(record)
            else:
                if not required_text(row.get('reason'), 10): raise ValueError('motivo mancante')
                decisions.append((prompt, 'DISCARDED' if row['decision'] == 'rejected' else 'DEFERRED', row['reason'].strip()))
        except ValueError as error:
            errors.append(f'{prompt}: {error}')
    if errors: raise ValueError('Decisioni non importate:\n' + '\n'.join(errors[:30]))
    db = SQLite(raw)
    result = register_reviews(db, records) if records else {'review_records_processed': 0, 'new_reviews': 0}
    if decisions:
        from inventory_updates import decide_term
        for prompt, decision, reason in decisions:
            decide_term(db, prompt, decision, reason, actor=reviewer)
    from discarded_prompt_database import sync_discarded
    discarded = sync_discarded(raw,filtered,unified_db.sibling(filtered,'scartati'))
    synced = sync_validated(db, destination)
    keep_game_db_current(raw)
    return {**result, 'verified': len(records), 'rejected_or_deferred': len(decisions),
            'valid_prompts': synced['valid_prompts'], 'verified_pools': synced['verified_pools'],
            'destination': synced['destination'],'discarded_db':discarded['output'],
            'discarded_prompts':discarded['discarded_prompts']}


def keep_game_db_current(raw: Path):
    """I bacini verificati (schema game) seguono la raccolta vera: si aggiornano dopo ogni modifica."""
    if unified_db.same_db(raw, DEFAULT_DB):
        from prompt_database import export_game_db
        export_game_db(SQLite(raw))


def read_decisions(path: Path) -> list[dict]:
    rows = [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]
    if len({r.get('prompt') for r in rows}) != len(rows): raise ValueError('Prompt ripetuto nelle decisioni')
    return rows


# --- LLM locale ---

def llm_reviewer_name() -> str:
    policy = json.loads(LLM_POLICY.read_text(encoding='utf-8'))
    return f"{policy['selected_base_model']} ({policy.get('model_file', 'locale')})"


def llm_available(endpoint: str) -> bool:
    try:
        with urllib.request.urlopen(endpoint.rstrip('/')+'/v1/models', timeout=3): return True
    except OSError:
        return False


def llm_decide(candidate: dict, endpoint: str, model: str | None = None) -> dict:
    categories = load_categories()
    catalog = '\n'.join(f"{c['category_id']}: {c['category_name']} ({c['cluster_name']})" for c in categories.values())
    system = ('Sei un revisore editoriale di un gioco italiano in diretta: il prompt è una parola mostrata alla chat, '
              'che deve indovinare 7 o 8 parole collegate. Un buon prompt è una parola familiare a un adulto italiano, '
              'con un senso dominante riconoscibile senza aiuti, abbastanza concreta da evocare molte associazioni '
              "comuni. Scarta parole generiche, grammaticali, tecniche, rare, volgari o con un senso ambiguo. "
              'Scegli il senso più familiare e la categoria più adatta del catalogo.\n\nCatalogo:\n' + catalog)
    user = {'prompt': candidate['prompt'], 'categorie_grammaticali': candidate['pos_all'],
            'definizione_wikizionario': candidate['gloss'], 'frequenza_zipf': candidate['zipf'],
            'vocabolario_di_base': bool(candidate.get('nvdb')), 'eta_di_acquisizione': candidate.get('aoa'),
            'segnalazioni': candidate['flags']}
    schema = {'type': 'object', 'additionalProperties': False,
              'required': ['decision', 'pos', 'sense', 'category_id', 'prompt_rationale', 'category_rationale', 'reason'],
              'properties': {'decision': {'type': 'string', 'enum': sorted(DECISIONS)},
                             'pos': {'type': 'string', 'enum': ['NOUN', 'VERB', 'ADJ']},
                             'sense': {'type': 'string', 'minLength': 15, 'maxLength': 160},
                             'category_id': {'type': 'string', 'enum': sorted(categories)},
                             'prompt_rationale': {'type': 'string', 'minLength': 25, 'maxLength': 300},
                             'category_rationale': {'type': 'string', 'minLength': 25, 'maxLength': 300},
                             'reason': {'type': 'string', 'maxLength': 300}}}
    body = {'messages': [{'role': 'system', 'content': system},
                         {'role': 'user', 'content': json.dumps(user, ensure_ascii=False)}],
            'temperature': 0.2, 'max_tokens': 700, 'cache_prompt': True,
            'response_format': {'type': 'json_schema', 'json_schema': {'name': 'prompt_review', 'strict': True, 'schema': schema}}}
    if model: body['model'] = model
    request = urllib.request.Request(endpoint.rstrip('/')+'/v1/chat/completions', headers={'Content-Type': 'application/json'},
                                     data=json.dumps(body, ensure_ascii=False).encode('utf-8'))
    with urllib.request.urlopen(request, timeout=300) as response:
        answer = json.loads(json.load(response)['choices'][0]['message']['content'])
    return {'prompt': candidate['prompt'], **answer}


def llm_review(limit: int | None, endpoint: str = DEFAULT_ENDPOINT, model: str | None = None,
               only: set[str] | None = None, raw: Path = DEFAULT_DB, filtered: Path = FILTERED_DB,
               destination: Path = VALIDATED_DB, decide=llm_decide) -> dict:
    todo = pending(raw, filtered, limit, only)
    rows, failed = [], []
    for candidate in todo:
        try: rows.append(decide(candidate, endpoint, model))
        except (OSError, ValueError, KeyError) as error: failed.append({'prompt': candidate['prompt'], 'error': str(error)})
    # Le decisioni restano anche su file, per rileggerle o correggerle.
    log = ROOT/'prompt-staging'/'reviews'/f"llm_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.jsonl"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows), encoding='utf-8')
    good = []
    for row in rows:
        try:
            import_decisions([row], llm_reviewer_name(), raw=raw, filtered=filtered, destination=destination)
            good.append(row['prompt'])
        except ValueError as error:
            failed.append({'prompt': row['prompt'], 'error': str(error)})
    return {'reviewed': len(good), 'failed': failed, 'decisions_file': str(log)}


def refresh(endpoint: str = DEFAULT_ENDPOINT, limit: int = 500, raw: Path = DEFAULT_DB,
            filtered: Path = FILTERED_DB, destination: Path = VALIDATED_DB) -> dict:
    """Dopo nuove parole dalle fonti: filtri, revisione LLM delle sole parole nuove, prompt_validi."""
    from filter_prompts import build
    before = set()
    if unified_db.exists(Path(filtered)):
        db = read_only(filtered)
        try: before = {r[0] for r in db.execute('SELECT prompt FROM filtered_prompts')}
        finally: db.close()
    built = build(raw, filtered)
    db = read_only(filtered)
    try: new = {r[0] for r in db.execute('SELECT prompt FROM filtered_prompts')} - before
    finally: db.close()
    result = {'filtered': built['kept'], 'new_candidates': len(new)}
    if new and llm_available(endpoint):
        result['llm_review'] = llm_review(limit, endpoint, only=new, raw=raw, filtered=filtered, destination=destination)
    elif new:
        result['llm_review'] = 'LLM locale non attivo: le parole nuove restano in attesa (review_prompts.py pending)'
    if unified_db.exists(Path(raw)):
        result['valid_prompts'] = sync_validated(SQLite(raw), destination)['valid_prompts']
        keep_game_db_current(raw)
    return result


def after_new_words(raw: Path) -> dict | None:
    """Chiamata da prompt_inventory.py e inventory_updates.py quando la raccolta riceve parole nuove.
    Solo per la raccolta vera: una raccolta di prova non tocca gli schemi filtrati e validi."""
    if not unified_db.same_db(raw, DEFAULT_DB): return None
    try:
        return refresh(raw=raw)
    except Exception as error:  # L'importazione è già conclusa: il problema si segnala, non la annulla.
        return {'refresh_error': f'{type(error).__name__}: {error}',
                'hint': 'rilanciare a mano: python -B review_prompts.py refresh'}


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('pending'); p.add_argument('--limit', type=int, default=50)
    p.add_argument('--output', type=Path, help='JSONL dei candidati, per un revisore')
    i = sub.add_parser('import-decisions'); i.add_argument('file', type=Path)
    i.add_argument('--reviewer', required=True); i.add_argument('--method', default='llm_editorial_review',
                                                               choices=['llm_editorial_review', 'human_editorial_review'])
    l = sub.add_parser('llm-review'); l.add_argument('--limit', type=int, default=100)
    l.add_argument('--endpoint', default=DEFAULT_ENDPOINT); l.add_argument('--model')
    r = sub.add_parser('refresh'); r.add_argument('--endpoint', default=DEFAULT_ENDPOINT); r.add_argument('--limit', type=int, default=500)
    args = ap.parse_args(argv)
    if args.command == 'pending':
        rows = pending(limit=args.limit)
        if args.output:
            args.output.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows), encoding='utf-8')
            print(json.dumps({'pending': len(rows), 'output': str(args.output)}, ensure_ascii=False))
        else:
            for r in rows: print(f"{r['prompt']:16} {r['pos']:4} zipf {r['zipf']:<5} nvdb {r['nvdb']} aoa {r['aoa']}  {r['gloss'][:70]}")
    elif args.command == 'import-decisions':
        print(json.dumps(import_decisions(read_decisions(args.file), args.reviewer, args.method), ensure_ascii=False, indent=2))
    elif args.command == 'llm-review':
        if not llm_available(args.endpoint): raise SystemExit(f'LLM locale non raggiungibile: {args.endpoint}')
        print(json.dumps(llm_review(args.limit, args.endpoint, args.model), ensure_ascii=False, indent=2))
    else:
        print(json.dumps(refresh(args.endpoint, args.limit), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
