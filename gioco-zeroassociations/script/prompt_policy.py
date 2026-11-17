"""Accessibilità dei contesti: prestiti comuni ammessi, tecnicismi da filtrare."""
import json
import math
from pathlib import Path
import re
import unicodedata

DEFAULT_POLICY_PATH=Path(__file__).parent.parent/'resources'/'prompt_policy.json'


def zipf_bound(policy):
    keys = [key for key in ('minimum_zipf_it', 'maximum_zipf_it') if key in policy]
    if len(keys) != 1:
        raise ValueError('Configurare un solo limite Zipf: minimo oppure massimo')
    key = keys[0]
    threshold = policy[key]
    if type(threshold) not in (int, float) or not math.isfinite(threshold) or not 0 <= threshold <= 8:
        raise ValueError('Limite Zipf non valido')
    return key, threshold, '>=' if key == 'minimum_zipf_it' else '<='


def zipf_matches(score, policy):
    key, threshold, _ = zipf_bound(policy)
    if score is None or not math.isfinite(score):
        return False
    return score >= threshold if key == 'minimum_zipf_it' else score <= threshold


def load_prompt_policy(path=DEFAULT_POLICY_PATH):
    policy=json.loads(Path(path).read_text(encoding='utf-8'))
    if (not isinstance(policy.get('version'),str)
            or not isinstance(policy.get('common_loanwords'),list)):
        raise ValueError('Politica di accessibilità dei prompt non valida')
    zipf_bound(policy)
    for word in policy['common_loanwords']:
        if not isinstance(word,str) or not re.fullmatch('[a-zàèéìòù]+',word):
            raise ValueError(f'Forma non canonica nella politica prompt: {word!r}')
    return policy


def borrowing_evidence(entry,sense):
    """Segnali lessicografici, non rilevamento linguistico di parole isolate.

    Le traduzioni in inglese non sono prove di prestito. L'etimologia remota da
    sola non basta: serve anche un rimando alla stessa forma non adattata.
    """
    signals=[]
    tags=[str(t).casefold() for obj in (entry,sense) for t in obj.get('raw_tags',[])]
    categories=[str(c.get('name','')).casefold() for obj in (entry,sense) for c in obj.get('categories',[])]
    if any(re.search('forestierism|inglesism|anglicism|loanword|unadapted',t) for t in tags+categories):
        signals.append('source_loanword_label')
    etymology=' '.join(entry.get('etymology_texts',[])).casefold()
    word=unicodedata.normalize('NFC',entry.get('word','')).casefold()
    links=entry.get('etymology_links',[])
    same_form=any(isinstance(link,(list,tuple)) and len(link)>=2
                  and str(link[0]).casefold()==word and re.search(r'#(?:inglese|english|en)\b',str(link[1]).casefold()) for link in links)
    direct_english=re.search(r'\binglese\s+[\"\x27«]*'+re.escape(word)+r'\b',etymology)
    if same_form or direct_english:
        signals.append('same_form_english_etymology')
    if (entry.get('pos')=='verb' and word.endswith(('are','ere','ire','rre'))
            and re.search(r'derivazion|derivat',etymology) and not (same_form or direct_english)):
        return []  # Es. filmare: derivazione italiana, non prestito non adattato.
    return signals


def familiarity_reference(entry,frequency_lookup):
    """Per i verbi considera anche forme flesse attestate nella voce sorgente.

    L'infinito può essere meno frequente del verbo coniugato. Per nomi e
    aggettivi il riferimento resta il lemma; non si allarga il criterio ai prestiti.
    """
    word=entry['word']
    candidates={word}
    if entry.get('pos')=='verb':
        for form in entry.get('forms',[]):
            if {'auxiliary','table-tags'}&set(form.get('tags',[])): continue
            text=unicodedata.normalize('NFC',form.get('form',''))
            if re.fullmatch('[a-zàèéìòù]+',text): candidates.add(text)
    ranked=sorted((frequency_lookup(form),form) for form in candidates)
    score,form=ranked[-1]
    return {'form':form,'zipf_it':score,'method':'max_attested_verbal_form' if entry.get('pos')=='verb' else 'headword'}


def screen_prompt(word,zipf_it,policy,loan_evidence=(),frequency_reference=None):
    """Esito del filtro editoriale automatico; non è un'approvazione QA."""
    loan=bool(loan_evidence)
    allowed_loan=word in policy['common_loanwords']
    if loan and not allowed_loan:
        reason='loanword_requires_editorial_review';accepted=False
    elif loan and allowed_loan:
        reason='common_loanword_listed';accepted=True
    elif not zipf_matches((frequency_reference or {}).get('zipf_it',zipf_it), policy):
        reason=('below_familiarity_frequency_threshold' if zipf_bound(policy)[2] == '>='
                else 'above_familiarity_frequency_threshold');accepted=False
    else:
        reason='frequency_screen_passed';accepted=True
    result={'accepted':accepted,'reason':reason,'policy_version':policy['version'],
            'zipf_it':zipf_it,'loanword_detected':loan,'loanword_listed':allowed_loan,
            'source_signals':list(loan_evidence),'semantic_approval':False}
    if frequency_reference is not None: result['frequency_reference']=frequency_reference
    return result
