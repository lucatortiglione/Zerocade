"""Riunisce le riscritture editoriali mantenendo tutti i contesti del lotto.

Rifiuta consegne parziali, duplicati o revisioni che cambiano il prompt.
Produce matrici JSON per l'export CSV e metadati non approvati dal QA.
"""
from __future__ import annotations
import argparse
from collections import Counter
from copy import deepcopy
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil

from rewrite_pending_sets import validate, read_jsonl
from semantic_rules import SEMANTIC_POLICY, editorial_errors
from generate_candidates import cuid
from validate_word_association_it_v3_6_0 import load_taxonomy, check_candidates_jsonl, TAXONOMY_FILENAME

ROOT=Path(__file__).parent


def generation_agent(index):
    if index<100:return 'root'
    if 100<=index<200 or 400<=index<2000:return 'a'
    if 200<=index<300 or 2000<=index<3500:return 'b'
    return 'c'


def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def write_jsonl(path,records):
    with path.open('x',encoding='utf-8') as stream:
        for record in records:stream.write(json.dumps(record,ensure_ascii=False)+'\n')


def collect(work,categories,require_complete=False):
    inputs=read_jsonl(work/'input.jsonl')
    drafts={}; partial=[]
    for path in sorted(work.glob('draft_*.jsonl')):
        match=re.fullmatch(r'draft_(\d+)_(\d+)\.jsonl',path.name)
        if not match:continue
        start,end=map(int,match.groups())
        try:rows=read_jsonl(path)
        except (ValueError,OSError):partial.append(path.name);continue
        if len(rows)!=end-start:
            partial.append(path.name);continue
        for index,row in zip(range(start,end),rows):
            if index>=len(inputs) or row.get('index')!=index or row.get('p')!=inputs[index]['prompt']:
                raise ValueError(f'Indice/prompt discordante in {path.name}: {index}')
            errors=validate(row,inputs[index]['prompt'],categories)
            if errors:raise ValueError(f'{row["p"]}: {errors}')
            if index in drafts:raise ValueError(f'Riscrittura duplicata: {index}')
            drafts[index]=row
    review_changes=[]
    for path in sorted(work.glob('review_*.jsonl')):
        report_path=path.with_name(path.stem+'_report.json')
        if not report_path.exists():
            partial.append(path.name);continue
        report=json.loads(report_path.read_text(encoding='utf-8'))
        if report.get('changed')!=len(read_jsonl(path)):
            raise ValueError('Numero revisioni discordante: '+path.name)
        for row in read_jsonl(path):
            index=row['index']
            if index not in drafts:raise ValueError('Revisione priva di bozza: '+str(index))
            errors=validate(row,inputs[index]['prompt'],categories)
            if errors or row['p']!=inputs[index]['prompt']:raise ValueError(f'Revisione non valida: {path.name}: {index}: {errors}')
            review_changes.append({'index':index,'prompt':row['p'],'file':path.name})
            drafts[index]=row
    if require_complete and set(drafts)!=set(range(len(inputs))):
        missing=sorted(set(range(len(inputs)))-set(drafts))
        raise ValueError(f'Copertura incompleta: {len(drafts)}/{len(inputs)}, primi mancanti {missing[:10]}')
    return inputs,drafts,partial,review_changes


