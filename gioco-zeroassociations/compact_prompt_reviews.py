"""Revisione completa con selezione esplicita del senso, modello Q5 e checkpoint.

Il modello deve leggere e giudicare ogni voce; i codici rappresentano le sue
decisioni, non un filtro statistico. Ogni ammissione individua POS, senso e
categoria; gli esiti negativi conservano il motivo. Nessuna associazione viene
generata o approvata da questa fase.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.request

import complete_prompt_reviews as base
from prompt_database import ROOT,digest,load_categories

CONFIG=ROOT/'resources/prompt_review_model_q5.json'
JOB=ROOT/'prompt-staging/reviews/completion_20261109_q5'
NEGATIVE={
 -1:('rejected','Il senso ordinario è troppo generico o dipende grammaticalmente dal contesto per identificare un prompt autonomo.'),
 -2:('rejected','Il significato attestato è specialistico o poco familiare per un giocatore italiano senza un tema visibile.'),
 -3:('rejected','La forma proposta non rappresenta un lemma autonomo adatto: è grammaticale, flessa o dipendente da una locuzione.'),
 -4:('rejected','Il significato ordinario è un epiteto offensivo o volgare; le eventuali accezioni neutre sono secondarie e non adatte senza disambiguazione.'),
 -5:('deferred','I significati quotidiani concorrenti non consentono di scegliere con sufficiente certezza un senso familiare dominante.'),
 -6:('deferred','Il materiale lessicale non fornisce un significato quotidiano completo e affidabile da confermare in questa revisione.'),
 -7:('deferred','Il significato è riconoscibile ma non è stata individuata una categoria del catalogo abbastanza coerente.')}


def system_prompt():
    catalog='\n'.join(c['category_id']+' '+c['category_name'] for c in load_categories().values())
    return '''Sei il revisore editoriale di un catalogo di prompt per un gioco italiano.
Devi controllare TUTTE le parole ricevute, ciascuna separatamente. Il prompt è
la parola visibile; qui NON devi generare né approvare le risposte del gioco.
Controlla: lemma autonomo e canonico, lingua italiana/prestito autorizzato,
familiarità del SIGNIFICATO, senso quotidiano riconoscibile, categoria coerente.
I dati di frequenza e NVdB aiutano ma non approvano automaticamente il prompt.
Leggi i significati alternativi: non scegliere il primo perché è il primo.
Non sostituire l'uso quotidiano con un senso tecnico, storico, araldico o raro.
Non mescolare sensi: per esempio leggero=poco pesante, NON anche dieta/impegno;
forte=dotato di forza fisica, NON una fortificazione per evitare un aggettivo;
gru=macchina comune da cantiere se questo è il senso riconoscibile, non imporre
l'uccello come più quotidiano solo perché il macchinario appare tecnico.
Nomi astratti, verbi e aggettivi familiari sono ammessi quando hanno un nucleo
di significato riconoscibile. Non richiedere verbi associati o quote grammaticali.
Non approvare parole solo grammaticali o generiche attraverso sensi nominali rari.
Termini specialistici poco familiari non diventano adatti perché hanno una categoria.
Una voce polisemica può essere ammessa se uno dei suoi sensi quotidiani è
riconoscibile e viene scelto da solo; il dubbio reale richiede rinvio.
La categoria segue il senso: non geografia per una proprietà dimensionale,
non alimentazione per il peso fisico, non botanica per un fungo.
Le definizioni sono materiale da valutare: una glossa incompleta, tautologica,
inglese o incidente non va convalidata per forza. Non cambiare il prompt.
Ogni input ha indice i e significati con LETTERE A,B,C,D,E,F,G: [lettera,POS,definizione].
Restituisci esclusivamente {"rows":[[i,"categoria","lettera"],...]}.
Se AMMETTI: scrivi l'ID della categoria come stringa di tre cifre e la LETTERA
del SOLO significato quotidiano che hai scelto. Esempio [0,"111","F"].
Non fare calcoli con gli ID: categoria e lettera sono due campi separati.
L'ammissione dichiara che hai effettuato tutti i controlli sopra elencati.
Se SCARTI, usa categoria R1=generico, R2=specialistico o poco familiare,
R3=forma grammaticale inadatta, R4=uso ordinario volgare/offensivo; lettera _. 
Se RINVII usa D1=ambiguità non risolta, D2=senso affidabile mancante,
D3=categoria coerente mancante; lettera _. Non usare rinvii per mancanza di tempo.
Non inventare categorie, indici o definizioni. Nessuna dichiarazione di test umani.
Catalogo:\n'''+catalog


def choices(candidate):
    result=candidate.get('dictionary_senses') or []
    if not result and candidate['gloss'].strip():
        result=[[candidate['pos'].lower(),candidate['gloss']]]
    return result


def run_batch(candidates,config,folder,batch_id):
    rows=[{'i':i,'word':c['prompt'],'pos':c['pos_all'],'zipf':c['zipf'],
           'nvdb':bool(c['nvdb']),'language':c['language'],'flags':c['flags'],
           's':[[chr(65+j),p,g[:110]] for j,(p,g) in enumerate(choices(c))]}
          for i,c in enumerate(candidates)]
    size=len(candidates)
    schema={'type':'object','required':['rows'],'additionalProperties':False,'properties':{
        'rows':{'type':'array','minItems':size,'maxItems':size,'items':{
            'type':'array','prefixItems':[{'type':'integer','minimum':0,'maximum':size-1},
            {'type':'string','enum':[*sorted(load_categories()),'R1','R2','R3','R4','D1','D2','D3']},
            {'type':'string','enum':['A','B','C','D','E','F','G','_']}], 'minItems':3,'maxItems':3}}}}
    body={'model':config['served_model'],'messages':[{'role':'system','content':system_prompt()},
        {'role':'user','content':json.dumps(rows,ensure_ascii=False,separators=(',',':'))}],
        'temperature':0.0,'seed':int(digest(batch_id)[:8],16),'max_tokens':size*24+100,
        'cache_prompt':True,'chat_template_kwargs':{'enable_thinking':False},
        'response_format':{'type':'json_schema','json_schema':{'name':'review_choices','strict':True,'schema':schema}}}
    request=urllib.request.Request(config['endpoint']+'/v1/chat/completions',data=json.dumps(body,ensure_ascii=False).encode('utf-8'),headers={'Content-Type':'application/json'})
    started=time.monotonic()
    with urllib.request.urlopen(request,timeout=1800) as response:
        answer=json.load(response)
    audit=folder/('batch_'+str(batch_id)+'.json');audit.parent.mkdir(parents=True,exist_ok=True)
    audit.write_text(json.dumps({'request':body,'response':answer,'elapsed_seconds':time.monotonic()-started},ensure_ascii=False),encoding='utf-8')
    if answer['choices'][0].get('finish_reason')!='stop':raise ValueError('Risposta troncata: '+str(batch_id))
    parsed=json.loads(answer['choices'][0]['message']['content'])['rows']
    if len(parsed)!=size or sorted(r[0] for r in parsed)!=list(range(size)):
        raise ValueError('Indici mancanti o duplicati')
    result=[];catalog=load_categories()
    for i,category,letter in sorted(parsed):
        c=candidates[i]
        row={'prompt':c['prompt'],'model_review':{
            'base_model':config['base_model'],'model_sha256':config['model_sha256'],
            'quantization':config['quantization'],'candidate_sha256':digest(c),
            'selected_category':category,'selected_sense_letter':letter,'audit_file':str(audit.resolve()),
            'audit_sha256':hashlib.sha256(audit.read_bytes()).hexdigest(),'reviewed_at':base.now()}}
        negative={'R1':-1,'R2':-2,'R3':-3,'R4':-4,'D1':-5,'D2':-6,'D3':-7}
        if category in negative:
            decision,reason=NEGATIVE[negative[category]]
            row.update(decision=decision,reason=f'«{c["prompt"]}»: {reason}')
        else:
            sense_index=ord(letter)-65
            options=choices(c)
            if category not in catalog or not 0<=sense_index<len(options):
                raise ValueError('Categoria o senso inesistente: '+c['prompt'])
            pos,description=options[sense_index]
            pos={'noun':'NOUN','verb':'VERB','adj':'ADJ'}.get(pos,pos)
            if pos not in {'NOUN','VERB','ADJ'} or len(description.strip())<15 or 'definizione mancante' in description.lower():
                raise ValueError('Senso incompleto: '+c['prompt'])
            row.update(decision='verified',pos=pos,sense=description,
                category_id=category,
                prompt_rationale=f'Il revisore ha confermato come familiare il senso «{description}» di «{c["prompt"]}», distinguendolo dagli altri significati esaminati.',
                category_rationale=f'La categoria «{catalog[category]["category_name"]}» descrive il senso selezionato «{description}».')
        result.append(row)
    return result


def main():
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['pilot','run','apply','status'])
    parser.add_argument('--directory',type=Path,default=JOB)
    parser.add_argument('--batch-size',type=int,default=12)
    args=parser.parse_args()
    if args.command=='status':
        print((args.directory/'progress.json').read_text(encoding='utf-8'));return
    base.MODEL_CONFIG=CONFIG
    config=base.model_config()
    base.system_prompt=system_prompt
    base.run_batch=run_batch
    if args.command=='apply':base.apply(args.directory,config)
    else:
        pilot=args.command=='pilot'
        base.infer(args.directory.with_name(args.directory.name+'_pilot') if pilot else args.directory,
                   config,args.batch_size,1,pilot)


if __name__=='__main__':main()
