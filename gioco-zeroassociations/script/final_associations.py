"""Lavorazione finale delle associazioni e schema finale del DB di lavoro.

prepare    congela la coda dei prompt validati ancora senza bacino e la divide in partizioni
           (sei per gli agenti, una unica per la modalità «solo Qwen»); non scrive nei DB.
           Con --rifai-validi congela invece tutti i prompt che hanno già un bacino, per rifarlo:
           ogni voce conserva l'impronta del bacino attuale, che l'importazione sostituisce solo
           se nel frattempo nessuno l'ha cambiato
serialize  trascrive il foglio editoriale di un revisore (authored_NNNN.txt) nel lotto JSONL
           importabile; non decide nulla: controlla forma, unicità e appartenenza alla partizione
status     avanzamento: bozze Qwen, lotti scritti, bacini importati
import     importa i lotti rivisti non ancora importati (un backup, una pubblicazione finale)
sheet      scheda dei prossimi prompt di una partizione, con l'eventuale bozza Qwen
build      rigenera lo schema finale dai bacini verificati dello schema validi:
           tabelle prompts, words, prompt_words (molti a molti: una parola serve più prompt)

Foglio editoriale (blocchi separati da una riga vuota):
  prompt|categoria|POS|senso|motivazione prompt|motivazione categoria|revisione del bacino[|lingua]
  parola|senso della parola|relazione|motivazione concreta della coppia[|gruppo]
Un blocco «prompt|RINVIO|motivo» rimanda il prompt senza bacino.

Cartella di lavoro: finale_20261110, oppure quella indicata da ZEROCADE_ASSOCIATIONS_JOB
(relativa a gioco-zeroassociations); vale per tutti i comandi e per script/qwen_associations.py.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import unified_db

from association_catalog import current, rule_hashes, read_only
from prompt_database import DEFAULT_DB, ROOT, digest, load_categories

DEFAULT_JOB = ROOT/'prompt-staging/associations/finale_20261110'
JOB = ROOT/os.environ['ZEROCADE_ASSOCIATIONS_JOB'] if os.environ.get('ZEROCADE_ASSOCIATIONS_JOB') else DEFAULT_JOB
POOL_FIELDS = ('word', 'answer_sense', 'relation', 'meaning_group')
FILTERED_DB = unified_db.address('filtrati')
VALID_DB = unified_db.address('validi')
FINAL_DB = unified_db.address('finale')
AGENT_REVIEWER = 'Claude Opus 5.5 (Anthropic) — agente associations_{:02d}'
WORD = re.compile(r'[a-zàèéìòóù]+')


def now():
    return datetime.now(timezone.utc).isoformat()


def rows(path):
    path = Path(path)
    return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()] if path.exists() else []


def write_jsonl(path, items):
    Path(path).write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in items), encoding='utf-8')


def qwen_reviewer():
    config = json.loads((ROOT/'resources/association_draft_model.json').read_text(encoding='utf-8'))
    return config['reviewer']


def prepare(job=JOB, raw=DEFAULT_DB, filtered=FILTERED_DB, shards=6, redo=False):
    job = Path(job)
    if (job/'prepared_shards'/'manifest.json').exists():
        raise ValueError('Coda già congelata: per nuovi prompt preparare una nuova cartella di lavoro')
    heads, pools, _ = current(raw)
    db = read_only(filtered)
    try:
        order = [r['prompt'] for r in db.execute('SELECT prompt FROM review_order')]
        automatic = {r['prompt']: dict(r) for r in db.execute('SELECT * FROM filtered_prompts')}
    finally:
        db.close()
    # Senza redo: i prompt validati ancora senza bacino. Con redo: quelli che lo hanno già.
    waiting = {p for p in heads if (p in pools) == redo}
    queue = [p for p in order if p in waiting] + sorted(waiting - set(order))
    entries = []
    for rank, word in enumerate(queue):
        head = heads[word]
        auto = automatic.get(word) or {'prompt': word, 'language': head['prompt_language'], 'pos': head['pos'],
                                       **head.get('automatic_filter', {})}
        entry = {'rank': rank, 'shard': f'shard_{rank % shards + 1:02d}', 'prompt': word,
                 'automatic': auto, 'initial_validation_id': head['content_sha256'],
                 'state': 'WAITING_ASSOCIATIONS', 'prompt_review': head}
        if redo:
            # L'impronta del bacino attuale: l'importazione lo sostituisce solo se è ancora questo.
            entry['initial_pool_id'] = pools[word]['content_sha256']
            entry['current_pool'] = [{k: a.get(k) for k in POOL_FIELDS} for a in pools[word]['answers']]
        entries.append(entry)
    folder = job/'prepared_shards'
    folder.mkdir(parents=True, exist_ok=True)
    reviewers = {f'shard_{k:02d}': AGENT_REVIEWER.format(k) for k in range(1, shards+1)}
    reviewers['qwen_solo'] = qwen_reviewer()
    specs = []
    for name in reviewers:
        part = entries if name == 'qwen_solo' else [e for e in entries if e['shard'] == name]
        path = folder/f'{name}.jsonl'
        write_jsonl(path, part)
        (job/'agent_outputs'/name).mkdir(parents=True, exist_ok=True)
        specs.append({'path': str(path.relative_to(ROOT)), 'entries': len(part),
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    keys = ('rank', 'shard', 'prompt', 'initial_validation_id') + (('initial_pool_id',) if redo else ())
    write_jsonl(job/'queue.jsonl', [{k: e[k] for k in keys} for e in entries])
    manifest = {'schema': 'association-final-job-1', 'created_at': now(), 'raw': str(Path(raw).resolve()),
                'purpose': 'Bacini completi per tutti i prompt validati senza associazioni; importazione centrale',
                'rules_sha256': rule_hashes(), 'shards': specs, 'reviewers': reviewers, 'pending': len(entries),
                'target_answers': '12-20 associazioni valide per prompt, senza riempitivi',
                'authorization': 'Utente, 10 novembre 2026: sei agenti in parallelo che rivedono le bozze Qwen; '
                                 'task separato per la sola modalità Qwen',
                'qwen_policy': 'Le bozze Qwen non sono approvazioni; la modalità solo Qwen importa soltanto '
                               'se il pilota delle associazioni sul modello configurato è superato'}
    if redo:
        manifest.update({
            'purpose': 'Rifare i bacini di tutti i prompt validati che ne hanno già uno; importazione centrale',
            'replaces_existing_pools': True,
            'authorization': 'Utente, 14 novembre 2026: rifare le associazioni di tutti i prompt validi (task 5a). '
                             'Un bacino si sostituisce solo se è ancora quello congelato (initial_pool_id)'})
    (folder/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (job/'qwen').mkdir(exist_ok=True)
    instructions = DEFAULT_JOB/'ISTRUZIONI_AGENTI.md'
    if redo and instructions.is_file() and not (job/instructions.name).exists():
        text = instructions.read_text(encoding='utf-8').replace(DEFAULT_JOB.name, job.name)
        text += ('\n## Rifacimento dei bacini\n\nOgni prompt di questa coda ha già un bacino, che la scheda mostra come '
                 '«bacino attuale». È un riferimento, non un vincolo: rifai il bacino completo con le regole sopra. '
                 'Il senso resta quello della scheda: l\'importazione rifiuta un cambio di senso. Il nuovo bacino '
                 'sostituisce il precedente solo se nel frattempo nessuno l\'ha cambiato.\n')
        (job/instructions.name).write_text(text, encoding='utf-8')
    return {'queue': len(entries), 'job': str(job), 'redo': redo, 'shards': {s['path']: s['entries'] for s in specs}}


def drafts_index(job=JOB):
    index = {}
    for record in rows(Path(job)/'qwen'/'drafts.jsonl'):
        index[record['prompt']] = record
    return index


def parse_sheet(text):
    blocks = []
    for block in text.strip().split('\n\n'):
        lines = [x.strip() for x in block.strip().splitlines() if x.strip() and not x.lstrip().startswith('#')]
        if lines:
            blocks.append(lines)
    return blocks


def serialize(shard, number, job=JOB):
    job = Path(job)
    manifest = json.loads((job/'prepared_shards'/'manifest.json').read_text(encoding='utf-8'))
    reviewer = manifest['reviewers'][shard]
    source = {e['prompt']: e for e in rows(job/'prepared_shards'/f'{shard}.jsonl')}
    here = job/'agent_outputs'/shard
    authored, target = here/f'authored_{number:04d}.txt', here/f'batch_{number:04d}.jsonl'
    if target.exists():
        raise ValueError('Lotto già serializzato e immutabile: usare un file corrections_NNNN.jsonl')
    done = {r['prompt'] for f in here.glob('batch_*.jsonl') for r in rows(f)}
    categories = load_categories()
    drafts = drafts_index(job)
    results, errors = [], []
    for lines in parse_sheet(authored.read_text(encoding='utf-8')):
        head = lines[0].split('|')
        prompt = head[0].strip()
        try:
            if prompt not in source:
                raise ValueError('prompt fuori dalla partizione')
            if prompt in done or prompt in {r['prompt'] for r in results}:
                raise ValueError('prompt già presente in un altro lotto')
            entry = source[prompt]
            base = {'schema': 'association-editorial-result-1', 'prompt': prompt,
                    'input_validation_id': entry['initial_validation_id'], 'reviewer': reviewer,
                    'method': 'llm_editorial_review', 'reviewed_at': datetime.now(timezone.utc).date().isoformat(),
                    'human_review': False, 'independent_gameplay_qa': False}
            if len(head) == 3 and head[1].strip().lower() == 'rinvio':
                if len(head[2].strip()) < 25:
                    raise ValueError('motivo del rinvio troppo breve')
                results.append({**base, 'decision': 'deferred', 'reason': head[2].strip()})
                continue
            if len(head) < 7:
                raise ValueError('intestazione incompleta')
            _, cat, pos, sense, pr, cr, ar = [x.strip() for x in head[:7]]
            language = head[7].strip() if len(head) > 7 else entry['prompt_review']['prompt_language']
            if cat not in categories or pos not in {'NOUN', 'VERB', 'ADJ'} or len(sense) < 15:
                raise ValueError('categoria, POS o senso non validi')
            if any(len(t) < 25 for t in (pr, cr, ar)):
                raise ValueError('motivazioni del prompt troppo brevi (minimo 25 caratteri)')
            answers = []
            for line in lines[1:]:
                fields = [x.strip() for x in line.split('|')]
                if len(fields) < 4:
                    raise ValueError(f'riga incompleta: {line}')
                word, answer_sense, relation, reason = fields[:4]
                group = fields[4] if len(fields) > 4 and fields[4] else word
                if not WORD.fullmatch(word) or word == prompt:
                    raise ValueError(f'parola non valida: {word}')
                if len(reason) < 20 or len(answer_sense) < 3 or len(relation) < 3:
                    raise ValueError(f'motivazione o senso troppo brevi: {word}')
                answers.append({'word': word, 'answer_sense': answer_sense, 'relation': relation,
                                'meaning_group': group, 'rationale': reason, 'decision': 'accepted',
                                'difficulty': 'unrated',
                                'difficulty_basis': 'Difficoltà non calibrata; nessun test con giocatori dichiarato.'})
            words = [a['word'] for a in answers]
            if not answers or len(set(words)) != len(words):
                raise ValueError('bacino vuoto o parole ripetute')
            row = {**base, 'decision': 'accepted', 'pos': pos, 'sense_description': sense, 'category_id': cat,
                   'prompt_language': language, 'prompt_rationale': pr, 'category_rationale': cr,
                   'association_review_rationale': ar, 'answers': answers,
                   'group_limits': {a['meaning_group']: 1 for a in answers}, 'conflicts': []}
            draft = drafts.get(prompt)
            if draft:
                proposed = {a['word'] for a in draft['answers']}
                row['draft_source'] = {'path': 'qwen/drafts.jsonl', 'record_sha256': digest(draft),
                                       'model': draft['model'], 'proposed': len(proposed),
                                       'kept': len(proposed & set(words)), 'added': len(set(words) - proposed)}
            results.append(row)
        except ValueError as error:
            errors.append(f'{prompt}: {error}')
    if errors:
        raise ValueError('Foglio non serializzato:\n'+'\n'.join(errors[:40]))
    write_jsonl(target, results)
    return progress(shard, job)


def sheet(shard, count=20, job=JOB):
    """Scheda compatta dei prossimi prompt della partizione ancora senza lotto, con l'eventuale bozza Qwen."""
    job = Path(job)
    here = job/'agent_outputs'/shard
    done = {r['prompt'] for f in list(here.glob('batch_*.jsonl')) for r in rows(f)}
    numbers = [int(f.stem.split('_')[1]) for f in here.glob('batch_*.jsonl')]
    categories = load_categories()
    drafts = drafts_index(job)
    todo = [e for e in rows(job/'prepared_shards'/f'{shard}.jsonl') if e['prompt'] not in done][:count]
    lines = [f'# lotto da scrivere: {here.as_posix()}/authored_{max(numbers, default=0)+1:04d}.txt',
             f'# restano {len(rows(job/"prepared_shards"/f"{shard}.jsonl")) - len(done)} prompt nella partizione']
    for e in todo:
        head = e['prompt_review']
        cat = categories[head['category_id']]['category_name']
        lines.append(f"\n## {e['prompt']} | {head['pos']} | {head['category_id']} {cat} | lingua {head['prompt_language']}")
        lines.append(f"senso: {head['sense_description']}")
        if e.get('current_pool'):
            lines.append('bacino attuale (riferimento da rifare, non vincolante):')
            lines += [f"  {a['word']}|{a['answer_sense']}|{a['relation']}|gruppo {a['meaning_group']}"
                      for a in e['current_pool']]
        draft = drafts.get(e['prompt'])
        if draft:
            lines.append('bozza Qwen (da verificare parola per parola, non è approvata):')
            lines += [f"  {a['word']}|{a['answer_sense']}|{a['relation']}|{a['rationale']}" for a in draft['answers']]
        else:
            lines.append('bozza Qwen: assente')
    return '\n'.join(lines)


