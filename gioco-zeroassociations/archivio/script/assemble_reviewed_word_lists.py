"""Assembla le scelte editoriali reali; le bozze locali non contano come revisioni.

Nessuna chiamata a LLM, rete o GPU. I controlli tecnici non approvano la semantica.
"""
from copy import deepcopy
import csv
import json
from pathlib import Path

from review_word_lists import load_lists,active_jsonl
from rewrite_pending_sets import WORD
from validate_word_association_it_v3_6_0 import load_taxonomy,TAXONOMY_FILENAME

ROOT=Path(__file__).parent
RES=ROOT/'resources'
DIRECTORY=ROOT/'rewritten-v3_6_0/lotto_0004_20261108'


def tsv(path):
    with path.open(encoding='utf-8',newline='') as stream:return list(csv.DictReader(stream,delimiter='\t'))


def assemble(directory=DIRECTORY):
    inputs,rows=load_lists(directory)
    taxonomy=load_taxonomy(ROOT/TAXONOMY_FILENAME)
    rows=deepcopy(rows)
    normal=json.loads((RES/'normalizzazioni_liste_20261109.json').read_text(encoding='utf-8'))
    for index,mapping in normal.items():
        row=rows[int(index)]
        for before,after in mapping.items():
            if before not in row['w']:raise ValueError(f'Normalizzazione non applicabile: {index}: {before}')
            row['w'][row['w'].index(before)]=after
            if 'a' in row:
                pair=next(a for a in row['a'] if a[0]==before);pair[0]=after
    for patch in tsv(RES/'correzioni_liste_20261109.tsv'):
        row=rows[int(patch['index'])];before=patch['old'];after=patch['new']
        if before not in row['w']:raise ValueError(f'Correzione non applicabile: {patch["index"]}: {before}')
        row['w'][row['w'].index(before)]=after
        if 'a' in row:
            pair=next(a for a in row['a'] if a[0]==before)
            pair[:]=[after,patch['relation'],patch['rationale']]
    manual=tsv(RES/'liste_riscritte_20261109.tsv')
    seen=set()
    for patch in manual:
        index=int(patch['index'])
        if index in seen:raise ValueError('Riscrittura manuale duplicata: '+str(index))
        seen.add(index)
        if inputs[index]['prompt']!=patch['prompt']:raise ValueError('Prompt cambiato: '+str(index))
        rows[index]={'index':index,'p':patch['prompt'],'s':patch['sense_description'],
                     'c':patch['category_id'],'w':patch['words'].split('|'),
                     'origin':'CHATGPT_EDITORIAL_REWRITE','rationales_status':'NOT_WRITTEN'}
    by_prompt={row['prompt']:row['index'] for row in inputs}
    individual=set()
    for patch in active_jsonl(RES/'revisioni_complete_20261109.jsonl'):
        index=by_prompt[patch['p']]
        rows[index]={**patch,'index':index,'w':[a[0] for a in patch['a']],
                     'origin':'CHATGPT_EDITORIAL_REWRITE_WITH_RATIONALES'}
        individual.add(index)
    coverage=set(individual)
    for report in active_jsonl(RES/'revisione_liste_20261109.jsonl'):
        if report['examined']!=report['end']-report['start']:
            raise ValueError('Copertura della revisione non documentata')
        coverage.update(range(report['start'],report['end']))
    if not coverage<=set(rows):raise ValueError('Dichiarata una revisione priva di lista')
    for index in coverage:
        row=rows[index];words=row['w']
        if row['p']!=inputs[index]['prompt']:raise ValueError('Prompt modificato')
        if len(words)!=7 or len(set(words))!=7 or row['p'] in words or any(not WORD.fullmatch(w) for w in words):
            raise ValueError('Set non canonico: '+str(index)+' '+str(words))
        if row.get('c',inputs[index]['previous_category']) not in taxonomy:
            raise ValueError('Categoria inesistente')
        row['selection_review']={'reviewer':'ChatGPT','kind':'EDITORIAL_WORD_LIST_REVIEW',
            'independent_retrieval_qa':False,'human_review':False,'approval':False}
    return inputs,rows,coverage


def main():
    inputs,rows,covered=assemble()
    missing=[i for i in range(len(inputs)) if i not in rows]
    without_rationales=sum('a' not in rows[i] for i in covered)
    print(json.dumps({'pending_input_sets':len(inputs),'available_drafts':len(rows),
        'editorially_reviewed_word_sets':len(covered),'not_editorially_reviewed':len(inputs)-len(covered),
        'missing_draft_indices':missing,'reviewed_sets_without_individual_rationales':without_rationales,
        'approved':0,'csv_exported':False},ensure_ascii=False))


if __name__=='__main__':main()
