"""Pilota di pertinenza delle associazioni: inferenza reale, nessuna scrittura nei DB.

Le attese sono decisioni editoriali per i significati e le motivazioni indicati.
Un pilota superato non equivale a QA indipendente del gioco né certifica altre coppie.
"""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.request

from association_catalog import rule_hashes
from prompt_database import ROOT

# prompt, senso scelto, proposta, motivazione proposta, attesa
CASES=[
 ('pongo','Pasta colorata da modellare','orango','Pongo è anche il nome di un genere di oranghi.','R'),
 ('pongo','Pasta colorata da modellare','modellare','Il pongo viene lavorato con le mani per modellare forme.','A'),
 ('skateboard','Tavola con ruote usata per muoversi e fare acrobazie','manubrio','Lo skateboard si distingue da altri mezzi perché è senza manubrio.','R'),
 ('skateboard','Tavola con ruote usata per muoversi e fare acrobazie','ruota','Le ruote permettono alla tavola dello skateboard di muoversi.','A'),
 ('rugby','Sport di squadra giocato con palla ovale','secolo','Il rugby nacque nel diciannovesimo secolo.','R'),
 ('rugby','Sport di squadra giocato con palla ovale','meta','Nel rugby la meta è una segnatura realizzata oltre la linea avversaria.','A'),
 ('aria','Miscela di gas che forma l’atmosfera terrestre','misura','L’azoto è presente nell’aria in misura prevalente.','R'),
 ('aria','Miscela di gas che forma l’atmosfera terrestre','ossigeno','L’ossigeno è uno dei gas presenti nell’aria.','A'),
 ('cosplay','Travestimento che riproduce un personaggio di opere di fantasia','pensare','Si imita il modo di agire e pensare del personaggio.','R'),
 ('cosplay','Travestimento che riproduce un personaggio di opere di fantasia','costume','Il costume riproduce l’abbigliamento del personaggio interpretato.','A'),
 ('gufo','Uccello rapace prevalentemente notturno','disco','Il gufo presenta un disco facciale.','R'),
 ('gufo','Uccello rapace prevalentemente notturno','notte','Il gufo è un rapace comunemente associato all’attività notturna.','A'),
 ('spandere','Spargere un liquido o un materiale su una superficie','coerenza','Il materiale viene distribuito con regolarità e coerenza.','R'),
 ('spandere','Spargere un liquido o un materiale su una superficie','spargere','Spandere e spargere indicano la diffusione di un materiale.','A'),
 ('esperto','Persona dotata di conoscenze e pratica in un settore','digiuno','Essere digiuno di una materia significa non conoscerla.','R'),
 ('esperto','Persona dotata di conoscenze e pratica in un settore','esperienza','L’esperto ha acquisito esperienza nella materia.','A'),
 ('coagulazione','Processo per cui il sangue forma un coagulo','formazione','La coagulazione è la formazione di un coagulo nel sangue.','R'),
 ('coagulazione','Processo per cui il sangue forma un coagulo','sangue','La coagulazione nel senso selezionato è un processo del sangue.','A'),
 ('tribuna','Struttura con posti per assistere a eventi e spettacoli','clero','Nell’architettura religiosa un’altra tribuna può essere riservata al clero.','R'),
 ('tribuna','Struttura con posti per assistere a eventi e spettacoli','spettatore','Lo spettatore prende posto nella tribuna per assistere all’evento.','A'),
 ('impoverire','Rendere una persona economicamente più povera','ragionamento','Un ragionamento può essere impoverito di contenuto nel senso figurato.','R'),
 ('impoverire','Rendere una persona economicamente più povera','ricchezza','Impoverire una persona ne riduce la ricchezza.','A'),
 ('tigre','Grande felino dal mantello striato','classificazione','La classificazione scientifica identifica la specie della tigre.','R'),
 ('tigre','Grande felino dal mantello striato','artiglio','Gli artigli permettono alla tigre di trattenere le prede.','A'),
 ('tagliere','Supporto rigido su cui tagliare alimenti','piegare','Il tagliere deve essere rigido e non piegarsi durante il taglio.','R'),
 ('tagliere','Supporto rigido su cui tagliare alimenti','coltello','Sul tagliere si usa il coltello per tagliare gli alimenti.','A'),
 ('chitarra','Strumento musicale a corde pizzicate','familiare','La chitarra viene descritta come diffusa nell’ambiente familiare.','R'),
 ('chitarra','Strumento musicale a corde pizzicate','corda','Le corde vibrano per produrre i suoni della chitarra.','A'),
 ('sottomarino','Mezzo navale capace di navigare sott’acqua','operare','Il sottomarino può operare sott’acqua.','R'),
 ('sottomarino','Mezzo navale capace di navigare sott’acqua','immersione','L’immersione porta il sottomarino sotto la superficie dell’acqua.','A'),
 ('camerata','Grande dormitorio condiviso, tipico della caserma','forma','Una camerata può essere una camera di forma rettangolare.','R'),
 ('camerata','Grande dormitorio condiviso, tipico della caserma','branda','Le brande sono letti semplici usati nella camerata.','A'),
]