def review_coverage(work):
    covered=set(); reports=[]
    for path in sorted(work.glob('review_*_report.json')):
        match=re.fullmatch(r'review_(\d+)_(\d+)_by_[a-z]+_report\.json',path.name)
        if not match:continue
        start,end=map(int,match.groups())
        report=json.loads(path.read_text(encoding='utf-8'))
        if report.get('examined')!=end-start:
            raise ValueError('Copertura della revisione non corrispondente: '+path.name)
        if not path.with_name(path.name.replace('_report.json','.jsonl')).exists():
            continue
        reviewer=re.search(r'_by_([a-z]+)_report',path.name).group(1)
        if any(generation_agent(index)==reviewer for index in range(start,end)):
            raise ValueError('La revisione trasversale coincide con il generatore: '+path.name)
        covered.update(range(start,end));reports.append({'file':path.name,'start':start,'end':end,'reviewer':reviewer,**report})
    return covered,reports


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--directory',type=Path,default=ROOT/'rewritten-v3_6_0/lotto_0004_20261108')
    ap.add_argument('--source-directory',type=Path,default=ROOT/'generated-v3_6_0')
    ap.add_argument('--status',action='store_true')
    args=ap.parse_args(argv)
    work=args.directory/'work'
    taxonomy=load_taxonomy(ROOT/TAXONOMY_FILENAME)
    inputs,drafts,partial,reviews=collect(work,taxonomy,require_complete=not args.status)
    covered,review_reports=review_coverage(work)
    if args.status:
        print(json.dumps({'complete_drafts':len(drafts),'target':len(inputs),
                          'partial_files':partial,'editorial_review_patches':len(reviews),
                          'editorially_cross_reviewed':len(covered)},ensure_ascii=False))
        return 0
    if covered!=set(range(len(inputs))):
        raise ValueError(f'Revisione editoriale trasversale incompleta: {len(covered)}/{len(inputs)}')
    source_metadata=args.source_directory/'word_association_it_5000_metadati_0003.jsonl'
    source_csv=args.source_directory/'word_association_it_5000_candidati_0003.csv'
    originals=read_jsonl(source_metadata)
    with source_csv.open(encoding='utf-8-sig',newline='') as stream:public=list(csv.DictReader(stream))
    if len(public)!=len(originals) or len(originals)!=5000:raise ValueError('Origine diversa dal lotto di5000')
    by_prompt={row['p']:row for row in drafts.values()}
    kept_file=ROOT/'filtered-v3_6_0/lotto_0003_20261108/metadati_filtrati_0003.jsonl'
    kept={r['prompt'] for r in read_jsonl(kept_file)}
    if set(by_prompt)&kept or set(by_prompt)|kept!={r['prompt'] for r in originals}:
        raise ValueError('Copertura dei contesti discordante')
    archive=args.directory/'originali';archive.mkdir(exist_ok=True)
    with (ROOT/'resources/frequency_ranks_it.csv').open(encoding='utf-8') as stream:
        frequency={row['lemma']:int(row['rank']) for row in csv.DictReader(stream)}
    source_manifest={}
    for path in (source_metadata,source_csv):
        target=archive/path.name
        if not target.exists():shutil.copy2(path,target)
        source_manifest[path.name]=digest(path)
        if digest(target)!=digest(path):raise ValueError('Archivio non corrispondente: '+path.name)
    result=[];public_matrix=[['ref','source','language','prompt','words']]
    technical_matrix=[public_matrix[0]];changes=[];notes=[]
    for index,(old,export) in enumerate(zip(originals,public)):
        if export['prompt'].casefold()!=old['prompt'] or export['words'].split('|')!=old['words']:
            raise ValueError('Sorgente CSV/JSONL discordante: '+old['prompt'])
        if old['prompt'] in kept:
            row=deepcopy(old)
        else:
            draft=by_prompt[old['prompt']]
            words=[pair[0] for pair in draft['a']]
            cat=taxonomy[draft['c']]
            difficulty=['facile' if frequency.get(w,10**9)<=2500 else 'media' if frequency.get(w,10**9)<=15000 else 'alta' for w in words]
            cross_review=next(r for r in review_reports if r['start']<=draft['index']<r['end'])
            row=deepcopy(old)
            row.update(candidate_id=f'REWRITE-20261108-0004-{index+1:05d}',
                parent_candidate_id=None,repair_attempt=0,
                regenerated_from_candidate_id=old['candidate_id'],
                batch_id='REWRITE-20261108-0004',ref=cuid(index),words=words,pos=draft['pos'],
                category_id=draft['c'],category_name=cat['category_name'],cluster_id=cat['cluster_id'],cluster_name=cat['cluster_name'],
                category_proposed=True,secondary_categories=[],category_relative_score=None,
                source_url=None,source_gloss=None,sense_id=None,
                previous_sense_id=old.get('sense_id'),source_license='Composizione editoriale; fonte precedente in archivio',
                relations=[pair[1] for pair in draft['a']],relations_verified=False,
                difficulty_estimate='alta' if difficulty.count('alta')>=3 or draft.get('notes') else 'media',word_difficulty_estimates=difficulty,
                difficulty_measured=None,blind_test=None,semantic_review=None,safety_review=None,safety_flags=[],
                status='CANDIDATO_DA_REVISIONARE')
            row.pop('word_pos',None);row.pop('lexical_audit',None)
            row['previous_editorial_revision']=old.get('editorial_revision')
            row['difficulty_estimation_method']='Proxy del rango di frequenza e note editoriali; non misura di gioco'
            row['editorial_cross_review']={'status':'PERFORMED','generator_agent':generation_agent(draft['index']),
                'reviewer_agent':cross_review['reviewer'],'report':cross_review['file'],
                'kind':'LLM_EDITORIAL_NOT_INDEPENDENT_RETRIEVAL_QA','human_review':False}
            word_reviews=[{'word':w,'relation':rel,'rationale':reason,'meaning_group':w}
                          for w,rel,reason in draft['a']]
            row['editorial_revision']={'revision_id':'20261108-ALL-PENDING',
                'kind':'regeneration_same_prompt','author':'ChatGPT, redazione parallela autorizzata',
                'sense_description':draft['s'],'sense_reselected':True,
                'sense_comparison':'NOT_VERIFIED','word_reviews':word_reviews,
                'removed':[w for w in old['words'] if w not in words],
                'added':[w for w in words if w not in old['words']],
                'independent_review':False,'decision':'DA_RIVEDERE','ratings':None,
                'retrieval_test':'NOT_RUN','prompt_preserved':True}
            row['clue_evidence']={w:{'kind':'composizione_editoriale','relation':rel,'rationale':reason,
                                      'independent_review':False} for w,rel,reason in draft['a']}
            row['association_selection']={'policy':SEMANTIC_POLICY,'editorial_selection':'PROPOSED',
                'independent_review':'NOT_RUN','human_review':'NOT_RUN','decision':'DA_RIVEDERE',
                'prompt_preserved':True}
            row['method']='Riscrittura semantica sullo stesso contesto; motivazioni individuali; QA non simulato.'
            if draft.get('notes'):row['editorial_notes']=draft['notes'];notes.append({'prompt':row['prompt'],'notes':draft['notes']})
            errors=editorial_errors(row)
            if errors:raise ValueError(f'Contratto editoriale non superato {row["prompt"]}: {errors}')
            changes.append({'prompt':old['prompt'],'previous_candidate_id':old['candidate_id'],
                'candidate_id':row['candidate_id'],'previous_words':old['words'],'words':words,
                'previous_category':old['category_id'],'category':row['category_id'],
                'sense_description':draft['s'],'previous_source_sense_id':old.get('sense_id')})
        result.append(row)
        public_matrix.append([export['ref'],export['source'],export['language'],export['prompt'],'|'.join(row['words'])])
        technical_matrix.append([row['ref'],'platform','it',row['prompt'],'|'.join(row['words'])])
    metadata=args.directory/'word_association_it_5000_metadati_0004.jsonl'
    write_jsonl(metadata,result)
    write_jsonl(args.directory/'modifiche_0004.jsonl',changes)
    write_jsonl(args.directory/'casi_da_verificare_0004.jsonl',notes)
    payload={'csvs':[{'file':'word_association_it_5000_candidati_0004.csv','sheet':'Candidati','matrix':public_matrix},
                     {'file':'word_association_it_5000_gioco_0004.csv','sheet':'Tecnico','matrix':technical_matrix}]}
    (args.directory/'export_payload.json').write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    check=check_candidates_jsonl(metadata,taxonomy)
    report={'input_sets':len(originals),'rewritten_sets':len(changes),'retained_complete_sets':len(kept),
        'output_sets':len(result),'prompts_unchanged_in_order':True,'prompts_deleted':0,
        'source_sha256':source_manifest,'editorial_review_patches':len(reviews),
        'editorially_cross_reviewed_sets':len(covered),
        'review_reports':review_reports,
        'answer_sets_changed':sum(c['previous_words']!=c['words'] for c in changes),
        'individual_rationales':sum(len(r['editorial_revision']['word_reviews']) for r in result),
        'unresolved_editorial_notes':len(notes),'metadata_validation':check,
        'approved':0,'human_tests':'NOT_RUN','independent_retrieval_tests':'NOT_RUN',
        'difficulty_labels':'ESTIMATES_NOT_MEASURED','status':'EDITORIAL_REWRITE_NOT_APPROVED'}
    (args.directory/'rapporto_riscrittura_0004.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('output_sets','rewritten_sets','retained_complete_sets','approved')},ensure_ascii=False))
    return int(check['errors_count']>0)


if __name__=='__main__':raise SystemExit(main())
