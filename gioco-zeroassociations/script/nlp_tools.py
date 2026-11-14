"""Lookup lessicale, analisi contestuali e confronto riproducibile dei motori NLP."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from time import perf_counter

from italian_nlp import ItalianAnalyzer, STANZA_MODEL, digest
from prompt_database import DEFAULT_DB, ROOT
from prompt_inventory import normalize, SINGLE_WORD
from sqlite_prompt_runtime import SQLite, literal, window_flags


def initialize_nlp(db):
    db.path.parent.mkdir(parents=True, exist_ok=True)
    db.run((ROOT / 'nlp_analysis_schema.sql').read_text(encoding='utf-8'))
    if db.schema:
        import unified_db
        unified_db.register_objects(db.schema)


def store_analysis(db, analysis):
    """Cache idempotente delle previsioni; nessuna modifica alle prove lessicali."""
    if analysis.get('evidence_kind') != 'model_prediction':
        raise ValueError('Sono ammesse soltanto previsioni NLP')
    model_id = digest(analysis['model'])
    if model_id != analysis['model_id']:
        raise ValueError('Identità del modello incoerente')
    identifier = digest([model_id, analysis['text'], analysis['scope']])
    db.run('BEGIN IMMEDIATE;\n'
           'INSERT OR IGNORE INTO nlp_models VALUES (' + literal(model_id) + ',' +
           literal(json.dumps(analysis['model'], ensure_ascii=False)) + ');\n'
           'INSERT OR IGNORE INTO nlp_analyses VALUES (' + ','.join(literal(v) for v in [
               identifier, model_id, analysis['text'], analysis['scope'],
               json.dumps(analysis['tokens'], ensure_ascii=False), datetime.now(timezone.utc).isoformat()]) +
           ');\nCOMMIT;')
    return identifier


def lookup_analyses(db, word):
    form = normalize(word)
    if not form or not SINGLE_WORD.fullmatch(form):
        raise ValueError('Il lookup richiede una singola parola italiana')
    rows = db.run('SELECT a.lemma,a.pos,a.role,a.source_form,a.locator,a.snapshot_id,'
                  's.source_key,s.kind,a.details_json '
                  'FROM inventory_current_attestations a '
                  'JOIN inventory_snapshots v ON v.id=a.snapshot_id '
                  'JOIN inventory_sources s ON s.source_key=v.source_key '
                  'WHERE a.prompt=' + literal(form) +
                  " AND a.role IN ('lemma','inflected_form','proper_name') ORDER BY a.lemma,a.pos,s.source_key,a.locator;",
                  rows=True)
    groups = {}
    for row in rows:
        details = json.loads(row.pop('details_json'))
        if details.get('language_claim') not in {
                'it_from_dictionary', 'it_from_lexicon', 'it_from_morphology',
                'it_treebank_token_not_isolated_language_proof', 'it_from_norms'}:
            continue
        lemma = row['lemma'] or (form if row['role'] in {'lemma', 'proper_name'} else '')
        if not lemma:
            continue
        key = (lemma, row['pos'], row['kind'])
        group = groups.setdefault(key, {'lemma': lemma, 'pos': row['pos'],
                                        'source_kind': row['kind'], 'attestations': []})
        group['attestations'].append({**row, 'details': details})
    return {'form': form, 'evidence_kind': 'lexical_attestation',
            'analyses': list(groups.values()), 'multiple_analyses': len(groups) > 1,
            'selected_lemma': None, 'context_used': False}


def load_gold(path):
    rows = []
    ids = set()
    with Path(path).open(encoding='utf-8-sig') as stream:
        for number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row.get('id'), str) or not row['id'] or row['id'] in ids:
                raise ValueError(f'ID assente o duplicato alla riga {number}')
            ids.add(row['id'])
            text, targets = row.get('text'), row.get('targets')
            if not isinstance(text, str) or not text.strip() or not isinstance(targets, list) or not targets:
                raise ValueError(f'Testo o target assenti alla riga {number}')
            spans = set()
            for target in targets:
                start, end = target.get('start'), target.get('end')
                if (type(start) is not int or type(end) is not int or not 0 <= start < end <= len(text)
                        or (start, end) in spans or not isinstance(target.get('lemma'), str) or not target['lemma']
                        or target.get('surface') != text[start:end]
                        or ('upos' in target and (not isinstance(target['upos'], str) or not target['upos']))
                        or ('morph' in target and not isinstance(target['morph'], dict))):
                    raise ValueError(f'Target non valido alla riga {number}')
                spans.add((start, end))
            rows.append(row)
    if not rows:
        raise ValueError('Campione di valutazione vuoto')
    return rows


def score_predictions(gold, predictions):
    """Stessi target per ogni motore: token mancanti o espansi contano come errori."""
    totals = {'lemma': 0, 'upos': 0, 'morph': 0}
    correct = dict.fromkeys(totals, 0)
    aligned = total = 0
    errors = []
    if len(gold) != len(predictions):
        raise ValueError('Numero di documenti diverso dal campione')
    capabilities = set(predictions[0]['model']['capabilities']) if predictions else set()
    for example, prediction in zip(gold, predictions):
        if example['text'] != prediction['text']:
            raise ValueError('Il testo analizzato non corrisponde al campione')
        for target in example['targets']:
            total += 1
            matching = [token for token in prediction['tokens']
                        if (token['start'], token['end']) == (target['start'], target['end'])
                        and not token['expanded_multiword']]
            token = matching[0] if len(matching) == 1 else None
            aligned += token is not None
            failed = []
            for field in totals:
                if field not in target:
                    continue
                totals[field] += 1
                if field not in capabilities:
                    continue
                actual = token.get(field) if token else None
                # Morfologia: si valutano soltanto i tratti annotati nel gold.
                matches = (actual is not None and all(actual.get(k) == v for k, v in target[field].items())
                           if field == 'morph' else actual == target[field])
                correct[field] += bool(matches)
                if not matches:
                    failed.append(field)
            if failed:
                errors.append({'id': example['id'], 'surface': example['text'][target['start']:target['end']],
                               'expected': target, 'predicted': token, 'failed': failed})
    return {'targets': total, 'aligned_targets': aligned,
            'metrics': {key: {'supported': key in capabilities, 'correct': correct[key], 'total': totals[key],
                             'accuracy': correct[key] / totals[key] if totals[key] and key in capabilities else None}
                        for key in totals}, 'errors': errors}


def peak_memory_bytes():
    """Picco del processo, incluse librerie native; ogni motore gira in un processo distinto."""
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes

        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize',
                'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
                'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi = ctypes.WinDLL('psapi', use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        return counters.PeakWorkingSetSize
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak if sys.platform == 'darwin' else peak * 1024


def benchmark_worker(args):
    gold = load_gold(args.gold)
    start = perf_counter()
    analyzer = ItalianAnalyzer(args.engine, args.model, args.model_dir)
    load_seconds = perf_counter() - start
    analyzer.analyze(gold[0]['text'])  # riscaldamento separato dal tempo di inferenza
    start = perf_counter()
    predictions = [analyzer.analyze(row['text']) for row in gold]
    elapsed = perf_counter() - start
    return {'engine': args.engine, 'model': analyzer.metadata, 'model_id': analyzer.model_id,
            'load_seconds': load_seconds, 'analysis_seconds': elapsed,
            'documents_per_second': len(gold) / elapsed,
            'peak_process_memory_bytes': peak_memory_bytes(),
            **score_predictions(gold, predictions)}


def benchmark(args):
    gold = load_gold(args.gold)
    results = []
    for engine in args.engines:
        command = [sys.executable, '-B', str(Path(__file__).resolve()), '_benchmark',
                   '--engine', engine, '--gold', str(args.gold.resolve())]
        model = args.spacy_model if engine == 'spacy' else args.stanza_model if engine == 'stanza' else None
        if model:
            command += ['--model', model]
        if args.model_dir and engine == 'stanza':
            command += ['--model-dir', str(args.model_dir)]
        result = subprocess.run(command, capture_output=True, encoding='utf-8',
                                creationflags=window_flags())
        if result.returncode:
            results.append({'engine': engine, 'status': 'FAILED', 'error': result.stderr.strip()})
        else:
            results.append({'status': 'OK', **json.loads(result.stdout)})
    return {'gold_sha256': digest(gold), 'documents': len(gold), 'results': results,
            'protocol': 'same_character_spans_isolated_processes_v1',
            'created_at': datetime.now(timezone.utc).isoformat()}


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Un risultato viene pubblicato solo dopo averlo scritto integralmente.
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.part',
                                     dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        except BaseException:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='command', required=True)
    lookup = sub.add_parser('lookup')
    lookup.add_argument('word')
    lookup.add_argument('--db', type=Path, default=DEFAULT_DB)
    analyze = sub.add_parser('analyze')
    analyze.add_argument('--text', required=True)
    analyze.add_argument('--scope', choices=['contextual', 'isolated'], default='contextual')
    analyze.add_argument('--save', action='store_true', help='Salva le previsioni nel DB')
    analyze.add_argument('--db', type=Path, default=DEFAULT_DB)
    for parser in (analyze, sub.add_parser('_benchmark')):
        parser.add_argument('--engine', choices=['spacy', 'stanza', 'simplemma'], default='spacy')
        parser.add_argument('--model')
        parser.add_argument('--model-dir', type=Path)
    sub.choices['_benchmark'].add_argument('--gold', type=Path, required=True)
    bench = sub.add_parser('benchmark')
    bench.add_argument('--gold', type=Path, default=ROOT / 'resources/nlp_gold_it.jsonl')
    bench.add_argument('--engines', nargs='+', choices=['spacy', 'stanza', 'simplemma'],
                       default=['spacy', 'stanza', 'simplemma'])
    bench.add_argument('--spacy-model', default='it_core_news_md')
    bench.add_argument('--stanza-model', default=STANZA_MODEL)
    bench.add_argument('--model-dir', type=Path)
    bench.add_argument('--output', type=Path, required=True)
    download = sub.add_parser('download-stanza')
    download.add_argument('--model', default=STANZA_MODEL)
    download.add_argument('--model-dir', type=Path)
    args = ap.parse_args(argv)
    if args.command == 'lookup':
        result = lookup_analyses(SQLite(args.db), args.word)
    elif args.command == 'analyze':
        result = ItalianAnalyzer(args.engine, args.model, args.model_dir).analyze(args.text, scope=args.scope)
        if args.save:
            db = SQLite(args.db)
            initialize_nlp(db)
            result['analysis_id'] = store_analysis(db, result)
    elif args.command == 'download-stanza':
        import stanza
        options = {'model_dir': str(args.model_dir)} if args.model_dir else {}
        stanza.download('it', package=args.model, processors='tokenize,mwt,pos,lemma', **options)
        result = {'downloaded': 'stanza', 'model': args.model}
    elif args.command == '_benchmark':
        result = benchmark_worker(args)
    else:
        result = benchmark(args)
        write_json(args.output, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if args.command == 'benchmark' and any(r['status'] != 'OK' for r in result['results']) else 0


if __name__ == '__main__':
    raise SystemExit(main())
