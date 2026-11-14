"""Raccoglie proposte in JSONL ESTERNI al DB, senza approvazione semantica.

Niente estrazione di parole dalle definizioni come risposte: si conservano solo
definizioni, lemmi e relazioni lessicografiche esplicite per il revisore.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
import urllib.request
from urllib.parse import quote

ROOT=Path(__file__).resolve().parent.parent
CACHE=Path(os.environ.get('LOCALAPPDATA',Path.home()/'.cache'))/'Zerocade/word-association'
DICTIONARY_URL='https://kaikki.org/itwiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl'
WIKIPEDIA_URL='https://dumps.wikimedia.org/itwiki/20261101/itwiki-20261101-all-titles-in-ns0.gz'
WORD=re.compile(r'[a-zàèéìòù]+')
LINKAGES=('synonyms','antonyms','hypernyms','hyponyms','related')


def checksum(path):
    with Path(path).open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()


def download(url,path):
    path=Path(path)
    if path.exists(): return path
    path.parent.mkdir(parents=True,exist_ok=True)
    partial=path.with_suffix(path.suffix+'.part')
    request=urllib.request.Request(url,headers={'User-Agent':'Zerocade-Italian-Prompt-Archive/1.0 (local research; bulk dumps)'})
    try:
        with urllib.request.urlopen(request,timeout=60) as response,partial.open('wb') as stream:
            while block:=response.read(1024*1024): stream.write(block)
        partial.replace(path)
    finally: partial.unlink(missing_ok=True)
    return path


def dictionary_proposals(path):
    with Path(path).open(encoding='utf-8') as stream:
        for number,line in enumerate(stream,1):
            entry=json.loads(line)
            word=unicodedata.normalize('NFC',entry.get('word','')).casefold()
            if (entry.get('lang_code')!='it' or entry.get('pos') not in {'noun','verb','adj'}
                    or not WORD.fullmatch(word) or 'form-of' in entry.get('tags',[])): continue
            senses=[]
            for sense in entry.get('senses',[]):
                if sense.get('form_of') or 'form-of' in sense.get('tags',[]): continue
                senses.append({k:sense[k] for k in ('id','glosses','tags','raw_tags',*LINKAGES) if k in sense})
            if not senses: continue
            yield {'prompt':word,'pos':entry['pos'].upper(),'language_claim':'it_from_dictionary',
                'source':'kaikki-itwiktionary','source_line':number,
                'url':'https://it.wiktionary.org/wiki/'+quote(entry['word']),
                'senses':senses,'entry_relations':{k:entry[k] for k in LINKAGES if entry.get(k)},
                'entry_relation_scope':'unverified_may_cross_senses',
                'tags':entry.get('tags',[]),'raw_tags':entry.get('raw_tags',[]),
                'status':'AWAITING_SEMANTIC_REVIEW','database_inserted':False}


def wikipedia_proposals(path):
    seen=set()
    with gzip.open(path,'rt',encoding='utf-8') as stream:
        for line in stream:
            title=line.rstrip('\r\n')
            word=unicodedata.normalize('NFC',title).casefold()
            if not WORD.fullmatch(word) or word in seen: continue
            seen.add(word)
            yield {'prompt':word,'title':title,'source':'wikipedia-it-titles-20261101',
                'url':'https://it.wikipedia.org/wiki/'+quote(title),
                'language_claim':'UNVERIFIED_TITLE_ONLY','status':'AWAITING_SEMANTIC_REVIEW',
                'database_inserted':False}


def write_stage(output, iterator):
    count=0; words=set()
    # Se interrotto, il .part non viene trattato come una raccolta conclusa.
    temporary=output.with_suffix(output.suffix+'.part')
    if output.exists(): raise FileExistsError(f'Raccolta già esistente: {output}')
    try:
        with temporary.open('x',encoding='utf-8',newline='\n') as stream:
            for row in iterator:
                stream.write(json.dumps(row,ensure_ascii=False)+'\n'); count+=1; words.add(row['prompt'])
        temporary.replace(output)
    finally: temporary.unlink(missing_ok=True)
    return {'records':count,'distinct_prompts':len(words),'sha256':checksum(output),'path':str(output)}


def main(argv=None):
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dictionary',type=Path,default=CACHE/'kaikki.org-dictionary-Italiano.jsonl')
    ap.add_argument('--wikipedia',type=Path,default=CACHE/'itwiki-20261101-all-titles-in-ns0.gz')
    ap.add_argument('--output',type=Path,default=ROOT/'prompt-staging/20261109')
    args=ap.parse_args(argv)
    args.output.mkdir(parents=True,exist_ok=True)
    report={'database_inserted':False,'semantic_review_completed':False,'coverage':'open_ended_not_exhaustive','sources':{}}
    for source,path,url,iterator,name,license_text,attribution in [
        ('dictionary',args.dictionary,DICTIONARY_URL,dictionary_proposals,'wikizionario.jsonl','CC BY-SA 4.0 / GFDL, secondo Wikizionario','Contributori Wikizionario; estrazione Kaikki/Wiktextract'),
        ('wikipedia',args.wikipedia,WIKIPEDIA_URL,wikipedia_proposals,'wikipedia.jsonl','Titoli e URL; testi degli articoli non scaricati','Contributori Wikipedia in italiano; Wikimedia dumps')]:
        download(url,path)
        stage=args.output/name
        if stage.exists():
            print('Raccolta già presente, non sovrascritta: '+str(stage),flush=True)
            if not (args.output/'manifest.json').exists(): raise ValueError('Manifest assente: usare una cartella nuova')
            previous=json.loads((args.output/'manifest.json').read_text(encoding='utf-8'))['sources'][source]
            if previous['source_sha256']!=checksum(path) or previous['sha256']!=checksum(stage):
                raise ValueError('Raccolta o sorgente modificata: usare una cartella nuova')
            report['sources'][source]=previous
        else:
            report['sources'][source]={**write_stage(stage,iterator(path)),'source_url':url,
                'source_sha256':checksum(path),'license':license_text,'attribution':attribution}
        print(json.dumps({source:report['sources'][source]},ensure_ascii=False),flush=True)
    (args.output/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0


if __name__=='__main__':raise SystemExit(main())
