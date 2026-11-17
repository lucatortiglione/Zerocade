"""ZeroContext: fastText, ConceptNet e LSA; modelli neurali opzionali con altro profilo.

Genera un corpus candidato completo e un DB dei giochi su copia, senza cambiare
la diretta. --plan mostra ingressi e ordine; --limit N produce un pilota esplicito.
Il rapporto confronta ogni fonte, fusione, compressione e ranking pubblicato.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
import gzip
from importlib.metadata import PackageNotFoundError, version
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile

import numpy as np

from context_ensemble import (MAX_BYTES, MAX_DIMENSIONS, MAX_WORDS, MODEL_NAMES, NAMES, combine, positions,
                              quantize, read_assertions, reduce_block, unit_rows)
from context_semantic_sources import (digest, lexical_vectors, load_game, model_access, profiles,
                                      readonly, sentence_vectors, sha, write_json, checked_model_code)

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'database' / 'script'))
from giochi import CONTEXT_SCHEMA  # noqa: E402
from schemadb import SchemaDb  # noqa: E402


def configuration(path):
    config = json.loads(path.read_text(encoding='utf-8'))
    if not set(config['models']) <= set(MODEL_NAMES) or set(config['vector_weights']) != {'fasttext', 'conceptnet'}:
        raise ValueError('Modelli non riconosciuti o fonti fastText/ConceptNet mancanti')
    weights = {n: model['weight'] for n, model in config['models'].items()}
    weights.update(config['vector_weights'])
    lsa = config.get('lsa', {})
    if not isinstance(lsa.get('enabled', False), bool):
        raise ValueError('lsa.enabled deve essere un booleano')
    if lsa.get('enabled', False):
        if not 1 <= lsa['dimensions'] <= 256 or not 2 <= lsa['max_features'] <= 100_000 or lsa['min_df'] < 1:
            raise ValueError('Parametri LSA fuori intervallo')
        weights['lsa'] = lsa['weight']
    # Valida i pesi e i nomi con la stessa regola della fusione.
    combine({n: np.ones((2, 1)) for n in weights}, weights)
    for model in config['models'].values():
        if not isinstance(model.get('enabled', True), bool):
            raise ValueError('enabled deve essere un booleano')
        if not re.fullmatch('[a-f0-9]{40}', model['revision']):
            raise ValueError('Ogni modello richiede una revisione Git completa e fissata')
        checked_model_code(model)
    if not 1 <= config['block_dimensions'] <= 256 or not 16 <= config['max_sequence_length'] <= 512:
        raise ValueError('Dimensioni blocco 1–256 e lunghezza testo 16–512')
    if not 0 <= config['link_boost'] <= 1 or config['hub_strength'] != 0:
        raise ValueError('Bonus collegamenti 0–1; la nuova pipeline non applica la vecchia penalità di genericità')
    weights = {n: w for n, w in weights.items() if n not in config['models'] or config['models'][n].get('enabled', True)}
    total = sum(weights.values())
    weights = {n: w / total for n, w in weights.items()}
    return config, weights


def ensure_vectors(cache):
    for name, script in [('fasttext_it', 'fetch_vectors.py'), ('numberbatch_it', 'fetch_numberbatch.py')]:
        if not all((cache / f'{name}_{suffix}').exists() for suffix in ('words.txt', 'vectors.npy')):
            print(f'Acquisizione {name}...', flush=True)
            subprocess.run([sys.executable, '-B', str(HERE / 'script' / script), '--out', str(cache)], check=True)


def verified_links(words, secrets, pairs):
    index = {w: i for i, w in enumerate(words)}
    selected = set(secrets)
    out = set()
    for a, b in pairs:
        if a not in index or b not in index or a == b:
            continue
        if a in selected:
            out.add((index[a], index[b]))
        if b in selected:
            out.add((index[b], index[a]))
    return out


def validate_links(links):
    if len(links) > 500_000 or any(n > 4096 for n in Counter(a for a, _ in links).values()):
        raise ValueError('Collegamenti oltre i limiti del gioco')


def comparison(words, probes, watch, sources, reduced, weights, q, scale, links, boost,
               baseline_words, baseline_q, baseline_links, baseline_hubs, baseline_boost):
    index = {w: i for i, w in enumerate(words)}
    old_index = {w: i for i, w in enumerate(baseline_words)}
    grouped = defaultdict(list)
    previous = defaultdict(list)
    for a, b in links:
        grouped[a].append(b)
    for a, b in baseline_links:
        previous[a].append(b)
    matrices = {n: unit_rows(sources[n]) for n in weights}
    out = {}
    for word in probes:
        if word not in index:
            continue
        s = index[word]
        scores = {n: matrix @ matrix[s] for n, matrix in matrices.items()}
        scores['ensemble_full'] = sum(weights[n] * scores[n] for n in weights)
        scores['ensemble_pca'] = sum(weights[n] * (reduced[n] @ reduced[n][s]) for n in weights)
        scores['ensemble_int8'] = (q.astype(np.int32) @ q[s].astype(np.int32)).astype(np.float64) / (scale * scale)
        scores['ensemble_links'] = scores['ensemble_int8'].copy()
        scores['ensemble_links'][grouped[s]] += boost / (scale * scale)
        variants = {}
        for name, values in scores.items():
            order, ranks = positions(values, s)
            variants[name] = {'top20': [words[i] for i in order[:20]],
                              'watch': {w: int(ranks[index[w]]) for w in watch if w in index}}
        old_s = old_index[word]
        dtype = np.float32 if baseline_q.dtype.kind == 'f' else np.int32
        old_scores = (baseline_q.astype(dtype) @ baseline_q[old_s].astype(dtype)).astype(np.float64)
        old_scores -= np.asarray(baseline_hubs)
        old_scores[previous[old_s]] += baseline_boost
        old_order, old_ranks = positions(old_scores, old_s)
        variants['published'] = {'vocabulary_size': len(baseline_words),
                                 'top20': [baseline_words[i] for i in old_order[:20]],
                                 'watch': {w: int(old_ranks[old_index[w]]) for w in watch if w in old_index}}
        # Misura geometrica, non un giudizio sulla qualità semantica.
        full_order, _ = positions(scores['ensemble_full'], s)
        pca_order, _ = positions(scores['ensemble_pca'], s)
        integer_order, _ = positions(scores['ensemble_int8'], s)
        k = min(100, len(words) - 1)
        out[word] = {'variants': variants, 'compression': {
            'top100_overlap_full_pca': len(set(full_order[1:k+1]) & set(pca_order[1:k+1])) / k,
            'top100_overlap_pca_int8': len(set(pca_order[1:k+1]) & set(integer_order[1:k+1])) / k}}
    return out


def candidate_database(source, destination, words, secrets, meta, links):
    """Copia consistente del DB, poi sostituzione del solo schema context nella copia."""
    with closing(readonly(source)) as origin, closing(sqlite3.connect(destination)) as target:
        origin.backup(target)
    with tempfile.TemporaryDirectory(prefix='context-ensemble-') as temp:
        path = Path(temp) / 'context.sqlite3'
        with closing(sqlite3.connect(path)) as con:
            con.execute('PRAGMA foreign_keys=ON')
            con.executescript(CONTEXT_SCHEMA)
            con.executemany('INSERT INTO vocab VALUES (?,?)', enumerate(words))
            con.executemany('INSERT INTO secrets VALUES (?)', ((w,) for w in secrets))
            con.executemany('INSERT INTO links VALUES (?,?)', sorted(links))
            con.executemany('INSERT INTO hubs VALUES (?,0)', ((i,) for i in range(len(words))))
            con.executemany('INSERT INTO meta VALUES (?,?)', ((k, json.dumps(v)) for k, v in meta.items()))
            con.commit()
            if con.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Riferimenti non validi nello schema candidato')
        SchemaDb(destination, {}, 'ZEROCADE_ENSEMBLE_LEGACY').import_schema(path, 'context')
    with closing(readonly(destination)) as con:
        if con.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise ValueError('DB candidato non integro')


def build(args, *, encoder=sentence_vectors, access_check=model_access):
    if args.refresh_vocabulary and args.limit:
        raise ValueError('--refresh-vocabulary richiede il corpus completo: togliere --limit')
    config, weights = configuration(args.config)
    models = {n: config['models'][n] for n in MODEL_NAMES if n in weights}
    disabled_models = {n: model['id'] for n, model in config['models'].items() if n not in models}
    use_lsa = 'lsa' in weights
    steps = len(models) + 4 + int(use_lsa)
    words, secrets, old_meta, old_links, old_hubs, reviewed, pairs = load_game(args.game_db)
    if args.vectors is None:
        from publish_context import active_vectors
        args.vectors = active_vectors(old_meta, args.data_dir)
    if not 3 <= len(words) <= MAX_WORDS or any(not re.fullmatch('[a-zàèéìòù]{2,20}', w) for w in words):
        raise ValueError('Vocabolario fuori formato o dimensioni del gioco')
    baseline_words = words.copy()
    baseline_dtype = {'float32': np.float32, 'float16': np.float16}.get(old_meta.get('vector_format'), np.int8)
    expected_bytes = len(words) * int(old_meta['dim']) * np.dtype(baseline_dtype).itemsize
    if expected_bytes > MAX_BYTES or args.vectors.stat().st_size != expected_bytes:
        raise ValueError('I vettori pubblicati non corrispondono al vocabolario')
    baseline_q = np.fromfile(args.vectors, dtype=baseline_dtype).reshape(len(words), int(old_meta['dim']))
    input_identity = {'vocab': digest(words), 'secrets': digest(secrets), 'vectors_sha256': sha(args.vectors),
                      'verified_pairs': digest(pairs), 'links': digest(old_links),
                      'hubs': digest(old_hubs), 'meta': digest(old_meta), 'reviewed_senses': digest(reviewed)}
    selection = None
    probes = args.probe or config['probes']
    if args.limit:
        preferred = [w for w in probes + config['watch_words'] if w in set(words)]
        chosen = list(dict.fromkeys(preferred + words))[:args.limit]
        words = sorted(chosen)
        secrets = [w for w in secrets if w in set(words)]
    if len(words) < 3 or not secrets:
        raise ValueError('Il pilota richiede almeno tre parole e una segreta')
    if args.plan:
        return {'mode': 'plan', 'words': len(words), 'secrets': len(secrets), 'weights': weights,
                'order': [*(['accesso ai modelli attivi'] if models else []),
                          'fastText (cache o download)', 'ConceptNet Numberbatch (cache o download)',
                          *(['segrete e vocabolario dal DB lessicale, senza CSV'] if args.refresh_vocabulary else []),
                          'schede lessicali',
                          *(model['id'] for model in models.values()),
                          *(['LSA: TF-IDF e SVD delle definizioni'] if use_lsa else []),
                          'PCA, fusione e quantizzazione', 'confronto e DB candidato'],
                'models': models, 'disabled_models': disabled_models, 'raw_db': str(args.raw_db), 'cache': str(args.cache),
                'publication': 'automatic' if args.publish else 'candidate_only',
                'selection': 'inventory-db-1' if args.refresh_vocabulary else 'current_corpus',
                'counts': 'precedenti; ricalcolati dal DB durante la generazione' if args.refresh_vocabulary else 'current_corpus',
                'explicit_graph': str(args.assertions) if args.assertions else None}
    if not 1 <= args.batch_size <= 128:
        raise ValueError('Batch size fuori intervallo 1–128')
    args.cache.mkdir(parents=True, exist_ok=True)
    print(f'Controllo iniziale: accesso a {len(models)} modelli attivi; disabilitati: {list(disabled_models)}', flush=True)
    if models:
        access_check(models, args.cache)
    print(f'1/{steps} Cache fastText e ConceptNet Numberbatch', flush=True)
    ensure_vectors(args.cache)
    if args.refresh_vocabulary:
        from context_inventory import select_inventory
        words, secrets, selection = select_inventory(args.raw_db, args.cache, words, secrets,
                                                     frequency_limit=args.vocab)
        if not 3 <= len(words) <= MAX_WORDS:
            raise ValueError('Vocabolario selezionato oltre i limiti del gioco')
        print(f'Selezione DB: {len(words)} tentativi (+{selection["words_added"]}, -{selection["words_removed"]}), '
              f'{len(secrets)} segrete (+{selection["secrets_added"]}, -{selection["secrets_removed"]})', flush=True)
    sources = {}
    provenance = {}
    sources['fasttext'], provenance['fasttext'] = lexical_vectors(args.cache, 'fasttext_it', words)
    sources['conceptnet'], provenance['conceptnet'] = lexical_vectors(args.cache, 'numberbatch_it', words)
    if provenance['fasttext']['missing']:
        raise ValueError('Il vocabolario contiene parole senza fastText; acquisire una cache più ampia')
    print(f'2/{steps} Schede lessicali italiane', flush=True)
    cards, snapshots = profiles(words, reviewed, args.raw_db, args.overrides)
    texts = [c['text'] for c in cards]
    print('Copertura:', dict(Counter(c['origin'] for c in cards)), flush=True)
    for step, key in enumerate(models, 3):
        print(f'{step}/{steps} {models[key]["id"]}', flush=True)
        sources[key], provenance[key] = encoder(key, config['models'][key], texts, args.cache,
            batch_size=args.batch_size, sequence_length=config['max_sequence_length'], device=args.device)
    if use_lsa:
        from context_lsa import lsa_vectors
        morphit = args.cache / 'morphit_048.txt'
        if not morphit.exists():
            subprocess.run([sys.executable, '-B', str(HERE / 'script/fetch_morphit.py'), '--out', str(args.cache)], check=True)
        print(f'{3 + len(models)}/{steps} LSA sulle definizioni italiane', flush=True)
        sources['lsa'], provenance['lsa'] = lsa_vectors(cards, config['lsa'], morphit, args.cache)
    print(f'{steps-1}/{steps} Riduzione e fusione di {len(weights)} fonti attive', flush=True)
    dimensions = min(config['block_dimensions'], MAX_DIMENSIONS // len(weights), MAX_BYTES // len(words) // len(weights))
    blocks, transformations, retained = {}, {}, {}
    for name in weights:
        blocks[name], mean, axes, retained[name] = reduce_block(sources[name], dimensions)
        transformations[name] = (mean, axes)
    merged = combine(blocks, weights)
    q, scale = quantize(merged)
    links = verified_links(words, secrets, pairs)
    graph = {}
    if args.assertions:
        opener = gzip.open if args.assertions.suffix == '.gz' else open
        with opener(args.assertions, 'rt', encoding='utf-8') as stream:
            graph = read_assertions(stream, words, secrets)
        links.update(graph)
    validate_links(links)
    boost = int(round(config['link_boost'] * scale * scale))
    print(f'{steps}/{steps} Confronto dei ranking e corpus candidato', flush=True)
    report = {'kind': 'context_ensemble_candidate', 'version': config['version'],
              'created_at': datetime.now(timezone.utc).isoformat(), 'pilot': bool(args.limit),
              'words': len(words), 'secrets': len(secrets), 'dim': int(q.shape[1]),
              'weights': weights, 'disabled_models': disabled_models, 'sources': provenance, 'inputs': input_identity,
              'profiles': dict(Counter(c['origin'] for c in cards)), 'lexical_snapshots': snapshots,
              'pca_variance_retained': retained, 'profiles_sha256': digest(cards),
              'verified_links': len(verified_links(words, secrets, pairs)), 'conceptnet_graph_links': len(graph),
              'conceptnet_assertions_sha256': sha(args.assertions) if args.assertions else None,
              'quality_status': 'comparison_only_not_human_validated',
              'probes': comparison(words, probes, config['watch_words'], sources, blocks, weights, q, scale,
                                   links, boost, baseline_words, baseline_q, old_links, old_hubs,
                                   int(old_meta.get('link_boost', 0))),
              'config': config, 'script_hashes': {p.name: sha(p) for p in (
                  Path(__file__), HERE / 'script/context_ensemble.py', HERE / 'script/context_semantic_sources.py')}}
    if selection is not None:
        from context_inventory import inventory_identity
        if inventory_identity(args.raw_db, args.cache) != selection['inputs']:
            raise ValueError('Le fonti lessicali sono cambiate durante la generazione: ripetere')
        report['selection'] = selection
        for name in ('context_inventory.py', 'context_vocabulary.py', 'build_context_bank.py',
                     'evaluate_context_inventory.py'):
            report['script_hashes'][name] = sha(HERE / 'script' / name)
    for package in ('numpy', 'scipy', 'scikit-learn', 'torch', 'sentence-transformers', 'transformers', 'huggingface-hub'):
        try:
            report.setdefault('packages', {})[package] = version(package)
        except PackageNotFoundError:
            pass
    # Se nel frattempo cambia la sorgente, il risultato non è pubblicato nemmeno come candidato completo.
    now = load_game(args.game_db)
    if (digest(now[0]) != input_identity['vocab'] or digest(now[1]) != input_identity['secrets'] or
            digest(now[6]) != input_identity['verified_pairs'] or digest(now[2]) != input_identity['meta'] or
            digest(now[3]) != input_identity['links'] or digest(now[4]) != input_identity['hubs'] or
            digest(now[5]) != input_identity['reviewed_senses'] or
            sha(args.vectors) != input_identity['vectors_sha256']):
        raise ValueError('Gli ingressi sono cambiati durante la generazione: rilanciare il task')
    run = args.output or args.cache / 'ensemble' / 'runs' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    if run.exists():
        raise ValueError(f'La cartella di uscita esiste già: {run}')
    run.mkdir(parents=True)
    vocab_text = '\n'.join(words) + '\n'
    (run / 'vocab.txt').write_text(vocab_text, encoding='utf-8', newline='\n')
    (run / 'secrets.txt').write_text('\n'.join(secrets) + '\n', encoding='utf-8', newline='\n')
    (run / 'profiles.jsonl').write_text(''.join(json.dumps(c, ensure_ascii=False) + '\n' for c in cards), encoding='utf-8')
    (run / 'conceptnet_edges.jsonl').write_text(''.join(json.dumps({'indices': pair, 'evidence': evidence}, ensure_ascii=False) + '\n'
                                                        for pair, evidence in sorted(graph.items())), encoding='utf-8')
    q.tofile(run / 'vectors.bin')
    for name, (mean, axes) in transformations.items():
        np.savez(run / f'{name}_pca.npz', mean=mean, axes=axes)
    meta = {'words': len(words), 'dim': int(q.shape[1]), 'secrets': len(secrets), 'links': len(links),
            'link_boost': boost, 'hub_strength': 0, 'pipeline': config['version'], 'weights': weights}
    grouped = defaultdict(list)
    for a, b in sorted(links):
        grouped[str(a)].append(b)
    write_json(run / 'links.json', {'boost': boost, 'links': grouped, 'hubs': [0] * len(words)})
    write_json(run / 'meta.json', meta)
    candidate_database(args.game_db, run / 'giochi.sqlite3', words, secrets, meta, links)
    report['artifacts'] = {name: sha(run / name) for name in (
        'vocab.txt', 'secrets.txt', 'vectors.bin', 'links.json', 'meta.json', 'giochi.sqlite3',
        'profiles.jsonl', 'conceptnet_edges.jsonl', *(f'{n}_pca.npz' for n in weights))}
    report['output'] = str(run.resolve())
    # report.json è la ricevuta finale: senza questo file il candidato è incompleto.
    write_json(run / 'report.json', report)
    write_json(args.cache / 'ensemble' / 'latest.json', {'output': str(run.resolve()), 'report_sha256': sha(run / 'report.json')})
    return {'output': str(run.resolve()), 'words': len(words), 'secrets': len(secrets), 'dim': int(q.shape[1]),
            'report': str((run / 'report.json').resolve()), 'published_to_live': False}


def parser():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--config', type=Path, default=HERE / 'resources/contexts.json')
    ap.add_argument('--game-db', type=Path, default=ROOT / 'database/giochi.sqlite3')
    ap.add_argument('--raw-db', type=Path, default=ROOT / 'database/parole_ita_raw.sqlite3')
    ap.add_argument('--vectors', type=Path, help='Vettori di partenza; senza opzione legge il file indicato dal DB attivo')
    ap.add_argument('--data-dir', type=Path, default=HERE / 'data')
    ap.add_argument('--cache', type=Path, default=HERE / '.cache')
    ap.add_argument('--output', type=Path)
    ap.add_argument('--overrides', type=Path, help='JSONL: word, definition, reviewer, source')
    ap.add_argument('--assertions', type=Path, help='Dump ConceptNet TSV o TSV.gz: aggiunge relazioni dirette a Numberbatch')
    ap.add_argument('--device', choices=('cpu', 'cuda'))
    ap.add_argument('--batch-size', type=int, default=8)
    ap.add_argument('--probe', nargs='+')
    ap.add_argument('--limit', type=int, help='Pilota: massimo N parole, non un corpus da pubblicare')
    ap.add_argument('--refresh-vocabulary', action='store_true', help='Seleziona segrete e tentativi dal DB lessicale senza CSV')
    ap.add_argument('--vocab', type=int, default=60000, help='Base per frequenza dal DB, oltre a banca e attestazioni')
    ap.add_argument('--plan', action='store_true', help='Mostra il piano senza download né scritture')
    ap.add_argument('--check-models', action='store_true', help='Verifica accesso e config senza scaricare i pesi')
    ap.add_argument('--publish', action='store_true', help='Pubblica e attiva automaticamente il corpus completo verificato')
    ap.add_argument('--server-url', default='http://127.0.0.1:3001', help='Server locale da ricaricare dopo la pubblicazione')
    return ap


def main():
    args = parser().parse_args()
    if args.limit is not None and not 3 <= args.limit <= MAX_WORDS:
        raise SystemExit('--limit deve essere tra 3 e 200000')
    if args.limit and args.publish:
        raise SystemExit('Un pilota non può essere pubblicato: togliere --publish oppure --limit')
    if args.refresh_vocabulary and args.limit:
        raise SystemExit('--refresh-vocabulary richiede il corpus completo: togliere --limit')
    if args.vocab < 1:
        raise SystemExit('--vocab deve essere positivo')
    try:
        if args.check_models:
            config, weights = configuration(args.config)
            models = {n: model for n, model in config['models'].items() if n in weights}
            model_access(models, args.cache)
            result = {'models_accessible': [m['id'] for m in models.values()],
                      'disabled_models': [m['id'] for n, m in config['models'].items() if n not in models]}
        elif args.plan:
            result = build(args)
        else:
            from filelock import FileLock, Timeout
            lock = args.cache / 'ensemble' / 'build.lock'
            lock.parent.mkdir(parents=True, exist_ok=True)
            try:
                with FileLock(str(lock), timeout=0):
                    result = build(args)
                    if args.publish:
                        from publish_context import publish
                        result.update(publish(result['output'], args.game_db, args.data_dir, server_url=args.server_url))
            except Timeout as error:
                raise ValueError('Una generazione ensemble è già in corso in questa cache') from error
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, sqlite3.Error, ImportError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'Ensemble ZeroContext: {error}') from error


if __name__ == '__main__':
    main()
