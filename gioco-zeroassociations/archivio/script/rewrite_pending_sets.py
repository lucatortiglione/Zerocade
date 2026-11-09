"""Riscrittura semantica riprendibile dei set in revisione tramite inferenza locale.

Il modello genera proposte editoriali, NON verbali QA o prove indipendenti.
I prompt e gli originali restano immutati. Non esegue codice del modello.
"""
from __future__ import annotations
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import unicodedata
import urllib.request
import urllib.error

from semantic_rules import SOURCE_ONLY_REASON
from validate_word_association_it_v3_6_0 import RELATIONS

ROOT=Path(__file__).parent
WORD=re.compile(r'[a-zàèéìòù]+\Z')
HINTS={
    'anima':'Senso spirituale/interiore familiare; NON profilato metallico.',
    'alternativo':'Che offre un’altra possibilità o una soluzione diversa; NON motore meccanico.',
    'agitato':'Stato di irrequietezza emotiva di una persona; NON indicazione musicale.',
    'agonia':'Sofferenza nella fase precedente la morte; tono dignitoso e non macabro.',
    'agosto':'Mese estivo nel contesto italiano; NON frammenti del calendario giuliano.',
    'affresco':'Dipinto realizzato su intonaco; fresco qualifica intonaco e NON è una risposta.',
    'camerata':'Ambiente dormitorio collettivo: NO forma, rettangolare, compagnia o circolo.',
    'cassa':'Punto di un negozio dove si paga; NON passare al senso di cassa di risparmio.',
    'pongo':'Plastilina per modellare: NO descrittori generici materiale/plastico.',
    'terna':'Combinazione di tre numeri nel gioco del lotto: NO riempitivi numero/gruppo.',
}
INSTRUCTIONS='''Sei un redattore italiano di un gioco di associazioni per adulti di cultura media.
Il giocatore vede SOLTANTO la parola-contesto p. Deve indovinare sette parole associate.
Per OGNI contesto scegli PRIMA un significato quotidiano riconoscibile. Non scegliere sensi
tecnici rari per trovare sette parole; le categorie interne NON sono aiuti visibili.
Scrivi s = breve descrizione del senso; c = categoria pertinente del catalogo; pos = NOUN/VERB/ADJ.
Proponi a = sette terne [risposta, relazione, motivazione concreta].
Ogni risposta: UNA parola italiana minuscola, accenti corretti, niente spazi o nomi propri,
diversa dal contesto e dalle altre sei. Verbi ammessi all'infinito, nessuna quota obbligatoria.
Le motivazioni sono brevi fatti distinti (almeno 15 caratteri), non frasi come 'è associato a'.
Ogni risposta deve essere naturale anche senza leggere la motivazione o la fonte.
NON estrarre parole dalle descrizioni: fine da 'col fine di', forma da 'di forma rettangolare',
funzione da 'funzioni vitali' e giuliano da 'calendario giuliano' NON sono buone risposte.
Gli aggettivi devono descrivere direttamente il contesto, non un altro oggetto nominato.
Preferisci nomi concreti, azioni caratteristiche, elementi e contesti riconoscibili;
non riempire con cosa, oggetto, elemento, struttura, tipo, modo, generale, compito, momento.
Non usare più di due sinonimi o equivalenti dello stesso concetto; varia i contenuti.
Non accumulare derivati o flessioni; ogni parola deve aggiungere un contenuto diverso.
Un solo senso per l'intero set, stessa categoria. Niente esempi storici incidentali o dettagli
biografici; non trasformare un prompt comune in una definizione specialistica.
Niente volgarità, stereotipi, propaganda, descrizioni cruente o contenuti espliciti.
Se sono fornite parole già valutate, conservale SOLO se compatibili col senso familiare scelto.
Non simulare revisori indipendenti, giocatori, punteggi o prove umane.
Rispondi ESCLUSIVAMENTE con JSON {"items":[{"p":"contesto","s":"senso","c":"001","pos":"NOUN",
"a":[["parola","contesto","Fatto concreto che spiega il rapporto."],...]}]}.
Le relazioni consentite sono: '''+', '.join(sorted(RELATIONS))+'.\n'


def canonical(s):return unicodedata.normalize('NFC',s).casefold()