SYSTEM='''Sei un revisore editoriale di associazioni di parole per un gioco italiano.
Il giocatore vede il prompt e deve indovinare risposte nascoste autonome. Per ogni
coppia ricevuta, giudica la proposta NEL SOLO significato indicato, e la sua motivazione.
A = ammetti soltanto se hai controllato tutte queste condizioni: stesso senso;
parola autonoma; associazione naturale e riconoscibile; contributo specifico;
assenza di dettagli incidentali; polarità e ruoli corretti; lemma dal significato fedele.
R = respingi quando un difetto è chiaro. D = dubbio reale da risolvere.
La sola verità di una frase non dimostra una buona associazione giocabile.
Non accettare metadescrittori generici, parole di servizio, un frammento che richiede
un complemento assente o una qualità che appartiene a un altro nome della fonte.
Una negazione non prova una caratteristica presente. Una relazione in un'altra
accezione non vale per quella scelta. Non cambiare il senso per salvare la risposta.
Puoi ammettere termini tecnici specifici e coerenti; la difficoltà non risolve
genericità o legami deboli. Non richiedere verbi, non approvare sinonimi a priori.
Non creare blacklist globali: valuta ogni coppia separatamente.
In r scrivi un motivo concreto della decisione, non una formula di approvazione.
Non dichiarare test umani o QA indipendente. Rispondi solo nel formato JSON richiesto.'''


def run(endpoint,model,folder,batch_size=8):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    manifest={'purpose':'association semantic quality pilot; no DB writes',
        'model':model,'model_sha256':'7897d2c5a5cee46aef50895141b2c8a0803c1185f3d03c4fda4cd137a7ad77fe',
        'quantization':'IQ2_S','base_model':'Qwen/Qwen3.8-27B',
        'rule_files_sha256':rule_hashes(),'cases':CASES,'system':SYSTEM,'created_at':datetime.now(timezone.utc).isoformat()}
    with (folder/'manifest.json').open('x',encoding='utf-8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
    result=[]
    for start in range(0,len(CASES),batch_size):
        cases=CASES[start:start+batch_size]
        inputs=[{'i':start+i,'prompt':p,'sense':s,'word':w,'proposed_rationale':r} for i,(p,s,w,r,_) in enumerate(cases)]
        schema={'type':'object','required':['rows'],'additionalProperties':False,'properties':{'rows':{
            'type':'array','minItems':len(cases),'maxItems':len(cases),'items':{
                'type':'object','required':['i','d','r'],'additionalProperties':False,'properties':{
                    'i':{'type':'integer'},'d':{'type':'string','enum':['A','R','D']},
                    'r':{'type':'string','minLength':25,'maxLength':170}}}}}}
        body={'model':model,'messages':[{'role':'system','content':SYSTEM},
            {'role':'user','content':json.dumps(inputs,ensure_ascii=False)}],'temperature':0,
            'max_tokens':len(cases)*100,'seed':20261109+start,'cache_prompt':True,
            'chat_template_kwargs':{'enable_thinking':False},
            'response_format':{'type':'json_schema','json_schema':{'name':'association_quality','strict':True,'schema':schema}}}
        started=time.monotonic()
        request=urllib.request.Request(endpoint+'/v1/chat/completions',data=json.dumps(body,ensure_ascii=False).encode('utf-8'),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=1800) as response:answer=json.load(response)
        audit={'request':body,'response':answer,'elapsed_seconds':time.monotonic()-started}
        with (folder/f'batch_{start:03d}.json').open('x',encoding='utf-8') as f:json.dump(audit,f,ensure_ascii=False,indent=2)
        if answer['choices'][0]['finish_reason']!='stop':raise ValueError('Risposta troncata: nessuna valutazione conclusiva')
        rows=json.loads(answer['choices'][0]['message']['content'])['rows']
        if sorted(r['i'] for r in rows)!=list(range(start,start+len(cases))):raise ValueError('Indici mancanti o duplicati')
        for row in sorted(rows,key=lambda r:r['i']):
            p,s,w,r,expected=CASES[row['i']]
            result.append({**row,'prompt':p,'word':w,'expected':expected,'matches_editorial_expectation':row['d']==expected})
        progress={'tested':len(result),'target':len(CASES),'false_acceptances':sum(r['d']=='A' and r['expected']=='R' for r in result),'decisions':result}
        (folder/'progress.json').write_text(json.dumps(progress,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in progress.items() if k!='decisions'}),flush=True)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--endpoint',default='http://127.0.0.1:19475')
    p.add_argument('--model',default='qwen38-association-pilot-iq2')
    p.add_argument('--directory',type=Path,default=ROOT/'prompt-staging/associations/pilot_iq2_20261109')
    args=p.parse_args();run(args.endpoint,args.model,args.directory)
