#!/usr/bin/env python3
"""Word Association IT v3.6.0 — CONTEXT PROMPT visibile, 7 risposte da indovinare.

Controlli deterministici standard senza dipendenze di terze parti.
Audit lessicale facoltativo con spaCy + risorse di frequenza/DF REALI.
Non simula risposte dei giocatori, test ciechi o prove semantiche indipendenti.
Il CSV finale mantiene ref,source,language,prompt,words.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from itertools import combinations
import csv
from dataclasses import dataclass, field
import math
import json
from pathlib import Path
import re
import secrets
import unicodedata
from typing import Any, Mapping
from semantic_rules import (SEMANTIC_POLICY, WORD_CHECKS, SET_CHECKS,
                            qa_word_checks_valid, screen_set, SOURCE_ONLY_REASON, adjective_attachment)

TOKEN_PATTERN = re.compile(r"[a-zàèéìòù]+\Z")
FUNCTION_POS = frozenset({"DET", "PRON", "ADP", "CCONJ", "SCONJ", "AUX", "PART", "INTJ", "SYM", "PUNCT", "X", "NUM"})
FUNCTION_LEMMAS = frozenset({
    "suo", "mio", "tuo", "nostro", "vostro", "loro", "questo", "quello", "esso",
    "essere", "avere", "stare", "fare", "molto", "poco", "tanto", "troppo",
    "più", "meno", "sempre", "mai", "già", "ancora", "qui", "qua", "lì", "là",
})
SHORT_CONTENT_LEMMAS = frozenset({"re", "do", "fa", "mi", "la", "si"})  # solo se POS=NOUN nel contesto
GENERIC_LEMMAS = frozenset({
    "bello", "brutto", "grande", "piccolo", "buono", "cattivo", "alto", "basso",
    "nuovo", "vecchio", "cosa", "oggetto", "persona", "gente", "uomo", "donna",
    "italia", "italiano", "mondo", "vita", "luogo", "posto", "tempo", "modo",
    "tipo", "parte", "fatto", "esempio",
})


def canon(s: str) -> str:
    """Normalizzazione ortografica canonica, senza modificare accenti di fonte."""
    return unicodedata.normalize("NFC", s).casefold()


def normalize_dictionary_form(s: str, *, source: str, allow_historical: bool = False) -> tuple[str, list[str]]:
    """Normalizza una *fonte dizionariale* con audit, non il testo libero indiscriminatamente.

    In italiano moderno ú e í a fine parola sono generalmente scritti ù/ì; î storico
    è ammesso solo quando la fonte ne documenta il valore. Non si assume che tutte
    le forme accentate siano sicure da traslitterare senza un revisore.
    """
    text = canon(s)
    modifications: list[str] = []
    for before, after in (("í", "ì"), ("ú", "ù")):
        if before in text:
            text = text.replace(before, after)
            modifications.append(f"{source}: {before} -> {after}")
    if "î" in text:
        if not allow_historical:
            raise ValueError(f"Forma con î richiede normalizzazione esplicita per la fonte {source}")
        text = text.replace("î", "i")
        modifications.append(f"{source}: î -> i (forma storica verificata)")
    return text, modifications


def load_italian_nlp(model: str = "it_core_news_md"):
    from italian_nlp import load_spacy
    return load_spacy(model)


@dataclass
class LexicalResources:
    """Frequenze: rank 1 = piu' frequente. Document frequency: presenza in documenti DISTINTI.
    L'assenza delle risorse e' resa esplicita; non implica filtro superato."""
    frequency_ranks: Mapping[str, int] | None = None
    definition_document_counts: Mapping[str, int] | None = None
    total_definitions: int | None = None
    frequency_top_n: int = 2500
    specificity_max_ratio: float = 0.08

    def __post_init__(self):
        if self.frequency_top_n < 0 or not 0 <= self.specificity_max_ratio <= 1:
            raise ValueError("Soglie fuori intervallo")
        if self.definition_document_counts is not None and not (self.total_definitions and self.total_definitions > 0):
            raise ValueError("total_definitions deve essere > 0 se si passano i conteggi delle definizioni")


def load_frequency_ranks(path: str | Path) -> dict[str, int]:
    """CSV UTF-8: lemma,rank. I rank devono provenire da un corpus esterno verificabile."""
    data = {}
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            word = canon(row["lemma"].strip())
            rank = int(row["rank"])
            if rank <= 0 or not TOKEN_PATTERN.fullmatch(word):
                raise ValueError(f"Rango o lemma invalido nel file frequenze: {row!r}")
            data[word] = min(rank, data.get(word, rank))
    return data


def load_definition_document_counts(path: str | Path) -> tuple[dict[str, int], int]:
    """CSV UTF-8: lemma,document_count,total_documents (un corpus omogeneo)."""
    counts = {}
    total = None
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            word = canon(row["lemma"].strip())
            count = int(row["document_count"])
            n = int(row["total_documents"])
            if not word or not TOKEN_PATTERN.fullmatch(word) or n <= 0 or count < 0 or count > n or (total is not None and n != total):
                raise ValueError(f"Statistiche di definizioni invalidi: {row!r}")
            counts[word] = count
            total = n
    if total is None:
        raise ValueError("Il file delle definizioni non contiene dati")
    return counts, total


def build_definition_document_counts(definitions: list[str], nlp) -> tuple[dict[str, int], int]:
    """Conteggio per definizione, non occorrenze. Idealmente stratificare per macro-categoria."""
    counts: Counter[str] = Counter()
    for doc in nlp.pipe(definitions, batch_size=128):
        lemmas = {canon(t.lemma_) for t in doc if getattr(t, "lemma_", "") and TOKEN_PATTERN.fullmatch(canon(t.text))}
        counts.update(lemmas)
    return dict(counts), len(definitions)


def check_token(prompt: str, token, resources: LexicalResources | None = None,
                source: str = "definizione", definition_id: str | None = None) -> dict[str, Any]:
    """Valuta un token GIA' analizzato da un modello italiano. Return: excluded / review / candidate.
    candidate significa soltanto che i filtri sono superati, NON che e' un buon risposteo."""
    res = resources if resources is not None else LexicalResources()
    surface = canon(token.text)
    lemma = canon(getattr(token, "lemma_", "") or "")
    pos = getattr(token, "pos_", "") or ""
    reasons = []
    notices = []
    checked = ["single_token", "minimum_length", "pos", "lemma", "generic_lemmas", "spacy_stop_words"]
    if not TOKEN_PATTERN.fullmatch(surface):
        reasons.append("invalid_token")
    if len(surface) <= 2 and not (lemma in SHORT_CONTENT_LEMMAS and pos == "NOUN"):
        reasons.append("too_short")
    elif len(surface) <= 2:
        notices.append("short_content_word:contextual_review")
    if pos in FUNCTION_POS:
        reasons.append(f"functional_pos:{pos}")
    if lemma in FUNCTION_LEMMAS:
        reasons.append("function_lemma")
    if lemma in GENERIC_LEMMAS:
        notices.append("generic_answer_requires_context_review")
    if bool(getattr(token, "is_stop", False)):
        (reasons if pos in FUNCTION_POS else notices).append("spacy_stopword_contextual")
    if not lemma or not pos:
        reasons.append("missing_morphological_analysis")

    rank = None
    definition_ratio = None
    if res.frequency_ranks is not None:
        checked.append("frequency_rank")
        rank = res.frequency_ranks.get(lemma)
        prompt_rank = res.frequency_ranks.get(canon(prompt))
        if rank is not None and rank <= res.frequency_top_n:
            if prompt_rank is not None and prompt_rank <= res.frequency_top_n:
                notices.append("common_clue_and_common_prompt:contextual_review")
            else:
                notices.append("very_common_lemma:review")
        elif rank is None:
            notices.append("frequency_rank_unknown:review")
    else:
        notices.append("frequency_resource_missing")
    if res.definition_document_counts is not None:
        checked.append("definition_specificity")
        definition_ratio = res.definition_document_counts.get(lemma, 0) / res.total_definitions
        if definition_ratio > res.specificity_max_ratio:
            notices.append("high_document_frequency:review")
    else:
        notices.append("specificity_resource_missing")

    status = "excluded" if reasons else "review" if notices else "candidate"
    return {
        "word": surface, "lemma": lemma, "pos": pos, "status": status,
        "exclusion_reasons": sorted(set(reasons)), "review_flags": sorted(set(notices)),
        "provenance": {
            "source": source, "source_id": definition_id, "rule": "token_in_definition",
            "filters_applied": checked, "frequency_rank": rank,
            "definition_doc_frequency_ratio": definition_ratio,
            "score": None,  # non inventare un punteggio senza valutazione semantica
            "token_start": getattr(token, "idx", None),
        },
    }


