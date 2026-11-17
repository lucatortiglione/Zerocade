"""Rigenera ZeroContext: Model2Vec, fallback FastText, margine antonimico e collaudo senza perdere segrete."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
from importlib.metadata import version

import numpy as np
from filelock import FileLock
from wordfreq import zipf_frequency

from context_semantic_sources import digest, load_game, profiles, readonly, sha, write_json
from context_subword import acquire_model, SubwordModel, unit_rows, MODEL_SHA, MODEL_REVISION
from context_semantic_policy import (aggregate_zipf, lexical_graph, neighbourhoods, nvdb_classes,
                                     ordinary_lexical, retrofit, special_lexical)
from context_inventory import candidate_reviews
from publish_context import active_vectors, publish
from context_vector_pipeline import configuration, initial_vectors, margin_retrofit, quality_words, validate_quality

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'database/script'))
from giochi import CONTEXT_SCHEMA
from schemadb import SchemaDb

WORD = re.compile('[a-zàèéìòù]{2,20}')
TARGET_SCHEMA = '''CREATE TABLE targets (
 word TEXT PRIMARY KEY REFERENCES vocab(word), ordinary INTEGER NOT NULL CHECK(ordinary IN (0,1)),
 special INTEGER NOT NULL CHECK(special IN (0,1)), legacy INTEGER NOT NULL CHECK(legacy IN (0,1)),
 details TEXT NOT NULL CHECK(json_valid(details))
) STRICT, WITHOUT ROWID;'''


def frequency(word):
    return zipf_frequency(word, 'it')


def morphology(path):
    parts, forms, inflections = defaultdict(set), defaultdict(set), set()
    with closing(readonly(path)) as con:
        rows = list(con.execute('''SELECT a.prompt,a.lemma,p.pos FROM raw__inventory_attestation_rows a
            JOIN raw__inventory_snapshot_numbers n ON n.n=a.snapshot
            JOIN raw__inventory_source_heads h ON h.snapshot_id=n.snapshot_id
            JOIN raw__inventory_registered_sources r USING(source_key)
            JOIN raw__inventory_attestation_pos p ON p.n=a.pos
            WHERE h.source_key='morphit-048-mirror' AND r.enabled=1'''))
    if not rows:
        raise ValueError('Snapshot Morph-it attivo assente dal DB lessicale')
    for form, lemma, tag in rows:
        if not WORD.fullmatch(lemma) or not WORD.fullmatch(form):
            continue
        if tag.startswith(('VER:', 'AUX:', 'MOD:', 'CAU:')):
            parts[lemma].add('verb')
            forms[lemma].add(form)
        elif tag.startswith('NOUN'):
            parts[lemma].add('noun')
        elif tag.startswith('ADJ'):
            parts[lemma].add('adjective')
        if tag.startswith(('VER:', 'AUX:', 'MOD:', 'CAU:', 'NOUN', 'ADJ')) and frequency(form) >= 3:
            inflections.add(form)
    return dict(parts), dict(forms), inflections


def build(args):
    config = configuration(args.config)
    before = load_game(args.game_db)
    old_words, old_secrets, old_meta, old_links, old_hubs, reviewed, pairs = before
    identity = {key: digest(value) for key, value in zip(
        ('vocab', 'secrets', 'meta', 'links', 'hubs', 'reviewed_senses', 'verified_pairs'), before)}
    identity['vectors_sha256'] = sha(active_vectors(old_meta, args.data_dir))
    parts, forms, inflections = morphology(args.raw_db)
    tiers, nvdb_source = nvdb_classes(args.cache)
    domains_config = json.loads((HERE / 'resources/semantic-domains.json').read_text(encoding='utf-8'))
    domains = {w: domain for domain, words in domains_config['domains'].items() for w in words.split()}
    excluded = {w for line in (HERE / 'context_bank_exclusions.txt').read_text(encoding='utf-8').splitlines()
                for w in line.split('#')[0].split()}
    with closing(readonly(args.raw_db)) as raw:
        reviews = candidate_reviews(raw)
        snapshots = list(raw.execute('SELECT source_key,snapshot_id FROM raw__inventory_source_heads ORDER BY source_key'))
    blocked = excluded | {w for w, r in reviews.items() if r['verdict'] != 'CONSIGLIATA'}
    effective = {w: aggregate_zipf(fs | {w}, frequency) for w, fs in forms.items()}
    lexical = set(parts) | set(domains)
    # Nuovi target: solo lemmi morfologici, più i lemmi già giocabili con definizione lessicale.
    candidates = {w for w in lexical if w not in blocked and (
        ordinary_lexical(effective.get(w, frequency(w)), tiers.get(w), 'noun' in parts.get(w, ()), 'verb' in parts.get(w, ())) or
        special_lexical(w, effective.get(w, frequency(w)), tiers.get(w), domains.get(w)))}
    # Le forme flesse restano tentativi. Le più comuni colmano i plurali eliminati dalla vecchia pipeline.
    words = sorted(set(old_words) | candidates | inflections | set(old_secrets))
    if args.limit:
        probes = [w for w in quality_words(config) if w in set(words)]
        words = sorted(list(dict.fromkeys(old_secrets[:1] + probes + words))[:args.limit])
        candidates &= set(words)
    if len(words) > 200000 or len(words) * 300 * (2 if config['storage'] == 'float16' else 4) > 128 * 1024 * 1024:
        raise ValueError('Vocabolario oltre il budget vettoriale; nessuna parola esistente è stata eliminata')
    print(f'Vocabolario: {len(words)}; segrete da conservare: {len(old_secrets)}; candidati: {len(candidates)}', flush=True)
    cards, _ = profiles(words, reviewed, args.raw_db)
    cards_by_word = {c['word']: c for c in cards}
    candidates = sorted(w for w in candidates if w in parts or cards_by_word[w]['origin'] != 'lemma_only')
    input_sources = {'raw_snapshots': snapshots, 'reviews_sha256': digest(reviews),
                     'morphology_source': 'active_enabled_morphit_snapshot_in_raw_db', 'domains_sha256': digest(domains_config)}
    # I lemmi di collaudo esterni alla guess list non diventano soluzioni o ancore aggiunte a Model2Vec.
    vector_words = words + sorted(set(quality_words(config)) - set(words))
    cache_key = digest({'words': vector_words, 'model': MODEL_SHA})
    encoded = args.cache / f'subword-{cache_key}.npy'
    model_path = acquire_model(args.cache / 'cc.it.300.bin')
    if encoded.exists():
        initial = unit_rows(np.load(encoded))
        subword_args = json.loads(encoded.with_suffix('.json').read_text(encoding='utf-8'))
    else:
        model = SubwordModel(model_path, vector_words)
        initial = unit_rows(model.encode(vector_words))
        subword_args = {'minn': model.minn, 'maxn': model.maxn, 'bucket': model.bucket,
                        'dictionary_words': len(model.ids), 'oov_words': len(vector_words) - len(model.ids)}
        np.save(encoded, initial)
        write_json(encoded.with_suffix('.json'), subword_args)
        del model
    contexts = vector_words if config['multi_context']['scope'] == 'all' else [w for w in vector_words
        if 'verb' in parts.get(w, ()) or w in domains or w in reviewed]
    initial, vector_source = initial_vectors(vector_words, len(words), contexts, initial, config, args.cache)
    synonyms, antonyms, graph_source = lexical_graph(vector_words, args.cache)
    print(f'Retrofitting: {len(synonyms)} coppie sinonimiche, {len(antonyms)} antonimiche', flush=True)
    matrix, fitting = margin_retrofit(initial, synonyms, antonyms, config['retrofitting'])
    stored = np.ascontiguousarray(matrix, dtype='<f2' if config['storage'] == 'float16' else '<f4')
    quality = validate_quality(stored.astype(np.float32), vector_words, config, guess_count=len(words))
    matrix = matrix[:len(words)]
    index = {w: i for i, w in enumerate(words)}
    surface = np.asarray([frequency(w) for w in words], dtype=np.float32)
    measured = sorted((set(candidates) | set(old_secrets)) & set(words))
    targets, ordinary, special, compatibility = [], [], [], []
    legacy = set(old_secrets) & set(words)
    for i, density, bridges, special_bridges in neighbourhoods(matrix, [index[w] for w in measured], surface):
        w = words[i]
        z = effective.get(w, frequency(w))
        standard = w in candidates and ordinary_lexical(z, tiers.get(w), 'noun' in parts.get(w, ()), 'verb' in parts.get(w, ())) and density >= .45 and bridges >= 10
        survival = config['special_rounds_enabled'] and w in candidates and special_lexical(w, z, tiers.get(w), domains.get(w)) and density >= .48 and special_bridges >= 15
        preserved = w in legacy and not standard and not survival
        if standard:
            ordinary.append(i)
        if survival:
            special.append(i)
        if preserved:
            compatibility.append(i)
        if standard or survival or w in legacy:
            details = {'zipf': z, 'surface_zipf': frequency(w), 'nvdb': tiers.get(w), 'density100': density,
                       'bridges4': bridges, 'bridges38': special_bridges, 'domain': domains.get(w),
                       'frequency_method': 'sum_attested_forms' if w in forms else 'surface',
                       'legacy_exception': preserved, 'lexical_origin': cards_by_word[w]['origin']}
            targets.append((w, int(standard or preserved), int(survival), int(w in legacy), json.dumps(details, ensure_ascii=False)))
    if config['special_rounds_enabled'] and not special:
        raise ValueError('Nessun target speciale supera i filtri: il corpus attivo rimane intatto')
    secrets = sorted(t[0] for t in targets)
    if not legacy <= set(secrets):
        raise ValueError('La generazione perderebbe segrete esistenti')
    pools = {'version': 'context-semantic-1', 'ordinary': sorted(ordinary + compatibility), 'special': special,
             'domains': {str(index[w]): domains[w] for w in secrets if index[w] in set(special)},
             'curatedOrdinary': ordinary, 'compatibility': compatibility}
    run = args.output or args.cache / 'semantic/runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    run.mkdir(parents=True, exist_ok=False)
    (run / 'vocab.txt').write_text('\n'.join(words) + '\n', encoding='utf-8', newline='\n')
    (run / 'secrets.txt').write_text('\n'.join(secrets) + '\n', encoding='utf-8', newline='\n')
    stored[:len(words)].tofile(run / 'vectors.bin')
    np.save(run / 'embeddings_300d.npy', stored[:len(words)])
    np.save(run / 'quality_probes.npy', stored[len(words):])
    write_json(run / 'vocab_index.json', index)
    write_json(run / 'quality.json', quality)
    write_json(run / 'vector_config.json', config)
    links = {'boost': 0, 'links': {}, 'hubs': [0] * len(words), 'vector_format': config['storage'], 'dim': 300, 'semantic': pools}
    write_json(run / 'links.json', links)
    meta = {'words': len(words), 'secrets': len(secrets), 'dim': 300, 'links': 0, 'link_boost': 0,
            'hub_strength': 0, 'vector_format': config['storage'], 'pipeline': 'context-semantic-1',
            'vector_pipeline': config['version'], 'special_rounds_enabled': config['special_rounds_enabled'],
            'ordinary': len(pools['ordinary']), 'special': len(special), 'legacy_preserved': len(legacy)}
    write_json(run / 'meta.json', meta)
    write_json(run / 'targets.json', [{'word': t[0], 'ordinary': bool(t[1]), 'special': bool(t[2]), 'legacy': bool(t[3]), **json.loads(t[4])} for t in targets])
    with closing(readonly(args.game_db)) as source, closing(sqlite3.connect(run / 'giochi.sqlite3')) as target:
        source.backup(target)
    with tempfile.TemporaryDirectory(prefix='context-semantic-') as folder:
        path = Path(folder) / 'context.sqlite3'
        with closing(sqlite3.connect(path)) as con:
            con.executescript(CONTEXT_SCHEMA + TARGET_SCHEMA)
            con.executemany('INSERT INTO vocab VALUES (?,?)', enumerate(words))
            con.executemany('INSERT INTO secrets VALUES (?)', ((w,) for w in secrets))
            con.executemany('INSERT INTO targets VALUES (?,?,?,?,?)', targets)
            con.executemany('INSERT INTO hubs VALUES (?,0)', ((i,) for i in range(len(words))))
            con.executemany('INSERT INTO meta VALUES (?,?)', ((k, json.dumps(v)) for k, v in meta.items()))
            con.commit()
        SchemaDb(run / 'giochi.sqlite3', {}, 'UNUSED_CONTEXT_LEGACY').import_schema(path, 'context')
    # Le fonti e la base devono ancora corrispondere dopo il lavoro offline.
    if any(digest(a) != digest(b) for a, b in zip(before, load_game(args.game_db))):
        raise ValueError('Il DB di gioco è cambiato durante la generazione')
    with closing(readonly(args.raw_db)) as raw:
        if (list(raw.execute('SELECT source_key,snapshot_id FROM raw__inventory_source_heads ORDER BY source_key')) != snapshots or
                digest(candidate_reviews(raw)) != input_sources['reviews_sha256']):
            raise ValueError('Le fonti lessicali sono cambiate durante la generazione')
    report = {'kind': 'context_semantic_candidate', 'version': config['version'], 'pilot': bool(args.limit),
              'inputs': identity, 'selection': {'mode': 'semantic-db-1', 'vocab_sha256': digest(words), 'secrets_sha256': digest(secrets)},
              'sources': {'fasttext': {'revision': MODEL_REVISION, 'sha256': MODEL_SHA, **subword_args}, 'nvdb': nvdb_source,
                          'graph': graph_source, 'model2vec': vector_source, **input_sources},
              'words': len(words), 'secrets': len(secrets), 'preserved': len(legacy), 'added': len(set(secrets) - legacy),
              'ordinary_curated': len(ordinary), 'special': len(special), 'legacy_exceptions': len(compatibility),
              'retrofitting': fitting, 'quality': quality, 'config': config,
              'quality_status': 'passed_automatic_checks_not_human_validated' if quality['passed'] else 'failed_automatic_checks',
              'packages': {name: version(name) for name in ('numpy', 'scipy', 'wordfreq', 'PyMuPDF')},
              'script_hashes': {name: sha(HERE / 'script' / name) for name in ('build_context_semantic.py', 'context_subword.py', 'context_semantic_policy.py', 'context_vector_pipeline.py', 'publish_context.py')},
              'artifacts': {name: sha(run / name) for name in ('vocab.txt', 'secrets.txt', 'vectors.bin', 'embeddings_300d.npy',
                'vocab_index.json', 'quality_probes.npy', 'quality.json', 'vector_config.json', 'links.json', 'meta.json', 'targets.json', 'giochi.sqlite3')}}
    write_json(run / 'report.json', report)
    write_json(args.cache / ('semantic/pilot-latest.json' if args.limit else 'semantic/latest.json'),
               {'output': str(run.resolve()), 'report_sha256': sha(run / 'report.json')})
    return {'output': str(run.resolve()), 'quality_passed': quality['passed'], **{k: report[k] for k in ('words', 'secrets', 'preserved', 'added', 'ordinary_curated', 'special', 'legacy_exceptions')}}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--game-db', type=Path, default=ROOT / 'database/giochi.sqlite3')
    ap.add_argument('--raw-db', type=Path, default=ROOT / 'database/parole_ita_raw.sqlite3')
    ap.add_argument('--data-dir', type=Path, default=HERE / 'data')
    ap.add_argument('--cache', type=Path, default=HERE / '.cache')
    ap.add_argument('--output', type=Path)
    ap.add_argument('--config', type=Path, default=HERE / 'resources/semantic-vectors.json')
    ap.add_argument('--limit', type=int, help='Pilota non pubblicabile (almeno 301 parole)')
    ap.add_argument('--plan', action='store_true', help='Controlla il profilo senza modelli, download o scritture')
    ap.add_argument('--publish', action='store_true')
    ap.add_argument('--server-url', default='http://127.0.0.1:3001')
    args = ap.parse_args()
    if args.limit is not None and (not 301 <= args.limit <= 200000 or args.publish):
        ap.error('Un pilota richiede 301–200000 parole e non può usare --publish')
    if args.plan:
        c = configuration(args.config)
        live = load_game(args.game_db)
        print(json.dumps({'mode': 'plan', 'config': c, 'words_current': len(live[0]), 'secrets_preserved': len(live[1]),
            'pilot': args.limit, 'publication': args.publish, 'steps': ['DB lessicale', 'Model2Vec + PCA + SIF',
            'prompt-averaging offline', 'fallback FastText allineato', 'retrofitting con margine',
            'L2, NPY e formato runtime', 'collaudo polarità/OOV/distribuzione', 'pubblicazione senza rimozioni']}, ensure_ascii=False, indent=2))
        return
    args.cache.mkdir(parents=True, exist_ok=True)
    (args.cache / 'ensemble').mkdir(exist_ok=True)
    with FileLock(str(args.cache / 'ensemble/build.lock'), timeout=0):
        result = build(args)
        if args.publish:
            if not result['quality_passed']:
                raise SystemExit(f'Collaudo fallito: corpus attivo conservato. Rapporto: {result["output"]}/quality.json')
            result.update(publish(result['output'], args.game_db, args.data_dir, server_url=args.server_url))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
