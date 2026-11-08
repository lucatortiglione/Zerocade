#!/usr/bin/env python3
"""Costruisce risorse reali e cache NLP dal corpus dichiarato, senza QA semantico."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

from generate_candidates import load_corpus
from validate_word_association_it_v3_6_0 import TOKEN_PATTERN, canon, load_italian_nlp


def sha256(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--corpus',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--lexical-model',default='it_core_news_md')
    ap.add_argument('--processes',type=int,default=4)
    args=ap.parse_args(argv)
    from wordfreq import top_n_list
    import spacy
    import wordfreq
    import importlib.metadata
    args.output.mkdir(parents=True,exist_ok=True)
    paths={k:args.output/name for k,name in [('frequency','frequency_ranks_it.csv'),
            ('df','definition_document_counts_it.csv'),('cache','analysis_cache.jsonl'),('manifest','resources.json')]}
    if any(path.exists() for path in paths.values()): ap.error('Output già presente; usare una cartella nuova')
    nlp=load_italian_nlp(args.lexical_model)
    entries,_,_=load_corpus(args.corpus)
    definitions={e['gloss'] for e in entries}
    texts=sorted(definitions|{e['examples'] for e in entries if e['examples']})
    print(f'Accezioni: {len(entries)}; definizioni distinte: {len(definitions)}; testi NLP: {len(texts)}',flush=True)
    del entries
    seen=set()
    with paths['frequency'].open('w',encoding='utf-8',newline='') as f:
        writer=csv.writer(f);writer.writerow(['lemma','rank'])
        for rank,form in enumerate(top_n_list('it',1000000),1):
            word=canon(form)
            if TOKEN_PATTERN.fullmatch(word) and word not in seen:
                writer.writerow([word,rank]);seen.add(word)
    df=Counter(); start=time.monotonic()
    with paths['cache'].open('w',encoding='utf-8') as stream:
        for i,doc in enumerate(nlp.pipe(texts,batch_size=256,n_process=args.processes),1):
            # Preserve full context analysis, including functional tokens for audit.
            tokens=[{'text':t.text,'lemma_':t.lemma_,'pos_':t.pos_,'is_stop':t.is_stop,'idx':t.idx} for t in doc]
            stream.write(json.dumps({'text':doc.text,'tokens':tokens},ensure_ascii=False)+'\n')
            if doc.text in definitions:
                df.update({canon(t.lemma_) for t in doc if TOKEN_PATTERN.fullmatch(canon(t.lemma_))})
            if i%5000==0: print(f'NLP {i}/{len(texts)} ({time.monotonic()-start:.0f}s)',flush=True)
    with paths['df'].open('w',encoding='utf-8',newline='') as f:
        writer=csv.writer(f);writer.writerow(['lemma','document_count','total_documents'])
        writer.writerows((w,n,len(definitions)) for w,n in sorted(df.items()))
    manifest={'created_at':datetime.now(timezone.utc).isoformat(),'corpus_id':'kaikki-itwiktionary-Italiano',
        'corpus_source':'https://kaikki.org/itwiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl',
        'corpus_dump_date':'2026-11-01','extraction_date':'2026-11-03','license':'CC-BY-SA-4.0; contributori Wikizionario',
        'corpus_sha256':sha256(args.corpus),'domain':'definizioni lessicografiche italiane',
        'document_unit':'testo completo della definizione di una accezione ammessa dal filtro corpus',
        'deduplication':'uguaglianza esatta del testo UTF-8 della definizione; esempi esclusi dal denominatore DF',
        'total_documents':len(definitions),'analyzed_texts':len(texts),'frequency_entries':len(seen),
        'frequency_source':'wordfreq top_n_list(it,1000000); rango della forma canonica, nessuna conversione in rango di lemma',
        'frequency_version':importlib.metadata.version('wordfreq'),'frequency_license':'Dati wordfreq CC BY-SA 4.0; vedere NOTICE delle dipendenze',
        'spacy_version':spacy.__version__,'model':args.lexical_model,'model_version':nlp.meta['version'],
        'model_license':nlp.meta.get('license'),'model_components':nlp.pipe_names,
        'files':{k:{'path':str(path),'sha256':sha256(path)} for k,path in paths.items() if k!='manifest'}}
    paths['manifest'].write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Risorse completate: {paths["manifest"]}',flush=True)
    return 0


if __name__=='__main__': raise SystemExit(main())
