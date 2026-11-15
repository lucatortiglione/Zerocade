"""Espansione dei tentativi dalle attestazioni lessicali correnti, senza tetto numerico."""
from __future__ import annotations

from contextlib import closing
from pathlib import Path
import re
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / 'gioco-zeroassociations' / 'script'))
from inventory_evidence import source_family, upos

WORD = re.compile(r'^[a-zàèéìòù]{3,16}$')
LEXICAL_KINDS = {'wiktextract', 'glaffit', 'morphit', 'unimorph', 'flex_it',
                 'nvdb_text', 'wordnet_tab', 'xlsx_table', 'tei_headwords'}
TRUSTED_FAMILIES = {'morphit-048-mirror', 'unimorph-ita', 'nvdb-de-mauro-2016'}


def accepted(families: set[str]) -> bool:
    """Una risorsa morfologica/di base, oppure due famiglie lessicali indipendenti."""
    return bool(families & TRUSTED_FAMILIES) or len(families) >= 2


def inventory_vocab(index: dict[str, int], path: Path) -> tuple[dict[str, list[str]], list[tuple]]:
    """Solo lemmi/forme flesse con vettore; titoli, frequenze e nomi propri non sono prove.

    Restituisce anche gli snapshot usati, per rendere riproducibile la selezione.
    La connessione è in sola lettura; l'elenco dei bersagli vive in una tabella temporanea.
    """
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as con:
        con.execute('BEGIN')
        sources = {n: (key, kind, snapshot) for n, key, kind, snapshot in con.execute('''
            SELECT n.n,h.source_key,i.kind,h.snapshot_id
            FROM raw__inventory_source_heads h
            JOIN raw__inventory_snapshot_numbers n ON n.snapshot_id=h.snapshot_id
            JOIN raw__inventory_sources i USING(source_key)
            JOIN raw__inventory_registered_sources r USING(source_key)
            WHERE r.enabled=1''') if kind in LEXICAL_KINDS}
        roles = dict(con.execute('SELECT n,role FROM raw__inventory_attestation_roles'))
        tags = dict(con.execute('SELECT n,pos FROM raw__inventory_attestation_pos'))
        con.execute('CREATE TEMP TABLE context_vocab_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
        con.executemany('INSERT INTO context_vocab_targets VALUES (?)',
                        ((w,) for w in sorted(index) if WORD.fullmatch(w)))
        evidence: dict[str, set[str]] = {}
        selected = ','.join('?' for _ in sources)
        for word, snapshot, role, pos in con.execute(f'''
            SELECT a.prompt,a.snapshot,a.role,a.pos FROM raw__inventory_attestation_rows a
            CROSS JOIN context_vocab_targets t ON t.word=a.prompt
            WHERE a.snapshot IN ({selected})''', tuple(sources)):
            if snapshot not in sources or roles[role] not in {'lemma', 'inflected_form'}:
                continue
            key, kind, _ = sources[snapshot]
            if upos(kind, tags[pos], roles[role]) == 'PROPN':
                continue
            evidence.setdefault(word, set()).add(source_family(key))
        snapshots = sorted((key, snapshot) for key, _, snapshot in sources.values())
        return {w: sorted(f) for w, f in sorted(evidence.items()) if accepted(f)}, snapshots


# --- Plurali puri (decisione del 15/11/2026: fuori dal vocabolario di ZeroContext) ---
# Una parola è un plurale puro quando una fonte morfologica la attesta come plurale di un nome o di un aggettivo, con
# un lemma singolare diverso che è anche lui nella raccolta, e nessuna fonte la dà come lemma a sé (pantaloni,
# fratelli) né come forma di un'altra parola (citati, participio; costumi, anche di «costumare»). Le prove di plurale:
# GLAFF (Ncmp, Ncfp, Afpmp, Afpfp), Morph-it! (NOUN-M:p, NOUN-F:p, ADJ:…+p), Flex_it (number plur), treebank UD
# (Number=Plur su NOUN/ADJ), Wiktionary (le voci «plurale di…»). Il plurale della parola segreta resta comunque una
# vittoria: il gioco lo riconosce (contextPlurals.json) anche senza la sua riga.

GLAFF_PLURAL = {'Ncmp', 'Ncfp', 'Afpmp', 'Afpfp'}
MORPHOLOGY = ('glaffit', 'morphit-048-mirror', 'flex-it', 'ud-', 'kaikki')
OTHER_LEXICAL = ('nvdb-de-mauro-2016', 'libreoffice-it-thesaurus', 'omw-multiwordnet-it')


def plural_evidence(source: str, pos: str, details: dict) -> bool:
    """L'attestazione dice che la forma è il plurale di un nome o di un aggettivo."""
    if source == 'glaffit':
        return pos in GLAFF_PLURAL
    if source == 'morphit-048-mirror':
        return pos in ('NOUN-M:p', 'NOUN-F:p') or (pos.startswith('ADJ:') and pos.endswith('+p'))
    if source.startswith('flex-it'):
        return details.get('number') == 'plur'
    if source.startswith('ud-'):
        return pos in ('NOUN', 'ADJ') and 'Number=Plur' in (details.get('features') or '')
    if source.startswith('kaikki') and pos in ('noun', 'adj'):
        for sense in details.get('senses') or []:
            glosses = ' '.join(sense.get('glosses') or []).lower()
            if 'plural' in (sense.get('tags') or []) or glosses.startswith(('plurale', 'pluriel', 'plural ')):
                return True
    return False


def pure_plurals(words, path: Path) -> dict[str, list[str]]:
    """Le parole di `words` che sono plurali puri, ognuna con i suoi singolari presenti nella raccolta."""
    import json
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as con:
        con.execute('BEGIN')
        sources = dict(con.execute('''SELECT n.n, s.source_key FROM raw__inventory_snapshot_numbers n
            JOIN raw__inventory_snapshots s ON s.id = n.snapshot_id'''))
        roles = dict(con.execute('SELECT n, role FROM raw__inventory_attestation_roles'))
        tags = dict(con.execute('SELECT n, pos FROM raw__inventory_attestation_pos'))
        con.execute('CREATE TEMP TABLE plural_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
        con.executemany('INSERT OR IGNORE INTO plural_targets VALUES (?)', ((w,) for w in words))
        singulars: dict[str, set[str]] = {}
        own_lemma: set[str] = set()
        other_form: set[str] = set()
        for word, snapshot, role, pos, lemma, details in con.execute('''
            SELECT a.prompt, a.snapshot, a.role, a.pos, a.lemma, a.details_json FROM plural_targets t
            JOIN raw__inventory_attestation_rows_json a ON a.prompt = t.word'''):
            source, role, pos = sources.get(snapshot, ''), roles[role], tags[pos]
            if not source.startswith(MORPHOLOGY) and source not in OTHER_LEXICAL:
                continue
            if role == 'proper_name' or pos in ('NPR', 'name', 'PROPN', 'X'):
                continue
            if role == 'lemma' and (lemma == word or not lemma):
                own_lemma.add(word)
                continue
            if role != 'inflected_form' or not lemma or lemma == word:
                continue
            parsed = json.loads(details) if details and details.startswith('{') else {}
            if plural_evidence(source, pos, parsed):
                singulars.setdefault(word, set()).add(lemma)
            else:
                other_form.add(word)
        con.execute('CREATE TEMP TABLE plural_singulars(word TEXT PRIMARY KEY) WITHOUT ROWID')
        con.executemany('INSERT OR IGNORE INTO plural_singulars VALUES (?)', ((s,) for ls in singulars.values() for s in ls))
        known = {w for w, in con.execute('''SELECT s.word FROM plural_singulars s JOIN raw__inventory_terms t
            ON t.prompt = s.word WHERE t.is_single_word = 1''')}
    out = {}
    for word, lemmas in singulars.items():
        present = sorted(lemmas & known)
        if present and word not in own_lemma and word not in other_form:
            out[word] = present
    return dict(sorted(out.items()))
