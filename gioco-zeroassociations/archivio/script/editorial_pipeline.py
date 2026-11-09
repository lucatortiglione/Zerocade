"""Produzione da selezioni editoriali; i token lessicali restano una modalità separata."""
from copy import deepcopy
import csv
import json
from pathlib import Path

from semantic_rules import SEMANTIC_POLICY, editorial_errors, screen_set


def partition_editorial(records, language_check):
    selected, pending = [], []
    seen = set()
    for record in records:
        prompt = record['prompt']
        if prompt in seen:
            raise ValueError(f'Due versioni selezionate per {prompt}')
        seen.add(prompt)
        errors = editorial_errors(record)
        language = language_check(record)
        if not language.get('accepted'):
            errors.append('Filtro lingua/familiarità: '+language.get('reason','non verificato'))
        if errors:
            pending.append({'prompt':prompt,'candidate_id':record['candidate_id'],
                            'record':record,'reasons':errors,'action':'Cercare alternative sullo stesso prompt'})
        else:
            row = deepcopy(record)
            row['prompt_familiarity'] = language
            row['status'] = 'CANDIDATO_DA_REVISIONARE'
            row['association_selection'] = {
                'policy':SEMANTIC_POLICY,'editorial_selection':'PROPOSED',
                'independent_review':'NOT_RUN','human_review':'NOT_RUN',
                'decision':'DA_RIVEDERE','screen_signals':screen_set(prompt,row['words'],row)['signals']}
            selected.append(row)
    assert len(selected)+len(pending)==len(records)
    return selected,pending


def produce_editorial(args, language_check):
    from generate_candidates import next_output_paths, cuid, export_public_csv, export_numbered_csv
    from validate_word_association_it_v3_6_0 import check_candidates_jsonl, load_taxonomy, check_csv
    taxonomy = load_taxonomy(args.taxonomy_csv)
    check = check_candidates_jsonl(args.editorial_jsonl,taxonomy)
    if check['errors_count']:
        raise ValueError('Metadati di origine non conformi: '+str(check['errors']))
    with args.editorial_jsonl.open(encoding='utf-8-sig') as stream:
        records = [json.loads(line) for line in stream if line.strip()]
    selected,pending = partition_editorial(records,language_check)
    args.output.mkdir(parents=True,exist_ok=True)
    sequence,paths = next_output_paths(args.output,args.count)
    report = {'schema_version':'word-association-generation-3.6.0',
        'semantic_policy_version':SEMANTIC_POLICY,'file_sequence':f'{sequence:04d}',
        'generation_stage':'EDITORIAL_SELECTION','input_prompts':len(records),
        'selected':min(len(selected),args.count),'pending':len(pending),
        'approved':0,'independent_review':'NOT_RUN','human_review':'NOT_RUN'}
    if pending:
        with paths['pending'].open('x',encoding='utf-8') as stream:
            for row in pending:stream.write(json.dumps(row,ensure_ascii=False)+'\n')
        report['pending_jsonl']=str(paths['pending'])
    if len(selected)<args.count:
        report['status']='UNDER_YIELD_EDITORIAL_REVIEW_REQUIRED'
        report['csv_exported']=False
        with paths['report'].open('x',encoding='utf-8') as stream:
            json.dump(report,stream,ensure_ascii=False,indent=2)
        print(json.dumps(report,ensure_ascii=False,indent=2))
        return 2
    chosen=selected[:args.count]
    for index,row in enumerate(chosen):
        row['origin_candidate_id']=row['candidate_id']
        row['candidate_id']=f'{args.batch_id}-{index+1}'
        row['batch_id']=args.batch_id
        row['parent_candidate_id']=None
        row['repair_attempt']=0
        row['ref']=cuid(index)
        row['ordine']=index+1
        for field in ('blind_test','semantic_review','safety_review'):
            row[field]=None
    # I record oltre al volume richiesto rimangono nel file di origine.
    with paths['game'].open('x',encoding='utf-8',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(['ref','source','language','prompt','words'])
        writer.writerows([r['ref'],'platform','it',r['prompt'],'|'.join(r['words'])] for r in chosen)
    with paths['metadata'].open('x',encoding='utf-8') as stream:
        for row in chosen:stream.write(json.dumps(row,ensure_ascii=False)+'\n')
    export_public_csv(paths['game'],paths['candidates'])
    if args.with_order:export_numbered_csv(paths['candidates'],paths['numbered'])
    report.update(status='CANDIDATI_NON_APPROVATI',csv_exported=True,
                  candidate_csv=str(paths['candidates']),csv=check_csv(paths['game'],min_rows=args.count),
                  candidates=check_candidates_jsonl(paths['metadata'],taxonomy))
    with paths['report'].open('x',encoding='utf-8') as stream:
        json.dump(report,stream,ensure_ascii=False,indent=2)
    print(json.dumps({key:report[key] for key in ('status','selected','pending','approved','candidate_csv')},ensure_ascii=False))
    return int(report['csv']['errors_count']>0 or report['candidates']['errors_count']>0)
