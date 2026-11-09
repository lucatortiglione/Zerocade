"""Applica le direttive al lotto esistente, senza simulare una revisione QA.

Esclude dai nuovi export anche le proposte non selezionate editorialmente,
conservandole in revisione: non le dichiara per questo semanticamente false.
Scrive JSON di analisi; export_filtered_associations.mjs produce i due CSV.
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

from semantic_rules import (SEMANTIC_POLICY, adjective_attachment, canonical,
                            editorial_errors, screen_set)
from prompt_policy import load_prompt_policy, screen_prompt
from validate_word_association_it_v3_6_0 import load_italian_nlp

POLICY = 'word-association-conservative-filter-2026-11-08.1'
KEEP = 'MANTENUTA_EDITORIALE'
EXCLUDE = 'ESCLUSA'
PENDING = 'DA_RIVEDERE'

# Decisioni contestuali ricavate dagli screenshot, NON blacklist di vocaboli.
# La sottostringa di fonte impedisce di applicarle a un'altra accezione.
CASES = {
    'affresco': ('intonaco fresco', {
        'fresco': 'Qualifica intonaco, non affresco.',
        'realizzare': 'Verbo generico della costruzione definitoria, non azione caratteristica.'},
        {'intonaco': 'L’affresco è realizzato su intonaco.',
         'dipingere': 'L’affresco è realizzato mediante una tecnica di pittura.'}),
    'agonia': ('funzioni vitali prima della morte', {
        'funzione': 'Frammento generico di funzioni vitali, privato del qualificatore.',
        'mancanza': 'Introduce mancanza di coscienza: da sola non caratterizza agonia.',
        'momento': 'Introduce la definizione temporale, senza caratterizzare agonia.',
        'temperatura': 'Da diminuzione della temperatura: la sola parola perde la variazione.'},
        {'morte': 'L’agonia precede la morte.',
         'respiro': 'La respirazione è una funzione interessata durante l’agonia.'}),
    'agosto': ('calendario giuliano', {
        'giuliano': 'Qualifica il calendario, non agosto; la parola isolata perde la locuzione.',
        'anno': 'Riferimento temporale generico, senza contributo caratteristico nel set.',
        'giorno': 'Estratto dal conteggio dei giorni, non caratteristico di agosto.'},
        {'mese': 'Agosto è un mese.', 'calendario': 'Agosto compare nel calendario.',
         'luglio': 'Luglio precede agosto.', 'settembre': 'Settembre segue agosto.'}),
    'camerata': ('camera di forma rettangolare', {
        'forma': 'Nome di supporto all’attributo: senza rettangolare rimane generico.',
        'rettangolare': 'Dettaglio geometrico non caratteristico né necessario per una camerata.'},
        {'dormitorio': 'La camerata è un ambiente adibito a dormitorio.'}),
    'cassa': ('col fine di raccogliere', {
        'fine': 'Col fine di introduce uno scopo; non è una relazione autonoma con cassa.',
        'raccogliere': 'Verbo generico privato del complemento risparmi.'},
        {'credito': 'La cassa nel senso bancario è un istituto di credito.',
         'prestito': 'La cassa nel senso bancario concede prestiti.',
         'risparmio': 'La cassa di risparmio raccoglie risparmi.'}),
}
WRONG_SENSE = {
    'agitato': ('didascalia nelle partiture',
                'Indicazione musicale non disambiguata dal prompt; scegliere un senso quotidiano.'),
    'alternativo': ('stantuffo',
                    'Senso meccanico specialistico non disambiguato dal solo prompt.'),
    'anima': ('profilato in metallo',
             'Senso strutturale specialistico non disambiguato dal solo prompt; categoria incoerente.'),
}
EDITORIAL_RECHECK = {
    ('pongo', 'materiale'): 'Categoria troppo generica: non offre un contenuto caratteristico del pongo.',
    ('pongo', 'plastico'): 'Descrittore generico e polisemico; naturalezza come risposta isolata da verificare.',
    ('terna', 'numero'): 'Membro possibile di una terna, non associazione caratteristica autonoma.',
    ('terna', 'gruppo'): 'Genere troppo ampio: perde la specificazione di tre elementi.',
}


def jsonl(path):
    with path.open(encoding='utf-8-sig') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def write_jsonl(path, records):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        for row in records:
            stream.write(json.dumps(row, ensure_ascii=False)+'\n')


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def contextual_case(record):
    prompt = canonical(record['prompt'])
    text = canonical(record.get('source_gloss') or '')
    case = CASES.get(prompt)
    return case if case and case[0] in text else None


def evaluate(record, docs, language=None):
    """Una decisione per ogni parola originale; nessuna falsa approvazione."""
    row = deepcopy(record)
    prompt = canonical(row['prompt'])
    text = canonical(row.get('source_gloss') or '')
    revision = row.get('editorial_revision') or {}
    editorial = {canonical(r['word']): r for r in revision.get('word_reviews', [])}
    editorial_problems = editorial_errors(row) if revision else []
    case = contextual_case(row)
    wrong = WRONG_SENSE.get(prompt)
    wrong_reason = wrong[1] if wrong and wrong[0] in text and not revision else None
    if language is not None and not language['accepted']:
        wrong_reason = 'Accessibilità del prompt non superata: '+language['reason']
    outputs = []
    for original_word in row['words']:
        word = canonical(original_word)
        evidence = row.get('clue_evidence', {}).get(original_word, {})
        old_analysis = evidence.get('analysis') or {}
        source = evidence.get('source_text') or row.get('source_gloss') or ''
        source_doc = docs.get(source)
        parsed = None
        if source_doc is not None and evidence.get('kind') == 'definizione':
            surface = canonical(old_analysis.get('word') or word)
            hits = [t for t in source_doc if canonical(t.text) == surface]
            offset = (old_analysis.get('provenance') or {}).get('token_start')
            parsed = next((t for t in hits if t.idx == offset), hits[0] if len(hits)==1 else None)
        attachment = adjective_attachment(prompt, parsed) if parsed is not None else None
        reasons, signals = [], []
        status = PENDING
        if wrong_reason:
            reasons.append(wrong_reason)
            signals.append('sense_requires_regeneration')
        elif case and word in case[1]:
            status = EXCLUDE
            reasons.append(case[1][word])
            signals.append('contextual_editorial_rejection')
        elif (prompt,word) in EDITORIAL_RECHECK and revision:
            status = EXCLUDE if word != 'plastico' else PENDING
            reasons.append(EDITORIAL_RECHECK[prompt,word])
            signals.append('editorial_recheck')
        elif attachment and attachment['status'] == 'other_referent':
            status = EXCLUDE
            reasons.append('Aggettivo riferito a '+attachment.get('governor','altro nome')+', non al prompt; esclusione sintattica conservativa.')
            signals.append('adjective_other_referent')
        elif old_analysis.get('pos') == 'ADJ' and attachment is None and not revision:
            reasons.append('Il referente dell’aggettivo non è verificabile nella frase.')
            signals.append('adjective_referent_unverified')
        elif (word == 'fine' and evidence.get('kind') == 'definizione'
              and re.search(r'\b(?:al|col|con il|con lo|allo) fine di\b', canonical(source))):
            status = EXCLUDE
            reasons.append('Fine introduce lo scopo nella costruzione finale della definizione.')
            signals.append('definitional_purpose_connector')
        elif word in editorial and not editorial_problems:
            status = KEEP
            reasons.append(editorial[word]['rationale'])
            signals.append('documented_editorial_proposal_not_independent_qa')
        elif case and word in case[2]:
            status = KEEP
            reasons.append(case[2][word])
            signals.append('contextual_editorial_proposal_not_independent_qa')
        else:
            reasons.append('Manca una selezione semantica individuale: la provenienza lessicale non basta.')
            signals.append('missing_editorial_selection')
            if editorial_problems:
                reasons.extend(editorial_problems)
            if evidence.get('kind') == 'relazione_lessicale' and not evidence.get('source_scope_verified'):
                signals.append('unverified_relation_scope')
            if word in {'forma','aspetto','dimensione','caratteristica','funzione','struttura','momento','mancanza'}:
                signals.append('possible_generic_descriptor_requires_context_review')
        outputs.append({'word':original_word,'status':status,'reasons':reasons,'signals':signals,
                        'source_text':source, 'adjective_attachment':attachment})
    kept = [w['word'] for w in outputs if w['status']==KEEP]
    return {'prompt':record['prompt'],'candidate_id':record['candidate_id'],
            'category_id':record.get('category_id'),'category_name':record.get('category_name'),
            'source_sense_id':record.get('sense_id'),'original_words':record['words'],
            'retained_words':kept,
            'excluded_words':[w['word'] for w in outputs if w['status']==EXCLUDE],
            'pending_words':[w['word'] for w in outputs if w['status']==PENDING],
            'words_review':outputs,'complete_editorial_set':len(kept)==7,
            'status':'CANDIDATO_EDITORIALE_NON_APPROVATO' if len(kept)==7 else 'IN_REVISIONE',
            'independent_review':'NOT_RUN','human_review':'NOT_RUN','approved':False,
            'prompt_familiarity':language,
            'set_signals':screen_set(record['prompt'],record['words'],record)['signals']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).parent/'generated-v3_6_0')
    parser.add_argument('--batch', default='0003')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    suffix = args.batch
    metadata = args.directory/f'word_association_it_5000_metadati_{suffix}.jsonl'
    public = args.directory/f'word_association_it_5000_candidati_{suffix}.csv'
    technical = args.directory/f'word_association_it_5000_gioco_{suffix}.csv'
    records = jsonl(metadata)
    with public.open(encoding='utf-8-sig', newline='') as f:
        csv_rows = list(csv.DictReader(f))
    if len(csv_rows)!=len(records):
        raise ValueError('CSV e metadati hanno lunghezze diverse')
    if len({canonical(r['prompt']) for r in records})!=len(records):
        raise ValueError('Prompt duplicati nei metadati')
    for row,record in zip(csv_rows,records):
        if canonical(row['prompt'])!=canonical(record['prompt']) or row['words'].split('|')!=record['words']:
            raise ValueError('CSV e metadati discordanti: '+record['prompt'])
    if args.output.exists():
        raise FileExistsError('Usare una nuova cartella per conservare l’audit precedente')
    args.output.mkdir(parents=True)
    archive = args.output/'originali'
    archive.mkdir()
    sources = {}
    for source in (public,technical,metadata):
        sources[source.name] = {'path':str(source.resolve()),'sha256':sha256(source)}
        shutil.copy2(source,archive/source.name)
    texts = sorted({e.get('source_text') or r.get('source_gloss') or ''
                    for r in records for e in r.get('clue_evidence',{}).values()
                    if e.get('kind')=='definizione'}-{''})
    nlp = load_italian_nlp()
    if 'parser' not in nlp.pipe_names:
        raise RuntimeError('Serve il parser italiano per il referente degli aggettivi')
    print(f'Analizzo {len(texts)} frasi sorgenti e {len(records)} set.',flush=True)
    docs = {}
    for i,(text,doc) in enumerate(zip(texts,nlp.pipe(texts,batch_size=64)),1):
        docs[text] = doc
        if i%1000==0:
            print(f'Frasi analizzate: {i}/{len(texts)}',flush=True)
    from wordfreq import zipf_frequency
    policy = load_prompt_policy()
    audits = []
    for record in records:
        previous_language = record.get('prompt_familiarity') or {}
        language = screen_prompt(canonical(record['prompt']),zipf_frequency(record['prompt'],'it'),policy,
                                 previous_language.get('source_signals',[]),previous_language.get('frequency_reference'))
        audits.append(evaluate(record,docs,language))
    selected, pending = [], []
    audit_table = [['prompt','parola','esito','motivo','segnali','fonte']]
    for record,audit,row in zip(records,audits,csv_rows):
        for word in audit['words_review']:
            audit_table.append([row['prompt'],word['word'],word['status'],' '.join(word['reasons']),
                                '|'.join(word['signals']),word['source_text']])
        if audit['complete_editorial_set']:
            copy = deepcopy(record)
            copy['conservative_filter'] = {'policy':POLICY,'approved':False,'independent_review':'NOT_RUN'}
            selected.append((copy,row))
        else:
            pending.append({'record':record,'filter':audit,'action':'Sostituire le risposte escluse e verificare quelle dubbie sullo stesso prompt'})
    write_jsonl(args.output/f'audit_parole_{suffix}.jsonl',audits)
    write_jsonl(args.output/f'set_in_revisione_{suffix}.jsonl',pending)
    write_jsonl(args.output/f'metadati_filtrati_{suffix}.jsonl',[record for record,_ in selected])
    public_header = ['ref','source','language','prompt','words']
    public_matrix = [public_header]+[[row[k] for k in public_header] for _,row in selected]
    payload = {'csvs':[{'file':f'candidati_filtrati_{suffix}.csv','sheet':'Candidati','matrix':public_matrix},
                       {'file':f'audit_parole_{suffix}.csv','sheet':'Audit','matrix':audit_table}]}
    (args.output/'export_payload.json').write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    counts = Counter(word['status'] for audit in audits for word in audit['words_review'])
    report = {'policy':POLICY,'semantic_policy':SEMANTIC_POLICY,'batch':suffix,
              'source_files':sources,'input_sets':len(records),'input_pairs':sum(len(r['words']) for r in records),
              'complete_editorial_sets':len(selected),'pending_sets':len(pending),'pair_statuses':dict(counts),
              'approved':0,'independent_reviews_performed':0,'prompts_deleted':0,
              'export_status':'CANDIDATI_EDITORIALI_DA_QA',
              'parser':{'model':nlp.meta.get('name'),'version':nlp.meta.get('version')},
              'method':'Filtro conservativo: casi editoriali contestuali, dipendenze sintattiche, esclusione dall’export di tutte le selezioni semantiche mancanti.',
              'limits':['Le coppie dubbie non sono dichiarate false: sono conservate in revisione.',
                        'Un’analisi sintattica non prova pertinenza o recuperabilità semantica.',
                        'I set esportati sono proposte editoriali, non approvazioni indipendenti.'],
              'observed_cases':{a['prompt']:{k:a[k] for k in ('retained_words','excluded_words','pending_words')}
                                for a in audits if canonical(a['prompt']) in set(CASES)|set(WRONG_SENSE)}}
    for filename, source in sources.items():
        if sha256(Path(source['path']))!=source['sha256'] or sha256(archive/filename)!=source['sha256']:
            raise RuntimeError('Sorgente cambiata durante il filtro: '+filename)
    (args.output/f'rapporto_filtro_{suffix}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('input_sets','input_pairs','complete_editorial_sets','pending_sets','pair_statuses')},ensure_ascii=False),flush=True)
    return 0


if __name__=='__main__':
    raise SystemExit(main())
