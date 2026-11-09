"""Segnali semantici riproducibili e contratto editoriale; nessun QA simulato."""
from collections import Counter, defaultdict
from functools import lru_cache
import json
from pathlib import Path
import re
import unicodedata

SEMANTIC_POLICY = 'word-association-semantic-2026-11-08.2'
REGRESSIONS = Path(__file__).parent/'resources/semantic_regressions_it.jsonl'
WORD_CHECKS = ('same_sense', 'standalone', 'natural', 'not_incidental',
               'source_polarity', 'lemma_meaning_preserved')
SET_CHECKS = ('single_sense', 'non_redundant', 'no_forced_pos')
SOURCE_ONLY_REASON = re.compile(
    r'^(?:(?:la parola|il lemma|il termine)\s+["«\']?\w+["»\']?\s+)?'
    r'(?:compare|è presente|si trova|viene citat[oa])\s+'
    r'(?:nella|nel|in)\s+(?:definizione|fonte|testo)(?:\s+(?:fornita|originale|sorgente))?[.!]?$',
    re.IGNORECASE)


def canonical(word):
    return unicodedata.normalize('NFC', word).casefold()


def family_key(word):
    """Segnale di forma, NON prova etimologica o giudizio di equivalenza."""
    word = canonical(word)
    for ending in ('izioni', 'izione', 'itivo', 'itiva', 'itivi', 'itive',
                   'azioni', 'azione', 'amenti', 'amento', 'ando', 'endo',
                   'ato', 'ata', 'ati', 'ate', 'are', 'ere', 'ire', 'o', 'a', 'i', 'e'):
        if word.endswith(ending) and len(word)-len(ending) >= 5:
            return word[:-len(ending)]
    return word


def definitional_connector(source, surface):
    """Riconosce la funzione nella frase, non vieta un lemma globalmente."""
    source=canonical(source).lstrip()
    match=re.match(r'(?:(?:inerente|attinente|relativ[oaie])\s+(?:a|al|alla|ai|agli|alle|all)\b'
                   r'|(?:riguardante|concernente)\b)',source)
    if match and source.split()[0]==canonical(surface):return match.group()
    return None


def adjective_attachment(prompt, token):
    """Controllo conservativo del referente; la sintassi non approva la semantica.

    Il nome principale di una definizione nominale può rappresentare il
    prompt («dipinto ...»). Un nome subordinato («intonaco fresco») no.
    Senza dipendenze affidabili l'aggettivo resta escluso dall'estrazione.
    """
    if getattr(token, 'pos_', '') != 'ADJ':
        return None
    dep = getattr(token, 'dep_', '')
    head = getattr(token, 'head', None)
    if not dep or head is None:
        return {'status': 'unverified', 'reason': 'dependency_parse_missing'}
    current = token
    visited = set()
    while getattr(current, 'dep_', '') == 'conj':
        marker = getattr(current, 'i', id(current))
        if marker in visited:
            return {'status': 'unverified', 'reason': 'dependency_cycle'}
        visited.add(marker)
        current = current.head
    governor = current.head
    details = {'governor': canonical(getattr(governor, 'text', '')),
               'governor_lemma': canonical(getattr(governor, 'lemma_', '')),
               'dependency': dep, 'method': 'dependency_attachment_not_semantic_approval'}
    if getattr(current, 'dep_', '') == 'ROOT':
        subjects = [c for c in getattr(current, 'children', [])
                    if getattr(c, 'dep_', '') in {'nsubj', 'nsubj:pass', 'csubj'}]
        if not subjects:
            return {**details, 'status': 'direct', 'reason': 'implicit_definition_subject'}
        direct = all(canonical(getattr(s, 'lemma_', '')) == canonical(prompt) for s in subjects)
    else:
        direct = (getattr(current, 'dep_', '') == 'amod'
                  and (canonical(getattr(governor, 'lemma_', '')) == canonical(prompt)
                       or (getattr(governor, 'dep_', '') == 'ROOT'
                           and getattr(governor, 'pos_', '') == 'NOUN'
                           and not any(getattr(c, 'dep_', '') == 'case'
                                       for c in getattr(governor, 'children', [])))))
    return {**details, 'status': 'direct' if direct else 'other_referent',
            'reason': 'prompt_or_definition_head' if direct else 'not_attached_to_prompt'}


@lru_cache(maxsize=1)
def regression_cases():
    if not REGRESSIONS.exists():
        return {}
    with REGRESSIONS.open(encoding='utf-8') as stream:
        return {row['prompt']: row for line in stream if line.strip() for row in [json.loads(line)]}


def diversity_signals(prompt, words, meaning_groups=None):
    signals = []
    families = defaultdict(list)
    for word in words:
        families[family_key(word)].append(word)
    for family in families.values():
        if len(family) >= 2:
            signals.append({'code': 'similar_answer_forms', 'words': family,
                            'certainty': 'signal_not_etymological_proof'})
    derivatives = [w for w in words if family_key(w) == family_key(prompt)]
    if len(derivatives) >= 2:
        signals.append({'code': 'prompt_family_accumulation', 'words': derivatives})
    if meaning_groups:
        groups = defaultdict(list)
        for word in words:
            if meaning_groups.get(word):
                groups[meaning_groups[word]].append(word)
        for group in groups.values():
            if len(group) > 2:
                signals.append({'code': 'semantic_equivalence_accumulation', 'words': group})
    return signals