def read_jsonl(path):
    with path.open(encoding='utf-8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def schema(prompts,categories):
    answer={'type':'array','minItems':3,'maxItems':3,'prefixItems':[
        {'type':'string','pattern':'^[a-zàèéìòù]+$'},
        {'type':'string','enum':sorted(RELATIONS)},
        {'type':'string','minLength':15,'maxLength':180}]}
    item={'type':'object','properties':{
        'p':{'type':'string','enum':prompts},'s':{'type':'string','minLength':10,'maxLength':160},
        'c':{'type':'string','enum':list(categories)},'pos':{'type':'string','enum':['NOUN','VERB','ADJ']},
        'a':{'type':'array','minItems':7,'maxItems':7,'items':answer}},
        'required':['p','s','c','pos','a'],'additionalProperties':False}
    return {'type':'object','properties':{'items':{'type':'array','minItems':len(prompts),'maxItems':len(prompts),'items':item}},
            'required':['items'],'additionalProperties':False}


def validate(item,prompt,categories):
    errors=[]
    if item.get('p')!=prompt:errors.append('Prompt modificato o mancante')
    if len(str(item.get('s','')).strip())<10:errors.append('Descrizione del senso assente')
    if item.get('c') not in categories:errors.append('Categoria non valida')
    if item.get('pos') not in {'NOUN','VERB','ADJ'}:errors.append('POS non valida')
    pairs=item.get('a',[])
    if len(pairs)!=7 or any(not isinstance(p,list) or len(p)!=3 for p in pairs):
        return errors+['Servono sette risposte con relazione e motivazione']
    words=[p[0] for p in pairs]
    if len(set(words))!=7 or prompt in words:errors.append('Risposte duplicate o uguali al contesto')
    for word,relation,reason in pairs:
        if not isinstance(word,str) or not WORD.fullmatch(word) or canonical(word)!=word:errors.append('Parola non canonica: '+str(word))
        if relation not in RELATIONS:errors.append('Relazione non valida')
        if not isinstance(reason,str) or len(reason.strip())<15 or SOURCE_ONLY_REASON.fullmatch(reason):errors.append('Motivazione non specifica per '+str(word))
    if len({p[2].strip() for p in pairs})!=7:errors.append('Motivazioni ripetute')
    prohibited={'forma','rettangolare'} if prompt=='camerata' else {'fine','raccogliere'} if prompt=='cassa' else {'fresco'} if prompt=='affresco' else {'giuliano','gregoriano'} if prompt=='agosto' else {'funzione','momento','mancanza','temperatura'} if prompt=='agonia' else set()
    if prohibited & set(words):errors.append('Reintrodotte risposte già respinte nel caso specifico: '+','.join(sorted(prohibited&set(words))))
    return errors


def request(endpoint,system,inputs,categories,feedback=None):
    message={'contesti':inputs}
    if feedback:message['correzioni_obbligatorie']=feedback
    body={'messages':[{'role':'system','content':system},{'role':'user','content':json.dumps(message,ensure_ascii=False)}],
          'temperature':0.35,'top_p':0.9,'max_tokens':min(6500,len(inputs)*450+200),
          'cache_prompt':True,'chat_template_kwargs':{'enable_thinking':False},
          'response_format':{'type':'json_schema','json_schema':{'name':'editorial_sets','strict':True,
                              'schema':schema([i['p'] for i in inputs],categories)}}}
    req=urllib.request.Request(endpoint+'/v1/chat/completions',data=json.dumps(body,ensure_ascii=False).encode('utf-8'),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=600) as response:raw=json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError(f'HTTP {error.code}: '+error.read().decode('utf-8',errors='replace')[:1800]) from error
    choice=raw['choices'][0]
    if choice.get('finish_reason')=='length':raise ValueError('Risposta troncata dal limite token')
    return json.loads(choice['message']['content']),raw


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--endpoint',default='http://127.0.0.1:19471')
    ap.add_argument('--output',type=Path,default=ROOT/'rewritten-v3_6_0/lotto_0004_20261108')
    ap.add_argument('--source',type=Path,default=ROOT/'filtered-v3_6_0/lotto_0003_20261108/set_in_revisione_0003.jsonl')
    ap.add_argument('--limit',type=int)
    ap.add_argument('--batch-size',type=int,default=4)
    ap.add_argument('--experimental-local-drafts',action='store_true',
                    help='Solo esperimenti: il pilota locale è stato respinto, nessun export utilizzabile')
    args=ap.parse_args(argv)
    if not args.experimental_local_drafts:
        ap.error('Il pilota locale non ha superato il controllo semantico. Non usarlo per la riscrittura del lotto; questa modalità sperimentale richiede --experimental-local-drafts.')
    args.output.mkdir(parents=True,exist_ok=True)
    raw_dir=args.output/'inference';raw_dir.mkdir(exist_ok=True)
    with (ROOT/'tassonomia_word_association_it_172_categorie_v3_6_0.csv').open(encoding='utf-8') as stream:
        categories={r['category_id']:r for r in csv.DictReader(stream)}
    system=INSTRUCTIONS+'\nCATALOGO (id: categoria):\n'+'\n'.join(k+': '+r['category_name'] for k,r in categories.items())
    pending=read_jsonl(args.source)
    pending.sort(key=lambda r:(canonical(r['record']['prompt']) not in HINTS, canonical(r['record']['prompt'])))
    checkpoint=args.output/'editorial_drafts.jsonl'
    completed={r['p']:r for r in read_jsonl(checkpoint)} if checkpoint.exists() else {}
    todo=[r for r in pending if r['record']['prompt'] not in completed]
    if args.limit is not None:todo=todo[:args.limit]
    manifest={'source':str(args.source.resolve()),'source_sha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),
              'system_prompt':system,'endpoint':args.endpoint,'drafts_are_not_independent_qa':True,
              'started_at':datetime.now(timezone.utc).isoformat(),'intended_pending_sets':len(pending)}
    (args.output/'generation_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    started=time.monotonic();failures=[];generated=0;token_count=0
    for offset in range(0,len(todo),args.batch_size):
        batch=todo[offset:offset+args.batch_size]
        inputs=[]
        for entry in batch:
            p=entry['record']['prompt']; inp={'p':p}
            if p in HINTS:inp['senso_richiesto']=HINTS[p]
            if entry['filter']['retained_words'] and p not in {'cassa','terna'}:
                inp['parole_valutate_compatibili_da_conservare']=entry['filter']['retained_words']
            inputs.append(inp)
        errors={};accepted={}
        for attempt in range(3):
            try:
                result,raw=request(args.endpoint,system,inputs,categories,errors or None)
                token_count+=raw.get('usage',{}).get('completion_tokens',0)
                name=f'batch_{len(completed):05d}_{time.time_ns()}_{attempt}.json'
                (raw_dir/name).write_text(json.dumps({'input':inputs,'raw':raw},ensure_ascii=False),encoding='utf-8')
                by_prompt={i.get('p'):i for i in result.get('items',[])}
                errors={}
                for inp in inputs:
                    p=inp['p'];item=by_prompt.get(p,{})
                    problems=validate(item,p,categories)
                    if problems:errors[p]=problems
                    else:accepted[p]=item
                if not errors:break
            except Exception as error:
                errors={i['p']:[str(error)[:250]] for i in inputs}
        for inp in inputs:
            p=inp['p']
            if p not in accepted:
                failures.append({'prompt':p,'errors':errors.get(p,['Risposta mancante'])})
                continue
            item=accepted[p]
            item['generation']={'engine':'local_llama_cpp','editorial_proposal':True,
                                'independent_review':'NOT_RUN','human_review':'NOT_RUN'}
            with checkpoint.open('a',encoding='utf-8') as stream:stream.write(json.dumps(item,ensure_ascii=False)+'\n')
            completed[p]=item;generated+=1
        progress={'completed':len(completed),'target':len(pending),'generated_this_run':generated,
                  'elapsed_seconds':round(time.monotonic()-started,1),'completion_tokens':token_count,
                  'failures_this_run':len(failures),'last_batch':[i['p'] for i in inputs]}
        (args.output/'progress.json').write_text(json.dumps(progress,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(progress,ensure_ascii=False),flush=True)
    (args.output/'generation_failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2),encoding='utf-8')
    return int(bool(failures))


if __name__=='__main__':raise SystemExit(main())
