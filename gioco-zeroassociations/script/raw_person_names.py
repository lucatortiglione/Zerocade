"""Filtro dei nomi di persona e dei cognomi del RAW 2.0 (18/11/2026).

Le voci dei Wiktionary in registro (italiano e inglese, via Kaikki) con categoria «nome proprio» (`pos` = name) la cui
definizione dice che si tratta di un nome di battesimo o di un cognome (given name, surname, nome proprio di persona, cognome…) formano l'elenco dei nomi di persona. Toponimi, sigle, divinità e altri nomi propri restano.
Una parola dell'elenco esce dal RAW solo se non è anche una parola comune: la tengono le voci non proprie dei Wiktionary
(`verdi`, `colombo`, `chiesa`) e le fonti lessicali senza nomi propri (LiITA Lemma Bank, CompL-it, CoLFIS, MAGIC, NVdB: i loro nomi propri sono scartati in lettura).
Morph-it contiene nomi propri e non basta a salvare una parola. Limite: un cognome assente da
tutti i Wiktionary (per esempio `tortiglione`) non si riconosce; un nome che è anche parola comune (`dante`, `elisa`) resta."""
import json
import re

from prompt_inventory import normalize

VERSION = 'raw-person-names-1'
LEXICAL_SOURCES = frozenset({'liita-lemma-bank', 'complit-cnr', 'colfis-cnr', 'magic-ilc-cnr', 'nvdb-de-mauro-2016'})
COMMON_POS = frozenset({'noun', 'adj', 'verb', 'adv'})
PERSON_GLOSS = re.compile(
    r'given name|surname|family name|first name|male name|female name|forename|personal name|'
    r'nome proprio di persona|nome di persona|cognome|nome maschile|nome femminile|'
    r'prénom|nom de famille|patronyme|nom de personne|'
    r'vorname|nachname|familienname|'
    r'nombre de pila|apellido|nombre propio de persona|nombre de varón|nombre de mujer', re.I)


def scan_wiktextract(path, encoding='utf-8-sig'):
    """(nomi di persona, parole comuni) delle voci italiane di un file wiktextract."""
    names, common = set(), set()
    with open(path, encoding=encoding) as stream:
        for line in stream:
            entry = json.loads(line)
            if entry.get('lang_code') != 'it':
                continue
            word = normalize(entry.get('word', ''))
            if not word:
                continue
            senses = entry.get('senses', [])
            if entry.get('pos') == 'name':
                if PERSON_GLOSS.search(' '.join(g for s in senses for g in s.get('glosses', []))):
                    names.add(word)
            elif entry.get('pos') in COMMON_POS and not any('form-of' in (s.get('tags') or []) for s in senses):
                common.add(word)
    return names, common
