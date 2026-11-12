"""Coda completa dei filtrati e importazione di bacini realmente revisionati.

Non assegna categorie, non estrae risposte dalle definizioni e non simula un
revisore. compile-reviewed trascrive decisioni editoriali esplicite, con senso,
relazione e motivazione per ogni coppia. Le bozze restano esterne ai database.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import unified_db
import sys
from urllib.parse import urlparse
from urllib.request import url2pathname

from prompt_database import (ROOT, DEFAULT_DB, GAME_DB, POOL_CHECKS, WORD_CHECKS,
    digest, directives_hash, validate_pool, import_reviewed, export_game_db)
from semantic_rules import SEMANTIC_POLICY
from sqlite_prompt_runtime import SQLite
from validated_prompt_database import validate_record, sync_validated, VALIDATED_DB

FILTERED_DB = ROOT/'prompt_filtrati.sqlite3'
JOB = ROOT/'prompt-staging/associations/filtered_20261109'
RULE_FILES = ('direttive_word_association_it_v3_6_0.md', 'DIRETTIVA_INDIZI.md', 'REGOLE.md')


def now():
    return datetime.now(timezone.utc).isoformat()


def read_only(path):
    db = unified_db.connect(Path(path).resolve().as_uri()+'?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def rule_hashes():
    return {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in RULE_FILES}


def current(raw):
    """Legge una fotografia della raccolta senza modificarla."""
    db = read_only(raw)
    try:
        db.execute('BEGIN')
        blocked = {r['prompt']: r['decision'] for r in db.execute(
            "SELECT prompt,decision FROM inventory_term_decisions WHERE decision IN ('DISCARDED','DEFERRED')")}
        heads = {}
        for r in db.execute('SELECT h.prompt,h.validation_id,v.record_json FROM prompt_validation_heads h '
                            'JOIN prompt_validations v ON v.id=h.validation_id'):
            record = json.loads(r['record_json'])
            try:
                validate_record(record)
                if record['prompt'] != r['prompt'] or record['content_sha256'] != r['validation_id']:
                    continue
                if r['prompt'] not in blocked:
                    heads[r['prompt']] = record
            except ValueError:
                continue
        pools = {r['prompt']: json.loads(r['record_json']) for r in db.execute(
            'SELECT s.prompt,r.record_json FROM senses s JOIN reviews r ON r.id=s.review_id '
            'JOIN prompts p ON p.lemma=s.prompt AND p.familiar_sense=s.description')}
        return heads, pools, blocked
    finally:
        db.close()


def prepare(folder=JOB, raw=DEFAULT_DB, filtered=FILTERED_DB):
    folder = Path(folder)
    if (folder/'manifest.json').exists():
        return status(folder, raw)
    db = read_only(filtered)
    try:
        db.execute('BEGIN')
        candidates = [dict(r) for r in db.execute('SELECT * FROM filtered_prompts ORDER BY prompt')]
        source_meta = dict(db.execute('SELECT * FROM metadata').fetchall())
    finally:
        db.close()
    heads, _, _ = current(raw)
    entries = [{'prompt':r['prompt'], 'automatic':r,
                'initial_validation_id':heads[r['prompt']]['content_sha256'] if r['prompt'] in heads else None}
               for r in candidates]
    text = ''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in entries)
    manifest = {'schema':'association-queue-1', 'created_at':now(), 'raw':str(Path(raw).resolve()),
        'filtered':str(Path(filtered).resolve()), 'filtered_metadata':source_meta,
        'candidate_count':len(entries), 'entries_sha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'semantic_policy':SEMANTIC_POLICY, 'rule_files_sha256':rule_hashes(),
        'coverage_claim':'Frozen filtered candidates; expandable reviewed pools, no claim of lexical exhaustiveness.'}
    folder.mkdir(parents=True, exist_ok=True)
    (folder/'entries.jsonl').write_bytes(text.encode('utf-8'))
    (folder/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return status(folder, raw)


def status(folder=JOB, raw=DEFAULT_DB):
    folder = Path(folder)
    manifest = json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    content = (folder/'entries.jsonl').read_bytes()
    if hashlib.sha256(content).hexdigest() != manifest['entries_sha256']:
        raise ValueError('Coda modificata dopo la preparazione')
    if Path(manifest['raw']).resolve() != Path(raw).resolve():
        raise ValueError('La coda appartiene a una raccolta diversa')
    heads, pools, blocked = current(raw)
    states = []
    for line in content.decode('utf-8').splitlines():
        word = json.loads(line)['prompt']
        head, pool = heads.get(word), pools.get(word)
        if word in blocked:
            state = 'BLOCKED_'+blocked[word]
        elif not head:
            state = 'WAITING_PROMPT_REVIEW'
        elif not pool:
            state = 'WAITING_ASSOCIATIONS'
        elif any(head[k] != pool[k] for k in ('sense_description','category_id','pos','prompt_language')):
            state = 'POOL_REQUIRES_REALIGNMENT'
        else:
            try:
                validate_pool(pool)
                state = 'REVIEWED_POOL'
            except ValueError:
                state = 'POOL_REQUIRES_REVIEW'
        states.append({'prompt':word, 'state':state})
    result = {'candidate_count':len(states), 'states':dict(Counter(r['state'] for r in states)),
              'updated_at':now(), 'semantic_policy':SEMANTIC_POLICY,
              'rules_unchanged':rule_hashes() == manifest['rule_files_sha256'],
              'coverage_complete':all(r['state']=='REVIEWED_POOL' for r in states),
              'lexically_exhaustive':False, 'independent_gameplay_qa':False}
    (folder/'entry_states.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in states),encoding='utf-8')
    (folder/'progress.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return result


def pool_from_decision(document, entry, head, annotation, source_sha):
    """Serializza una decisione esplicita senza accedere ai database."""
    annotation=Path(annotation)
    word=entry['prompt']
    if entry.get('decision') != 'accepted' or not entry.get('review_rationale','').strip():
        raise ValueError('Decisione editoriale esplicita del bacino mancante: '+word)
    answers = []
    for item in entry['answers']:
        # Campi semantici espliciti: nessuno deriva dalla categoria o da token
        # di una definizione. Non copiare una motivazione da un'altra coppia.
        if item.get('decision') != 'accepted' or any(not item.get(k) for k in
                ('word','answer_sense','relation','meaning_group','rationale')):
            raise ValueError('Decisione individuale incompleta: '+word)
        answers.append({**item, 'difficulty':item.get('difficulty','unrated'),
            'difficulty_basis':item.get('difficulty_basis','Difficoltà non calibrata; nessun test con giocatori dichiarato.'),
            'checks':{key:True for key in WORD_CHECKS}})
    pool = {'schema':'verified-pool-1', **{k:head[k] for k in
        ('prompt','pos','sense_description','category_id','prompt_language')},
        'review':{'decision':'verified','reviewer':document['reviewer'],'method':document['method'],
            'reviewed_at':document['reviewed_at'], 'human_review':document['method']=='human_editorial_review',
            'independent_gameplay_qa':False, 'directives_sha256':directives_hash(),'policy_version':SEMANTIC_POLICY,
            'checks':{key:True for key in POOL_CHECKS},
            'prompt_rationale':head['review']['prompt_rationale'],
            'category_rationale':head['review']['category_rationale'],
            'association_review_rationale':entry['review_rationale']},
        'answers':answers, 'group_limits':entry['group_limits'], 'conflicts':entry.get('conflicts',[]),
        'evidence':head['evidence']+[{'source_id':'editorial-associations-'+source_sha[:20],
            'source_url':annotation.resolve().as_uri(), 'url':annotation.resolve().as_uri()+'#'+word,
            'license':'Contenuto editoriale prodotto per il progetto; riferimenti del prompt conservati separatamente.',
            'attribution':document['reviewer'], 'snapshot_sha256':source_sha,
            'scope':'individual_association_editorial_review', 'note':entry['review_rationale']}],
        'association_catalog':{'prompt_validation_id':head['content_sha256'],
            'annotation_sha256':source_sha, 'rule_files_sha256':document['rules_sha256'],
            'lexically_exhaustive':False}}
    pool['content_sha256'] = digest(pool)
    validate_record(pool)
    return pool


def compile_reviewed(annotation, output, raw=DEFAULT_DB):
    """Serializzazione, non revisione: ogni decisione deve essere già stata presa."""
    annotation, output = Path(annotation), Path(output)
    source_bytes = annotation.read_bytes()
    document = json.loads(source_bytes.decode('utf-8'))
    if (document.get('schema') != 'association-editorial-decisions-1'
            or not isinstance(document.get('reviewer'),str) or not document['reviewer'].strip()
            or document.get('method') not in {'llm_editorial_review','human_editorial_review'}
            or document.get('rules_sha256') != rule_hashes()):
        raise ValueError('Annotazione, attribuzione o direttive non conformi')
    entries = document.get('entries')
    if not isinstance(entries,list) or not entries or len({e['prompt'] for e in entries}) != len(entries):
        raise ValueError('Servono decisioni distinte per ciascun prompt')
    heads, existing, blocked = current(raw)
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    pools = []
    for entry in entries:
        word = entry['prompt']
        if word in blocked or word not in heads:
            raise ValueError('Serve una revisione positiva corrente del prompt: '+word)
        head = heads[word]
        if entry.get('validation_id') != head['content_sha256']:
            raise ValueError('Revisione del prompt cambiata: '+word)
        if word in existing:
            raise ValueError('Il prompt ha già un bacino: questo percorso non lo sovrascrive: '+word)
        pool=pool_from_decision(document,entry,head,annotation,source_sha)
        pools.append(pool)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Un output già presente non viene modificato, nemmeno da una nuova revisione.
    with output.open('x',encoding='utf-8') as stream:
        stream.write(''.join(json.dumps(p,ensure_ascii=False)+'\n' for p in pools))
    return {'output':str(output.resolve()),'pools':len(pools),'associations':sum(len(p['answers']) for p in pools)}


def record_reviewed_text(source, output, reviewer, method='llm_editorial_review', raw=DEFAULT_DB):
    """Trascrive un foglio già revisionato (@ prompt, cinque campi per coppia).

    Le righe sono decisioni positive del revisore indicato, non suggerimenti da
    approvare. Non usare questa conversione su output LLM non ancora esaminati.
    """
    source=Path(source)
    heads, _, _=current(raw)
    entries=[];entry=None
    for n,line in enumerate(source.read_text(encoding='utf-8').splitlines(),1):
        line=line.strip()
        if not line or line.startswith('#'):continue
        if line.startswith('@ '):
            word=line[2:].strip()
            if word not in heads:raise ValueError('Revisione positiva assente: '+word)
            head=heads[word]
            entry={'prompt':word,'validation_id':head['content_sha256'],'decision':'accepted',
                'review_rationale':f'Revisione editoriale di ogni coppia per «{word}», nel senso «{head["sense_description"]}». '
                    'Controllati autonomia, coerenza, forma e ruoli. Gruppi equivalenti limitati a uno per estrazione; '
                    'nessun test indipendente dichiarato.',
                'answers':[],'group_limits':{},'conflicts':[]}
            entries.append(entry)
        else:
            cells=[x.strip() for x in line.split(' | ')]
            if entry is None or len(cells)!=5 or not all(cells):
                raise ValueError(f'Riga editoriale incompleta: {source.name}:{n}')
            word,sense,relation,group,reason=cells
            entry['answers'].append({'word':word,'answer_sense':sense,'relation':relation,
                'meaning_group':group,'rationale':reason,'decision':'accepted','editorial_source_line':n})
            entry['group_limits'][group]=1
    try: source_name=str(source.resolve().relative_to(ROOT))
    except ValueError: source_name=str(source.resolve())
    annotation={'schema':'association-editorial-decisions-1','reviewer':reviewer,'method':method,
        'reviewed_at':datetime.now(timezone.utc).date().isoformat(),'rules_sha256':rule_hashes(),
        'source_text':source_name,'source_text_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'human_review':method=='human_editorial_review','independent_gameplay_qa':False,
        'lexically_exhaustive':False,'entries':entries}
    path=Path(output).with_suffix('.annotations.json')
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x',encoding='utf-8') as stream:json.dump(annotation,stream,ensure_ascii=False,indent=2)
    return compile_reviewed(path,output,raw)


def verify_annotation(pool):
    """Vincola le parole importate alle decisioni archiviate, non alla sola autodichiarazione."""
    audit=pool.get('association_catalog') or {}
    evidence=next((e for e in pool['evidence'] if e['scope']=='individual_association_editorial_review'
                   and e['snapshot_sha256']==audit.get('annotation_sha256')),None)
    if evidence is None:
        raise ValueError('Prova delle decisioni editoriali mancante: '+pool['prompt'])
    location=urlparse(evidence['source_url'])
    if location.scheme!='file' or location.netloc not in ('','localhost'):
        raise ValueError('Serve il verbale editoriale locale archiviato')
    path=Path(url2pathname(location.path))
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=audit.get('annotation_sha256'):
        raise ValueError('Annotazione editoriale assente o modificata: '+pool['prompt'])
    document=json.loads(path.read_text(encoding='utf-8'))
    if document.get('rules_sha256')!=audit.get('rule_files_sha256'):
        raise ValueError('Direttive del foglio editoriale discordanti')
    if any(document.get(k)!=pool['review'][k] for k in ('reviewer','method','reviewed_at')):
        raise ValueError('Attribuzione della revisione discordante: '+pool['prompt'])
    entries=[e for e in document['entries'] if e['prompt']==pool['prompt']]
    if len(entries)!=1 or entries[0].get('decision')!='accepted':
        raise ValueError('Decisione del prompt assente nel verbale editoriale')
    entry=entries[0]
    if entry['validation_id']!=audit.get('prompt_validation_id'):
        raise ValueError('Riferimento del prompt discordante nel verbale editoriale')
    fields=('word','answer_sense','relation','meaning_group','rationale','decision')
    original=[{k:a.get(k) for k in fields} for a in entry['answers']]
    compiled=[{k:a.get(k) for k in fields} for a in pool['answers']]
    if (original!=compiled or entry['group_limits']!=pool['group_limits']
            or entry.get('conflicts',[])!=pool.get('conflicts',[])):
        raise ValueError('Parole o vincoli diversi dalle decisioni editoriali archiviate')
    text=Path(document['source_text'])
    if not text.is_absolute():text=ROOT/text
    if not text.is_file() or hashlib.sha256(text.read_bytes()).hexdigest()!=document.get('source_text_sha256'):
        raise ValueError('Foglio editoriale originale assente o modificato')
    origin=entry.get('source_decision')
    if origin:
        original_path=Path(origin['path'])
        if not original_path.is_absolute():original_path=ROOT/original_path
        original_bytes=original_path.read_bytes()
        if hashlib.sha256(original_bytes).hexdigest()!=origin['file_sha256']:
            raise ValueError('Verbale originale dell’agente modificato')
        decisions=[json.loads(line) for line in original_bytes.decode('utf-8').splitlines() if line.strip()]
        decisions=[d for d in decisions if d['prompt']==pool['prompt'] and digest(d)==origin['record_sha256']]
        if len(decisions)!=1:raise ValueError('Decisione originale non ritrovata')
        decision=decisions[0]
        if any(decision.get(k)!=pool['review'][k] for k in ('reviewer','method','reviewed_at')):
            raise ValueError('Attribuzione diversa dal verbale originale')
        if any(decision.get(k)!=pool[k] for k in ('prompt','pos','sense_description','category_id','prompt_language')):
            raise ValueError('Significato diverso dal verbale originale')
        if ([{k:a.get(k) for k in fields} for a in decision['answers']]!=compiled
                or decision['group_limits']!=pool['group_limits'] or decision.get('conflicts',[])!=pool.get('conflicts',[])):
            raise ValueError('Associazioni diverse dal verbale originale dell’agente')


def apply_reviewed(pack, raw=DEFAULT_DB, valid=VALIDATED_DB):
    pack = Path(pack)
    pools = [json.loads(line) for line in pack.read_text(encoding='utf-8').splitlines() if line.strip()]
    if not pools:
        raise ValueError('Pacchetto vuoto')
    heads, existing, blocked = current(raw)
    for pool in pools:
        validate_record(pool)
        audit = pool.get('association_catalog') or {}
        if audit.get('rule_files_sha256') != rule_hashes():
            raise ValueError('Regole cambiate dopo la revisione: '+pool['prompt'])
        verify_annotation(pool)
        head = heads.get(pool['prompt'])
        if not head or pool['prompt'] in blocked or head['content_sha256'] != audit.get('prompt_validation_id'):
            raise ValueError('Revisione del prompt non più corrente: '+pool['prompt'])
        if any(pool[k] != head[k] for k in ('sense_description','category_id','pos','prompt_language')):
            raise ValueError('Senso/categoria/POS/lingua discordanti: '+pool['prompt'])
        old = existing.get(pool['prompt'])
        if old and old['content_sha256'] != pool['content_sha256']:
            raise ValueError('Un altro bacino esiste già: '+pool['prompt'])
    todo = [p for p in pools if p['prompt'] not in existing]
    db = SQLite(raw)
    backup = None
    if todo:
        backup = ROOT/'database-backups'/('before_associations_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')+'.sql')
        backup.parent.mkdir(parents=True,exist_ok=True)
        from prompt_database import pool_objects
        db.dump(backup,pool_objects(db))
        pending_pack = pack.with_name(pack.stem+'.pending_'+str(len(todo))+'.jsonl')
        with pending_pack.open('x',encoding='utf-8') as stream:
            stream.write(''.join(json.dumps(p,ensure_ascii=False)+'\n' for p in todo))
        expected = {p['prompt']:p['association_catalog']['prompt_validation_id'] for p in todo}
        import_reviewed(db,pending_pack,expected_heads=expected,new_prompts_only=True)
    result = {'imported_pools':len(todo),'already_imported':len(pools)-len(todo),
              'backup':str(backup) if backup else None,
              'validated_db':sync_validated(db,valid)}
    if Path(raw).resolve() == DEFAULT_DB.resolve():
        result['game_db'] = export_game_db(db,GAME_DB)
    receipt = pack.with_suffix('.import.json')
    if receipt.exists():
        receipt=pack.with_name(pack.stem+'.import_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')+'.json')
    with receipt.open('x',encoding='utf-8') as stream:
        stream.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw',type=Path,default=DEFAULT_DB)
    parser.add_argument('--filtered',type=Path,default=FILTERED_DB)
    parser.add_argument('--valid',type=Path,default=VALIDATED_DB)
    parser.add_argument('--directory',type=Path,default=JOB)
    sub = parser.add_subparsers(dest='command',required=True)
    sub.add_parser('prepare');sub.add_parser('status')
    compile_parser=sub.add_parser('compile-reviewed');compile_parser.add_argument('annotation',type=Path)
    compile_parser.add_argument('--output',type=Path,required=True)
    record_parser=sub.add_parser('record-reviewed');record_parser.add_argument('source',type=Path)
    record_parser.add_argument('--output',type=Path,required=True)
    record_parser.add_argument('--reviewer',required=True)
    record_parser.add_argument('--method',choices=['llm_editorial_review','human_editorial_review'],default='llm_editorial_review')
    apply_parser=sub.add_parser('import-reviewed');apply_parser.add_argument('pack',type=Path)
    args=parser.parse_args()
    if args.command=='prepare':result=prepare(args.directory,args.raw,args.filtered)
    elif args.command=='status':result=status(args.directory,args.raw)
    elif args.command=='compile-reviewed':result=compile_reviewed(args.annotation,args.output,args.raw)
    elif args.command=='record-reviewed':result=record_reviewed_text(args.source,args.output,args.reviewer,args.method,args.raw)
    else:result=apply_reviewed(args.pack,args.raw,args.valid)
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