def filter_definition(prompt: str, definition: str, nlp,
                      resources: LexicalResources | None = None,
                      definition_id: str | None = None) -> list[dict[str, Any]]:
    """Lavora sui token di UNA definizione. Le locuzioni non diventano un solo risposteo.
    Restituisce audit di tutti i token, inclusi quelli esclusi, per tracciabilita'."""
    output = []
    seen = set()
    model = getattr(nlp, 'meta', {}).get('zerocade_nlp')
    for tok in nlp(definition):
        item = check_token(prompt, tok, resources, definition_id=definition_id)
        item['provenance'].update(analysis_kind='model_prediction', context=definition)
        if model:
            from italian_nlp import digest
            item['provenance']['model'] = {key: model[key] for key in
                                           ('engine', 'library_version', 'model', 'model_version')}
            item['provenance']['model_id'] = digest(model)
        attachment = adjective_attachment(prompt, tok)
        if attachment is not None:
            item['adjective_attachment'] = attachment
            item['provenance']['filters_applied'].append('direct_adjective_reference')
            if attachment['status'] != 'direct':
                item['status'] = 'excluded'
                item['exclusion_reasons'].append('adjective_' + attachment['status'])
        if item["lemma"] in seen and item["status"] != "excluded":
            item["status"] = "excluded"
            item["exclusion_reasons"].append("duplicate_lemma_in_definition")
        if item["status"] != "excluded":
            seen.add(item["lemma"])
        output.append(item)
    return output



def extract_lemmas_from_definition(prompt: str, definition: str, nlp,
                                   resources: LexicalResources | None = None,
                                   definition_id: str | None = None,
                                   lexicalized_forms: set[str] | None = None) -> list[dict[str, Any]]:
    """Restituisce candidati con forma canonica di *lemma*; preserva la forma originaria.

    Eccezioni di forma superficiale: soltanto una whitelist esplicita e revisionata
    (participi o plurali lessicalizzati), mai come automatismo POS.
    """
    lexicalized = {canon(x) for x in (lexicalized_forms or set())}
    candidates = []
    for item in filter_definition(prompt, definition, nlp, resources, definition_id):
        if item["status"] == "excluded":
            continue
        surface = item["word"]
        lemma = item["lemma"]
        clue = surface if surface in lexicalized else lemma
        clue = canon(clue)
        if not TOKEN_PATTERN.fullmatch(clue):
            continue
        item = dict(item)
        item["suggested_clue"] = clue
        item["surface_override"] = surface in lexicalized
        item["provenance"] = dict(item["provenance"],
                                  selected_form="surface" if surface in lexicalized else "lemma")
        candidates.append(item)
    return candidates


try:
    from nltk.stem.snowball import SnowballStemmer
    from functools import lru_cache
    _stemmer_it = SnowballStemmer("italian")
    @lru_cache(maxsize=80000)
    def _stem_it(s: str) -> str:
        return _stemmer_it.stem(s)
except ImportError:
    def _stem_it(s: str) -> str:
        return ""


def morphological_overlap_candidates(a: str, b: str) -> set[str]:
    """Snowball + inclusione (SOLO segnalazioni; non sono test etimologici)."""
    a, b = canon(a), canon(b)
    flags = set()
    if (len(a) >= 5 and a in b) or (len(b) >= 5 and b in a):
        flags.add("lemma_containment")
    sa, sb = _stem_it(a), _stem_it(b)
    if sa and sb and sa == sb:
        flags.add("snowball_stem_match")
    return flags


HEADER = ['ref', 'source', 'language', 'prompt', 'words']
TOKEN = re.compile(r'^[a-zàèéìòù]+$')
ID = re.compile(r'^c[a-z0-9]{24}$')
BLACKLIST = {'bello','brutto','grande','piccolo','buono','cattivo','alto','basso',
    'nuovo','vecchio','cosa','oggetto','persona','gente','uomo','donna','italia',
    'italiano','mondo','vita','luogo','posto','tempo','modo','tipo','parte',
    'fatto','esempio'}
DIM_WEIGHTS = {'Individuabilità':35,'Pertinenza':25,'Difficoltà':20,'Originalità':10,'Familiarità':10}
POS = {'NOUN','VERB','ADJ'}
RELATIONS = {'funzione','causa','processo','ruolo','contrasto','metafora','proprietà','contesto','sensoriale','altro','parte','materiale','luogo','strumento','ingrediente','attività','categoria','sinonimia','effetto'}


def norm(s: str) -> str:
    return unicodedata.normalize('NFC', s).casefold()



TAXONOMY_COLUMNS = ['category_id','cluster_id','cluster_name','category_name','example_prompts','quota_status']
TAXONOMY_FILENAME = 'tassonomia_word_association_it_172_categorie_v3_6_0.csv'


