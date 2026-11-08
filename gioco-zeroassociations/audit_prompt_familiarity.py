#!/usr/bin/env python3
"""Audit dei prompt contro fonte e lista chiusa, senza simulare familiarità umana."""
import argparse
import csv
import json
import unicodedata
from collections import Counter
from pathlib import Path
from prompt_policy import DEFAULT_POLICY_PATH,load_prompt_policy,borrowing_evidence,screen_prompt,familiarity_reference
from generate_candidates import read_export_rows

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--csv',type=Path,required=True)
    ap.add_argument('--metadata',type=Path,required=True)
    ap.add_argument('--corpus',type=Path,required=True)
    ap.add_argument('--policy',type=Path,default=DEFAULT_POLICY_PATH)
    ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(argv)
    from wordfreq import zipf_frequency
    rows=read_export_rows(args.csv)
    for row in rows:
        row['prompt']=unicodedata.normalize('NFC',row['prompt']).casefold()
    metadata={d['prompt']:d for line in args.metadata.read_text(encoding='utf-8-sig').splitlines() if line.strip() for d in [json.loads(line)]}
    contexts={r['prompt'] for r in rows};sources={};references={}
    for line in args.corpus.open(encoding='utf-8'):
        entry=json.loads(line);word=entry.get('word')
        if word not in contexts or entry.get('lang_code')!='it': continue
        key=(word,entry.get('pos'))
        reference=familiarity_reference(entry,lambda form:zipf_frequency(form,'it'))
        if key not in references or reference['zipf_it']>references[key]['zipf_it']:
            references[key]=reference
        wanted=metadata.get(word,{})
        for sense in entry.get('senses',[]):
            if ((wanted.get('sense_id') and sense.get('id')==wanted['sense_id']) or
                    not wanted.get('sense_id') and ' '.join(sense.get('glosses',[]))==wanted.get('source_gloss')):
                sources[word]=borrowing_evidence(entry,sense)
    policy=load_prompt_policy(args.policy)
    rejected=[];counts=Counter();admitted_loans=set()
    for word in sorted(contexts):
        if word not in sources:
            review={'accepted':False,'reason':'source_sense_not_verified'}
        else: review=screen_prompt(word,zipf_frequency(word,'it'),policy,sources[word],references.get((word,metadata[word]['pos'].lower())))
        counts[review['reason']]+=1
        if not review['accepted']: rejected.append({'prompt':word,**review})
        elif review.get('loanword_detected'): admitted_loans.add(word)
    result={'policy_version':policy['version'],'rows':len(rows),'unique_prompts':len(contexts),
        'rejected_count':len(rejected),'rejected':rejected,'counts':dict(counts),
        'allowed_loanwords':sorted(admitted_loans),'result':'FAIL' if rejected else 'PASS_AUTOMATIC_PROMPT_SCREEN',
        'limits':'Verifica automatica con fonte e frequenze; non dimostra familiarità o correttezza di ogni accezione.'}
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ('rows','rejected_count','counts','result')},ensure_ascii=False))
    return int(bool(rejected))

if __name__=='__main__': raise SystemExit(main())
