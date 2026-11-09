#!/usr/bin/env python3
"""Adatta Morph-it! 0.4.8 alle forme presenti nel lotto; conserva tutte le analisi note."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from collections import Counter
from validate_word_association_it_v3_6_0 import TOKEN_PATTERN, canon

TAGS={'NOUN':'NOUN','ADJ':'ADJ','VER':'VERB','ADV':'ADV','NPR':'PROPN','PRO':'PRON',
      'DET':'DET','AUX':'AUX','MOD':'AUX','PRE':'ADP','CON':'CCONJ','INT':'INTJ',
      'ART':'DET','ARTPRE':'ADP','WH':'PRON'}

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source',type=Path,required=True)
    ap.add_argument('--csv',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(argv)
    forms=set()
    with args.csv.open(encoding='utf-8-sig',newline='') as stream:
        for row in csv.DictReader(stream): forms.update([row['prompt'],*row['words'].split('|')])
    rows=set(); skipped=Counter()
    with args.source.open(encoding='latin-1') as stream:
        for line in stream:
            cells=line.rstrip('\n').split('\t')
            if len(cells)!=3: continue
            form,lemma,tag=cells; form=canon(form); lemma=canon(lemma)
            if form not in forms: continue
            pos=TAGS.get(tag.split(':')[0].split('-')[0])
            if pos and TOKEN_PATTERN.fullmatch(form) and TOKEN_PATTERN.fullmatch(lemma): rows.add((form,lemma,pos))
            else: skipped[tag]+=1
    with args.output.open('w',encoding='utf-8',newline='') as stream:
        writer=csv.writer(stream); writer.writerow(['form','lemma','pos']);writer.writerows(sorted(rows))
    with args.source.open('rb') as stream: source_hash=hashlib.file_digest(stream,'sha256').hexdigest()
    known={r[0] for r in rows}
    report={'source':'Morph-it! 0.4.8, Marco Baroni e Eros Zanchetta, 2009-02-23',
            'source_url':'https://sslmitdev-online.sslmit.unibo.it/linguistics/morph-it.php',
            'source_sha256':source_hash,'source_encoding':'ISO-8859-1',
            'license':'CC BY-SA 2.0, in alternativa licenza GNU indicata nel README originario',
            'conversion':'NFC/casefold; POS da tabella esplicita; sole forme richieste dal lotto; nessuna analisi inventata',
            'pos_mapping':TAGS,'analyses':len(rows),'requested_forms':len(forms),'covered_forms':len(known),
            'unknown_forms':sorted(forms-known),'unmapped_tags':dict(skipped)}
    args.output.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Morfologia: {len(rows)} analisi; {len(known)}/{len(forms)} forme note')
    return 0

if __name__=='__main__': raise SystemExit(main())
