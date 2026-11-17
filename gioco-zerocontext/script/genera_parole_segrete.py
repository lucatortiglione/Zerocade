"""Genera le parole segrete di ZeroContext dal RAW 2.0, secondo ARCHITETTURA_SEMANTICA_CONTEXT.md.

Parte da `normalizzata` (parole singole, senza doppioni di genere e numero e senza forme verbali diverse
dall'infinito), le limita alla guess list del gioco e misura densità e ponti semantici nei vettori che il gioco
usa davvero. Non rigenera i vettori e non pubblica niente in giochi.sqlite3: scrive la tabella `parole_segrete`
nel RAW 2.0 e un rapporto JSON. Le segrete già in uso non si perdono mai: quelle che non superano i nuovi filtri
restano, marcate `deroga`.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import datetime, timezone
from functools import lru_cache
from importlib.metadata import version
import json
from pathlib import Path
import re
import sqlite3
import sys

import numpy as np
from filelock import FileLock
from wordfreq import zipf_frequency

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE / 'script'))
sys.path.insert(0, str(ROOT / 'gioco-zeroassociations/script'))

from context_semantic_policy import aggregate_zipf, neighbourhoods, nvdb_classes, ordinary_lexical, special_lexical
from context_semantic_sources import digest, sha, write_json

PROFILES = ('original', 'abtt')
# Soglie del §7 della specifica (tabella definitiva).
ORDINARY = {'density': .45, 'bridges_zipf': 4.0, 'bridges': 10}
SPECIAL = {'density': .48, 'bridges_zipf': 3.8, 'bridges': 15}
WORD = re.compile('[a-zàèéìòù]{2,20}')
VERB_TAGS = ('VER:', 'AUX:', 'MOD:', 'CAU:')

TABLE = '''CREATE TABLE parole_segrete(
 parola TEXT PRIMARY KEY,
 ordinaria INTEGER NOT NULL CHECK(ordinaria IN (0,1)),
 speciale INTEGER NOT NULL CHECK(speciale IN (0,1)),
 legacy INTEGER NOT NULL CHECK(legacy IN (0,1)),
 deroga INTEGER NOT NULL CHECK(deroga IN (0,1)),
 zipf REAL NOT NULL, zipf_superficie REAL NOT NULL,
 nvdb TEXT CHECK(nvdb IN ('FO','AU','AD')), dominio TEXT,
 densita REAL NOT NULL, ponti_4 INTEGER NOT NULL, ponti_38 INTEGER NOT NULL,
 metodo_frequenza TEXT NOT NULL CHECK(metodo_frequenza IN ('forme_attestate','superficie')),
 in_normalizzata INTEGER NOT NULL CHECK(in_normalizzata IN (0,1))
) STRICT, WITHOUT ROWID'''


class PreconditionError(ValueError):
    pass


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def preconditions(meta):
    """Il RAW 2.0 deve essere stato pulito e normalizzato con le regole correnti: altrimenti le forme coniugate
    con Zipf 2,00-2,40 diventerebbero segrete. Restituisce i problemi, con il task da eseguire."""
    from raw_word_cleaning import VERSION as CLEANING
    from normalizza_parole_raw_v2 import POLICY
    problems = []
    if meta.get('word_cleanup_version') != CLEANING:
        problems.append(f'pulizia delle parole {meta.get("word_cleanup_version")!r} invece di {CLEANING!r}: '
                        'eseguire "ZeroCade : Aggiornamento parole RAW"')
    report = json.loads(meta.get('normalizzazione_report') or '{}')
    if meta.get('normalizzazione_stato') != 'aggiornata' or report.get('policy') != POLICY:
        problems.append(f'normalizzazione {meta.get("normalizzazione_stato")!r} con regola {report.get("policy")!r} '
                        f'invece di {POLICY!r} aggiornata: eseguire "ZeroCade : Normalizzare parole RAW"')
    return problems


def game_profile(game_db, profile, data_dir):
    """Guess list, segrete attuali e matrice L2 del profilo vettoriale scelto, in sola lettura."""
    schema = f'context_{profile}'
    with closing(readonly(game_db)) as con:
        meta = {k: json.loads(v) for k, v in con.execute(f'SELECT name,value FROM "{schema}__meta"')}
        words = [w for _, w in con.execute(f'SELECT idx,word FROM "{schema}__vocab" ORDER BY idx')]
        secrets = [w for w, in con.execute(f'SELECT word FROM "{schema}__secrets" ORDER BY word')]
    path = Path(data_dir) / meta['vectors_file']
    dim = int(meta['dim'])
    if not path.is_file() or path.stat().st_size != len(words) * dim * 4:
        raise ValueError(f'File dei vettori assente o di dimensione errata: {path}')
    if sha(path) != meta['vectors_sha256']:
        raise ValueError(f'File dei vettori diverso da quello registrato: {path.name}')
    matrix = np.fromfile(path, dtype='<f4').reshape(len(words), dim)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if not np.isfinite(matrix).all() or np.any(norms < 1e-12):
        raise ValueError('Vettori nulli o non finiti')
    return words, secrets, np.ascontiguousarray(matrix / norms, dtype=np.float32), meta


def morphology(con):
    """Lemmi e forme verbali attestate da Morph-it, dallo snapshot attivo del RAW 2.0."""
    from collect_prompt_sources import checksum
    from normalizza_parole_raw_v2 import morphology_sources
    from prompt_inventory import records
    from raw_word_cleaning import clean_word
    sources = [s for s in morphology_sources(con) if s['source'] == 'morphit-048-mirror']
    if not sources:
        raise ValueError('Snapshot Morph-it assente dal RAW 2.0: eseguire "ZeroCade : Aggiornamento parole RAW"')
    source = sources[0]
    path = Path(source['path'])
    if not path.is_file():
        alternate = con.execute('SELECT cache_path FROM inventory_http_cache WHERE source_key=? AND sha256=? ORDER BY checked_at DESC',
                                (source['source'], source['sha256'])).fetchall()
        path = next((Path(p) for p, in alternate if Path(p).is_file()), path)
    if not path.is_file() or checksum(path) != source['sha256']:
        raise ValueError('Cache di Morph-it assente o modificata: ripetere "ZeroCade : Aggiornamento parole RAW"')
    parts, forms = defaultdict(set), defaultdict(set)
    for row in records(path, source['config']):
        form, lemma, tag = clean_word(row['prompt']), clean_word(row['lemma']), row['pos']
        if not form or not lemma or not WORD.fullmatch(form) or not WORD.fullmatch(lemma):
            continue
        if tag.startswith(VERB_TAGS):
            parts[lemma].add('verb')
            forms[lemma].add(form)
        elif tag.startswith('NOUN'):
            parts[lemma].add('noun')
        elif tag.startswith('ADJ'):
            parts[lemma].add('adjective')
    return dict(parts), dict(forms), {'snapshot': source['snapshot'], 'sha256': source['sha256']}


def select_pools(words, matrix, secrets, normalized, parts, forms, tiers, domains, blocked, frequency):
    """Ordinario e speciale secondo il §7; le segrete attuali restano in ogni caso. Pura: nessun I/O."""
    index = {w: i for i, w in enumerate(words)}
    legacy = set(secrets) & set(index)
    effective = {w: aggregate_zipf(fs | {w}, frequency) for w, fs in forms.items()}

    def zipf(w):
        return effective.get(w, frequency(w))

    def ordinary_ok(w):
        # Verbi: frequenza aggregata delle forme attestate, ammessa da 2,00 in su (§3.3 e §7), come nella prima
        # implementazione. Il codice di esempio del §6 la limiterebbe a 2,40: il testo prevale. Le FO restano escluse.
        return ordinary_lexical(zipf(w), tiers.get(w), 'noun' in parts.get(w, ()), 'verb' in parts.get(w, ()))

    def special_ok(w):
        return special_lexical(w, zipf(w), tiers.get(w), domains.get(w))

    lexical = set(parts) | set(domains)
    # Nuovi target: lemmi morfologici o dei domini accreditati, nella guess list, presenti in normalizzata.
    candidates = {w for w in lexical if w in index and w in normalized and w not in blocked and (ordinary_ok(w) or special_ok(w))}
    measured = sorted((candidates | legacy), key=index.get)
    surface = np.asarray([frequency(w) for w in words], dtype=np.float32)
    rows, rejected = [], Counter()
    for i, density, bridges4, bridges38 in neighbourhoods(matrix, [index[w] for w in measured], surface):
        w = words[i]
        standard = w in candidates and ordinary_ok(w) and density >= ORDINARY['density'] and bridges4 >= ORDINARY['bridges']
        survival = w in candidates and special_ok(w) and density >= SPECIAL['density'] and bridges38 >= SPECIAL['bridges']
        if w in candidates and not (standard or survival):
            rejected['densità o ponti insufficienti'] += 1
        keep = w in legacy and not standard and not survival
        if standard or survival or w in legacy:
            rows.append((w, int(standard), int(survival), int(w in legacy), int(keep), round(zipf(w), 3), round(frequency(w), 3),
                         tiers.get(w), domains.get(w), round(density, 4), bridges4, bridges38,
                         'forme_attestate' if w in forms else 'superficie', int(w in normalized)))
    return rows, {'candidates': len(candidates), 'legacy': len(legacy), 'rejected': dict(rejected)}


def write_table(db, rows, report, backup_root, stamp):
    backup = Path(backup_root) / f'parole_raw_2.0-segrete-{stamp}.sqlite3'
    backup.parent.mkdir(parents=True, exist_ok=True)
    print('Backup consistente:', backup, flush=True)
    with closing(readonly(db)) as original, closing(sqlite3.connect(backup)) as target:
        original.backup(target)
        if target.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise ValueError('Backup RAW non integro')
    report['backup'] = str(backup)
    with closing(sqlite3.connect(Path(db).resolve().as_uri() + '?mode=rw', uri=True, timeout=30, isolation_level=None)) as con:
        con.execute('BEGIN IMMEDIATE')
        try:
            con.execute('DROP TABLE IF EXISTS parole_segrete')
            con.execute(TABLE)
            con.executemany('INSERT INTO parole_segrete VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', rows)
            con.execute("INSERT OR REPLACE INTO meta VALUES ('parole_segrete_stato','aggiornata')")
            con.execute("INSERT OR REPLACE INTO meta VALUES ('parole_segrete_report',?)", (json.dumps(report, ensure_ascii=False),))
            if con.execute('SELECT count(*) FROM parole_segrete').fetchone()[0] != len(rows):
                raise ValueError('Conteggio delle segrete non valido')
            con.execute('COMMIT')
        except BaseException:
            con.execute('ROLLBACK')
            raise


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', type=Path, default=ROOT / 'database/parole_ita_raw_2.0.sqlite3')
    ap.add_argument('--game-db', type=Path, default=ROOT / 'database/giochi.sqlite3')
    ap.add_argument('--profile', choices=PROFILES, default='original', help='Spazio vettoriale in cui si misurano densità e ponti')
    ap.add_argument('--data-dir', type=Path, default=HERE / 'data')
    ap.add_argument('--cache', type=Path, default=HERE / '.cache')
    ap.add_argument('--reviews-db', type=Path, default=ROOT / 'database/parole_ita_raw.sqlite3',
                    help='DB con i pareri sulle candidate (sola lettura, facoltativo)')
    ap.add_argument('--report', type=Path, default=HERE / 'reports/parole_segrete_2.0.json')
    ap.add_argument('--backup-root', type=Path, default=ROOT / 'gioco-zeroassociations/database-backups')
    ap.add_argument('--plan', action='store_true', help='Calcola tutto senza scrivere nel DB')
    ap.add_argument('--ignore-preconditions', action='store_true', help='Solo con --plan: prova la pipeline su un RAW non aggiornato')
    args = ap.parse_args(argv)
    if args.ignore_preconditions and not args.plan:
        ap.error('--ignore-preconditions è ammesso solo con --plan')
    database = args.db.resolve()
    if not database.is_file():
        raise FileNotFoundError('Eseguire prima "ZeroCade : Aggiornamento parole RAW" per creare il DB 2.0')
    lock = FileLock(str(database) + '.raw-update.lock', timeout=0)
    with lock:
        with closing(readonly(database)) as con:
            meta = dict(con.execute('SELECT name,value FROM meta'))
            problems = preconditions(meta)
            if problems and not args.ignore_preconditions:
                raise PreconditionError('Il RAW 2.0 non è pronto:\n - ' + '\n - '.join(problems))
            if problems:
                print('ATTENZIONE, RAW non aggiornato (solo prova):', *problems, sep='\n - ', flush=True)
            normalized = {w for w, in con.execute('SELECT parola FROM normalizzata WHERE is_single_word=1')}
            parts, forms, morphit = morphology(con)
        words, secrets, matrix, vector_meta = game_profile(args.game_db, args.profile, args.data_dir)
        print(f'Normalizzata: {len(normalized):,} parole singole; guess list {len(words):,}; segrete attuali {len(secrets):,}; '
              f'profilo {args.profile} ({matrix.shape[1]} dimensioni).', flush=True)
        tiers, nvdb = nvdb_classes(args.cache)
        domains_config = json.loads((HERE / 'resources/semantic-domains.json').read_text(encoding='utf-8'))
        domains = {w: d for d, ws in domains_config['domains'].items() for w in ws.split()}
        excluded = {w for line in (HERE / 'context_bank_exclusions.txt').read_text(encoding='utf-8').splitlines() for w in line.split('#')[0].split()}
        reviews = {}
        if args.reviews_db.is_file():
            from context_inventory import candidate_reviews
            with closing(readonly(args.reviews_db)) as raw:
                reviews = candidate_reviews(raw)
        blocked = excluded | {w for w, r in reviews.items() if r['verdict'] != 'CONSIGLIATA'}
        frequency = lru_cache(maxsize=None)(lambda w: zipf_frequency(w, 'it'))
        rows, stats = select_pools(words, matrix, secrets, normalized, parts, forms, tiers, domains, blocked, frequency)
        ordinary = [r for r in rows if r[1]]
        special = [r for r in rows if r[2]]
        kept = [r for r in rows if r[4]]
        added = [r for r in rows if (r[1] or r[2]) and not r[3]]
        lost = (set(secrets) & set(words)) - {r[0] for r in rows}
        if lost:
            raise ValueError(f'La generazione perderebbe {len(lost)} segrete esistenti')
        report = {'task': 'ZeroCade : Generazione parole segrete', 'completed_at_utc': datetime.now(timezone.utc).isoformat(),
                  'database': str(database), 'profile': args.profile, 'dimensions': int(matrix.shape[1]),
                  # Impronta delle parole da cui deriva normalizzata: "ZeroContext : Generazione segrete" la ricontrolla.
                  'normalization_source_sha256': json.loads(meta.get('normalizzazione_report') or '{}').get('source_words_sha256'),
                  'vectors_sha256': vector_meta['vectors_sha256'], 'guess_list': len(words), 'normalized_single_words': len(normalized),
                  'thresholds': {'ordinary': ORDINARY, 'special': SPECIAL}, 'candidates': stats['candidates'],
                  'ordinary_pool': len(ordinary), 'special_pool': len(special), 'current_secrets': len(secrets),
                  'current_conforming': sum(1 for r in rows if r[3] and (r[1] or r[2])), 'current_kept_with_exception': len(kept),
                  'added': len(added), 'secrets_total': len(rows), 'rejected': stats['rejected'],
                  'special_words': sorted(r[0] for r in special)[:200],
                  'added_examples': [r[0] for r in sorted(added, key=lambda r: -r[9])[:40]],
                  'sources': {'nvdb': nvdb, 'morphit': morphit, 'exclusions_sha256': digest(sorted(excluded)),
                              'reviews': len(reviews)},
                  'packages': {n: version(n) for n in ('numpy', 'wordfreq')},
                  'script_sha256': sha(Path(__file__)), 'published': False, 'plan_only': args.plan,
                  'note': 'Specifica: ARCHITETTURA_SEMANTICA_CONTEXT.md. Non pubblica in giochi.sqlite3 e non attiva i round speciali.'}
        if not args.plan:
            write_table(database, rows, report, args.backup_root, datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        write_json(args.report, report)
    print(json.dumps({k: report[k] for k in ('profile', 'candidates', 'ordinary_pool', 'special_pool', 'current_secrets',
                                              'current_kept_with_exception', 'added', 'secrets_total', 'plan_only')}, ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
