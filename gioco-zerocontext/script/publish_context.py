"""Attiva un corpus completo: vettori immutabili, poi commit del solo schema context."""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile
import urllib.error
import urllib.request

from context_semantic_sources import digest, load_game, readonly, sha, write_json
from context_ensemble import MAX_BYTES, MAX_DIMENSIONS, MAX_WORDS

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'database' / 'script'))
from schemadb import SchemaDb  # noqa: E402


def active_vectors(meta, directory):
    name = meta.get('vectors_file', 'vectors.bin')
    if not isinstance(name, str) or not re.fullmatch(r'vectors(?:\.[a-f0-9]{64})?\.bin', name):
        raise ValueError('Nome del file vettori attivo non valido')
    return Path(directory) / name


def reload_server(base, revision, database):
    """Nessun server viene avviato o terminato; la prima versione del server richiede un riavvio."""
    if base is None:
        return {'state': 'on_next_start'}
    from urllib.parse import urlsplit
    parsed = urlsplit(base)
    if parsed.scheme != 'http' or parsed.hostname not in {'localhost', '127.0.0.1', '::1'} or parsed.username or parsed.password:
        raise ValueError('Il ricaricamento è consentito soltanto sul server locale')
    body = json.dumps({'revision': revision, 'database': str(Path(database).resolve())}).encode()
    request = urllib.request.Request(base.rstrip('/') + '/api/context/reload', data=body,
                                     headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
        return {'state': 'reloaded', **result}
    except urllib.error.HTTPError as error:
        return {'state': 'restart_required' if error.code == 404 else 'reload_failed', 'http_status': error.code}
    except (OSError, ValueError) as error:
        return {'state': 'on_next_start', 'reason': str(error)}


def publish(run, game_db, data_dir, *, server_url='http://127.0.0.1:3001', notifier=reload_server):
    from filelock import FileLock

    run, game_db, data_dir = Path(run).resolve(), Path(game_db).resolve(), Path(data_dir).resolve()
    report = json.loads((run / 'report.json').read_text(encoding='utf-8'))
    if report.get('pilot') is not False:
        raise ValueError('Un pilota non può sostituire il corpus del gioco')
    for name, expected in report['artifacts'].items():
        path = run / name
        if path.resolve().parent != run or sha(path) != expected:
            raise ValueError(f'Artefatto candidato non integro: {name}')
    candidate = run / 'giochi.sqlite3'
    if game_db == candidate:
        raise ValueError('Il database di destinazione deve essere distinto dalla copia candidata')
    words, secrets, meta, links, hubs, _, _ = load_game(candidate)
    if not 1 <= len(words) <= MAX_WORDS or not 1 <= meta['dim'] <= MAX_DIMENSIONS:
        raise ValueError('Dimensioni del candidato oltre i limiti del gioco')
    vector_format = meta.get('vector_format', 'int8')
    if vector_format not in {'int8', 'float32', 'float16'}:
        raise ValueError('Formato vettoriale non riconosciuto')
    vector_bytes = len(words) * meta['dim'] * (4 if vector_format == 'float32' else 2 if vector_format == 'float16' else 1)
    if vector_bytes > MAX_BYTES or (run / 'vectors.bin').stat().st_size != vector_bytes:
        raise ValueError('Vettori candidati non allineati al vocabolario')
    if vector_format in {'float32', 'float16'}:
        import numpy as np
        if meta['dim'] not in {256, 300}:
            raise ValueError('Dimensioni float32 fuori specifica')
        matrix = np.memmap(run / 'vectors.bin', dtype='<f4' if vector_format == 'float32' else '<f2', mode='r', shape=(len(words), meta['dim']))
        for offset in range(0, len(words), 4096):
            rows = matrix[offset:offset + 4096].astype(np.float32)
            if not np.isfinite(rows).all() or np.any(np.abs(np.linalg.norm(rows, axis=1) - 1) > (1e-3 if vector_format == 'float16' else 1e-4)):
                raise ValueError('Vettori non finiti o non normalizzati')
        del rows, matrix
    if meta.get('vector_pipeline') == 'context-vectors-1' or report.get('version') == 'context-vectors-1':
        from context_vector_pipeline import configuration, quality_words, validate_quality
        required = {'quality.json', 'quality_probes.npy', 'vector_config.json', 'embeddings_300d.npy', 'vocab_index.json'}
        if (meta.get('vector_pipeline') != report.get('version') or not required <= report['artifacts'].keys() or
                report.get('quality', {}).get('passed') is not True):
            raise ValueError('Collaudo vettoriale mancante o fallito: pubblicazione bloccata')
        config = configuration(run / 'vector_config.json')
        if config['storage'] != vector_format:
            raise ValueError('Formato vettoriale diverso dal profilo verificato')
        extra = sorted(set(quality_words(config)) - set(words))
        probes = np.load(run / 'quality_probes.npy', allow_pickle=False)
        actual = np.fromfile(run / 'vectors.bin', dtype='<f2' if vector_format == 'float16' else '<f4').reshape(len(words), meta['dim'])
        exported = np.load(run / 'embeddings_300d.npy', mmap_mode='r', allow_pickle=False)
        if exported.shape != actual.shape or exported.dtype != actual.dtype or not np.array_equal(exported, actual):
            raise ValueError('Matrice NPY diversa dal file binario runtime')
        if json.loads((run / 'vocab_index.json').read_text(encoding='utf-8')) != {w: i for i, w in enumerate(words)}:
            raise ValueError('Indice NPY diverso dal vocabolario del gioco')
        if probes.shape != (len(extra), meta['dim']):
            raise ValueError('Sonde di collaudo non allineate')
        checked = validate_quality(np.concatenate([actual, probes]).astype(np.float32), words + extra, config, len(words))
        if not checked['passed'] or checked != json.loads((run / 'quality.json').read_text(encoding='utf-8')):
            raise ValueError('La matrice pubblicabile non supera il collaudo di polarità, OOV e distribuzione')
    revision = digest({n: report['artifacts'][n] for n in ('vocab.txt', 'secrets.txt', 'vectors.bin', 'links.json')})
    data_dir.mkdir(parents=True, exist_ok=True)
    with FileLock(str(data_dir / 'publish.lock'), timeout=0):
        current = load_game(game_db)
        missing = set(current[1]) - set(secrets)
        if missing:
            raise ValueError(f'Pubblicazione bloccata: perderebbe {len(missing)} segrete già disponibili')
        if current[2].get('corpus_revision') == revision:
            receipt = data_dir / 'publication.json'
            previous = json.loads(receipt.read_text(encoding='utf-8')) if receipt.exists() else {}
            result = {**(previous if previous.get('revision') == revision else {}),
                      'published_to_live': True, 'already_active': True, 'revision': revision}
        else:
            if digest(current[0]) != report['inputs']['vocab'] or digest(current[1]) != report['inputs']['secrets']:
                raise ValueError('Vocabolario o segrete attivi cambiati dopo la generazione: rigenerare')
            selection = report.get('selection')
            if selection is not None:
                if (selection.get('mode') not in {'inventory-db-1', 'semantic-db-1'} or
                        digest(words) != selection.get('vocab_sha256') or
                        digest(secrets) != selection.get('secrets_sha256')):
                    raise ValueError('Il candidato non corrisponde alla selezione dal DB lessicale')
            elif digest(words) != report['inputs']['vocab'] or digest(secrets) != report['inputs']['secrets']:
                raise ValueError('Il candidato non conserva vocabolario e segrete della generazione completa')
            if sha(active_vectors(current[2], data_dir)) != report['inputs']['vectors_sha256']:
                raise ValueError('I vettori attivi sono cambiati dopo la generazione: rigenerare')
            for key, value in (('meta', current[2]), ('links', current[3]), ('hubs', current[4]),
                               ('reviewed_senses', current[5]), ('verified_pairs', current[6])):
                if key in report['inputs'] and digest(value) != report['inputs'][key]:
                    raise ValueError('I dati di partenza sono cambiati dopo la generazione: rigenerare')
            backup = data_dir.parent / '.cache' / 'backups' / datetime.now(timezone.utc).strftime('publish-%Y%m%dT%H%M%S%fZ')
            backup.mkdir(parents=True)
            with closing(readonly(game_db)) as source, closing(sqlite3.connect(backup / 'giochi.sqlite3')) as target:
                source.backup(target)
            old_vector = active_vectors(current[2], data_dir)
            shutil.copy2(old_vector, backup / old_vector.name)
            for name in ('vocab.txt', 'secrets.txt', 'links.json', 'meta.json'):
                if (data_dir / name).exists():
                    shutil.copy2(data_dir / name, backup / name)
            name = f"vectors.{report['artifacts']['vectors.bin']}.bin"
            target_vector = data_dir / name
            if target_vector.exists():
                if sha(target_vector) != report['artifacts']['vectors.bin']:
                    raise ValueError('Un file vettori con la stessa impronta è corrotto')
            else:
                temporary = data_dir / (name + '.part')
                shutil.copyfile(run / 'vectors.bin', temporary)
                if sha(temporary) != report['artifacts']['vectors.bin']:
                    raise ValueError('Copia dei vettori non riuscita')
                temporary.replace(target_vector)
            # Il file immutabile esiste PRIMA del commit: vecchi e nuovi lettori non mescolano generazioni.
            new_meta = {**meta, 'vectors_file': name, 'vectors_sha256': report['artifacts']['vectors.bin'],
                        'corpus_revision': revision}
            with tempfile.TemporaryDirectory(prefix='context-publish-') as tmp:
                schema = Path(tmp) / 'context.sqlite3'
                SchemaDb(candidate, {}, 'UNUSED_CONTEXT_LEGACY').export_schema('context', schema)
                with closing(sqlite3.connect(schema)) as con:
                    con.executemany('INSERT OR REPLACE INTO meta VALUES (?,?)',
                                    ((k, json.dumps(v)) for k, v in new_meta.items()))
                    con.commit()
                    if con.execute('PRAGMA foreign_key_check').fetchall():
                        raise ValueError('Riferimenti non validi nel candidato')
                SchemaDb(game_db, {}, 'UNUSED_CONTEXT_LEGACY').import_schema(schema, 'context')
            # Sono esportazioni di consultazione; il runtime legge lo schema e il file immutabile puntato da esso.
            warnings = []
            try:
                for name in ('vocab.txt', 'secrets.txt', 'links.json'):
                    temporary = data_dir / (name + '.part')
                    shutil.copyfile(run / name, temporary)
                    temporary.replace(data_dir / name)
                write_json(data_dir / 'meta.json', new_meta)
            except OSError as error:
                warnings.append(f'Corpus attivo nel DB; esportazioni testuali non aggiornate: {error}')
            result = {'published_to_live': True, 'revision': revision, 'backup': str(backup),
                      'words': len(words), 'secrets': len(secrets), 'dim': meta['dim'],
                      'vectors_file': str(target_vector), 'warnings': warnings}
        result['server'] = notifier(server_url, revision, game_db)
        write_json(run / 'publication.json', result)
        write_json(data_dir / 'publication.json', result)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('run', type=Path)
    ap.add_argument('--game-db', type=Path, default=ROOT / 'database/giochi.sqlite3')
    ap.add_argument('--data-dir', type=Path, default=HERE / 'data')
    ap.add_argument('--server-url', default='http://127.0.0.1:3001')
    args = ap.parse_args()
    try:
        print(json.dumps(publish(args.run, args.game_db, args.data_dir, server_url=args.server_url), indent=2))
    except (ValueError, OSError, sqlite3.Error) as error:
        raise SystemExit(f'Pubblicazione ZeroContext: {error}') from error


if __name__ == '__main__':
    main()
