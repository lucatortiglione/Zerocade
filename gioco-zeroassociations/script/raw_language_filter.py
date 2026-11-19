"""Filtro di lingua del RAW 2.0 (17/11/2026): una parola entra solo se è italiana.

Una parola è straniera quando una lingua concorrente è nettamente più frequente dell'italiano secondo wordfreq: l'inglese con
un Zipf di almeno 2,5 e 1,0 sopra l'italiano; francese, spagnolo e tedesco con almeno 2,5 e 1,5 sopra (margine più largo perché
condividono più parole con l'italiano). Vale anche se la parola è attestata in una fonte morfologica italiana: quelle fonti
contengono anch'esse parole inglesi. Poiché il Zipf italiano di wordfreq è inquinato dall'inglese (workshop, national, matrix),
per l'inglese vale anche una regola più stretta sulle parole che l'italiano nativo non scrive così: almeno 4 lettere, Zipf inglese
di almeno 3,0 non inferiore a quello italiano, e finale in consonante o una delle lettere j, k, w, x, y. Le parole che finiscono
in vocale (case, area, date, sale) restano finché l'inglese non le supera di un punto intero. Inoltre esce la parola con un'ortografia che l'italiano non ha (spelling_oddity): sempre se non ha vocali (sigle) o
comincia per «aa» (aarhus, aamot); se ha una j, k, w, x, y, o finisce in consonante, o contiene «aa», un digramma straniero (sh, ck, tz, th, ph, ij, ou, ch/gh davanti ad a/o/u) o cinque consonanti di
fila, solo quando non ha alcuna frequenza italiana e nessuna fonte di ITALIAN_EVIDENCE la attesta (restano jazz, kiwi, pollar).
Una parola assente da tutte le liste e senza ortografia anomala (un cognome come abaidoo) non viene toccata."""
from functools import lru_cache

from wordfreq import zipf_frequency

import re

VERSION = 'raw-language-filter-4'
MIN_ZIPF = 2.5
VOWELS = frozenset('aeiouàèéìòù')
NON_ITALIAN_LETTERS = re.compile('[jkwxy]')
# Fonti che documentano l'italiano (Morph-it, LiITA Lemma Bank, CompL-it, CoLFIS, MAGIC, NVdB): una parola con ortografia dubbia vi si salva.
# I Wiktionary non bastano: contengono anche altre lingue.
ITALIAN_EVIDENCE = frozenset({'morphit-048-mirror', 'liita-lemma-bank', 'complit-cnr', 'colfis-cnr', 'magic-ilc-cnr', 'nvdb-de-mauro-2016'})
SPELLING = 'ortografia'
CONSONANTS_5 = re.compile('[^aeiouàèéìòùáíóú]{5}')
# Digrammi e gruppi che l'italiano nativo non scrive così (cognomi e nomi arabi, francesi, tedeschi, slavi, greci): «ch» e «gh» si
# usano solo davanti a e/i, «sch» e «cch» sono italiani; sh, ck, tz, th, ph, ij, ou, uu e -eau(x) no. Esclusi «ché»/«chè» (poiché).
FOREIGN_GRAPHEMES = re.compile('sh|ck|tz|th|ph|ij|ou|uu|eaux?$|(?<![sc])ch(?![eihéè])|gh(?![ei])')
MARGINS = {'en': 1.0, 'fr': 1.5, 'es': 1.5, 'de': 1.5}


def has_italian_frequency(word):
    return zipf_frequency(word, 'it') > 0


@lru_cache(maxsize=200_000)
def foreign_language(word):
    """La lingua straniera che prevale su quella italiana, o None."""
    italian = zipf_frequency(word, 'it')
    english = zipf_frequency(word, 'en')
    if len(word) >= 4 and english >= 3.0 and english >= italian and (word[-1] not in VOWELS or NON_ITALIAN_LETTERS.search(word)):
        return 'en'
    best, best_gap = None, 0.0
    for language, margin in MARGINS.items():
        zipf = zipf_frequency(word, language)
        gap = zipf - italian - margin
        if zipf >= MIN_ZIPF and gap >= 0 and gap >= best_gap:
            best, best_gap = language, gap
    return best


def spelling_oddity(word):
    """'hard': ortografia impossibile in italiano; 'soft': insolita (lecita solo per prestiti e apocopi attestati); None."""
    if not any(c in VOWELS for c in word) or word.startswith('aa'):
        return 'hard'
    if NON_ITALIAN_LETTERS.search(word) or FOREIGN_GRAPHEMES.search(word) or word[-1] not in VOWELS or 'aa' in word or CONSONANTS_5.search(word):
        return 'soft'
    return None
