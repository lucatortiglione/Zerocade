"""Famiglie di provenienza e tag lessicali, senza dipendenze dai modelli NLP."""


def source_family(key):
    """Una risorsa derivata non costituisce una seconda prova indipendente."""
    if key == 'glaffit': return 'kaikki-itwiktionary'
    if key.startswith('flex-it-'): return 'morphit-048-mirror'
    if key.startswith('ud-'): return 'ud'
    return key


def upos(kind, tag, role):
    """Mappatura dichiarata dei formati; un tag sconosciuto rimane irrisolto."""
    if role == 'proper_name':
        return 'PROPN'
    if kind == 'glaffit':
        if tag.startswith('Np'):
            return 'PROPN'
        return {'N': 'NOUN', 'V': 'VERB', 'A': 'ADJ', 'R': 'ADV', 'P': 'PRON',
                'D': 'DET', 'S': 'ADP', 'C': 'CCONJ', 'M': 'NUM', 'I': 'INTJ'}.get(tag[:1])
    if kind == 'nvdb_text':
        # Il NVdB può elencare più categorie: non se ne sceglie una arbitrariamente.
        return None
    key = tag.upper().split(':')[0].split('-')[0].split('.')[0]
    return {'NOUN': 'NOUN', 'N': 'NOUN', 'VER': 'VERB', 'VERB': 'VERB', 'V': 'VERB',
            'ADJ': 'ADJ', 'A': 'ADJ', 'S': 'ADJ', 'ADV': 'ADV', 'R': 'ADV',
            'NPR': 'PROPN', 'NAME': 'PROPN', 'PROPN': 'PROPN', 'AUX': 'AUX',
            'DET': 'DET', 'ART': 'DET', 'PRE': 'ADP', 'ADP': 'ADP', 'PRON': 'PRON',
            'PRO': 'PRON', 'NUM': 'NUM', 'CON': 'CCONJ', 'CCONJ': 'CCONJ',
            'SCONJ': 'SCONJ', 'INTJ': 'INTJ'}.get(key)
