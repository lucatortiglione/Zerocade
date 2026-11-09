"""Bozze lessicali locali in quarantena: nessuna selezione o esportazione CSV.

La revisione editoriale successiva deve leggere ogni lista; i JSON validi non
provano la pertinenza delle associazioni. Non modifica originali o bozze esistenti.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import time
import urllib.request

from assemble_rewritten_sets import collect
from rewrite_pending_sets import read_jsonl, WORD
from validate_word_association_it_v3_6_0 import load_taxonomy,TAXONOMY_FILENAME

ROOT=Path(__file__).parent
SYSTEM='''Proponi parole per un gioco italiano di associazioni. Il giocatore vede il
contesto p e deve indovinare sette parole. Scegli un solo senso familiare e naturale.
Ogni risposta è una parola italiana minuscola, diversa dal contesto. Nomi singolari,
verbi all'infinito facoltativi. Niente sinonimi ripetuti, derivati tautologici,
parole generiche, frammenti di frasi o dettagli di definizioni. Ogni parola deve
avere un nesso diretto, riconoscibile e diverso dalle altre sei.
Rispondi JSON {"items":[{"p":"contesto","s":"significato scelto","w":[sette parole]}]}.
Esempi: skateboard: tavola, ruota, rampa, equilibrio, salto, pista, casco.
tigre: felino, ruggito, zanna, artiglio, striscia, predatore, giungla.
agosto: estate, caldo, vacanza, ferragosto, mare, ombrellone, anguria.
Preferisci associazioni quotidiane; non estrarre parole dalle definizioni.
'''


def generate(batch,endpoint,raw_dir):
    prompts=[r['prompt'] for r in batch]
    schema={'type':'object','properties':{'items':{'type':'array','minItems':len(prompts),'maxItems':len(prompts),
      'items':{'type':'object','properties':{'p':{'type':'string','enum':prompts},
        's':{'type':'string','minLength':10,'maxLength':120},
        'w':{'type':'array','minItems':7,'maxItems':7,'items':{'type':'string','pattern':'^[a-zàèéìòù]+$'}}},
      'required':['p','s','w'],'additionalProperties':False}}},'required':['items'],'additionalProperties':False}
    feedback={};accepted={}
    for attempt in range(4):
        body={'messages':[{'role':'system','content':SYSTEM},
                          {'role':'user','content':json.dumps({'contesti':prompts,'correzioni':feedback},ensure_ascii=False)}],
              'temperature':0.5,'max_tokens':len(prompts)*200+200,'cache_prompt':True,
              'response_format':{'type':'json_schema','json_schema':{'name':'word_drafts','strict':True,'schema':schema}}}
        req=urllib.request.Request(endpoint+'/v1/chat/completions',data=json.dumps(body,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=300) as response:raw=json.load(response)
            (raw_dir/f'{batch[0]["index"]:05d}_{time.time_ns()}.json').write_text(json.dumps(raw,ensure_ascii=False),encoding='utf-8')
            if raw['choices'][0].get('finish_reason')=='length':raise ValueError('Risposta troncata')
            by_p={r.get('p'):r for r in json.loads(raw['choices'][0]['message']['content'])['items']}
            feedback={}
            for original in batch:
                p=original['prompt'];row=by_p.get(p,{})
                words=row.get('w',[])
                if len(words)!=7 or len(set(words))!=7 or p in words or any(not WORD.fullmatch(w) for w in words):
                    feedback[p]='Servono sette parole singole distinte, diverse dal contesto.'
                else:accepted[p]={**row,'index':original['index'],'status':'UNREVIEWED_LOCAL_DRAFT'}
            if not feedback:break
        except Exception as error:feedback={'error':str(error)}
    return list(accepted.values()),feedback


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--directory',type=Path,default=ROOT/'rewritten-v3_6_0/lotto_0004_20261108')
    ap.add_argument('--endpoint',default='http://127.0.0.1:19472')
    ap.add_argument('--limit',type=int)
    args=ap.parse_args()
    work=args.directory/'work';out=args.directory/'quarantine_gemma_20261109';out.mkdir(exist_ok=True)
    raw_dir=out/'inference';raw_dir.mkdir(exist_ok=True)
    taxonomy=load_taxonomy(ROOT/TAXONOMY_FILENAME)
    inputs,drafts,_,_=collect(work,taxonomy)
    checkpoint=out/'word_drafts.jsonl'
    completed={r['p']:r for r in read_jsonl(checkpoint)} if checkpoint.exists() else {}
    todo=[r for r in inputs if r['index'] not in drafts and r['prompt'] not in completed]
    if args.limit:todo=todo[:args.limit]
    batches=[todo[i:i+6] for i in range(0,len(todo),6)]
    start=time.monotonic();failures=[]
    with checkpoint.open('a',encoding='utf-8',buffering=1) as stream,ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(generate,b,args.endpoint,raw_dir) for b in batches]
        for future in as_completed(futures):
            rows,errors=future.result()
            for row in rows:
                if row['p'] in completed:continue
                stream.write(json.dumps(row,ensure_ascii=False)+'\n');completed[row['p']]=row
            if errors:failures.append(errors)
            progress={'new_unreviewed_drafts':len(completed),'existing_editorial_drafts':len(drafts),
                      'target_pending_sets':len(inputs),'failed_batches':len(failures),'seconds':round(time.monotonic()-start)}
            (out/'progress.json').write_text(json.dumps(progress,indent=2),encoding='utf-8')
            print(json.dumps(progress),flush=True)
    (out/'failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':main()
