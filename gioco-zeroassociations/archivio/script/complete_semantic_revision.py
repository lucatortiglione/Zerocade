"""Revisione editoriale locale riprendibile di tutti i set, senza QA simulato.

Le risposte del modello sono dati JSON: non eseguono codice e non approvano set.
I CSV sorgenti restano intatti fino all'assemblaggio completo e verificato.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import time
import urllib.request

from assemble_rewritten_sets import collect
from rewrite_pending_sets import read_jsonl, request, validate
from semantic_rules import SEMANTIC_POLICY
from local_llm_preflight import check_new_batch, get_json
from validate_word_association_it_v3_6_0 import load_taxonomy, TAXONOMY_FILENAME

ROOT=Path(__file__).parent
MODEL='unsloth/Qwen3.8-27B-GGUF@4ca720788d1e01f1bff70c033e0d0028fd02e502'
MODEL_SHA256='2de73110cb254cbf09b54b717578dadff12ef1194e7271527e68202f39ba4bfd'
ADDITIONAL='''
Questa è una revisione editoriale completa. Ogni contesto deve restare identico.
Le parole precedenti possono essere SBAGLIATE: correggile senza copiarle per inerzia.
Se una parola è già naturale e pertinente, conservala. Non sostituire il prompt.
Non usare descrittori senza un rapporto riconoscibile: operare, inerente, formazione,
misura, permettere, compiere non vanno introdotti come riempitivi.
Non unire significati diversi: PONGO è plastilina, non orango; TRIBUNA è per spettatori;
TERNA è tre elementi o numeri; AGITATO è irrequieto, non didascalia musicale;
ANIMA ha il senso spirituale, non metallo. Scegli il senso più familiare.
SKATEBOARD: tavola, ruota, pista, rampa, equilibrio, salto, casco. NON manubrio.
TIGRE: felino, ruggito, zanna, artiglio, striscia, predatore, giungla.
AGONISTICO: sportivo, competizione, allenamento, atleta, vittoria, record, campionato.
Evita ridondanze anche di due parole se non aggiungono informazioni distinte.
Nomi singolari e verbi all'infinito. Aggettivi alla forma maschile singolare
quando autonomi; non usare plurali o forme femminili solo per concordare con il prompt.
Le motivazioni devono essere vere e specifiche, anche se brevi. NON inventare fatti
per giustificare una parola. Evita giustificazioni circolari come 'X riguarda Y'.
Non associare aggettivi a oggetti subordinati: intonaco fresco non rende fresco
una risposta pertinente ad AFFRESCO. La categoria è interna e NON disambigua il gioco.
Usa relazioni differenti quando pertinenti, senza forzare sinonimi o contrari.
'''

SYSTEM='''Sei un redattore italiano per un gioco: il giocatore vede p e indovina sette
parole associate. Scegli un solo significato quotidiano familiare e sette associazioni
naturali e diverse. Correggi le parole precedenti se sbagliate, preserva quelle valide.
Mai estrarre frammenti dalle definizioni o introdurre parole generiche per arrivare a sette.
Niente sinonimi ripetuti, derivati tautologici, dettagli incidentali o sensi secondari.
Una parola minuscola per risposta; nomi singolari, aggettivi in forma base, verbi
all'infinito facoltativi. Ogni risposta aggiunge informazione e funziona da sola.
Non scegliere aggettivi che descrivono un oggetto subordinato anziché il contesto.
Non inventare fatti: aggiungi per ogni parola una breve motivazione vera, specifica,
di almeno 15 caratteri. Non bastano 'è associato', 'è citato' o rapporti circolari.
Conserva esattamente p. s descrive il senso, c sceglie una categoria proposta,
pos è NOUN/VERB/ADJ. a contiene sette terne [parola,relazione,motivazione].
Rispondi solo JSON {"items":[{"p":"...","s":"...","c":"001","pos":"NOUN","a":[...]}]}.
Relazioni: sinonimia, parte, materiale, strumento, funzione, categoria, proprietà,
contesto, luogo, attività, causa, effetto, contrasto, processo, ingrediente, sensoriale,
ruolo, metafora, altro. Non produrre giudizi QA o punteggi.
'''


def source_inputs(source,work,taxonomy):
    originals=read_jsonl(source)
    _,drafts,_,_=collect(work,taxonomy)
    draft_by_prompt={row['p']:row for row in drafts.values()}
    result=[]
    for index,old in enumerate(originals):
        draft=draft_by_prompt.get(old['prompt'])
        revision=old.get('editorial_revision') or {}
        item={'p':old['prompt'],'pos_precedente':old['pos'],
              'parole_da_verificare':draft['a'] if draft else old['words']}
        if draft:item['senso_proposto_da_verificare']=draft['s']
        elif revision:item['senso_proposto_da_verificare']=revision.get('sense_description')
        result.append({'index':index,'input':item,'original':old})
    return result


def category_options(inputs,taxonomy):
    import numpy as np
    import spacy
    nlp=spacy.load('it_core_news_md',exclude=['parser','ner','tagger','lemmatizer','attribute_ruler'])
    keys=list(taxonomy)
    docs=list(nlp.pipe([taxonomy[k]['category_name'] for k in keys]))
    vectors=np.array([doc.vector for doc in docs])
    norms=np.linalg.norm(vectors,axis=1)
    contexts=[row['input']['p']+' '+str(row['input'].get('senso_proposto_da_verificare') or '') for row in inputs]
    for row,doc in zip(inputs,nlp.pipe(contexts)):
        scores=vectors@doc.vector/(norms*np.linalg.norm(doc.vector)+1e-10)
        selected=[keys[i] for i in np.argsort(scores)[-14:][::-1]]
        old=row['original']['category_id']
        if old not in selected:selected.append(old)
        row['input']['categorie_proposte']={k:taxonomy[k]['category_name'] for k in selected}
    return inputs


def run_batch(batch,endpoint,system,taxonomy,raw_dir):
    accepted={};feedback={};attempts=[]
    for attempt in range(4):
        todo=[row for row in batch if row['input']['p'] not in accepted]
        if not todo:break
        inputs=[row['input'] for row in todo]
        try:
            result,raw=request(endpoint,system,inputs,taxonomy,feedback or None)
            stamp=f'{batch[0]["index"]:05d}_{attempt}_{time.time_ns()}'
            (raw_dir/f'{stamp}.json').write_text(json.dumps({'inputs':inputs,'response':raw},ensure_ascii=False),encoding='utf-8')
            output={row.get('p'):row for row in result.get('items',[])}
            feedback={}
            for row in todo:
                p=row['input']['p'];item=output.get(p,{})
                errors=validate(item,p,taxonomy)
                if errors:feedback[p]=errors
                else:
                    accepted[p]={**item,'index':row['index'],'model':MODEL,
                                 'model_sha256':MODEL_SHA256,'diagnostic_kind':'LOCAL_LLM_EDITORIAL',
                                 'independent_review':False,'human_review':False}
            attempts.append({'attempt':attempt,'usage':raw.get('usage'),'errors':feedback})
        except Exception as error:
            feedback={row['input']['p']:[str(error)[:1200]] for row in todo}
            attempts.append({'attempt':attempt,'errors':feedback})
    return list(accepted.values()),feedback,attempts


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--endpoint',default='http://127.0.0.1:19472')
    ap.add_argument('--directory',type=Path,default=ROOT/'rewritten-v3_6_0/lotto_0004_20261108/completion')
    ap.add_argument('--source',type=Path,default=ROOT/'generated-v3_6_0/word_association_it_5000_metadati_0003.jsonl')
    ap.add_argument('--work',type=Path,default=ROOT/'rewritten-v3_6_0/lotto_0004_20261108/work')
    ap.add_argument('--prompts',nargs='*')
    ap.add_argument('--limit',type=int)
    ap.add_argument('--batch-size',type=int,default=2)
    ap.add_argument('--workers',type=int,default=4)
    ap.add_argument('--pilot-assessment',type=Path,
                    help='Valutazione reale del pilota, obbligatoria per tutto il lotto')
    args=ap.parse_args(argv)
    if not args.prompts and not args.limit:
        if not args.pilot_assessment:
            ap.error('Prima del lotto completo occorre una valutazione positiva del pilota')
        assessment=json.loads(args.pilot_assessment.read_text(encoding='utf-8'))
        if assessment.get('model_sha256')!=MODEL_SHA256 or assessment.get('status')!='ACCEPTED_FOR_EDITORIAL_DRAFTS':
            ap.error('Pilota assente, respinto o relativo a un modello diverso')
    args.directory.mkdir(parents=True,exist_ok=True)
    raw_dir=args.directory/'inference';raw_dir.mkdir(exist_ok=True)
    taxonomy=load_taxonomy(ROOT/TAXONOMY_FILENAME)
    system=SYSTEM
    source_hash=hashlib.sha256(args.source.read_bytes()).hexdigest()
    manifest_path=args.directory/'manifest.json'
    manifest={'source':str(args.source.resolve()),'source_sha256':source_hash,'model':MODEL,
              'model_sha256':MODEL_SHA256,'system_prompt':system,'semantic_policy':SEMANTIC_POLICY,
              'independent_review':'NOT_RUN','human_review':'NOT_RUN'}
    policy=json.loads((ROOT/'resources/local_llm_policy.json').read_text(encoding='utf-8'))
    served=get_json(args.endpoint+'/v1/models')
    if not any(str(row.get('id','')).endswith(policy['model_file']) for row in served.get('data',[])):
        raise ValueError('Il server locale non sta servendo il modello registrato nella politica')
    if manifest_path.exists():
        previous=json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['version_check']=previous.get('version_check')
        if previous!=manifest:
            raise ValueError('Manifest diverso: non mescolare versioni del modello o della sorgente')
    else:manifest['version_check']=check_new_batch(policy)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    checkpoint=args.directory/'proposals.jsonl'
    completed={row['p']:row for row in read_jsonl(checkpoint)} if checkpoint.exists() else {}
    inputs=category_options(source_inputs(args.source,args.work,taxonomy),taxonomy)
    todo=[row for row in inputs if row['input']['p'] not in completed
          and (not args.prompts or row['input']['p'] in args.prompts)]
    if args.limit:todo=todo[:args.limit]
    batches=[todo[i:i+args.batch_size] for i in range(0,len(todo),args.batch_size)]
    start=time.monotonic();new=0;failures=[]
    with checkpoint.open('a',encoding='utf-8',buffering=1) as stream, ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(run_batch,b,args.endpoint,system,taxonomy,raw_dir) for b in batches]
        for future in as_completed(futures):
            rows,errors,attempts=future.result()
            for row in rows:
                if row['p'] in completed:raise ValueError('Risultato duplicato')
                stream.write(json.dumps(row,ensure_ascii=False)+'\n');completed[row['p']]=row;new+=1
            if errors:failures.append(errors)
            progress={'completed':len(completed),'target':len(inputs),'new':new,'elapsed_seconds':round(time.monotonic()-start,1),
                      'failed_batches':len(failures),'status':'EDITORIAL_PROPOSALS_NOT_QA_APPROVED'}
            (args.directory/'progress.json').write_text(json.dumps(progress,indent=2),encoding='utf-8')
            print(json.dumps(progress),flush=True)
    (args.directory/'failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2),encoding='utf-8')
    return int(bool(failures))


if __name__=='__main__':raise SystemExit(main())
