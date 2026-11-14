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
