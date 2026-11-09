"""Mostra snapshot completi delle liste durante la produzione riprendibile."""
import argparse
import json
import sys
from pathlib import Path
from assemble_rewritten_sets import collect
from validate_word_association_it_v3_6_0 import load_taxonomy,TAXONOMY_FILENAME

ROOT=Path(__file__).parent


def active_jsonl(path):
    if not path.exists():return []
    data=path.read_bytes()
    if data and not data.endswith(b'\n'):data=data.rsplit(b'\n',1)[0]
    return [json.loads(line) for line in data.decode('utf-8').split('\n') if line]


def load_lists(directory):
    inputs,drafts,_,_=collect(directory/'work',load_taxonomy(ROOT/TAXONOMY_FILENAME))
    rows={r['index']:{**r,'w':[a[0] for a in r['a']],'origin':'existing_editorial_draft'} for r in drafts.values()}
    for row in active_jsonl(directory/'quarantine_gemma_20261109/word_drafts.jsonl'):
        if row['index'] in rows:raise ValueError('Bozza duplicata')
        rows[row['index']]={**row,'origin':'unreviewed_local_draft'}
    return inputs,rows


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('start',type=int);ap.add_argument('end',type=int)
    ap.add_argument('--directory',type=Path,default=ROOT/'rewritten-v3_6_0/lotto_0004_20261108')
    args=ap.parse_args()
    inputs,rows=load_lists(args.directory)
    missing=[i for i in range(args.start,args.end) if i not in rows]
    for index in range(args.start,args.end):
        if index not in rows:continue
        row=rows[index];original=inputs[index]
        print(';'.join([str(index),row['p'],row['s'],row.get('c',original['previous_category']),','.join(row['w'])]))
    if missing:print('MISSING '+','.join(map(str,missing)))


if __name__=='__main__':main()
