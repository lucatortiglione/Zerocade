"""Associazioni con Qwen locale (llama.cpp), riprendibili in qualunque momento.

drafts  bozze per gli agenti: per ogni prompt della coda finale ancora senza bacino e senza bozza,
        Qwen propone 12-20 associazioni motivate; le bozze restano in qwen/drafts.jsonl e
        non entrano nei database (le rivede e le completa un revisore).
solo    modalità solo Qwen, senza agenti: bozza, poi autoverifica di ogni coppia con i criteri
        del pilota; le coppie ammesse formano lotti in agent_outputs/qwen_solo. I lotti si
        importano nella raccolta soltanto se il pilota delle associazioni su questo modello è
        superato (zero accettazioni e zero rifiuti errati); altrimenti restano da rivedere.
pilot   esegue il pilota delle 32 coppie sul modello configurato e ne registra l'esito.
serve   avvia il server llama.cpp configurato e resta in esecuzione.
status  avanzamento delle bozze e della modalità solo Qwen.

Configurazione: resources/association_draft_model.json. Se il server non risponde, drafts,
solo e pilot lo avviano da sé e lo chiudono alla fine. Ctrl+C interrompe: si riprende dal
prompt successivo all'ultimo salvato.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

from association_llm_pilot import CASES, SYSTEM as REVIEW_SYSTEM
from association_catalog import current
from final_associations import JOB, WORD, rows, drafts_index
from prompt_database import DEFAULT_DB, ROOT, digest, load_categories

CONFIG = ROOT/'resources/association_draft_model.json'
QWEN = JOB/'qwen'
SOLO = JOB/'agent_outputs'/'qwen_solo'

DRAFT_SYSTEM = '''Sei un autore di associazioni di parole per un gioco italiano in diretta.
Il giocatore vede solo il PROMPT e deve indovinare parole nascoste collegate a quel prompt,
nel solo senso indicato. Proponi tutte le associazioni valide che trovi, di norma da 12 a 20:
parti, luoghi, strumenti, azioni, persone, effetti, contesti tipici e contrari naturali.
Ogni parola deve essere: italiana, singola, minuscola, al lemma corretto, diversa dal prompt e
non un suo derivato; nello stesso senso del prompt; autonoma, senza ricostruire una locuzione;
naturale e riconoscibile da una persona comune; specifica di questo prompt.
Escludi: parole di servizio, metadescrittori (forma, caratteristica, funzione, tipo),
date, quantità, esempi incidentali, sinonimi in serie, parole volgari, sessuali o offensive,
stereotipi su gruppi di persone. Una negazione non prova una caratteristica.
Per ogni parola scrivi: il suo senso, la relazione con il prompt e una motivazione concreta
(almeno 20 caratteri) diversa per ogni parola. Usa lo stesso "group" per le parole quasi
equivalenti, altrimenti ripeti la parola stessa come group. Rispondi solo con il JSON richiesto.'''


def now():
    return datetime.now(timezone.utc).isoformat()


def config():
    data = json.loads(CONFIG.read_text(encoding='utf-8'))
    for key in ('model_path', 'server_exe'):
        data[key] = os.path.expandvars(data[key])
    return data


def append(path, record):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as f:
        f.write(json.dumps(record, ensure_ascii=False)+'\n')


# --- server ---

def served(cfg):
    try:
        with urllib.request.urlopen(cfg['endpoint']+'/v1/models', timeout=5) as response:
            return [m['id'] for m in json.load(response)['data']]
    except OSError:
        return None


def verify_model(cfg):
    """SHA-256 dei pesi, calcolato una volta e ricordato finché file, dimensione e data non cambiano."""
    path = Path(cfg['model_path'])
    stat = path.stat()
    marker = QWEN/'model_verified.json'
    key = {'path': str(path), 'size': stat.st_size, 'mtime': stat.st_mtime}
    if marker.exists() and json.loads(marker.read_text(encoding='utf-8')).get('key') == key:
        return
    print('Verifico lo SHA-256 dei pesi (una sola volta, qualche minuto)...', flush=True)
    sha = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 24), b''):
            sha.update(chunk)
    if sha.hexdigest() != cfg['model_sha256']:
        raise SystemExit('Pesi diversi da quelli configurati: nessun avvio con un modello non verificato')
    QWEN.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps({'key': key, 'sha256': sha.hexdigest(), 'checked_at': now()}, indent=2), encoding='utf-8')


def server_command(cfg):
    p = cfg['runtime_parameters']
    port = cfg['endpoint'].rsplit(':', 1)[1]
    return [cfg['server_exe'], '-m', cfg['model_path'], '--alias', cfg['served_model'], '--host', '127.0.0.1',
            '--port', port, '-ngl', str(p['gpu_layers']), '-c', str(p['context']), '-np', str(p['parallel']),
            '-fa', 'on', '--cache-type-k', p['kv_cache'], '--cache-type-v', p['kv_cache'], '--jinja']


def ensure_server(cfg):
    """Restituisce il processo avviato, oppure None se un server compatibile era già attivo."""
    models = served(cfg)
    if models is not None:
        if cfg['served_model'] not in models:
            raise SystemExit(f"Sulla porta risponde un altro modello: {models}")
        return None
    verify_model(cfg)
    print('Avvio il server Qwen locale...', flush=True)
    process = subprocess.Popen(server_command(cfg))
    for _ in range(600):
        if process.poll() is not None:
            raise SystemExit('Il server Qwen si è chiuso durante l\'avvio: controllare memoria della GPU e parametri')
        if served(cfg):
            print('Server pronto.', flush=True)
            return process
        time.sleep(1)
    process.terminate()
    raise SystemExit('Il server Qwen non ha risposto entro 10 minuti')


def chat(cfg, system, user, schema, seed, max_tokens, temperature):
    body = {'model': cfg['served_model'], 'messages': [{'role': 'system', 'content': system},
            {'role': 'user', 'content': json.dumps(user, ensure_ascii=False)}],
            'temperature': temperature, 'max_tokens': max_tokens, 'seed': seed, 'cache_prompt': True,
            'chat_template_kwargs': {'enable_thinking': False},
            'response_format': {'type': 'json_schema', 'json_schema': {'name': 'result', 'strict': True, 'schema': schema}}}
    request = urllib.request.Request(cfg['endpoint']+'/v1/chat/completions', headers={'Content-Type': 'application/json'},
                                     data=json.dumps(body, ensure_ascii=False).encode('utf-8'))
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=3600) as response:
        answer = json.load(response)
    choice = answer['choices'][0]
    if choice['finish_reason'] != 'stop':
        raise ValueError('risposta troncata')
    return json.loads(choice['message']['content']), {'request_sha256': digest(body), 'response': answer,
                                                       'elapsed_seconds': round(time.monotonic()-started, 1)}


# --- bozze ---

def queue_entries():
    return rows(JOB/'prepared_shards'/'qwen_solo.jsonl')


def draft(cfg, entry, categories):
    head = entry['prompt_review']
    schema = {'type': 'object', 'additionalProperties': False, 'required': ['answers'], 'properties': {'answers': {
        'type': 'array', 'minItems': 7, 'maxItems': 22, 'items': {'type': 'object', 'additionalProperties': False,
            'required': ['word', 'answer_sense', 'relation', 'rationale', 'group'], 'properties': {
                'word': {'type': 'string', 'minLength': 2, 'maxLength': 24},
                'answer_sense': {'type': 'string', 'minLength': 3, 'maxLength': 80},
                'relation': {'type': 'string', 'minLength': 3, 'maxLength': 40},
                'rationale': {'type': 'string', 'minLength': 20, 'maxLength': 200},
                'group': {'type': 'string', 'minLength': 2, 'maxLength': 24}}}}}}
    user = {'prompt': entry['prompt'], 'pos': head['pos'], 'senso': head['sense_description'],
            'categoria': categories[head['category_id']]['category_name']}
    result, audit = chat(cfg, DRAFT_SYSTEM, user, schema, seed=20261110+entry['rank'], max_tokens=3000, temperature=0.3)
    answers, dropped, seen = [], [], set()
    for a in result['answers']:
        word = a['word'].strip().lower()
        if not WORD.fullmatch(word) or word == entry['prompt'] or word in seen:
            dropped.append(word)
            continue
        seen.add(word)
        group = a['group'].strip().lower()
        answers.append({'word': word, 'answer_sense': a['answer_sense'].strip(), 'relation': a['relation'].strip(),
                        'rationale': a['rationale'].strip(), 'group': group if WORD.fullmatch(group) else word})
    record = {'schema': 'qwen-association-draft-1', 'prompt': entry['prompt'], 'rank': entry['rank'],
              'validation_id': entry['initial_validation_id'], 'model': cfg['base_model'],
              'quantization': cfg['quantization'], 'model_sha256': cfg['model_sha256'],
              'served_model': cfg['served_model'], 'created_at': now(), 'answers': answers,
              'dropped_by_format': dropped, 'approved': False}
    append(QWEN/'audit.jsonl', {'prompt': entry['prompt'], 'created_at': record['created_at'], **audit})
    append(QWEN/'drafts.jsonl', record)
    return record


def drafts(limit=None):
    cfg = config()
    process = ensure_server(cfg)
    try:
        categories = load_categories()
        _, pools, _ = current(DEFAULT_DB)
        done = drafts_index()
        todo = [e for e in queue_entries() if e['prompt'] not in pools and e['prompt'] not in done][:limit]
        print(f'Bozze da scrivere: {len(todo)}', flush=True)
        for n, entry in enumerate(todo, 1):
            try:
                record = draft(cfg, entry, categories)
                print(f"[{n}/{len(todo)}] {entry['prompt']}: {len(record['answers'])} parole", flush=True)
            except (ValueError, OSError, KeyError) as error:
                append(QWEN/'failures.jsonl', {'prompt': entry['prompt'], 'stage': 'draft', 'error': str(error), 'at': now()})
                print(f"[{n}/{len(todo)}] {entry['prompt']}: errore {error}", flush=True)
    finally:
        if process:
            process.terminate()


# --- pilota e modalità solo Qwen ---

REVIEW_SCHEMA_ITEM = {'type': 'object', 'required': ['i', 'd', 'r'], 'additionalProperties': False, 'properties': {
    'i': {'type': 'integer'}, 'd': {'type': 'string', 'enum': ['A', 'R', 'D']},
    'r': {'type': 'string', 'minLength': 25, 'maxLength': 170}}}


def review_pairs(cfg, pairs, seed):
    schema = {'type': 'object', 'required': ['rows'], 'additionalProperties': False, 'properties': {'rows': {
        'type': 'array', 'minItems': len(pairs), 'maxItems': len(pairs), 'items': REVIEW_SCHEMA_ITEM}}}
    result, audit = chat(cfg, REVIEW_SYSTEM, pairs, schema, seed=seed, max_tokens=len(pairs)*110, temperature=0)
    decided = {r['i']: r for r in result['rows']}
    if sorted(decided) != [p['i'] for p in pairs]:
        raise ValueError('indici della revisione mancanti o duplicati')
    return decided, audit


def pilot_result():
    path = QWEN/'pilot_result.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def pilot():
    cfg = config()
    process = ensure_server(cfg)
    try:
        decisions = []
        for start in range(0, len(CASES), 8):
            cases = CASES[start:start+8]
            pairs = [{'i': start+i, 'prompt': p, 'sense': s, 'word': w, 'proposed_rationale': r}
                     for i, (p, s, w, r, _) in enumerate(cases)]
            decided, audit = review_pairs(cfg, pairs, seed=20261109+start)
            append(QWEN/'pilot_audit.jsonl', audit)
            for pair in pairs:
                expected = CASES[pair['i']][4]
                decisions.append({**pair, 'd': decided[pair['i']]['d'], 'r': decided[pair['i']]['r'], 'expected': expected})
        false_accept = sum(d['d'] == 'A' and d['expected'] == 'R' for d in decisions)
        false_reject = sum(d['d'] != 'A' and d['expected'] == 'A' for d in decisions)
        result = {'model': cfg['base_model'], 'quantization': cfg['quantization'], 'model_sha256': cfg['model_sha256'],
                  'tested': len(decisions), 'false_acceptances': false_accept, 'false_rejections': false_reject,
                  'passed': false_accept == 0 and false_reject == 0, 'run_at': now(), 'decisions': decisions,
                  'note': 'Il pilota abilita o blocca la modalità solo Qwen; non è QA umano né del gioco.'}
        (QWEN/'pilot_result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        print(json.dumps({k: v for k, v in result.items() if k != 'decisions'}, ensure_ascii=False), flush=True)
        return result
    finally:
        if process:
            process.terminate()


def solo_done():
    return {r['prompt'] for f in SOLO.glob('batch_*.jsonl') for r in rows(f)}


def write_solo_batch(results):
    numbers = [int(f.stem.split('_')[1]) for f in SOLO.glob('batch_*.jsonl')]
    path = SOLO/f'batch_{max(numbers, default=0)+1:04d}.jsonl'
    SOLO.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in results), encoding='utf-8')
    return path


def solo(limit=None, batch_size=10):
    cfg = config()
    process = ensure_server(cfg)
    try:
        result = pilot_result()
        if not result or result.get('model_sha256') != cfg['model_sha256']:
            print('Pilota delle associazioni non ancora eseguito su questo modello: lo eseguo ora.', flush=True)
            result = pilot()  # riusa il server già attivo
        importable = bool(result and result['passed'])
        print('Pilota superato: i lotti verranno importati.' if importable else
              'Pilota NON superato: i lotti restano in agent_outputs/qwen_solo da rivedere, senza importazione.', flush=True)
        categories = load_categories()
        drafts_by_prompt = drafts_index()
        done = solo_done()
        _, pools, _ = current(DEFAULT_DB)
        todo = [e for e in queue_entries() if e['prompt'] not in pools and e['prompt'] not in done][:limit]
        print(f'Prompt da completare: {len(todo)}', flush=True)
        pending = []
        for n, entry in enumerate(todo, 1):
            try:
                record = drafts_by_prompt.get(entry['prompt']) or draft(cfg, entry, categories)
                head = entry['prompt_review']
                pairs = [{'i': i, 'prompt': entry['prompt'], 'sense': head['sense_description'], 'word': a['word'],
                          'proposed_rationale': a['rationale']} for i, a in enumerate(record['answers'])]
                decided, audit = review_pairs(cfg, pairs, seed=30261110+entry['rank'])
                append(QWEN/'solo_audit.jsonl', {'prompt': entry['prompt'], **audit})
                kept = [dict(a, review=decided[i]['r']) for i, a in enumerate(record['answers']) if decided[i]['d'] == 'A']
                print(f"[{n}/{len(todo)}] {entry['prompt']}: {len(kept)}/{len(record['answers'])} ammesse", flush=True)
                if len(kept) < 7:
                    append(QWEN/'solo_insufficient.jsonl', {'prompt': entry['prompt'], 'kept': len(kept), 'at': now()})
                    continue
                pending.append(solo_result(cfg, entry, record, kept, categories))
            except (ValueError, OSError, KeyError) as error:
                append(QWEN/'failures.jsonl', {'prompt': entry['prompt'], 'stage': 'solo', 'error': str(error), 'at': now()})
                print(f"[{n}/{len(todo)}] {entry['prompt']}: errore {error}", flush=True)
            if len(pending) >= batch_size:
                flush_solo(pending, importable)
                pending = []
        if pending:
            flush_solo(pending, importable)
        if importable and _imported['since_publish']:
            from ingest_agent_associations import publish
            publish()
    finally:
        if process:
            process.terminate()


def solo_result(cfg, entry, record, kept, categories):
    head = entry['prompt_review']
    words = [a['word'] for a in kept]
    category = categories[head['category_id']]['category_name']
    return {'schema': 'association-editorial-result-1', 'prompt': entry['prompt'], 'decision': 'accepted',
            'input_validation_id': entry['initial_validation_id'], 'reviewer': cfg['reviewer'],
            'method': 'llm_editorial_review', 'reviewed_at': datetime.now(timezone.utc).date().isoformat(),
            'human_review': False, 'independent_gameplay_qa': False, 'pos': head['pos'],
            'sense_description': head['sense_description'], 'category_id': head['category_id'],
            'prompt_language': head['prompt_language'], 'prompt_rationale': head['review']['prompt_rationale'],
            'category_rationale': head['review']['category_rationale'],
            'association_review_rationale': (f"Bozza Qwen di {len(record['answers'])} parole nel senso «{head['sense_description']}» "
                                             f"({category}); autoverifica Qwen per coppia: ammesse {len(words)}."),
            'answers': [{'word': a['word'], 'answer_sense': a['answer_sense'], 'relation': a['relation'],
                         'meaning_group': a['group'], 'rationale': a['rationale'], 'decision': 'accepted',
                         'difficulty': 'unrated',
                         'difficulty_basis': 'Difficoltà non calibrata; nessun test con giocatori dichiarato.'} for a in kept],
            'group_limits': {a['group']: 1 for a in kept}, 'conflicts': [],
            'draft_source': {'path': 'qwen/drafts.jsonl', 'record_sha256': digest(record), 'model': record['model'],
                             'proposed': len(record['answers']), 'kept': len(words), 'added': 0}}


_imported = {'backup': False, 'since_publish': 0}


def flush_solo(results, importable):
    path = write_solo_batch(results)
    print(f'Lotto scritto: {path.name} ({len(results)} prompt)', flush=True)
    if importable:
        from ingest_agent_associations import ingest, publish
        # Un solo backup delle tabelle dei bacini per esecuzione; copia valida e DB del gioco ogni 10 lotti.
        result = ingest(path, publish=False, backup=not _imported['backup'])
        _imported['backup'] = _imported['backup'] or bool(result.get('backup'))
        _imported['since_publish'] += 1
        print(json.dumps({'import': result}, ensure_ascii=False)[:400], flush=True)
        if _imported['since_publish'] >= 10:
            publish()
            _imported['since_publish'] = 0


def status():
    _, pools, _ = current(DEFAULT_DB)
    queue = queue_entries()
    pilot_data = pilot_result()
    return {'queue': len(queue), 'with_pool': sum(e['prompt'] in pools for e in queue),
            'qwen_drafts': len(drafts_index()), 'solo_prompts_written': len(solo_done()),
            'failures': len(rows(QWEN/'failures.jsonl')),
            'pilot': pilot_data and {k: pilot_data[k] for k in ('quantization', 'false_acceptances', 'false_rejections', 'passed')}}


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    for name in ('drafts', 'solo'):
        p = sub.add_parser(name)
        p.add_argument('--limit', type=int)
    sub.add_parser('pilot')
    sub.add_parser('serve')
    sub.add_parser('status')
    args = ap.parse_args(argv)
    if args.command == 'drafts':
        drafts(args.limit)
    elif args.command == 'solo':
        solo(args.limit)
    elif args.command == 'pilot':
        pilot()
    elif args.command == 'serve':
        cfg = config()
        verify_model(cfg)
        subprocess.run(server_command(cfg), check=False)
    else:
        print(json.dumps(status(), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
