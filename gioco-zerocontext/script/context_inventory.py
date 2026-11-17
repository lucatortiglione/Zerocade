"""Selezione di segrete e tentativi dal DB lessicale, senza banche CSV."""
from __future__ import annotations

from collections import Counter
from contextlib import closing
from pathlib import Path
import json

import numpy as np

import build_context_bank as bank
from context_vocabulary import WORD, inventory_vocab, pure_plurals
from evaluate_context_inventory import collect_batch, heads, DICTIONARIES, MORPHOLOGY
from context_semantic_sources import digest, readonly, sha

HERE = Path(__file__).resolve().parent.parent
EXCLUSIONS = HERE / 'context_bank_exclusions.txt'


def candidate_reviews(con):
    if not con.execute("SELECT 1 FROM sqlite_schema WHERE name='raw__context_candidate_reviews'").fetchone():
        return {}
    # Ultima decisione per parola; un parere positivo non sostituisce i filtri lessicali.
    return {word: {'verdict': verdict, 'reason': reason, 'actor': actor, 'reviewed_at': at}
            for word, verdict, reason, actor, at in con.execute('''
                SELECT prompt,verdict,reason,actor,reviewed_at FROM raw__context_candidate_reviews
                ORDER BY reviewed_at,run''')}


def inventory_identity(path, cache, exclusions=EXCLUSIONS):
    with closing(readonly(path)) as con:
        snapshots = heads(con)
        reviews = candidate_reviews(con)
    return {'database': str(Path(path).resolve()), 'active_snapshots': snapshots,
            'candidate_reviews_sha256': digest(reviews),
            'fasttext_words_sha256': sha(Path(cache) / 'fasttext_it_words.txt'),
            'exclusions_sha256': sha(exclusions)}