def screen_set(prompt, words, metadata=None):
    """Esamina segnali: il risultato non approva né elimina il prompt."""
    prompt = canonical(prompt)
    words = [canonical(w) for w in words]
    metadata = metadata or {}
    review = metadata.get('editorial_revision') or {}
    groups = {r['word']: r.get('meaning_group') for r in review.get('word_reviews', [])}
    signals = diversity_signals(prompt, words, groups)
    case = regression_cases().get(prompt)
    # Senza metadati è un segnale di confronto. Con metadati vincolare il
    # caso al senso originale; non vietare una coppia in tutte le accezioni.
    if case and (not metadata or metadata.get('sense_id') == case['sense_id']):
        for issue in case['issues']:
            matches = sorted(set(words) & set(issue['words']))
            minimum = {'synonym_accumulation':3, 'derivative_accumulation':2,'same_semantic_nucleus':2,
                       'attribute_concentration':3}.get(issue['code'],1)
            if len(matches) >= minimum:
                signals.append({'code': issue['code'], 'words': matches,
                                'case_id': case['case_id'], 'reason': issue['reason'],
                                'certainty': 'editorial_case_or_contextual_review'})
    for word in words:
        evidence = metadata.get('clue_evidence', {}).get(word, {})
        if evidence.get('kind') == 'relazione_lessicale' and evidence.get('source_scope_verified') is not True:
            signals.append({'code': 'unverified_relation_scope', 'words': [word]})
        analysis = evidence.get('analysis') or {}
        if analysis.get('pos') == 'ADJ':
            attachment = analysis.get('adjective_attachment') or {}
            if attachment.get('status') != 'direct':
                signals.append({'code': ('adjective_other_referent' if attachment.get('status') == 'other_referent'
                                         else 'adjective_referent_unverified'),
                                'words': [word], 'attachment': attachment,
                                'certainty': 'requires_direct_prompt_reference'})
        source = evidence.get('source_text') or metadata.get('source_gloss') or ''
        surface = analysis.get('word') or word
        if evidence.get('kind')=='definizione':
            connector=definitional_connector(source,surface)
            if connector:
                signals.append({'code':'definitional_connector','words':[word],
                    'source_span':connector,'certainty':'requires_contextual_role_review'})
        # Contrasto locale esplicito: non estendere la negazione a tutta la frase.
        match = re.search(r'\b(?:senza|priv[oa] di)\s+(?:(?:un|uno|una|il|lo|la|alcun)\s+)?'
                          + re.escape(surface) + r'\b', source, re.IGNORECASE)
        if match:
            signals.append({'code': 'negated_source_feature', 'words': [word],
                            'source_span': match.group(), 'certainty': 'requires_role_review'})
    return {'policy': SEMANTIC_POLICY, 'prompt': prompt, 'signals': signals,
            'decision': 'DA_RIVEDERE', 'prompt_preserved': True,
            'semantic_approval': False}


def editorial_errors(record):
    """Conformità del materiale editoriale, distinta dal QA indipendente."""
    errors = []
    revision = record.get('editorial_revision') or {}
    if not revision.get('sense_description'):
        errors.append('Accezione editoriale mancante')
    answers = revision.get('word_reviews')
    if not isinstance(answers, list) or len(answers) != 7 or any(not isinstance(a,dict) for a in answers):
        return errors + ['Servono sette motivazioni editoriali individuali']
    if [a.get('word') for a in answers] != record.get('words'):
        errors.append('Risposte e materiale editoriale discordanti')
    rationales = [str(a.get('rationale') or '').strip() for a in answers]
    if any(len(reason) < 15 for reason in rationales) or len(set(rationales)) != 7:
        errors.append('Motivazioni brevi, assenti o copiate tra risposte')
    if any(SOURCE_ONLY_REASON.fullmatch(reason) for reason in rationales):
        errors.append('La sola presenza nella fonte non motiva una relazione')
    if any(not a.get('relation') for a in answers):
        errors.append('Relazioni editoriali mancanti')
    # La densità di sinonimi si valuta per significato, non per sola grafia.
    groups = Counter(a.get('meaning_group') for a in answers if isinstance(a.get('meaning_group'),str))
    if any(n > 2 for n in groups.values()):
        errors.append('Più di due risposte editorialmente equivalenti')
    hard_signals={'negated_source_feature','cross_sense_relation','cross_sense_taxonomy','lemma_meaning_change',
                  'adjective_other_referent','adjective_referent_unverified'}
    resolutions=revision.get('signal_resolutions',[])
    if not isinstance(resolutions,list):resolutions=[]
    for signal in screen_set(record['prompt'],record['words'],record)['signals']:
        if signal['code'] not in hard_signals:continue
        for word in signal['words']:
            resolved=any(isinstance(item,dict) and item.get('code')==signal['code']
                and item.get('word')==word and item.get('decision')=='resolved'
                and isinstance(item.get('rationale'),str) and len(item['rationale'].strip())>=30
                for item in resolutions)
            if not resolved:errors.append(f'Segnale irrisolto {signal["code"]}: {word}; cercare una sostituzione')
    return errors


def qa_word_checks_valid(review):
    return (review.get('decision') == 'accettata'
            and isinstance(review.get('answer_sense'), str)
            and len(review['answer_sense'].strip()) >= 3
            and isinstance(review.get('meaning_group'), str)
            and bool(review['meaning_group'].strip())
            and isinstance(review.get('checks'),dict)
            and all(review['checks'].get(key) is True for key in WORD_CHECKS))
