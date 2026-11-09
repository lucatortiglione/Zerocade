#!/usr/bin/env python3
"""Prepara moduli non approvati e prove indipendenti prompt -> risposte nascoste."""
import argparse
import json
from pathlib import Path
import secrets
from semantic_rules import SEMANTIC_POLICY, WORD_CHECKS, SET_CHECKS
from validate_word_association_it_v3_6_0 import (
    TAXONOMY_FILENAME,DIM_WEIGHTS,retrieval_payload,check_candidates_jsonl,load_taxonomy,
)

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('candidates_jsonl',type=Path)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--reviewers',type=int,default=2)
    ap.add_argument('--ui-cues-json',type=Path,help='Aiuti UI effettivi da riprodurre nella prova')
    args=ap.parse_args(argv)
    if args.reviewers<2: ap.error('Servono almeno due valutatori indipendenti')
    taxonomy=load_taxonomy(Path(__file__).parent/TAXONOMY_FILENAME)
    result=check_candidates_jsonl(args.candidates_jsonl,taxonomy)
    if result['errors_count']: ap.error('JSONL non valido: '+str(result['errors']))
    if args.output.exists(): ap.error('La cartella di output deve essere nuova')
    cues=json.loads(args.ui_cues_json.read_text(encoding='utf-8')) if args.ui_cues_json else {'answer_lengths_visible':False}
    private=args.output/'private';blind=args.output/'blind'
    (private/'qa').mkdir(parents=True);blind.mkdir();manifest=[]
    for line in args.candidates_jsonl.read_text(encoding='utf-8-sig').splitlines():
        if not line.strip(): continue
        item=json.loads(line);uid=secrets.token_hex(12);requests=[]
        for _ in range(args.reviewers):
            filename=secrets.token_hex(12)+'.json'
            (blind/filename).write_text(json.dumps(retrieval_payload(item['prompt'],cues),ensure_ascii=False,indent=2),encoding='utf-8')
            requests.append(filename)
        record={'schema_version':'word-association-qa-3.6.0','candidate_id':item['candidate_id'],
            'semantic_policy_version':SEMANTIC_POLICY,
            'prompt':item['prompt'],'words':item['words'],'category_id':item['category_id'],
            'technical':{'passed':False,'errors':[],'warnings_reviewed':False},
            'retrieval_test':{'protocol':'prompt_to_words_independent','prompt_visible':True,
                'answers_visible':False,'independence_verified':False,'verification_method':None,'evidence_refs':[],'trials':[]},
            'word_reviews':[{'word':word,'relevance':None,'discoverability':None,'difficulty':None,
                'answer_sense':None,'meaning_group':None,'decision':None,
                'checks':{key:None for key in WORD_CHECKS},'rationale':None} for word in item['words']],
            'semantic_review':{'ratings':{k:None for k in DIM_WEIGHTS},'total_100':None,
                'alternative_answer_pressure':None,'rationale':None},
            'safety_review':{'status':'NOT_RUN','classification':None},'decision':'DA_RIVEDERE'}
        record['semantic_review']['set_checks']={key:None for key in SET_CHECKS}
        (private/'qa'/(uid+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
        manifest.append({'qa_file':uid+'.json','prompt':item['prompt'],'batch_id':item['batch_id'],'independent_requests':requests})
    (private/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'{len(manifest)} moduli DA_RIVEDERE; fornire un solo payload a ogni valutatore indipendente, senza private/.')
    return 0

if __name__=='__main__': raise SystemExit(main())