def load_taxonomy(path: Path) -> dict[str, dict[str, str]]:
    """Verifica il catalogo ufficiale e restituisce category_id => record."""
    with path.open(encoding='utf-8-sig', newline='') as f:
        rdr = csv.DictReader(f)
        if list(rdr.fieldnames or []) != TAXONOMY_COLUMNS:
            raise ValueError(f'Intestazione tassonomia non valida: {rdr.fieldnames!r}')
        entries = {}
        categories = set()
        clusters = {}
        for line, row in enumerate(rdr, 2):
            cid=row['category_id']
            if not re.fullmatch(r'[0-9]{3}', cid):
                raise ValueError(f'Riga {line}: category_id deve essere a 3 cifre: {cid!r}')
            if cid in entries:
                raise ValueError(f'Riga {line}: category_id duplicato: {cid}')
            title=row['category_name'].strip()
            if not title or title.casefold() in categories:
                raise ValueError(f'Riga {line}: nome categoria vuoto o duplicato: {title!r}')
            categories.add(title.casefold())
            cluster=row['cluster_id'].strip()
            if not re.fullmatch(r'[A-P]',cluster):
                raise ValueError(f'Riga {line}: cluster_id non valido: {cluster!r}')
            if cluster in clusters and clusters[cluster]!=row['cluster_name']:
                raise ValueError(f'Riga {line}: nome cluster incoerente')
            clusters[cluster]=row['cluster_name']
            entries[cid]=row
    expected={f'{i:03d}' for i in range(1,173)}
    if set(entries)!=expected:
        missing=sorted(expected-set(entries))
        extra=sorted(set(entries)-expected)
        raise ValueError(f'Attesi 172 ID 001..172; presenti {len(entries)}; mancanti={missing[:12]}, extra={extra[:12]}')
    if len(clusters)!=16:
        raise ValueError(f'Attesi 16 cluster, trovati {len(clusters)}')
    return entries


def find_taxonomy(explicit:Path|None) -> Path|None:
    if explicit is not None:
        return explicit
    for path in (Path(__file__).resolve().parent / TAXONOMY_FILENAME,
                 Path.cwd()/TAXONOMY_FILENAME):
        if path.is_file():
            return path
    return None


def compare_candidate_metadata(items:list[dict], taxonomy:dict[str,dict]) -> dict:
    counts=Counter(x['category_id'] for x in items if x.get('category_id') in taxonomy)
    clusters=Counter(taxonomy[cid]['cluster_id'] for cid,n in counts.items() for _ in range(n))
    return {'candidates_by_category':dict(sorted(counts.items())),
            'candidates_by_cluster':dict(sorted(clusters.items())),
            'covered_categories':len(counts), 'uncovered_categories':172-len(counts),
            'note':'Le categorie senza candidati non sono un errore su lotti pilota.'}


# ===== v3.6.0: semantica UNIDIREZIONALE prompt visibile -> sette risposte =====
CANDIDATE_SCHEMA = 'word-association-candidate-3.6.0'
QA_SCHEMA = 'word-association-qa-3.6.0'
STRATEGIES = {'balanced_322', 'convergent_free'}
DIFFICULTIES = {'facile', 'media', 'alta'}
CONTENT_POS = {'NOUN', 'VERB', 'ADJ', 'ADV'}


def _valid_word(value):
    return isinstance(value, str) and bool(TOKEN.fullmatch(value)) and norm(value) == value


