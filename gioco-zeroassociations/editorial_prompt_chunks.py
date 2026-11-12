"""Registra annotazioni editoriali esplicite sui candidati congelati, senza classificatori automatici.

Ogni indice deve avere una decisione del revisore. Le categorie non sono inferite
dal dizionario. Le correzioni di senso/POS sono conservate insieme all'input.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path

from prompt_database import ROOT,load_categories,digest

FOLDER=ROOT/'prompt-staging/reviews/completion_20261109_editorial'
REASONS={
 'generic':'Voce troppo generica in questo uso: non identifica un nucleo di associazioni proprio e riconoscibile.',
 'sense':'Occorre risolvere il contrasto fra significati quotidiani concorrenti prima di scegliere il senso del prompt.',
 'rare':'Il senso attestato è specialistico o poco familiare e non risulta riconoscibile senza un tema visibile.',
 'form':'La forma proposta non offre un lemma autonomo o una categoria grammaticale adatta nel senso considerato.',
 'offensive':'Il significato proposto è un epiteto offensivo o una designazione discriminatoria inadatta al catalogo del gioco.',
 'category':'La categoria del senso deve essere verificata prima dell\'ammissione del prompt.'}


def record_chunk(annotation):
    candidates=[json.loads(l) for l in (FOLDER/'candidates.jsonl').read_text(encoding='utf-8').splitlines()]
    start=annotation['start']; end=annotation['end']
    if type(start)is not int or type(end)is not int or not 0<=start<end<=len(candidates):
        raise ValueError('Intervallo non valido')
    decisions={}
    catalog=load_categories()
    for category,indices in annotation['categories'].items():
        if category not in catalog:raise ValueError('Categoria sconosciuta: '+category)
        for i in indices:
            if i in decisions:raise ValueError('Indice duplicato: '+str(i))
            decisions[i]={'decision':'verified','category_id':category}
    for kind in ('rejected','deferred'):
        for reason,indices in annotation.get(kind,{}).items():
            if reason not in REASONS:raise ValueError('Motivo sconosciuto')
            for i in indices:
                if i in decisions:raise ValueError('Indice duplicato: '+str(i))
                decisions[i]={'decision':kind,'reason':REASONS[reason]}
    if set(decisions)!=set(range(start,end)):
        raise ValueError('Indici mancanti o fuori intervallo: '+str(sorted(set(range(start,end))^set(decisions))))
    overrides={int(k):v for k,v in annotation.get('overrides',{}).items()}
    rows=[]
    for i in range(start,end):
        c=candidates[i];row={'prompt':c['prompt'],**decisions[i]}
        if row['decision']=='verified':
            correction=overrides.get(i,{})
            sense=correction.get('sense',c['gloss']).strip()
            pos=correction.get('pos',c['pos'])
            if len(sense)<15 or sense.lower().startswith(('definizione mancante',)):
                raise ValueError('Senso da correggere esplicitamente: '+str(i)+' '+c['prompt'])
            category=catalog[row['category_id']]['category_name']
            row.update(pos=pos,sense=sense,
                prompt_rationale=correction.get('rationale',f'Confermato il significato familiare di «{c["prompt"]}»: {sense}. Il controllo riguarda questo senso, non altri usi della voce.'),
                category_rationale=f'Il significato selezionato «{sense}» appartiene al dominio «{category}».')
        row['editorial_review']={'reviewer':'ChatGPT','method':'llm_editorial_review',
            'candidate_index':i,'candidate_sha256':digest(c),'source_pos':c['pos'],
            'source_gloss':c['gloss'],'explicit_annotation_sha256':digest(annotation),
            'reviewed_at':datetime.now(timezone.utc).isoformat(),'human_review':False,
            'independent_gameplay_qa':False}
        rows.append(row)
    folder=FOLDER/'annotations';folder.mkdir(exist_ok=True)
    path=folder/f'{start:05d}_{end:05d}.json'
    if path.exists() and json.loads(path.read_text(encoding='utf-8'))!=annotation:
        raise ValueError('Annotazione esistente diversa: non sovrascriverla')
    path.write_text(json.dumps(annotation,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    output=folder/f'{start:05d}_{end:05d}.jsonl'
    output.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
    all_rows=[]
    for p in sorted(folder.glob('*.jsonl')):all_rows+= [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines()]
    if len({r['prompt'] for r in all_rows})!=len(all_rows):raise ValueError('Intervalli sovrapposti')
    (FOLDER/'editorial_decisions.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in all_rows),encoding='utf-8')
    progress={'target':len(candidates),'reviewed':len(all_rows),'remaining':len(candidates)-len(all_rows),
        'decisions':dict(Counter(r['decision'] for r in all_rows)),
        'completed_chunks':len(list(folder.glob('*.jsonl'))),'reviewer':'ChatGPT'}
    (FOLDER/'progress.json').write_text(json.dumps(progress,indent=2)+'\n',encoding='utf-8')
    return progress


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file',type=Path)
    args=parser.parse_args()
    print(json.dumps(record_chunk(json.loads(args.file.read_text(encoding='utf-8'))),ensure_ascii=False))
