"""Revisione LLM riprendibile di tutti i candidati, con verbali e controllo preinserimento.

Il pilota va esaminato editorialmente prima di avviare il lotto completo.
Le risposte del modello restano su disco; errori tecnici non diventano scarti.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import time
import urllib.request

from filter_prompts import clean_senses
from prompt_database import ROOT, DEFAULT_DB, digest, directives_hash, load_categories
from review_prompts import pending, read_only, FILTERED_DB, build_record, evidence_for
from semantic_rules import SEMANTIC_POLICY
from sqlite_prompt_runtime import SQLite, literal
from validated_prompt_database import register_reviews, sync_validated, validate_record

MODEL_CONFIG = ROOT/'resources/prompt_review_model.json'
JOB = ROOT/'prompt-staging/reviews/completion_20261109'
PILOT_WORDS = ('sabbia','ghiaccio','ladro','ristorante','ballerino','terrazzo','sandalo',
    'vacanza','quadro','circo','mandarino','macchina','gru','vampiro','pianeta','orologio',
    'fungo','soffocare','timido','leggero','solo','stare','dare','grande','forte','vivo')


def now():
    return datetime.now(timezone.utc).isoformat()


def read_jsonl(path):
    if not Path(path).exists():
        return []
    return [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]


def model_config():
    config = json.loads(MODEL_CONFIG.read_text(encoding='utf-8'))
    with urllib.request.urlopen(config['endpoint']+'/v1/models',timeout=10) as response:
        served = json.load(response)['data']
    if not any(r['id']==config['served_model'] and r.get('meta',{}).get('ftype','').startswith(config['quantization']) for r in served):
        raise ValueError('Modello servito diverso dalla configurazione del lotto')
    return config


def add_senses(candidates):
    db = read_only(DEFAULT_DB)
    try:
        for candidate in candidates:
            choices = []
            for pos,details in db.execute("SELECT a.pos,a.details_json FROM inventory_attestations a "
                    "JOIN inventory_snapshots s ON s.id=a.snapshot_id WHERE a.prompt=? "
                    "AND s.source_key='kaikki-itwiktionary' AND a.role='lemma'",(candidate['prompt'],)):
                if pos not in {'noun','verb','adj'}:
                    continue
                for sense in clean_senses(json.loads(details))[:3]:
                    pair = [pos,sense['gloss'][:180]]
                    if pair not in choices:
                        choices.append(pair)
            candidate['dictionary_senses'] = choices[:7]
    finally:
        db.close()
    return candidates


def system_prompt():
    catalog='\n'.join(c['category_id']+' '+c['category_name'] for c in load_categories().values())
    return '''Sei un revisore editoriale di prompt per un gioco di associazioni in lingua italiana.
Per OGNI voce, controlla familiarità del SIGNIFICATO, forma canonica, lingua, POS e categoria.
V = ammessa: parola italiana familiare, o prestito già autorizzato, con un senso quotidiano
riconoscibile e capace di evocare associazioni specifiche. R = scartata con motivo concreto.
D = rinviata per un dubbio reale non risolto. Non usare D per errori tecnici o mancanza di tempo.
La frequenza e il dizionario sono indizi, NON approvazioni. Non scegliere il primo senso per
comodità: confronta i sensi e preferisci quello quotidiano. Puoi correggere il POS automatico.
Esempi: ristorante=NOUN locale per pasti, ghiaccio=NOUN acqua solida, sabbia=NOUN granelli;
terrazzo è quello della casa, non geologia; vacanza è riposo/viaggio, non posto senza titolare;
vampiro è la creatura fantastica, non automaticamente il pipistrello.
Non promuovere ausiliari, parole grammaticali o termini eccessivamente generici soltanto perché
frequenti. Un nome astratto o un verbo non è vietato: emozioni, azioni e concetti familiari con
un senso preciso possono essere buoni prompt. Non scartare un prompt per assenza di verbi
associati. Non scegliere sensi specialistici o rari senza un tema visibile nel gioco.
Non stai generando né approvando risposte nascoste. Le associazioni saranno verificate a parte.
Categorie: scegline una coerente con il senso; non inventare ID e non forzare una categoria
incompatibile. Per le parole straniere l'autorizzazione riguarda solo la forma proposta;
non trasformare parole italiane in inglese e non proporre traduzioni come prompt.
Usa V solo quando hai effettuato tutte le verifiche. In s scrivi una definizione breve,
chiara e quotidiana del senso scelto, senza copiare frammenti incidentali della fonte.
In r motiva la scelta con proprietà concrete o esempi riconoscibili, non frasi generiche.
Per R/D basta il motivo in r; p,c,s possono essere rispettivamente NOUN,000 e stringa vuota.
Restituisci una riga per ogni indice i ricevuto, senza cambiarlo, ometterlo o duplicarlo.
Nessuna certificazione umana o QA di gioco. Rispondi soltanto con il JSON richiesto.
Catalogo delle categorie:\n'''+catalog


def schema(size):
    return {'type':'object','additionalProperties':False,'required':['rows'],'properties':{
        'rows':{'type':'array','minItems':size,'maxItems':size,'items':{'type':'object',
            'additionalProperties':False,'required':['i','d','p','c','s','r'],'properties':{
                'i':{'type':'integer','minimum':0,'maximum':size-1},
                'd':{'type':'string','enum':['V','R','D']},
                'p':{'type':'string','enum':['NOUN','VERB','ADJ']},
                'c':{'type':'string','enum':['000',*sorted(load_categories())]},
                's':{'type':'string','maxLength':180},
                'r':{'type':'string','minLength':25,'maxLength':180}}}}}}


def run_batch(candidates,config,folder,batch_id):
    request_rows = [{'i':i,'word':c['prompt'],'pos':c['pos_all'],'zipf':c['zipf'],
        'nvdb':bool(c['nvdb']),'language':c['language'],'flags':c['flags'],
        'senses':c.get('dictionary_senses') or [[c['pos'],c['gloss'][:180]]]} for i,c in enumerate(candidates)]
    body={'model':config['served_model'],'messages':[{'role':'system','content':system_prompt()},
        {'role':'user','content':json.dumps(request_rows,ensure_ascii=False)}],
        'temperature':0.05,'seed':int(digest(batch_id)[:8],16),'max_tokens':len(candidates)*170+100,
        'cache_prompt':True,'chat_template_kwargs':{'enable_thinking':False},
        'response_format':{'type':'json_schema','json_schema':{'name':'prompt_reviews','strict':True,'schema':schema(len(candidates))}}}
    audit=folder/('batch_'+str(batch_id)+'.json')
    audit.parent.mkdir(parents=True,exist_ok=True)
    url=config['endpoint']+'/v1/chat/completions'
    started=time.monotonic()
    request=urllib.request.Request(url,data=json.dumps(body,ensure_ascii=False).encode('utf-8'),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=1800) as response:
        result=json.load(response)
    audit.write_text(json.dumps({'request':body,'response':result,'elapsed_seconds':time.monotonic()-started},ensure_ascii=False),encoding='utf-8')
    if result['choices'][0].get('finish_reason')!='stop':
        raise ValueError('Risposta troncata: '+str(batch_id))
    answer=json.loads(result['choices'][0]['message']['content'])['rows']
    if len(answer)!=len(candidates) or sorted(row['i'] for row in answer)!=list(range(len(candidates))):
        raise ValueError('Indici incompleti/duplicati: '+str(batch_id))
    decisions=[]
    for row in sorted(answer,key=lambda r:r['i']):
        candidate=candidates[row['i']]
        if row['d'] not in {'V','R','D'} or len(row['r'].strip())<25:
            raise ValueError('Decisione incompleta: '+candidate['prompt'])
        decision={'prompt':candidate['prompt'],'decision':{'V':'verified','R':'rejected','D':'deferred'}[row['d']],
            'reason':row['r'],'model_review':{'model_sha256':config['model_sha256'],
                'base_model':config['base_model'],'quantization':config['quantization'],
                'audit_file':str(audit.resolve()),'audit_sha256':hashlib.sha256(audit.read_bytes()).hexdigest(),
                'candidate_sha256':digest(candidate),'reviewed_at':now()}}
        if row['d']=='V':
            if row['c'] not in load_categories() or len(row['s'].strip())<15:
                raise ValueError('Senso o categoria mancante: '+candidate['prompt'])
            decision.update(pos=row['p'],sense=row['s'].strip(),category_id=row['c'],
                prompt_rationale=row['r'].strip(),category_rationale='Il significato «'+row['s'].strip()+'» appartiene a «'+load_categories()[row['c']]['category_name']+'».')
        decisions.append(decision)
    return decisions


def prepare(folder,config,pilot=False):
    folder.mkdir(parents=True,exist_ok=True)
    file=folder/'candidates.jsonl'
    if file.exists():
        candidates=read_jsonl(file)
    else:
        if pilot:
            db=read_only(FILTERED_DB)
            try:
                candidates=[]
                for word in PILOT_WORDS:
                    row=db.execute('SELECT * FROM filtered_prompts WHERE prompt=?',(word,)).fetchone()
                    if row:
                        candidates.append(dict(row)|{'flags':json.loads(row['flags'])})
            finally:
                db.close()
        else:
            candidates=pending()
        add_senses(candidates)
        file.write_text(''.join(json.dumps(c,ensure_ascii=False)+'\n' for c in candidates),encoding='utf-8')
    manifest={'model_sha256':config['model_sha256'],'base_model':config['base_model'],
        'quantization_revision':config['quantization_revision'],'semantic_policy':SEMANTIC_POLICY,
        'directives_sha256':directives_hash(),'catalog_sha256':digest(load_categories()),
        'system_sha256':digest(system_prompt()),'candidates_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
        'candidate_count':len(candidates),'pilot':pilot}
    path=folder/'manifest.json'
    if path.exists() and json.loads(path.read_text(encoding='utf-8'))!=manifest:
        raise ValueError('Manifest cambiato: non mescolare regole, modello o candidati durante la ripresa')
    path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return candidates


def infer(folder,config,batch_size=12,workers=4,pilot=False):
    if not pilot and config.get('pilot_status')!='ACCEPTED_FOR_PROMPT_REVIEW':
        raise ValueError('Pilota non ancora esaminato e accettato per la revisione dei prompt')
    candidates=prepare(folder,config,pilot)
    checkpoint=folder/'decisions.jsonl'
    done={r['prompt']:r for r in read_jsonl(checkpoint)}
    todo=[c for c in candidates if c['prompt'] not in done]
    chunks=[todo[i:i+batch_size] for i in range(0,len(todo),batch_size)]
    failures=[];started=time.monotonic()
    with checkpoint.open('a',encoding='utf-8',buffering=1) as stream,ThreadPoolExecutor(max_workers=workers) as pool:
        futures={pool.submit(run_batch,chunk,config,folder/'inference',digest([c['prompt'] for c in chunk])[:16]):chunk for chunk in chunks}
        for future in as_completed(futures):
            try:
                rows=future.result()
                for row in rows:
                    if row['prompt'] in done:
                        raise ValueError('Risultato duplicato: '+row['prompt'])
                    stream.write(json.dumps(row,ensure_ascii=False)+'\n')
                    done[row['prompt']]=row
            except Exception as error:
                failures.append({'prompts':[c['prompt'] for c in futures[future]],'error':str(error)})
            progress={'target':len(candidates),'reviewed':len(done),'remaining':len(candidates)-len(done),
                'decisions':dict(Counter(r['decision'] for r in done.values())),
                'failed_batches':len(failures),'elapsed_seconds':round(time.monotonic()-started,1),
                'status':'INFERENCE_COMPLETED' if len(done)==len(candidates) else 'INFERENCE_IN_PROGRESS'}
            (folder/'progress.json').write_text(json.dumps(progress,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(json.dumps(progress,ensure_ascii=False),flush=True)
    (folder/'failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if failures:
        raise ValueError('Alcuni lotti richiedono ripresa: '+str(len(failures)))
    return len(done)


def apply(folder,config):
    candidates=prepare(folder,config)
    decisions=read_jsonl(folder/'decisions.jsonl')
    if len(decisions)!=len(candidates) or {r['prompt'] for r in decisions}!={c['prompt'] for c in candidates}:
        raise ValueError('Revisione incompleta: nessuna importazione')
    current={r['prompt'] for r in pending()}
    lookup={c['prompt']:c for c in candidates}
    records=[];negative=[];superseded=[]
    reviewer=config['base_model']+' '+config['quantization']+' — revisione editoriale dei prompt'
    for row in decisions:
        if row['prompt'] not in current:
            superseded.append(row['prompt'])
            continue
        if row['decision']=='verified':
            candidate=lookup[row['prompt']]
            record=build_record(row,candidate,evidence_for(DEFAULT_DB,row['prompt'],candidate),reviewer,'llm_editorial_review')
            record['model_review']=row['model_review']
            record['content_sha256']=digest({k:v for k,v in record.items() if k!='content_sha256'})
            validate_record(record)
            records.append(record)
        elif row['decision'] in {'rejected','deferred'} and len(row['reason'].strip())>=10:
            negative.append(row)
        else:
            raise ValueError('Decisione non valida: '+row['prompt'])
    db=SQLite(DEFAULT_DB)
    backup=ROOT/'database-backups'/('review_state_before_complete_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')+'.sql')
    db.dump(backup,['prompt_validations','prompt_validation_heads','inventory_term_decisions','inventory_decision_history'])
    result=register_reviews(db,records)
    statements=['BEGIN IMMEDIATE;']
    for row in negative:
        decision='DISCARDED' if row['decision']=='rejected' else 'DEFERRED'
        values=[row['prompt'],decision,row['reason'],reviewer,now()]
        statements.append('INSERT INTO inventory_term_decisions VALUES ('+','.join(literal(v) for v in values)+
            ') ON CONFLICT(prompt) DO UPDATE SET decision=excluded.decision,reason=excluded.reason,actor=excluded.actor,decided_at=excluded.decided_at;')
        statements.append("INSERT INTO inventory_decision_history(subject_type,subject_id,decision,reason,actor,decided_at) VALUES ('TERM',"+
            ','.join(literal(v) for v in values)+');')
    statements.append('COMMIT;')
    db.run(''.join(statements))
    result['valid_db']=sync_validated(db)
    from filter_prompts import build
    from review_prompts import keep_game_db_current
    result['filtered_db']=build()
    keep_game_db_current(DEFAULT_DB)
    result.update({'target':len(candidates),'verified':len(records),'rejected_or_deferred':len(negative),
        'superseded_by_existing_decision':superseded,'remaining_pending':len(pending()),
        'human_review':False,'independent_gameplay_qa':False,'source_review_state_backup':str(backup)})
    report=ROOT/'prompt_review_completion_20261109.json'
    report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))


def main(argv=None):
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['pilot','run','apply','status'])
    parser.add_argument('--directory',type=Path,default=JOB)
    parser.add_argument('--batch-size',type=int,default=12)
    parser.add_argument('--workers',type=int,default=4)
    args=parser.parse_args(argv)
    if args.command=='status':
        print((args.directory/'progress.json').read_text(encoding='utf-8'))
        return
    config=model_config()
    if args.command=='apply':
        apply(args.directory,config)
    else:
        pilot=args.command=='pilot'
        infer(args.directory.with_name(args.directory.name+'_pilot') if pilot else args.directory,
              config,args.batch_size,args.workers,pilot)


if __name__=='__main__':
    main()