def read_jsonl(path: Path):
    for line_number, line in enumerate(path.read_text(encoding='utf-8-sig').splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            yield line_number, None, f'JSON non valido: {exc}'
            continue
        if not isinstance(item, dict):
            yield line_number, None, 'Atteso oggetto JSON'
        else:
            yield line_number, item, None


def check_csv(path: Path, min_rows: int = 0, max_answer_frequency: float = 0.01,
              max_shared_answers: int = 2, samples: int = 25,
              multiword_lexicon: Path | None = None) -> dict[str, Any]:
    '''Controlla il CSV di gioco: prompt VISIBILE e sette RISPOSTE nascoste.

    Le sovrapposizioni tra risposte di contesti differenti non sono, da sole,
    prove di ambiguità; l'indice invertito usa coppie di risposte.
    '''
    errors, warnings, counts = [], [], Counter()
    entries, seen_refs, seen_prompts, sets = [], {}, {}, {}
    frequency = Counter()

    def add(level, kind, message):
        counts[f'{level}:{kind}'] += 1
        target = errors if level == 'error' else warnings
        if len(target) < samples:
            target.append(message)

    try:
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.reader(stream)
            header = next(reader, [])
            if header != HEADER:
                add('error', 'header', f'Intestazione {header!r}, attesa {HEADER!r}')
                return {'rows':0,'errors_count':1,'warnings_count':0,'errors':errors,
                        'warnings':warnings,'counts':dict(counts)}
            for lineno, row in enumerate(reader, 2):
                if len(row) != 5:
                    add('error', 'columns', f'Riga {lineno}: {len(row)} colonne anziché 5')
                    continue
                ref, source, language, prompt, raw = row
                answers = raw.split('|')
                if not ID.fullmatch(ref):
                    add('error','ref',f'Riga {lineno}: ref malformato')
                if ref in seen_refs:
                    add('error','duplicate_ref',f'Riga {lineno}: ref duplicato alla {seen_refs[ref]}')
                seen_refs[ref] = lineno
                if not _valid_word(prompt):
                    add('error','prompt_format',f'Riga {lineno}: contesto non canonico {prompt!r}')
                elif prompt in seen_prompts:
                    add('error','duplicate_prompt',f'Riga {lineno}: contesto {prompt!r} duplicato alla {seen_prompts[prompt]}')
                seen_prompts[prompt] = lineno
                if source != 'platform' or language != 'it':
                    add('error','metadata',f'Riga {lineno}: source/language non conformi')
                if len(answers) != 7:
                    add('error','answer_count',f'Riga {lineno}: attese 7 risposte, trovate {len(answers)}')
                if any(not _valid_word(w) for w in answers):
                    add('error','answer_format',f'Riga {lineno}: risposte non canoniche')
                if len(set(answers)) != len(answers):
                    add('error','duplicate_answers',f'Riga {lineno}: risposte ripetute')
                if prompt in answers:
                    add('error','prompt_as_answer',f'Riga {lineno}: il contesto compare fra le risposte')
                for word in set(answers):
                    if word in BLACKLIST:
                        add('warning','generic_answer',f'Riga {lineno}: {word!r} generico, verificare se indovinabile nel contesto')
                    if _valid_word(word):
                        frequency[word] += 1
                for a,b in combinations([prompt]+answers,2):
                    if _valid_word(a) and _valid_word(b) and len(a)>=5 and len(b)>=5:
                        flags=morphological_overlap_candidates(a,b)
                        if flags:
                            add('warning','morphology',f'Riga {lineno}: parentela {a}/{b} {sorted(flags)} (non prova di errore)')
                for signal in screen_set(prompt, answers)['signals']:
                    add('warning', 'semantic:'+signal['code'],
                        f'Riga {lineno}: {signal["code"]}: {signal["words"]}; revisione contestuale, mantenere il prompt')
                aset=frozenset(answers)
                if len(answers)==7 and len(aset)==7 and all(_valid_word(x) for x in aset):
                    signature=tuple(sorted(aset))
                    if signature in sets:
                        add('error','identical_answer_set',f'Riga {lineno}: stesse sette risposte della riga {sets[signature]}')
                    sets[signature]=lineno
                entries.append({'line':lineno,'prompt':prompt,'answers':aset})
    except (OSError, UnicodeError, csv.Error) as exc:
        add('error','read',f'Errore lettura: {exc}')
    if len(entries)<min_rows:
        add('error','min_rows',f'Righe {len(entries)} inferiori al minimo {min_rows}')
    if len(entries)>=1000:
        for w,n in frequency.items():
            if n/len(entries)>max_answer_frequency:
                add('warning','global_answer_frequency',f'Risposta {w!r}: {n}/{len(entries)} (segnale, non errore)')
    # Indice invertito su coppie (21 chiavi/set), non confronto O(N^2) esaustivo.
    inverted=defaultdict(list)
    for i,e in enumerate(entries):
        if len(e['answers'])==7:
            for pair in combinations(sorted(e['answers']),2):
                inverted[pair].append(i)
    candidate_pairs=set()
    for postings in inverted.values():
        if len(postings)>1:
            candidate_pairs.update(combinations(postings,2))
    collisions=[]
    for a,b in sorted(candidate_pairs):
        overlap=entries[a]['answers'] & entries[b]['answers']
        shared=len(overlap)
        if shared<=max_shared_answers:continue
        severity='high' if shared>=5 else 'review'
        item={'context_a':entries[a]['prompt'],'context_b':entries[b]['prompt'],
              'shared_answers':sorted(overlap),'count':shared,
              'jaccard':round(shared/(14-shared),6),'priority':severity}
        if len(collisions)<samples:collisions.append(item)
        add('warning','overlapping_answer_sets',f"{item['context_a']} / {item['context_b']}: {shared} risposte condivise ({severity})")
    multiword=[]
    if multiword_lexicon:
        try:
            with multiword_lexicon.open(encoding='utf-8-sig',newline='') as stream:
                for lex in csv.DictReader(stream):
                    context=norm(lex.get('prompt',''))
                    terms={norm(w.strip()) for w in lex.get('domain_terms','').split('|') if w.strip()}
                    for entry in entries:
                        if norm(entry['prompt'])==context and (not terms or terms & entry['answers']):
                            multiword.append({'prompt':entry['prompt'],'expression':lex.get('expression',''),
                                              'matching_answers':sorted(terms & entry['answers'])})
                            add('warning','multiword_association',f"Contesto {context}: possibile risposta dipendente dalla locuzione {lex.get('expression')!r}")
        except (OSError, csv.Error) as exc:
            add('error','multiword_resource',str(exc))
    prompts={norm(e['prompt']) for e in entries}
    cross={w:n for w,n in frequency.items() if w in prompts}
    return {'file':str(path),'game_direction':'visible_prompt_to_hidden_answers',
            'rows':len(entries),'errors_count':sum(v for k,v in counts.items() if k.startswith('error:')),
            'warnings_count':sum(v for k,v in counts.items() if k.startswith('warning:')),
            'errors':errors,'warnings':warnings,'counts':dict(counts),
            'collision_examples':collisions,'answer_frequency_top':frequency.most_common(20),
            'other_prompts_used_as_answers':cross,'multiword_warnings':multiword[:samples],
            'limits':['Le risposte possono essere condivise tra contesti diversi.',
                      'Somiglianza lessicale non prova difficoltà o recuperabilità.',
                      'Nessun test umano o LLM viene simulato.']}


def check_candidates_jsonl(path:Path, taxonomy:dict[str,dict]|None=None, samples:int=25)->dict:
    errors, warnings=[],[]
    planning_notes=[]
    counts=Counter(); relations=Counter(); cats=Counter(); batches=Counter()
    seen_ids={}; seen_prompts=defaultdict(list); lineage=[]; items=0
    semantic_counts=Counter();semantic_examples=[];semantic_sets=0;editorial_missing=0
    for ln,d,err in read_jsonl(path):
        if err:errors.append(f'Riga {ln}: {err}');continue
        items+=1
        if d.get('schema_version')!=CANDIDATE_SCHEMA:
            errors.append(f'Riga {ln}: schema_version atteso {CANDIDATE_SCHEMA}')
        cid=d.get('candidate_id')
        if not isinstance(cid,str) or not cid.strip() or cid in seen_ids:
            errors.append(f'Riga {ln}: candidate_id mancante o duplicato')
        else:seen_ids[cid]=ln
        p=d.get('prompt');w=d.get('words');cat=d.get('category_id')
        if not _valid_word(p):errors.append(f'Riga {ln}: prompt/contesto non valido')
        else:seen_prompts[p].append((ln,cid,d.get('parent_candidate_id')))
        if not isinstance(w,list) or len(w)!=7 or any(not _valid_word(a) for a in w):
            errors.append(f'Riga {ln}: words richiede sette risposte canoniche')
        elif len(set(w))!=7 or p in w:
            errors.append(f'Riga {ln}: risposte duplicate o uguali al prompt')
        if _valid_word(p) and isinstance(w,list) and len(w)==7 and all(_valid_word(a) for a in w):
            screen=screen_set(p,w,d)
            if screen['signals']:
                semantic_sets+=1
                semantic_counts.update(s['code'] for s in screen['signals'])
                if len(semantic_examples)<samples:semantic_examples.append(screen)
        editorial_missing+=not bool(d.get('editorial_revision'))
        if not isinstance(d.get('pos'),str) or d.get('pos') not in POS:errors.append(f'Riga {ln}: POS del contesto non valido')
        if not isinstance(d.get('difficulty_estimate'),str) or d.get('difficulty_estimate') not in {'media','alta'}:
            errors.append(f'Riga {ln}: difficoltà complessiva stimata non valida')
        wd=d.get('word_difficulty_estimates')
        if not isinstance(wd,list) or len(wd)!=7 or any(not isinstance(x,str) or x not in DIFFICULTIES for x in wd):
            errors.append(f'Riga {ln}: word_difficulty_estimates deve avere 7 valori facile/media/alta')
        wp=d.get('word_pos')
        if wp is not None and (not isinstance(wp,list) or len(wp)!=7 or any(x not in POS for x in wp)):
            errors.append(f'Riga {ln}: word_pos non valido')
        rs=d.get('relations')
        if not isinstance(rs,list) or len(rs)!=7 or any(not isinstance(x,str) or x not in RELATIONS for x in rs):
            errors.append(f'Riga {ln}: relations deve avere sette etichette enum')
        else:relations.update(rs)
        if not isinstance(d.get('strategy'),str) or d.get('strategy') not in STRATEGIES:
            errors.append(f'Riga {ln}: strategy attesa balanced_322 o convergent_free')
        if not isinstance(d.get('batch_id'),str) or not d['batch_id'].strip():
            errors.append(f'Riga {ln}: batch_id obbligatorio')
        else:batches[d['batch_id']]+=1
        if not isinstance(cat,str) or not re.fullmatch('[0-9]{3}',cat):
            errors.append(f'Riga {ln}: category_id formato 001..172 obbligatorio')
        elif taxonomy is not None and cat not in taxonomy:
            errors.append(f'Riga {ln}: category_id {cat} non nel catalogo')
        else:cats[cat]+=1
        attempt=d.get('repair_attempt');parent=d.get('parent_candidate_id','__absent__')
        if type(attempt)!=int or attempt not in (0,1):
            errors.append(f'Riga {ln}: repair_attempt obbligatorio 0 o 1')
        elif attempt==0 and parent is not None:
            errors.append(f'Riga {ln}: tentativo iniziale deve avere parent_candidate_id=null')
        elif attempt==1 and (not isinstance(parent,str) or not parent.strip() or parent==cid):
            errors.append(f'Riga {ln}: riparazione richiede parent_candidate_id valido')
        if isinstance(parent,str) and parent not in {'__absent__',''}:
            lineage.append((ln,parent,cid,p))
        counts['pos:'+str(d.get('pos'))]+=1
        counts['difficulty:'+str(d.get('difficulty_estimate'))]+=1
        if isinstance(wd,list):counts.update('answer_difficulty:'+str(x) for x in wd)
    for p, versions in seen_prompts.items():
        if len(versions)>1:
            ids={v[1] for v in versions}
            roots=[v for v in versions if v[2] is None]
            repairs=[v for v in versions if isinstance(v[2],str) and v[2] in ids]
            if len(roots)!=1 or len(versions)!=2 or len(repairs)!=1 or repairs[0][2]!=roots[0][1]:
                errors.append(f'Contesto {p!r}: versioni duplicate senza una sola riparazione diretta')
    for ln,parent,cid,p in lineage:
        if parent not in seen_ids:
            warnings.append(f'Riga {ln}: padre {parent!r} non incluso nel lotto (verificare archivio genealogico)')
    n=items
    if n>=30:
        for tag,target in [('NOUN',.7),('VERB',.2),('ADJ',.1)]:
            ratio=counts['pos:'+tag]/n
            if abs(ratio-target)>.05:
                planning_notes.append(f'POS contesti {tag}: {ratio:.1%} vs piano orientativo {target:.0%}; compensazione ammessa, anche senza verbi')
        for tag,target in [('media',.7),('alta',.3)]:
            ratio=counts['difficulty:'+tag]/n
            if abs(ratio-target)>.05:
                warnings.append(f'Difficoltà set {tag}: {ratio:.1%} vs target {target:.0%} (stimato)')
        total=sum(relations.values())
        for rel,c in relations.items():
            if total and c/total>.25:
                warnings.append(f'Relazione {rel}: {c/total:.1%} > obiettivo aggregato 25% (NON gate)')
    clusters=Counter()
    if taxonomy:
        for cat,nc in cats.items():
            if cat in taxonomy:clusters[taxonomy[cat]['cluster_id']]+=nc
    return {'file':str(path),'items':n,'errors_count':len(errors),'warnings_count':len(warnings),
            'errors':errors[:samples],'warnings':warnings[:samples],
            'by_category':dict(sorted(cats.items())),'by_cluster':dict(sorted(clusters.items())),
            'covered_categories':len(cats),'batches':dict(batches),
            'planning_notes':planning_notes,'pos_quotas_are_mandatory':False,
            'distribution':dict(counts),'relations':dict(relations),
            'semantic_screen':{'policy':SEMANTIC_POLICY,'sets_with_signals':semantic_sets,
                'signals':dict(semantic_counts),'examples':semantic_examples,
                'without_editorial_selection':editorial_missing,'semantic_approval':False,
                'action':'Cercare sostituzioni mantenendo il prompt; QA indipendente da eseguire'},
            'limits':['Metadati autodeclarati dal generatore: non certificano associazioni, difficoltà o POS.',
                      'Il test reale va nella direzione prompt visibile -> risposte nascoste.']}


def assemble_candidates(path:Path, output:Path)->int:
    '''Esporta candidati, mai approvati. Richiede UNA versione selezionata per contesto.'''
    ids=set(); seen_prompts=set(); rows=[]
    for _,d,err in read_jsonl(path):
        if err:raise ValueError(err)
        prompt=d['prompt']
        if prompt in seen_prompts:
            raise ValueError(f'Il contesto {prompt!r} ha più versioni: selezionare un solo candidato prima dell’export')
        seen_prompts.add(prompt)
        ref='c'+secrets.token_hex(12)
        while ref in ids:ref='c'+secrets.token_hex(12)
        ids.add(ref)
        rows.append([ref,'platform','it',prompt,'|'.join(d['words'])])
    temporary=output.with_name(output.name+'.tmp')
    try:
        with temporary.open('w',encoding='utf-8',newline='') as stream:
            writer=csv.writer(stream);writer.writerow(HEADER);writer.writerows(rows)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return len(rows)


def load_morphology(path:Path)->dict[str,set[tuple[str,str]]]:
    '''Tabelle deterministiche di forme: form,lemma,pos. Da fonte reale versionata.'''
    mapping=defaultdict(set)
    with path.open(encoding='utf-8-sig',newline='') as stream:
        reader=csv.DictReader(stream)
        if not {'form','lemma','pos'} <= set(reader.fieldnames or []):
            raise ValueError('Morfologia: intestazioni form,lemma,pos richieste')
        for row in reader:
            form,lemma,pos=norm(row['form'].strip()),norm(row['lemma'].strip()),row['pos'].strip()
            if not _valid_word(form) or not _valid_word(lemma) or pos not in POS | FUNCTION_POS | {'ADV','PROPN'}:
                raise ValueError(f'Analisi morfologica non valida: {row}')
            mapping[form].add((lemma,pos))
    if not mapping:raise ValueError('Dizionario morfologico vuoto')
    return dict(mapping)


def lexical_check(path:Path, morphology:Path|None=None, frequency_path:Path|None=None,
                  definition_path:Path|None=None, samples:int=25)->dict:
    '''Il POS di parole isolate usa un lessico formale, NON una predizione spaCy fuori contesto.'''
    mapping=load_morphology(morphology) if morphology else None
    ranks=load_frequency_ranks(frequency_path) if frequency_path else None
    dfs,total=load_definition_document_counts(definition_path) if definition_path else (None,None)
    counts=Counter();flags=defaultdict(list);examples=[];evaluated=0
    with path.open(encoding='utf-8-sig',newline='') as stream:
        for row in csv.DictReader(stream):
            prompt=row.get('prompt','')
            for form,role in [(prompt,'context')]+[(w,'answer') for w in row.get('words','').split('|')]:
                if not _valid_word(form):continue
                evaluated+=1;warn=[];bad=[]
                analyses=mapping.get(form) if mapping is not None else None
                if mapping is None:warn.append('morphology_resource_missing')
                elif not analyses:warn.append('lexicon_form_unknown')
                else:
                    possible={p for _,p in analyses}
                    if not (possible & CONTENT_POS):
                        bad.append('only_function_pos_in_lexicon')
                    elif possible & FUNCTION_POS:
                        warn.append('homograph_ambiguous_pos')
                if ranks is not None:
                    lemmas={l for l,_ in analyses} if analyses else {form}
                    known=[ranks[x] for x in lemmas if x in ranks]
                    if known and min(known)<=2500:warn.append('high_frequency_check_context')
                    if not known:warn.append('frequency_rank_unknown')
                if dfs is not None:
                    lemmas={l for l,_ in analyses} if analyses else {form}
                    if any(dfs.get(lemma,0)/total>.08 for lemma in lemmas):
                        warn.append('high_document_frequency_check_context')
                status='excluded' if bad else 'review' if warn else 'candidate'
                counts[status]+=1
                if status!='candidate':
                    item={'form':form,'role':role,'status':status,'reasons':bad+warn}
                    flags[prompt].append(item)
                    if len(examples)<samples:examples.append({'prompt':prompt,**item})
    return {'evaluated':evaluated,'counts':dict(counts),'flags_by_prompt':dict(flags),'examples':examples,
            'morphology_loaded':mapping is not None,'frequency_loaded':ranks is not None,
            'document_frequency_loaded':dfs is not None,
            'note':'La presenza nel lessico conferma analisi possibili, non il senso corretto della risposta.'}


def resolve_lexical_flags(flags_by_prompt:dict, qa_dir:Path, samples:int=20)->dict:
    """Verifica solo la presenza di decisioni QA motivate; NON accerta la loro verità."""
    qas={}
    for path in qa_dir.glob('*.json'):
        try:
            d=json.loads(path.read_text(encoding='utf-8'))
            if isinstance(d,dict) and isinstance(d.get('prompt'),str):
                qas[norm(d['prompt'])]=d
        except (OSError,ValueError):
            continue
    unresolved=[];resolved=0
    for context,issues in flags_by_prompt.items():
        reviews=((qas.get(norm(context),{}).get('lexical_review') or {}).get('resolved_flags') or [])
        for issue in issues:
            corresponding=[item for item in reviews if isinstance(item,dict) and
                           item.get('word')==issue.get('form') and item.get('role')==issue.get('role')]
            accepted=any(item.get('reviewed') is True and
                         item.get('decision') in {'accepted_in_context','false_positive_morphology','exception_approved'} and
                         isinstance(item.get('reviewer_id'),str) and len(item['reviewer_id'])>=2 and
                         isinstance(item.get('rationale'),str) and len(item['rationale'].strip())>=20
                         for item in corresponding)
            if accepted:resolved+=1
            else:unresolved.append(f"{context}/{issue.get('form')}/{issue.get('role')}: flag {issue.get('reasons')} senza evidenza")
    return {'resolved':resolved,'unresolved_count':len(unresolved),'examples':unresolved[:samples],
            'note':'Controllo DOCUMENTALE delle decisioni; il codice non certifica il giudizio umano.'}


def _score_valid(ratings,total):
    if not isinstance(ratings,dict) or isinstance(total,bool) or not isinstance(total,(int,float)):
        return False
    score=0
    for name,weight in DIM_WEIGHTS.items():
        v=ratings.get(name)
        if type(v) not in (int,float) or not 0<=v<=5:return False
        score+=v*weight/5
    return abs(score-total)<=0.15


def _retrieval_valid(data,prompt):
    if not isinstance(data,dict) or data.get('protocol')!='prompt_to_words_independent':return False
    if data.get('prompt_visible') is not True or data.get('answers_visible') is not False:return False
    if data.get('independence_verified') is not True:return False
    if data.get('verification_method') not in {'human_review_records','external_provider_logs'}:return False
    refs=data.get('evidence_refs');trials=data.get('trials')
    if not isinstance(refs,list) or len(refs)<2 or not all(isinstance(x,str) and x.strip() for x in refs):return False
    if len(set(refs))!=len(refs):return False
    if not isinstance(trials,list) or len(trials)<2:return False
    ids=set();human=0
    for t in trials:
        if not isinstance(t,dict):return False
        rid=t.get('reviewer_id')
        if not isinstance(rid,str) or not rid or rid in ids:return False
        ids.add(rid)
        if t.get('prompt_shown')!=prompt or t.get('answers_shown') is not False:return False
        if t.get('reviewer_type') not in {'human','llm_diagnostic'}:return False
        human+=t.get('reviewer_type')=='human'
        guesses=t.get('guesses')
        if not isinstance(guesses,list) or not 1<=len(guesses)<=30 or any(not _valid_word(w) for w in guesses):return False
        if not isinstance(t.get('ui_cues'),dict):return False
    return human>=1


def _word_reviews_valid(reviews,answers):
    if not isinstance(reviews,list) or len(reviews)!=7:return False
    entries={}
    for item in reviews:
        if not isinstance(item,dict) or not isinstance(item.get('word'),str) or item.get('word') in entries:return False
        entries[item.get('word')]=item
        if type(item.get('relevance')) not in (int,float) or item['relevance']<4 or item['relevance']>5:return False
        if type(item.get('discoverability')) not in (int,float) or not 3<=item['discoverability']<=5:return False
        if item.get('difficulty') not in DIFFICULTIES:return False
        if not isinstance(item.get('rationale'),str) or len(item['rationale'].strip())<15:return False
        if SOURCE_ONLY_REASON.fullmatch(item['rationale'].strip()):return False
        if not qa_word_checks_valid(item):return False
    if len({item['rationale'].strip().casefold() for item in reviews}) != 7:return False
    if any(n>2 for n in Counter(item['meaning_group'] for item in reviews).values()):return False
    return set(entries)==set(answers)


def check_qa_register(csv_path:Path,qa_dir:Path, require_qa:bool=False, samples:int=25,
                      taxonomy:dict[str,dict]|None=None,
                      candidate_categories:dict[str,str]|None=None)->dict:
    '''Controllo dei verbali CON DIREZIONE CORRETTA. Non fabbrica studi su esseri umani.'''
    dataset={}
    with csv_path.open(encoding='utf-8-sig',newline='') as stream:
        for row in csv.DictReader(stream):dataset[norm(row.get('prompt',''))]=row.get('words','').split('|')
    errors,warnings,found=[],[],{}
    decisions=Counter()
    for path in sorted(qa_dir.glob('*.json')):
        try:d=json.loads(path.read_text(encoding='utf-8'))
        except (OSError,ValueError) as exc:errors.append(f'{path.name}: JSON non valido: {exc}');continue
        if not isinstance(d,dict):errors.append(f'{path.name}: JSON non oggetto');continue
        if d.get('schema_version')!=QA_SCHEMA:
            errors.append(f'{path.name}: QA vecchio o incompatibile, serve {QA_SCHEMA}');continue
        p=d.get('prompt','');key=norm(p)
        if key in found:errors.append(f'{path.name}: QA duplicato per {p}')
        found[key]=path.name
        if key not in dataset or d.get('words')!=dataset[key]:
            errors.append(f'{path.name}: contesto o risposte non coincidono col CSV');continue
        cat=d.get('category_id')
        if not isinstance(cat,str) or not re.fullmatch('[0-9]{3}',cat):
            errors.append(f'{path.name}: category_id mancante')
        elif taxonomy is not None and cat not in taxonomy:
            errors.append(f'{path.name}: categoria {cat} sconosciuta')
        if candidate_categories is not None and key in candidate_categories and cat!=candidate_categories[key]:
            errors.append(f'{path.name}: category_id incoerente con candidati')
        if 'blind_test' in d:
            errors.append(f'{path.name}: blind_test 3/5/7 OBSOLETO; usare retrieval_test prompt→risposte')
        technical=d.get('technical') or {};sem=d.get('semantic_review') or {}
        safe=d.get('safety_review') or {}
        safety=(safe.get('status')=='CLEAR' and safe.get('classification') is None or
                safe.get('status')=='FLAGGED' and safe.get('classification') in {'false_positive','acceptable_with_note'}
                and isinstance(safe.get('reason'),str) and len(safe['reason'].strip())>=20)
        ratings=sem.get('ratings') or {}
        allowed=(d.get('semantic_policy_version')==SEMANTIC_POLICY and
                 isinstance(sem.get('set_checks'),dict) and
                 all(sem.get('set_checks',{}).get(k) is True for k in SET_CHECKS) and
                 technical.get('passed') is True and technical.get('errors')==[] and
                 technical.get('warnings_reviewed') is True and
                 _retrieval_valid(d.get('retrieval_test'),p) and
                 _word_reviews_valid(d.get('word_reviews'),dataset[key]) and
                 _score_valid(ratings,sem.get('total_100')) and sem.get('total_100',0)>=85 and
                 ratings.get('Individuabilità',0)>=4 and ratings.get('Pertinenza',0)>=4 and
                 sem.get('alternative_answer_pressure')=='acceptable' and
                 isinstance(sem.get('rationale'),str) and len(sem['rationale'].strip())>=20 and safety)
        decision=d.get('decision');decisions[decision]+=1
        if decision=='IDONEO_REVISIONE_FINALE' and not allowed:
            errors.append(f'{path.name}: approvazione incompatibile con evidenze / set di sette risposte')
        if decision not in {'IDONEO_REVISIONE_FINALE','DA_RIVEDERE'}:
            errors.append(f'{path.name}: decision non valida')
        if require_qa and decision!='IDONEO_REVISIONE_FINALE':
            errors.append(f'{path.name}: risposta-set non idoneo in archivio approvato')
    missing=sorted(set(dataset)-set(found))
    if missing and require_qa:errors.append(f'{len(missing)} verbali QA mancanti: {missing[:5]}')
    elif missing:warnings.append(f'{len(missing)} verbali QA mancanti')
    return {'checked':len(found),'missing':len(missing),'decisions':dict(decisions),
            'errors_count':len(errors),'warnings_count':len(warnings),
            'errors':errors[:samples],'warnings':warnings[:samples],
            'limits':['Evidenze dichiarate nel JSON non equivalgono a verifica indipendente dei log.',
                      'Le risposte spontanee non devono necessariamente coincidere tutte con le sette risposte previste.']}


def retrieval_payload(prompt:str, ui_cues:dict|None=None, max_guesses:int=15)->dict:
    '''Payload per revisore, SENZA le sette risposte; una prova generativa, non predizione della soluzione unica.'''
    if not _valid_word(prompt):raise ValueError('Serve un prompt visibile singolo e canonico')
    if type(max_guesses)!=int or not 1<=max_guesses<=30:raise ValueError('max_guesses fuori intervallo')
    return {'visible_context':prompt,'ui_cues':ui_cues or {'answer_lengths_visible':False},
            'instructions':f'Elenca fino a {max_guesses} parole singole che assoceresti spontaneamente al contesto visibile. Nessuna lista di risposte prevista è stata fornita.',
            'expected_response_schema':{'guesses':['parola'],'uncertain':'boolean'}}


def retrieval_metrics(prompt:str,answers:list[str], trials:list[dict], k:int=15)->dict:
    '''Recall spontaneo @k DIAGNOSTICO; non richiede 7/7 né è un giudizio di qualità.'''
    if not _valid_word(prompt) or len(answers)!=7:raise ValueError('Contesto o risposte non conformi')
    if not trials:raise ValueError('Mancano prove')
    coverage=Counter();total=0
    for trial in trials:
        guesses=trial.get('guesses')
        if not isinstance(guesses,list):raise ValueError('Guesses mancanti')
        total+=1
        for word in set(answers)&set(guesses[:k]):coverage[word]+=1
    return {'prompt':prompt,'n':total,'k':k,
            'per_answer_recall':{w:coverage[w]/total for w in answers},
            'mean_answer_recall':sum(coverage[w] for w in answers)/(7*total),
            'distinct_answers_recalled':sum(coverage[w]>0 for w in answers),
            'note':'Campione aperto e risposte concorrenti: recall@k misura recuperabilità empirica, non validità binaria.'}


def kappa(a:list[int], b:list[int], *,ordinal:bool=False)->float|None:
    if len(a)!=len(b) or not a:return None
    labels=sorted(set(a)|set(b))
    if len(labels)==1:return None
    n=len(a);ca=Counter(a);cb=Counter(b);joint=Counter(zip(a,b))
    width=max(labels)-min(labels)
    d=lambda x,y:((x-y)/width)**2 if ordinal else int(x!=y)
    observed=sum(c*d(x,y) for (x,y),c in joint.items())/n
    expected=sum(ca[x]*cb[y]*d(x,y) for x in labels for y in labels)/n**2
    return None if expected==0 else 1-observed/expected


def check_double_reviews(path:Path, batch_sizes:dict|None=None)->dict:
    rows=[];errors=[]
    for ln,d,err in read_jsonl(path):
        if err:errors.append(f'Riga {ln}: {err}');continue
        if not all(key in d for key in ('batch_id','reviewer_a','reviewer_b')):
            errors.append(f'Riga {ln}: doppie revisioni incomplete');continue
        rows.append(d)
    n=len(rows);out={'reviewed':n,'errors':errors,'metrics':{},'agreement_status':'NOT_EVALUATED','notes':[]}
    if n<30:out['agreement_status']='N_INSUFFICIENTE'
    ra=[d['reviewer_a'].get('decision') for d in rows]
    rb=[d['reviewer_b'].get('decision') for d in rows]
    if n and all(v in {'IDONEO','DA_RIVEDERE'} for v in ra+rb):
        out['metrics']['decision_kappa']=kappa([int(v=='IDONEO') for v in ra],[int(v=='IDONEO') for v in rb])
    for dim in DIM_WEIGHTS:
        a=[d['reviewer_a'].get('ratings',{}).get(dim) for d in rows]
        b=[d['reviewer_b'].get('ratings',{}).get(dim) for d in rows]
        if n and all(type(x) in (int,float) and 0<=x<=5 for x in a+b):
            out['metrics'][dim+'_weighted_kappa']=kappa(a,b,ordinal=True)
    if batch_sizes is not None:
        reviewed=Counter(str(d['batch_id']) for d in rows)
        out['batch_coverage']={}
        for batch,size in batch_sizes.items():
            required=min(size,max(30,math.ceil(.10*size)))
            passed=reviewed.get(batch,0)>=required
            out['batch_coverage'][batch]={'n':reviewed.get(batch,0),'minimum':required,'passed':passed}
            if not passed:errors.append(f'Lotto {batch}: n doppie revisioni insufficienti')
    if n>=30:
        if len(set(ra))==1 and len(set(rb))==1:
            out['agreement_status']='UNDEFINED' if ra[0]==rb[0] else 'ZERO_VARIANCE_RATER'
        elif len(set(ra))==1 or len(set(rb))==1:
            out['agreement_status']='ZERO_VARIANCE_RATER'
        else:
            value=out['metrics'].get('decision_kappa')
            out['agreement_status']='UNDEFINED' if value is None else 'OK' if value>=.60 else 'LOW_AGREEMENT'
    return out


def main(argv:list[str]|None=None)->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv',nargs='?',type=Path,help='CSV con prompt visibile e 7 risposte nascoste')
    parser.add_argument('--taxonomy-csv',type=Path)
    parser.add_argument('--candidates-jsonl',type=Path)
    parser.add_argument('--export-csv',type=Path,help='Esporta solo candidati tecnicamente validi, NON approvati')
    parser.add_argument('--min-rows',type=int,default=0)
    parser.add_argument('--max-frequency-ratio',type=float,default=.01)
    parser.add_argument('--max-shared-answers',type=int,default=2)
    parser.add_argument('--max-shared-clues',dest='max_shared_answers',type=int,help=argparse.SUPPRESS)
    parser.add_argument('--multiword-lexicon-csv',type=Path)
    parser.add_argument('--morphology-csv',type=Path,help='Lessico italiano form,lemma,pos versionato; consigliato Morph-it!')
    parser.add_argument('--frequency-csv',type=Path)
    parser.add_argument('--definition-df-csv',type=Path)
    parser.add_argument('--lexical-model',help='Modello spaCy per DEFINIZIONI COMPLETE, non usato su parole isolate')
    parser.add_argument('--definitions-jsonl',type=Path,help='JSONL con prompt,definition per l’audit contestuale spaCy')
    parser.add_argument('--require-lexical',action='store_true')
    parser.add_argument('--qa-dir',type=Path)
    parser.add_argument('--require-qa',action='store_true')
    parser.add_argument('--agreement-jsonl',type=Path)
    parser.add_argument('--release',action='store_true',help='Gate di rilascio; richiede tutti i report esterni')
    parser.add_argument('--strict-warnings',action='store_true')
    parser.add_argument('--report-json',type=Path)
    args=parser.parse_args(argv)
    if not args.csv and not args.candidates_jsonl:parser.error('Serve un CSV o --candidates-jsonl')
    if args.export_csv and not args.candidates_jsonl:parser.error('--export-csv richiede --candidates-jsonl')
    if args.definitions_jsonl and not args.lexical_model:parser.error('--definitions-jsonl richiede --lexical-model')
    if args.lexical_model and not args.definitions_jsonl:
        parser.error('spaCy deve analizzare definizioni COMPLETE: serve --definitions-jsonl')
    if args.require_lexical or args.release:
        if not (args.csv and args.morphology_csv and args.frequency_csv and args.definition_df_csv):
            parser.error('Audit lessicale rigoroso: CSV + --morphology-csv + --frequency-csv + --definition-df-csv')
    if args.require_qa or args.release:
        if not(args.csv and args.qa_dir and args.qa_dir.is_dir()):parser.error('QA richiede CSV e --qa-dir valido')
    if args.release and not(args.candidates_jsonl and args.agreement_jsonl):
        parser.error('--release richiede anche --candidates-jsonl e --agreement-jsonl')
    taxonomy_path=find_taxonomy(args.taxonomy_csv)
    try:
        taxonomy=load_taxonomy(taxonomy_path) if taxonomy_path else None
    except (OSError,ValueError,csv.Error) as exc:
        parser.error(f'Tassonomia invalida: {exc}')
    if taxonomy is None and (args.candidates_jsonl or args.release):
        parser.error('Catalogo obbligatorio per JSONL/release: --taxonomy-csv')
    result={'schema_version':'word-association-validation-3.6.0',
            'game_direction':'prompt_visible_seven_answers_hidden',
            'taxonomy':{'status':'verified' if taxonomy else 'not_run','categories':len(taxonomy) if taxonomy else None}}
    failed=False
    if args.csv:
        result['csv']=check_csv(args.csv,args.min_rows if not args.release else max(args.min_rows,10001),
                                args.max_frequency_ratio,args.max_shared_answers,
                                multiword_lexicon=args.multiword_lexicon_csv)
        failed |= result['csv']['errors_count']>0
    if args.candidates_jsonl:
        result['candidates']=check_candidates_jsonl(args.candidates_jsonl,taxonomy)
        failed |= result['candidates']['errors_count']>0
        if args.export_csv:
            if failed:result['assembly']={'skipped':'Input invalidi: non esportato'}
            else:
                try:result['assembly']={'rows':assemble_candidates(args.candidates_jsonl,args.export_csv),
                                        'path':str(args.export_csv),'status':'CANDIDATES_ONLY_NOT_APPROVED'}
                except (OSError,ValueError,KeyError) as exc:
                    failed=True;result['assembly']={'error':str(exc)}
    if args.morphology_csv or args.frequency_csv or args.definition_df_csv:
        if not args.csv:parser.error('Audit lessicale richiede CSV')
        try:result['lexical']=lexical_check(args.csv,args.morphology_csv,args.frequency_csv,args.definition_df_csv)
        except (ValueError,OSError,KeyError) as exc:parser.error(f'Risorse lessicali non valide: {exc}')
        if args.release:
            resolution=resolve_lexical_flags(result['lexical']['flags_by_prompt'],args.qa_dir)
            result['lexical']['resolution']=resolution
            if resolution['unresolved_count']:
                failed=True;result['lexical']['release_gate']='Flag non risolti con revisione documentata'
        # Evita report massivi per archivi da 10k.
        result['lexical'].pop('flags_by_prompt',None)
    if args.definitions_jsonl:
        try:
            nlp=load_italian_nlp(args.lexical_model)
            analysed=[]
            for ln,d,err in read_jsonl(args.definitions_jsonl):
                if err:raise ValueError(f'Riga {ln}: {err}')
                if not isinstance(d.get('definition'),str):raise ValueError(f'Riga {ln}: manca definition')
                tokens=extract_lemmas_from_definition(d.get('prompt',''),d['definition'],nlp,definition_id=str(ln))
                analysed.append({'prompt':d.get('prompt'),'candidate_lemmas':[x['suggested_clue'] for x in tokens]})
            result['definition_nlp']={'model':args.lexical_model,'definitions':len(analysed),
                                      'examples':analysed[:10],
                                      'note':'Analisi su frasi complete, non certificazione di risposte.'}
        except (OSError,RuntimeError,ValueError) as exc:parser.error(f'Analisi definizioni non eseguibile: {exc}')
    categories={}
    if args.candidates_jsonl:
        for _,d,err in read_jsonl(args.candidates_jsonl):
            if not err and _valid_word(d.get('prompt')) and isinstance(d.get('category_id'),str):
                categories[d['prompt']]=d['category_id']
    if args.qa_dir and args.csv:
        result['qa']=check_qa_register(args.csv,args.qa_dir,args.require_qa or args.release,
                                       taxonomy=taxonomy,candidate_categories=categories)
        failed |= result['qa']['errors_count']>0
    if args.agreement_jsonl:
        batch_sizes=None
        if args.candidates_jsonl:
            batch_sizes=Counter()
            for _,d,err in read_jsonl(args.candidates_jsonl):
                if not err:batch_sizes[str(d.get('batch_id'))]+=1
        result['agreement']=check_double_reviews(args.agreement_jsonl,batch_sizes)
        failed |= bool(result['agreement']['errors'])
    if args.release and result.get('agreement',{}).get('agreement_status')!='OK':
        failed=True;result['release_notice']='Accordo doppie revisioni non certificato: rilascio bloccato'
    if args.strict_warnings:
        failed |= any(isinstance(v,dict) and v.get('warnings_count',0)>0 for v in result.values())
    result['result']='FAIL' if failed else 'PASS_TECHNICAL_ONLY'
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if args.report_json:args.report_json.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return int(failed)

if __name__=='__main__':
    raise SystemExit(main())