def progress(shard, job=JOB):
    job = Path(job)
    here = job/'agent_outputs'/shard
    assigned = rows(job/'prepared_shards'/f'{shard}.jsonl')
    effective = {}
    for f in sorted(here.glob('batch_*.jsonl')) + sorted(here.glob('corrections_*.jsonl')):
        for r in rows(f):
            effective[r['prompt']] = r
    counts = Counter(r['decision'] for r in effective.values())
    rank = {e['prompt']: e['rank'] for e in assigned}
    result = {'shard': shard, 'assigned': len(assigned), 'examined': len(effective),
              'accepted': counts['accepted'], 'deferred': counts['deferred'],
              'association_count': sum(len(r.get('answers', [])) for r in effective.values()),
              'last_rank': max((rank[p] for p in effective), default=None),
              'remaining': len(assigned) - len(effective), 'complete': len(effective) == len(assigned),
              'batches': sorted(f.name for f in here.glob('batch_*.jsonl')), 'updated_at': now()}
    (here/'progress.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return result


def status(job=JOB, raw=DEFAULT_DB):
    job = Path(job)
    queue = rows(job/'queue.jsonl')
    _, pools, blocked = current(raw)
    drafts = drafts_index(job)
    shards = {}
    for folder in sorted((job/'agent_outputs').iterdir()):
        if folder.is_dir():
            shards[folder.name] = progress(folder.name, job) if (job/'prepared_shards'/f'{folder.name}.jsonl').exists() else None
    # In una coda di rifacimento il bacino conta come fatto solo quando non è più quello congelato.
    done = [e['prompt'] for e in queue
            if e['prompt'] in pools and pools[e['prompt']]['content_sha256'] != e.get('initial_pool_id')]
    return {'queue': len(queue), 'qwen_drafts': sum(e['prompt'] in drafts for e in queue),
            'imported_pools': len(done), 'blocked': sum(e['prompt'] in blocked for e in queue),
            'waiting': len(queue) - len(done),
            'shards': {k: (v and {x: v[x] for x in ('examined', 'accepted', 'deferred', 'association_count', 'remaining')})
                       for k, v in shards.items()}}


def import_batches(job=JOB, include_qwen=False):
    """Importa i lotti rivisti non ancora importati: un solo backup, una sola pubblicazione finale."""
    from ingest_agent_associations import ingest, publish
    job = Path(job)
    folders = sorted(f for f in (job/'agent_outputs').iterdir() if f.is_dir() and (include_qwen or f.name != 'qwen_solo'))
    summary, backed_up = {'imported_pools': 0, 'associations': 0, 'batches': 0, 'errors': []}, False
    for folder in folders:
        for batch in sorted(folder.glob('batch_*.jsonl')):
            if any((job/'central_imports'/folder.name).glob(batch.stem+'_*/receipt.json')):
                continue
            try:
                result = ingest(batch, publish=False, backup=not backed_up)
            except ValueError as error:
                summary['errors'].append(f'{folder.name}/{batch.name}: {error}')
                continue
            backed_up = backed_up or bool(result.get('backup'))
            summary['batches'] += 1
            summary['imported_pools'] += result['imported_pools']
            summary['associations'] += result.get('associations', 0)
    if backed_up:
        summary['published'] = {k: v for k, v in publish().items() if k != 'game_db'}
    return summary


SCHEMA = '''
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE categories(category_id TEXT PRIMARY KEY, category_name TEXT NOT NULL,
  cluster_id TEXT NOT NULL, cluster_name TEXT NOT NULL) STRICT;
CREATE TABLE prompts(
  id INTEGER PRIMARY KEY, prompt TEXT NOT NULL UNIQUE,
  pos TEXT NOT NULL CHECK(pos IN ('NOUN','VERB','ADJ')),
  language TEXT NOT NULL CHECK(language IN ('it','common_loanword')),
  sense TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(category_id),
  reviewer TEXT NOT NULL, method TEXT NOT NULL, reviewed_at TEXT NOT NULL,
  pool_review_id TEXT NOT NULL, association_count INTEGER NOT NULL) STRICT;
CREATE TABLE words(id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE) STRICT;
-- Molti a molti: la stessa parola può essere risposta di più prompt, ognuno con la propria motivazione.
CREATE TABLE prompt_words(
  prompt_id INTEGER NOT NULL REFERENCES prompts(id), word_id INTEGER NOT NULL REFERENCES words(id),
  answer_sense TEXT NOT NULL, relation TEXT NOT NULL, meaning_group TEXT NOT NULL,
  rationale TEXT NOT NULL, difficulty TEXT NOT NULL, PRIMARY KEY(prompt_id, word_id)) STRICT;
CREATE INDEX prompt_words_by_word ON prompt_words(word_id);
CREATE TABLE group_limits(prompt_id INTEGER NOT NULL REFERENCES prompts(id), meaning_group TEXT NOT NULL,
  maximum INTEGER NOT NULL CHECK(maximum IN (1,2)), PRIMARY KEY(prompt_id, meaning_group)) STRICT;
CREATE TABLE conflicts(prompt_id INTEGER NOT NULL REFERENCES prompts(id),
  word_a INTEGER NOT NULL REFERENCES words(id), word_b INTEGER NOT NULL REFERENCES words(id),
  reason TEXT NOT NULL, PRIMARY KEY(prompt_id, word_a, word_b)) STRICT;
CREATE VIEW prompt_word_list AS
  SELECT p.prompt, w.word, pw.answer_sense, pw.relation, pw.meaning_group, pw.rationale, pw.difficulty
  FROM prompt_words pw JOIN prompts p ON p.id=pw.prompt_id JOIN words w ON w.id=pw.word_id;
CREATE VIEW word_usage AS
  SELECT w.word, count(*) AS prompt_count, group_concat(p.prompt, ', ') AS prompts
  FROM prompt_words pw JOIN words w ON w.id=pw.word_id JOIN prompts p ON p.id=pw.prompt_id GROUP BY w.id;
'''


def build(source=VALID_DB, output=FINAL_DB):
    """Ricostruzione completa: copia soltanto bacini verificati, non decide nulla."""
    src = read_only(source)
    output = Path(output)
    temporary = output.with_suffix('.tmp')
    temporary.unlink(missing_ok=True)
    out = sqlite3.connect(temporary)
    try:
        out.executescript(SCHEMA)
        out.executemany('INSERT INTO categories VALUES(?,?,?,?)',
                        src.execute('SELECT category_id,category_name,cluster_id,cluster_name FROM categories'))
        word_ids = {}
        pools = src.execute('SELECT p.lemma,p.language,s.id sense_id,s.description,s.pos,s.category_id,'
                            'r.reviewer,r.method,r.reviewed_at,r.id review_id FROM prompts p '
                            'JOIN senses s ON s.prompt=p.lemma AND s.description=p.familiar_sense '
                            'JOIN reviews r ON r.id=s.review_id ORDER BY p.lemma').fetchall()
        for prompt_id, pool in enumerate(pools, 1):
            answers = src.execute('SELECT word,answer_sense,relation,meaning_group,rationale,difficulty '
                                  'FROM associations WHERE sense_id=? ORDER BY word', (pool['sense_id'],)).fetchall()
            out.execute('INSERT INTO prompts VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                        (prompt_id, pool['lemma'], pool['pos'], pool['language'], pool['description'],
                         pool['category_id'], pool['reviewer'], pool['method'], pool['reviewed_at'],
                         pool['review_id'], len(answers)))
            for a in answers:
                if a['word'] not in word_ids:
                    word_ids[a['word']] = len(word_ids)+1
                    out.execute('INSERT INTO words VALUES(?,?)', (word_ids[a['word']], a['word']))
                out.execute('INSERT INTO prompt_words VALUES(?,?,?,?,?,?,?)',
                            (prompt_id, word_ids[a['word']], a['answer_sense'], a['relation'],
                             a['meaning_group'], a['rationale'], a['difficulty']))
            out.executemany('INSERT INTO group_limits VALUES(?,?,?)',
                            [(prompt_id, g, m) for g, m in src.execute(
                                'SELECT meaning_group,maximum FROM group_limits WHERE sense_id=?', (pool['sense_id'],))])
            out.executemany('INSERT INTO conflicts VALUES(?,?,?,?)',
                            [(prompt_id, word_ids[a], word_ids[b], reason) for a, b, reason in src.execute(
                                'SELECT word_a,word_b,reason FROM conflicts WHERE sense_id=?', (pool['sense_id'],))])
        meta = {'database_role': 'prompt-finale-1', 'source_db': str(Path(source).resolve()), 'built_at': now(),
                'source_copied_at': dict(src.execute('SELECT key,value FROM metadata').fetchall()).get('copied_at', ''),
                'contents': 'Prompt con bacino verificato; parole uniche collegate a più prompt (prompt_words)',
                'human_review': 'false', 'independent_gameplay_qa': 'false'}
        out.executemany('INSERT INTO metadata VALUES(?,?)', meta.items())
        out.commit()
        check = out.execute('PRAGMA integrity_check').fetchone()[0]
        if check != 'ok':
            raise ValueError('Controllo di integrità fallito: '+check)
        counts = {t: out.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in ('prompts', 'words', 'prompt_words')}
        counts['shared_words'] = out.execute('SELECT count(*) FROM word_usage WHERE prompt_count>1').fetchone()[0]
    finally:
        out.close()
        src.close()
    from sqlite_prompt_runtime import publish_database  # in the one database the copy replaces its schema
    publish_database(temporary, output)
    return {'output': str(output), **counts}


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--rifai-validi', action='store_true',
                   help='congela tutti i prompt che hanno già un bacino, per rifarlo (serve una cartella nuova)')
    s = sub.add_parser('serialize')
    s.add_argument('shard')
    s.add_argument('number', type=int)
    sub.add_parser('status')
    i = sub.add_parser('import')
    i.add_argument('--include-qwen', action='store_true', help='importa anche i lotti della sola modalità Qwen')
    h = sub.add_parser('sheet')
    h.add_argument('shard')
    h.add_argument('--count', type=int, default=20)
    b = sub.add_parser('build')
    b.add_argument('--sync', action='store_true', help='rigenera prima lo schema validi dalla raccolta')
    args = ap.parse_args(argv)
    if args.command == 'prepare':
        result = prepare(redo=args.rifai_validi)
    elif args.command == 'serialize':
        result = serialize(args.shard, args.number)
    elif args.command == 'status':
        result = status()
    elif args.command == 'import':
        result = import_batches(include_qwen=args.include_qwen)
    elif args.command == 'sheet':
        print(sheet(args.shard, args.count))
        return
    else:
        if args.sync:
            from validated_prompt_database import sync_validated
            from sqlite_prompt_runtime import SQLite
            sync_validated(SQLite(DEFAULT_DB), VALID_DB)
        result = build()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
