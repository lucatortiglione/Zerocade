"""Prepara riparazioni coerenti dei casi osservati e delle relative copie CSV.

Le fonti originarie rimangono negli archivi e i prompt non vengono eliminati.
"""
from copy import deepcopy
import argparse
import json
from pathlib import Path

from repair_candidates import read_jsonl, prepare_plan

ROOT=Path(__file__).parent


def editorial_bank():
    records=read_jsonl(ROOT/'generated-v3_6_0/word_association_it_5000_metadati_0003.jsonl')
    bank={}
    for row in records:
        revision=row.get('editorial_revision')
        if not revision:continue
        bank[row['prompt']]={'prompt':row['prompt'],'sense_description':revision['sense_description'],
            'answers':deepcopy(revision['word_reviews']),
            'category_id':row['category_id'],'sense_changed':revision.get('sense_changed',False)}
    source=ROOT/'resources/revisioni_screenshot_20261108.txt'
    for line in source.read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):continue
        prompt,sense,pairs=line.split('\t')
        answers=[]
        for pair in pairs.split(';'):
            word,rationale=pair.split('=',1)
            answers.append({'word':word,'relation':'contesto','rationale':rationale,'meaning_group':word})
        bank[prompt]={'prompt':prompt,'sense_description':sense,'answers':answers,
                      'sense_changed':prompt in {'tribuna','impoverire'}}
    for answer in bank['pongo']['answers']:
        if answer['word']=='modellazione':
            answer.update(word='figura',relation='effetto',meaning_group='figura',
                rationale='Con il pongo si modellano figure e forme tridimensionali.')
    equivalences={('difendere','salvaguardare'):'protezione',('difendere','proteggere'):'protezione',
        ('masso','macigno'):'grande_sasso',('masso','sasso'):'grande_sasso',
        ('improvviso','scatto'):'movimento_brusco',('improvviso','sussulto'):'movimento_brusco'}
    categories={'tribuna':'132','impoverire':'079','travestimento':'150',
                'masso':'037','tigre':'047','skateboard':'122'}
    for prompt,spec in bank.items():
        if prompt in categories:spec['category_id']=categories[prompt]
        for answer in spec['answers']:
            answer['meaning_group']=equivalences.get((prompt,answer['word']),answer['word'])
    return bank


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plans-directory',type=Path,required=True)
    args=parser.parse_args(argv)
    args.plans_directory.mkdir(parents=True,exist_ok=True)
    bank=editorial_bank()
    (ROOT/'resources/editorial_associations_it.jsonl').write_text(
        ''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in bank.values()),encoding='utf-8')
    folder=ROOT/'generated-v3_6_0'
    configurations=[('0003',folder/'word_association_it_5000_metadati_0003.jsonl',None),
        ('0002',folder/'word_association_it_5000_metadati_0002.jsonl',None),
        ('0001',folder/'word_association_it_5000_metadati.jsonl',
            [folder/'word_association_it_5000_candidati.csv',folder/'word_association_it_5000_gioco_0001.csv'])]
    plans=[]
    for batch,metadata,csvs in configurations:
        patches=[]
        for row in read_jsonl(metadata):
            spec=bank.get(row['prompt'])
            if not spec:continue
            words=[a['word'] for a in spec['answers']]
            if words==row['words']:continue
            patch=deepcopy(spec)
            patch.update(expected_words=row['words'],revision_id='20261108-SCREENSHOTS-2')
            patches.append(patch)
        revisions=args.plans_directory/f'revisions_{batch}.jsonl'
        with revisions.open('x',encoding='utf-8') as stream:
            for row in patches:stream.write(json.dumps(row,ensure_ascii=False)+'\n')
        plan=args.plans_directory/f'plan_{batch}.json'
        report=prepare_plan(folder,batch,revisions,plan,metadata,csvs)
        plans.append(str(plan.resolve()))
        print(json.dumps({'batch':batch,'new_revisions':len(patches),**report},ensure_ascii=False))
    (args.plans_directory/'plans.json').write_text(json.dumps(plans),encoding='utf-8')
    return 0


if __name__=='__main__':raise SystemExit(main())