def select_inventory(path, cache, current_words, current_secrets, *, frequency_limit=60000,
                     exclusions=EXCLUSIONS, batch_size=10000):
    """Conserva il corpus attuale e aggiunge soltanto parole con prove correnti.

    Le nuove segrete richiedono fascia base/comune e vettore fastText. Le segrete
    esistenti restano, salvo esclusioni esplicite, plurali puri o vettori mancanti.
    Frequenze, lemmi e morfologia vengono dal DB in sola lettura.
    """
    if frequency_limit < 1 or batch_size < 1:
        raise ValueError('Limite frequenze e dimensione lotto devono essere positivi')
    path, cache, exclusions = Path(path), Path(cache), Path(exclusions)
    identity = inventory_identity(path, cache, exclusions)
    matrix = np.load(cache / 'fasttext_it_vectors.npy', mmap_mode='r')
    forms = (cache / 'fasttext_it_words.txt').read_text(encoding='utf-8').splitlines()
    if matrix.ndim != 2 or len(forms) != len(matrix) or matrix.shape[1] != 300:
        raise ValueError('Indice e matrice fastText non allineati')
    index = {w: i for i, w in reversed(list(enumerate(forms))) if WORD.fullmatch(w)}
    del matrix
    excluded = {w for line in exclusions.read_text(encoding='utf-8').splitlines()
                for w in line.split('#')[0].split()}
    attested, lexical_snapshots = inventory_vocab(index, path)
    candidates, reserve, tiers, rejected, frequencies = set(), set(), Counter(), Counter(), {}
    with closing(readonly(path)) as con:
        con.execute('BEGIN')
        sources = {n: (key, kind) for n, key, kind in con.execute('''
            SELECT n.n,h.source_key,i.kind FROM raw__inventory_source_heads h
            JOIN raw__inventory_snapshot_numbers n ON n.snapshot_id=h.snapshot_id
            JOIN raw__inventory_sources i USING(source_key)
            JOIN raw__inventory_registered_sources r USING(source_key) WHERE r.enabled=1''')}
        roles = dict(con.execute('SELECT n,role FROM raw__inventory_attestation_roles'))
        tags = dict(con.execute('SELECT n,pos FROM raw__inventory_attestation_pos'))
        reviews = candidate_reviews(con)
        con.execute('CREATE TEMP TABLE context_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
        words = sorted(index)
        for offset in range(0, len(words), batch_size):
            batch = words[offset:offset + batch_size]
            feats = collect_batch(con, batch, sources, roles, tags)
            for word, f in feats.items():
                if word in excluded:
                    rejected['esclusione_editoriale'] += 1
                    continue
                tier = bank.decide(word, f, dictionary_sources=DICTIONARIES, morphology_sources=MORPHOLOGY)
                if tier in {'base', 'comune'}:
                    candidates.add(word)
                    tiers[tier] += 1
                elif tier == 'esteso':
                    reserve.add(word)
                else:
                    rejected[tier.removeprefix('-')] += 1
            # Solo il rango wordfreq dello snapshot attivo: le frequenze Flex_it
            # non sono intercambiabili con wordfreq o OpenSubtitles.
            con.execute('DELETE FROM context_targets')
            con.executemany('INSERT INTO context_targets VALUES (?)', ((w,) for w in batch))
            for word, snapshot, role, details in con.execute('''
                SELECT a.prompt,a.snapshot,a.role,a.details_json FROM context_targets t
                CROSS JOIN raw__inventory_attestation_rows_json a ON a.prompt=t.word'''):
                if (sources.get(snapshot, ('', ''))[0] != 'wordfreq-it-local' or
                        roles[role] != 'frequency_form'):
                    continue
                rank = json.loads(details).get('rank')
                if isinstance(rank, int) and not isinstance(rank, bool) and 0 < rank <= frequency_limit * 2:
                    frequencies[word] = min(frequencies.get(word, rank), rank)
            print(f'Inventario: {min(offset + batch_size, len(words))}/{len(words)} parole con vettore', flush=True)
    base = sorted(frequencies, key=lambda w: (frequencies[w], w))[:frequency_limit]
    guess_candidates = candidates.copy()
    review_holds = {w: reviews[w] for w in sorted(candidates - set(current_secrets))
                    if w in reviews and reviews[w]['verdict'] != 'CONSIGLIATA'}
    candidates.difference_update(review_holds)
    # Come nel generatore precedente, anche la riserva può essere un tentativo.
    selected = set(base) | set(attested) | guess_candidates | reserve | set(current_words)
    missing = selected - set(index)
    if missing:
        raise ValueError(f'{len(missing)} parole conservate senza fastText: acquisire una cache più ampia')
    plurals = pure_plurals(sorted(selected), path, active_only=True)
    words = sorted(selected - set(plurals))
    secrets = sorted(((set(current_secrets) | candidates) & set(words)) - excluded)
    if not secrets:
        raise ValueError('Il DB lessicale non produce segrete giocabili')
    if inventory_identity(path, cache, exclusions) != identity:
        raise ValueError('Le fonti lessicali sono cambiate durante la selezione: ripetere')
    old_words, old_secrets = set(current_words), set(current_secrets)
    report = {'mode': 'inventory-db-1', 'inputs': identity, 'frequency_limit': frequency_limit,
              'frequency_words': len(base), 'attested_words': len(attested),
              'lexical_snapshots': lexical_snapshots, 'candidate_tiers': dict(tiers),
              'candidate_review_holds': review_holds,
              'extended_reserve': len(reserve), 'rejected': dict(rejected),
              'excluded_pure_plurals': len(plurals),
              'words_added': len(set(words) - old_words), 'words_removed': len(old_words - set(words)),
              'secrets_added': len(set(secrets) - old_secrets), 'secrets_removed': len(old_secrets - set(secrets)),
              'preserved_secrets': len(set(secrets) & old_secrets),
              'vocab_sha256': digest(words), 'secrets_sha256': digest(secrets)}
    return words, secrets, report
