#!/usr/bin/env python3
"""Generazione lessicale di candidati, NON approvazione QA v3.6.0.

Richiede wordfreq e spaCy con modello italiano; risorse frequenza/DF dichiarate. Il corpus Wikizionario/Kaikki resta nella cache
esterna; i soli contesti usati sono documentati nel registro di provenienza.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import secrets
import socket
import time
import unicodedata
from types import SimpleNamespace
from urllib.parse import quote

from association_rules import STOP_ASSOCIATIONS
from prompt_policy import DEFAULT_POLICY_PATH,load_prompt_policy,borrowing_evidence,screen_prompt,familiarity_reference
from validate_word_association_it_v3_6_0 import (
    TAXONOMY_FILENAME, LexicalResources, load_taxonomy,
    load_italian_nlp, load_frequency_ranks, load_definition_document_counts,
    extract_lemmas_from_definition, morphological_overlap_candidates,
    check_csv, check_candidates_jsonl, load_morphology, CONTENT_POS,
)

TOKEN = re.compile(r'[a-zàèéìòù]+\Z')
WORDS = re.compile(r'(?<![A-Za-zÀ-ÖØ-öø-ÿ-])[A-Za-zÀ-ÖØ-öø-ÿ]+(?![A-Za-zÀ-ÖØ-öø-ÿ-])')
STOP = set('''a ad al allo alla ai agli alle all anche ancora avere avendo aveva avevano
che chi ci ciò cioè come con contro cui da dal dallo dalla dai dagli dalle dall degli
dei del dello della dell delle di dice detto detta detti dette dire do dove e ed è era
erano essere essendo esse essi esso essa fa fare fatto fatta fatti fatte fino fra fu
già gli ha hai hanno ho i il in infatti invece io la le lei li lo loro lui l ma me
mediante mentre mi molto molti molte ne nei nel nello nella nelle negli nell né non
noi o od ogni oltre oppure per perché più poi può quando quale quali quanto quasi
quella quello quelle quelli questa questo queste questi qui quindi se senza si sia
siano siamo siete solo sono sopra soprattutto sotto spesso sta stare stessa stesso
stessi stesse su sul sulla sulle sugli sui tra tre tu tutti tutte tutto un una uno
un altro altra altri altre alcuni alcune alcuni alcuno adatto avente relativo relativa
relativi relative riguardante relativo particolarmente particolari particolare genere
generalmente propri propria proprio propri proprie esempio esempi ecc ossia ovvero
così tale tali talvolta tanto tanto tanto tanto viene vengono venire usato usata usati
usate detto detta definizione mancante vuoi aggiungila tu sinonimo variante plurale
singolare femminile maschile prima seconda terza presente passato participio indicativo
termine parola senso significato solitamente comunemente specialmente chiamato chiamata
chiamati chiamate costituito costituita costituiti costituite formato formata formati
formate caratterizzato caratterizzata caratterizzati caratterizzate tipo tipico tipica
tipici tipiche diversi diverse diverso diversa certo certa certi certe qualcosa qualcuno
qualcuna qualsiasi qualunque ciascuno ciascuna spesso abbastanza assai molto poco
meno maggior maggiore minore maggiormente ulteriormente ulteriori ulteriori essenzialmente
etc anziché anziche oppure ossia nonché nonche soprattutto tal tale tali
'''.split()) | STOP_ASSOCIATIONS | set('usare utilizzare chiamare dire simile vario dato atto diventare rendere ottenere indicare servire riferire appartenere riguardare comprendere comprendente solito detto capace diverso chiama meglio spesso quasi detto suddetto suddetta relativo relativa propriamente grosso formare costituire conoscere determinato determinata determinati determinate seguente seguire seguito seguìto seguìta tale causare suoi sue suo tua tuo tue tuoi nostro vostri nostre nome dopo prima poi piuttosto qualche attraverso comunque tal fra secondo terzo quarto finire iniziare passare prendere mettere rimanere trattare coloro'.split())
BLOCK = set('''violentare scopare cazzo cazzi cazzo merda stronzo stronza puttana troia fica figa pompino
masturbazione masturbare orgasmo pornografico pornografia stupro stuprare pedofilia
pedofilo necrofilia suicidio suicida suicidare autolesionismo razzista negro negra
negri negre frocio frocia finocchio ritardato handicappato mongoloide nazista
bestemmia bestemmiare sadismo torturare tortura sgozzare decapitare sventrare
terrorismo terrorista cocaina eroina sballo overdose sesso sessuale pene vagina
genitale genitali testicolo testicoli coito eiaculazione sperma anale
'''.split())
BAD_TAGS = {'form-of', 'archaic', 'obsolete', 'vulgar', 'offensive', 'derogatory',
            'pejorative', 'regional', 'dialectal', 'rare', 'dated'}



def norm(s):
    return unicodedata.normalize('NFC', s)


def tokens(text):
    return [norm(m.group().lower()) for m in WORDS.finditer(text)
            if (m.start() == 0 or not m.group()[0].isupper())
            and TOKEN.fullmatch(norm(m.group().lower()))]


def related_root(a, b):
    # Segnale da conservare nel rapporto, mai prova di una radice etimologica.
    return bool(morphological_overlap_candidates(a, b))


def _corpus_records(path):
    with path.open(encoding='utf-8') as stream:
        for line in stream:
            yield json.loads(line)


def load_corpus(path):
    entries = []
    forms = defaultdict(Counter)
    lexicon = defaultdict(set)
    for e in _corpus_records(path):
        word = norm(e.get('word', ''))
        pos = e.get('pos')
        if not TOKEN.fullmatch(word) or e.get('lang_code') != 'it':
            continue
        if 'form-of' in e.get('tags', []):
            for s in e.get('senses', []):
                for base in s.get('form_of', []):
                    if TOKEN.fullmatch(base['word']):
                        forms[word][base['word']] += 1
            continue
        if pos not in {'noun', 'verb', 'adj'} or BAD_TAGS.intersection(e.get('tags', [])):
            continue
        if pos == 'verb' and not word.endswith(('are', 'ere', 'ire', 'rre')):
            continue
        valid_senses = [s for s in e.get('senses', [])
                        if not BAD_TAGS.intersection(s.get('tags', [])) and not s.get('form_of')
                        and s.get('glosses') and 'definizione mancante' not in ' '.join(s['glosses'])]
        if not valid_senses:
            continue
        lexicon[word].add(pos)
        for f in e.get('forms', []):
            form = norm(f.get('form', ''))
            if TOKEN.fullmatch(form) and 'table-tags' not in f.get('tags', []):
                forms[form][word] += 1
        for sense_index,sense in enumerate(valid_senses):
            if BAD_TAGS.intersection(sense.get('tags', [])) or sense.get('form_of'):
                continue
            gloss = ' '.join(sense.get('glosses', []))
            if 'definizione mancante' in gloss or not gloss:
                continue
            examples = ' '.join(x.get('text', '') for x in sense.get('examples', []))
            labels = ' '.join(sense.get('raw_tags', []) + sense.get('topics', [])) + ' ' + ' '.join(x['name'] for x in sense.get('categories', []))
            if re.search(r'araldica|heraldry',labels,re.I):
                continue
            rels = {}
            for key in ('synonyms', 'antonyms', 'related', 'hypernyms', 'hyponyms'):
                # Wiktextract può ripetere relazioni di pagina sotto più POS.
                # Una sola accezione estratta NON ne dimostra l'appartenenza:
                # PALATO anatomico ereditava palo/fasciato/sbarrato dall'araldica.
                # Soltanto l'annidamento esplicito nella stessa accezione abilita
                # una proposta automatica; anche questa resta da valutare.
                rels[key] = [norm(x['word']) for x in sense.get(key, [])
                             if TOKEN.fullmatch(norm(x['word'])) and not BAD_TAGS.intersection(x.get('tags', []))]
            family = {norm(x['word']) for x in e.get('derived', [])}
            family.update(norm(x[0]) for x in e.get('etymology_links', []) if x)
            entries.append({'word': word, 'pos': pos, 'gloss': gloss, 'examples': examples,
                            'forms':e.get('forms',[]),
                            'loan_evidence':borrowing_evidence(e,sense),
                            'family':family,
                            'unscoped_relations':{key:e.get(key,[]) for key in rels if e.get(key)},
                            'sense_index':sense_index,
                            'labels': labels, 'rels': rels, 'sense_id': sense.get('id')})
    return entries, forms, lexicon


def base36(n, width):
    chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while n:
        n, digit = divmod(n, 36)
        out = chars[digit] + out
    return out.zfill(width)[-width:]


def cuid(counter):
    fingerprint = hashlib.sha256(socket.gethostname().encode()).hexdigest()[:4]
    return ('c' + base36(int(time.time()*1000), 8) + base36(counter, 4)
            + fingerprint + base36(secrets.randbelow(36**8), 8))


def read_export_rows(source:Path):
    """Legge i cinque campi sia dal CSV tecnico sia dalla consegna Excel italiana."""
    header=['ref','source','language','prompt','words']
    for delimiter in (';',','):
        with source.open(encoding='utf-8-sig',newline='') as stream:
            reader=csv.DictReader(stream,delimiter=delimiter)
            if reader.fieldnames not in (header,['ordine',*header]): continue
            rows=list(reader)
            if any(None in row or any(row.get(key) is None for key in header) for row in rows):
                raise ValueError('CSV con celle mancanti o in eccesso')
            return rows
    raise ValueError('Intestazione CSV non riconosciuta')


def export_numbered_csv(source:Path, target:Path)->int:
    """Copia editoriale con ordine 1..N; il CSV di gioco mantiene cinque colonne."""
    if source.resolve()==target.resolve(): raise ValueError('Sorgente e destinazione devono essere distinte')
    header=['ref','source','language','prompt','words']
    rows=read_export_rows(source)
    with target.open('x',encoding='utf-8',newline='') as stream:
        writer=csv.writer(stream,delimiter=',');writer.writerow(['ordine',*header])
        writer.writerows([i,*(row[key] for key in header)] for i,row in enumerate(rows,1))
    return len(rows)


def export_public_csv(source:Path,target:Path)->int:
    """Formato di consegna: ref vuoto, ChatGPT, it, contesto maiuscolo, risposte minuscole."""
    if source.resolve()==target.resolve(): raise ValueError('Sorgente e destinazione devono essere distinte')
    header=['ref','source','language','prompt','words']
    rows=read_export_rows(source)
    with target.open('x',encoding='utf-8',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=header,extrasaction='ignore',delimiter=',')
        writer.writeheader()
        for row in rows:
            writer.writerow({'ref':'','source':'ChatGPT','language':'it',
                'prompt':unicodedata.normalize('NFC',row['prompt']).upper(),
                'words':unicodedata.normalize('NFC',row['words']).lower()})
    return len(rows)


def next_output_paths(directory:Path, count:int)->tuple[int,dict[str,Path]]:
    """Numero di lotto successivo nella cartella, comune a CSV, JSONL e rapporto."""
    pattern=re.compile(r'(?:word_association_it_[0-9]+_(?:gioco|candidati(?:_con_ordine)?|metadati)|rapporto)_([0-9]{4,})\.(?:csv|jsonl|json)')
    previous=[]
    if directory.exists():
        for path in directory.iterdir():
            match=pattern.fullmatch(path.name)
            if match: previous.append(int(match[1]))
    sequence=max(previous,default=0)+1
    suffix=f'{sequence:04d}'
    prefix=f'word_association_it_{count}'
    return sequence,{
        'game':directory/f'{prefix}_gioco_{suffix}.csv',
        'candidates':directory/f'{prefix}_candidati_{suffix}.csv',
        'numbered':directory/f'{prefix}_candidati_con_ordine_{suffix}.csv',
        'metadata':directory/f'{prefix}_metadati_{suffix}.jsonl',
        'report':directory/f'rapporto_{suffix}.json',
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--corpus', type=Path, required=True)
    ap.add_argument('--output', type=Path, default=Path(__file__).parent / 'generated-v3_6_0')
    ap.add_argument('--taxonomy-csv', type=Path, default=Path(__file__).parent / TAXONOMY_FILENAME)
    ap.add_argument('--count', type=int, default=5000)
    ap.add_argument('--batch-id', default=time.strftime('B%Y%m%d-%H%M%S'))
    ap.add_argument('--strategy', choices=['balanced_322','convergent_free'], default='convergent_free')
    ap.add_argument('--lexical-model', default='it_core_news_md')
    ap.add_argument('--frequency-csv', type=Path, required=True)
    ap.add_argument('--definition-df-csv', type=Path, required=True)
    ap.add_argument('--curated', type=Path, help='CSV opzionale con category_id a tre cifre, pos, prompt, words')
    ap.add_argument('--analysis-cache',type=Path,help='Cache NLP costruita da prepare_resources.py con lo stesso modello/corpus')
    ap.add_argument('--strict-pos-quotas',action='store_true',help='Opzionale: richiede esattamente il piano 70/20/10; il default ammette compensazioni')
    ap.add_argument('--morphology-csv',type=Path,help='Esclude dalla selezione conservativa le forme note soltanto come nomi propri o POS funzionali')
    ap.add_argument('--prompt-policy',type=Path,default=DEFAULT_POLICY_PATH,help='Familiarità dei contesti e lista chiusa dei prestiti ammessi')
    ap.add_argument('--with-order',action='store_true',help='Crea anche la copia editoriale con la colonna ordine; disattivata normalmente')
    args = ap.parse_args(argv)
    from wordfreq import zipf_frequency
    import numpy as np
    if args.count<1: ap.error('--count deve essere positivo')
    if not args.batch_id.strip(): ap.error('--batch-id non può essere vuoto')
    taxonomy=load_taxonomy(args.taxonomy_csv)
    categories=list(taxonomy.values())
    nlp=load_italian_nlp(args.lexical_model)
    counts,total=load_definition_document_counts(args.definition_df_csv)
    resources=LexicalResources(load_frequency_ranks(args.frequency_csv),counts,total)
    prompt_policy=load_prompt_policy(args.prompt_policy)
    morphology=load_morphology(args.morphology_csv) if args.morphology_csv else {}
    def permitted(form):
        return form not in morphology or any(pos in CONTENT_POS for _,pos in morphology[form])
    entries, forms, lexicon=load_corpus(args.corpus)
    print(f'Accezioni: {len(entries)}; categorie ufficiali: {len(categories)}',flush=True)
    freq={w:zipf_frequency(w,'it') for w in lexicon}
    prompt_frequency={}
    for e in entries:
        key=(e['word'],e['pos'])
        if key not in prompt_frequency:
            prompt_frequency[key]=familiarity_reference(e,lambda word:zipf_frequency(word,'it'))
    loan_signals={}
    for e in entries:
        loan_signals.setdefault(e['word'],set()).update(e['loan_evidence'])
    analysis={}
    if args.analysis_cache:
        manifest_path=args.analysis_cache.parent/'resources.json'
        manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
        with args.corpus.open('rb') as source: corpus_hash=hashlib.file_digest(source,'sha256').hexdigest()
        with args.analysis_cache.open('rb') as source: cache_hash=hashlib.file_digest(source,'sha256').hexdigest()
        if (manifest['corpus_sha256']!=corpus_hash or manifest['model']!=args.lexical_model
                or manifest['model_version']!=nlp.meta['version']
                or manifest['files']['cache']['sha256']!=cache_hash):
            raise ValueError('Cache NLP discordante da corpus, modello o manifest')
        for line in args.analysis_cache.open(encoding='utf-8'):
            record=json.loads(line)
            analysis[record['text']]=[SimpleNamespace(**token) for token in record['tokens']]
        print(f'Caricati {len(analysis)} testi dalla cache NLP verificata',flush=True)

    def analyze(text):
        return analysis[text] if text in analysis else nlp(text)

    def clean(text):
        # Analisi della frase completa; la proposta usa lemma, non forma superficiale.
        if not text: return []
        return [item for item in extract_lemmas_from_definition('',text,analyze,resources)
                if item['suggested_clue'] not in STOP and item['pos'] in {'NOUN','VERB','ADJ'}]

    seeds=[{x['suggested_clue'] for x in clean(c['category_name']+' '+c['example_prompts'])} for c in categories]
    docs=[]; df=Counter()
    for e in entries:
        evidence={}
        # Gli esempi possono menzionare persone/oggetti accidentali: non sono
        # estratti automaticamente come risposte del gioco.
        for kind,text in [('definizione',e['gloss'])]:
            for item in clean(text):
                word=item['suggested_clue']
                evidence.setdefault(word,{'kind':kind,'analysis':item,'source_text':text})
        e['evidence_pool']=evidence
        doc=set(evidence); docs.append(doc); df.update(doc)
    print('Analisi contestuale ricostruita; preparo relazioni lessicali e contesti inversi',flush=True)
    inverse=defaultdict(list)
    for e,doc in zip(entries,docs):
        for clue in doc:
            inverse[clue].append(e)
    idf={w:math.log(1+len(entries)/(1+c)) for w,c in df.items()}
    weak=set('base elemento condizione caratteristico eventuale possibile noto completo singolo proprio particolare generale principale diverso riferimento corrispondente considerare mantenere costituire'.split())
    vector_cache={}
    def embedding(weights):
        vector=np.zeros(nlp.vocab.vectors_length,dtype='float32')
        for term,weight in weights.items():
            if term not in vector_cache: vector_cache[term]=nlp.vocab[term].vector
            vector+=vector_cache[term]*weight
        length=np.linalg.norm(vector)
        return vector/length if length else vector
    category_vectors=np.vstack([embedding({term:1 for term in seed-weak}) for seed in seeds])
    example_sets=[{norm(w.strip()) for w in c['example_prompts'].split(',')} for c in categories]
    candidates=[];prompt_screen_rejections={}
    for e,doc in zip(entries,docs):
        word=e['word']
        if (not permitted(word) or word in STOP_ASSOCIATIONS or (e['pos']!='verb' and word in STOP)
                or freq.get(word,0)<2 or len(word)<3): continue
        prompt_screen=screen_prompt(word,freq.get(word),prompt_policy,e['loan_evidence'],prompt_frequency[word,e['pos']])
        if not prompt_screen['accepted']:
            prompt_screen_rejections.setdefault(word,prompt_screen)
            continue
        pool={w:v for w,v in e['evidence_pool'].items() if w!=word and w in lexicon and freq.get(w,0)>=1.5}
        # Complementi documentati nella stessa accezione, senza parole riempitive.
        for relation,limit in [('related',3),('antonyms',1),('hypernyms',1),('hyponyms',2),('synonyms',2)]:
            added=0
            for clue in e['rels'][relation]:
                if added>=limit: break
                if clue!=word and clue not in STOP and clue in lexicon and freq.get(clue,0)>=1.5 and clue not in pool:
                    pool[clue]={'kind':'relazione_lessicale','relation':relation,'analysis':None,
                                'source_prompt':word,'source_text':e['gloss'],'source_sense_id':e['sense_id']}
                    added+=1
        reverse=[]
        for neighbor in inverse.get(word,[]):
            clue=neighbor['word']
            shared=(set(neighbor['evidence_pool'])&doc)-STOP-{word,clue}
            if (clue!=word and clue not in pool and clue not in STOP and neighbor['pos']=='noun'
                    and freq.get(clue,0)>=2.0 and len(shared)>=2):
                reverse.append((len(shared),freq[clue],neighbor,shared))
        reverse.sort(key=lambda x:(-x[0],-x[1],x[2]['word']))
        added_reverse=0
        for _,_,neighbor,shared in reverse:
            if added_reverse>=7: break
            clue=neighbor['word']
            if clue in pool: continue
            source_evidence=neighbor['evidence_pool'][word]
            pool[clue]={'kind':'definizione_inversa','source_prompt':clue,
                'source_sense_id':neighbor['sense_id'],'source_text':source_evidence['source_text'],
                'source_kind':source_evidence['kind'],'source_definition':neighbor['gloss'],
                'source_url':'https://it.wiktionary.org/wiki/'+quote(clue),
                'target_analysis':source_evidence['analysis'],'shared_context':sorted(shared)}
            added_reverse+=1
        pool={w:evidence for w,evidence in pool.items() if permitted(w)}
        if len(pool)<7: continue
        context_weights={t:idf.get(t,1) for t in doc-weak}
        context_weights[word]=context_weights.get(word,0)+4
        for term in set(tokens(e['labels'].lower()))-STOP-weak:
            context_weights[term]=context_weights.get(term,0)+2
        semantic=category_vectors@embedding(context_weights)
        scores=[float(semantic[i])*20+(20 if word in example_sets[i] else 0)
                for i in range(len(categories))]
        ranking=sorted(range(len(categories)),key=lambda i:(-scores[i],categories[i]['category_id']))
        if scores[ranking[0]]<=0: continue
        # Preferire relazioni documentate; parentela morfologica è solo un segnale.
        ordered=sorted(pool,key=lambda w:(w in weak,related_root(word,w),pool[w]['kind']!='definizione',-freq.get(w,0),w))
        selected=ordered[:7]
        selected.sort(key=lambda w:(idf.get(w,0),w))
        candidates.append({**e,'clues':selected,'category':ranking[0],
            'prompt_familiarity':prompt_screen,
            'secondary_categories':[categories[i]['category_id'] for i in ranking[1:3] if scores[i]>0],
            'category_relative_score':scores[ranking[0]]/(sum(scores) or 1),
            'quality':freq[word]*3-e['sense_index']*3,'frequency_zipf':freq[word],
            'evidence':{w:pool[w] for w in selected}})
    print(f'Bersagli unici disponibili per POS: { {p:len({e["word"] for e in candidates if e["pos"]==p}) for p in ("noun","verb","adj")} }',flush=True)
    if args.curated:
        for row in csv.DictReader(args.curated.open(encoding='utf-8-sig',newline='')):
            cid=row['category_id']
            if cid not in taxonomy:
                raise ValueError(f'Categoria curata {cid!r} non valida: nessuna conversione automatica degli ID legacy')
            word=row['prompt']; clues=row['words'].split('|')
            prompt_screen=screen_prompt(word,zipf_frequency(word,'it'),prompt_policy,loan_signals.get(word,()),prompt_frequency.get((word,row['pos'].lower())))
            if word not in lexicon or not prompt_screen['accepted']:
                raise ValueError(f'Prompt curato da revisionare: {word}: {prompt_screen["reason"]}')
            pos=row['pos'].upper()
            if pos=='NOUN': pos='noun'
            elif pos=='VERB': pos='verb'
            elif pos=='ADJ': pos='adj'
            else: raise ValueError(f'POS curata non valida: {pos}')
            if not TOKEN.fullmatch(word) or word in clues or len(clues)!=7 or len(set(clues))!=7 or any(not TOKEN.fullmatch(w) or w in STOP_ASSOCIATIONS for w in clues):
                raise ValueError(f'Candidato curato non conforme: {word}')
            candidates.append({'word':word,'pos':pos,'clues':clues,'category':list(taxonomy).index(cid),
                'prompt_familiarity':prompt_screen,
                'secondary_categories':[],'category_relative_score':None,'quality':100.,
                'frequency_zipf':zipf_frequency(word,'it'),'sense_id':None,'gloss':None,
                'evidence':{w:{'kind':'composizione_originale','analysis':None,'source_text':None} for w in clues}})
    # Quote POS aggregate. Nessuna quota per categoria prima dei dati pilota.
    proportions={'noun':.7,'verb':.2,'adj':.1}
    quota={p:math.floor(args.count*r) for p,r in proportions.items()}
    for pos in sorted(quota,key=lambda p:-(args.count*proportions[p]-quota[p]))[:args.count-sum(quota.values())]: quota[pos]+=1
    requested_quota=dict(quota)
    chosen=[]; used=set(); signatures=set(); obtained=Counter()
    # Riservare prima i verbi, classe meno abbondante: gli omografi non devono
    # essere consumati come nomi quando esistono molti altri nomi disponibili.
    for e in sorted(candidates,key=lambda e:({'verb':0,'adj':1,'noun':2}[e['pos']],-e['quality'],e['word'],e['category'])):
        signature=frozenset(e['clues'])
        if e['word'] in used or signature in signatures or obtained[e['pos']]>=quota[e['pos']]: continue
        chosen.append(e); used.add(e['word']); signatures.add(signature); obtained[e['pos']]+=1
    if len(chosen)<args.count and not args.strict_pos_quotas:
        # Ricalibrazione esplicita del piano pilota, mai della rubrica di qualità.
        for e in sorted(candidates,key=lambda e:({'noun':0,'adj':1,'verb':2}[e['pos']],-e['quality'],e['word'],e['category'])):
            signature=frozenset(e['clues'])
            if e['word'] in used or signature in signatures: continue
            chosen.append(e); used.add(e['word']); signatures.add(signature); obtained[e['pos']]+=1
            if len(chosen)==args.count: break
        quota=dict(obtained)
    if len(chosen)!=args.count:
        raise RuntimeError(f'UNDER_YIELD: {len(chosen)}/{args.count}; POS disponibili {dict(obtained)}, richieste {quota}. Nessun riempimento automatico.')
    for cluster in 'ABCDEFGHIJKLMNOP':
        group=sorted([e for e in chosen if categories[e['category']]['cluster_id']==cluster],key=lambda e:(-e['frequency_zipf'],e['word']))
        for i,e in enumerate(group): e['difficulty_estimate']='media' if i<round(len(group)*.7) else 'alta'
    args.output.mkdir(parents=True,exist_ok=True)
    sequence,paths=next_output_paths(args.output,args.count)
    csv_path=paths['game'];meta_path=paths['metadata'];numbered_path=paths['numbered'];candidate_path=paths['candidates']
    report_path=paths['report']
    with csv_path.open('x',encoding='utf-8',newline='') as f, meta_path.open('x',encoding='utf-8') as m:
        writer=csv.writer(f); writer.writerow(['ref','source','language','prompt','words'])
        for i,e in enumerate(sorted(chosen,key=lambda e:(e['category'],e['word']))):
            ref=cuid(i); cat=categories[e['category']]; prompt=e['word']
            writer.writerow([ref,'platform','it',prompt,'|'.join(e['clues'])])
            metadata={'schema_version':'word-association-candidate-3.6.0','taxonomy_version':'3.6.0',
                'ref':ref,'candidate_id':f'{args.batch_id}-{i+1}','batch_id':args.batch_id,
                'ordine':i+1,
                'parent_candidate_id':None,'repair_attempt':0,
                'game_direction':'prompt_visible_seven_answers_hidden',
                'category_id':cat['category_id'],'cluster_id':cat['cluster_id'],
                'category_name':cat['category_name'],'category_proposed':True,
                'secondary_categories':e['secondary_categories'],'category_relative_score':e['category_relative_score'],
                'prompt':prompt,'words':e['clues'],'pos':e['pos'].upper(),'pos_human_verified':False,
                'prompt_familiarity':e['prompt_familiarity'],
                'difficulty_estimate':e['difficulty_estimate'],'difficulty_measured':None,
                'word_difficulty_estimates':['facile' if freq.get(w,0)>=4 else 'media' if freq.get(w,0)>=3 else 'alta' for w in e['clues']],
                # Provenienza non implica relazione: altro è una dichiarazione non verificata.
                'relations':['altro']*7,'relations_verified':False,'strategy':args.strategy,
                'status':'CANDIDATO_DA_REVISIONARE','blind_test':None,'semantic_review':None,'safety_review':None,
                'association_selection':{'policy':'3.6.0-semantic-2026-11-08',
                    'editorial_selection':'NOT_RUN','independent_review':'NOT_RUN',
                    'human_review':'NOT_RUN','decision':'DA_RIVEDERE'},
                'safety_flags':sorted(BLOCK.intersection({prompt,*e['clues'],*tokens(e['gloss'] or '')})),
                'source_url':'https://it.wiktionary.org/wiki/'+quote(prompt) if e['gloss'] else None,
                'sense_id':e['sense_id'],'source_gloss':e['gloss'],
                'clue_evidence':e['evidence'],'source_license':'CC-BY-SA-4.0; Wikizionario via Kaikki/Wiktextract o composizione originale',
                'lexical_audit':{'model':args.lexical_model,'frequency_csv':str(args.frequency_csv),'definition_df_csv':str(args.definition_df_csv),'morphology_csv':str(args.morphology_csv) if args.morphology_csv else None},
                'method':'Lemma/POS su frase completa, relazioni della stessa accezione e contesti inversi con almeno due lemmi condivisi; ordine IDF diagnostico, progressione da verificare.'}
            m.write(json.dumps(metadata,ensure_ascii=False)+'\n')
    export_public_csv(csv_path,candidate_path)
    if args.with_order: export_numbered_csv(candidate_path,numbered_path)
    report={'schema_version':'word-association-generation-3.6.0','taxonomy_version':'3.6.0',
        'file_sequence':f'{sequence:04d}',
        'game_direction':'prompt_visible_seven_answers_hidden',
        'csv':check_csv(csv_path,min_rows=args.count),'candidates':check_candidates_jsonl(meta_path,taxonomy),
        'numbered_csv':({'path':str(numbered_path),'rows':len(chosen),'order_column':'ordine','first':1,'last':len(chosen)} if args.with_order else None),
        'candidate_csv':{'path':str(candidate_path),'columns':['ref','source','language','prompt','words'],
            'ref':'','source':'ChatGPT','language':'it','prompt_case':'upper','words_case':'lower','delimiter':',','encoding':'utf-8'},
        'prompt_policy':{'path':str(args.prompt_policy),'version':prompt_policy['version'],
            'minimum_zipf_it':prompt_policy['minimum_zipf_it'],'listed_loanwords':len(prompt_policy['common_loanwords']),
            'selected_loanwords':sorted({e['word'] for e in chosen if e['prompt_familiarity']['loanword_detected']}),
            'rejections_by_prompt':prompt_screen_rejections},
        'status':'CANDIDATI_NON_APPROVATI','approved':0,'target_approved':10001,
        'generation_stage':'LEXICAL_PROPOSALS_ONLY','pending_semantic_selection':len(chosen),
        'category_quotas':'da_calibrare_su_pilota','pos_requested':requested_quota,'pos_planned':quota,'pos_generated':dict(obtained),
        'pos_rebalanced':quota!=requested_quota,
        'plan_adjustment':('Compensata sotto-resa dei verbi con nomi disponibili; 70/20/10 rimane obiettivo, non risultato acquisito.' if quota!=requested_quota else None),
        'resources_sha256':{str(path):hashlib.file_digest(path.open('rb'),'sha256').hexdigest() for path in (args.corpus,args.taxonomy_csv,args.frequency_csv,args.definition_df_csv,args.prompt_policy,args.morphology_csv) if path}}
    with report_path.open('x',encoding='utf-8') as stream:
        stream.write(json.dumps(report,ensure_ascii=False,indent=2))
    print(f'Scritti {len(chosen)} candidati. CSV: {candidate_path}. Approvati: 0. Rapporto: {report_path}',flush=True)
    return int(report['csv']['errors_count']>0 or report['candidates']['errors_count']>0)


if __name__ == '__main__':
    raise SystemExit(main())
