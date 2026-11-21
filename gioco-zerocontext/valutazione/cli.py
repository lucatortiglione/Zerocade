"""Comandi della valutazione: campione, valuta, ricalcola, parita (spec, sezioni 6-9).

Uscite: 0 riuscita, 2 il riferimento (raw 2.0 o le associazioni) è cambiato durante la valutazione, 3 dati mancanti.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import csv
import json
from pathlib import Path
import random
import sqlite3
import sys
from typing import Callable

import numpy as np

from valutazione import paths, ranking, split
from valutazione.gold import Gold, fingerprint as gold_fingerprint, load_gold
from valutazione.judge import Judge, QwenBackend, controls, judge_version, live_guard
from valutazione.metrics import bootstrap, grade_slots, human_share, ndcg20, precision_judged, precision_verified, sense_share
from valutazione.profiles import Profile, SCHEMAS, load_candidate, load_published
from valutazione.reference import Reference, ReferenceChanged, load_reference
from valutazione.store import MetricRow, SampleRow, SecretMetricRow, Store

OK, CHANGED, MISSING = 0, 2, 3
DEFAULT_SEED = 20261119
SAMPLE_BLOCKS = {1: (25, 25), 'next': (13, 12)}   # (con associazioni verificate, senza) per blocco
# Misure per segreta calcolate con i vettori, salvate durante `valuta` perché `ricalcola` non li ha.
DIAGNOSTICS = ('posizione_mediana_verificate', 'verificate_entro_10', 'verificate_entro_100', 'verificate_entro_1000')
GROUPS = 'gruppi_nel_vocabolario'


class MissingData(Exception):
    pass


def say(message: str) -> None:
    print(message, flush=True)


# --- ingressi ---

def load_inputs(args) -> tuple[Reference, Gold]:
    try:
        return load_reference(Path(args.raw2), Path(args.morphit)), load_gold(Path(args.giochi))
    except (FileNotFoundError, sqlite3.OperationalError, ValueError) as error:
        raise MissingData(str(error)) from error


def load_profile(args) -> tuple[Profile, str]:
    """Il profilo scelto e da dove viene (si salva nel database dei risultati)."""
    try:
        if args.profilo:
            profile = load_published(args.profilo, giochi=Path(args.giochi), vectors_dir=Path(args.vettori_dir),
                                     pipeline_b=Path(args.pipeline_b), riordino=Path(args.export_riordino))
            return profile, f'giochi.sqlite3#{SCHEMAS[args.profilo]}'
        return load_candidate(args.candidato, Path(args.vettori), Path(args.vocab), args.dim), f'candidato:{Path(args.vettori).name}'
    except (FileNotFoundError, sqlite3.OperationalError, ValueError) as error:
        raise MissingData(str(error)) from error


# --- campione ---

def cmd_campione(args, backend, live_guard_fn) -> int:
    ref, gold = load_inputs(args)
    with closing(Store(Path(args.risultati))) as store:
        existing = store.sample()
        block = max((r.block for r in existing), default=0) + 1
        if existing and not args.blocco:
            say(f'Campione già creato: {len(existing)} segrete in {block - 1} blocchi. Per aggiungerne altre: campione --blocco.')
            return OK
        n_gold, n_plain = SAMPLE_BLOCKS[1] if block == 1 else SAMPLE_BLOCKS['next']
        taken = {r.secret for r in existing}
        pool = sorted(s for s in ref.secrets if split.is_measure(s) and s not in taken)
        with_gold, without = [s for s in pool if s in gold], [s for s in pool if s not in gold]
        if len(with_gold) < n_gold or len(without) < n_plain:
            raise MissingData(f'Segrete di misura insufficienti per il blocco {block}: {len(with_gold)} con e {len(without)} senza associazioni')
        rng = random.Random(f'{args.seme}:{block}')   # il blocco ha il suo sorteggio: i blocchi già fatti non cambiano
        chosen = rng.sample(with_gold, n_gold) + rng.sample(without, n_plain)
        store.add_sample([SampleRow(s, s in gold, block) for s in chosen], args.seme)
        say(f'Blocco {block}: {n_gold} segrete con associazioni verificate e {n_plain} senza, seme {args.seme}. Totale {len(existing) + len(chosen)}.')
    return OK


# --- valuta ---

def considered_secrets(ref: Reference, gold: Gold, profile: Profile) -> list[str]:
    """Tutte le segrete di misura e, dello sviluppo, solo quelle con associazioni verificate (spec, passo 2 di valuta)."""
    return sorted(s for s in ref.secrets if s in profile.index and (split.is_measure(s) or s in gold)
                  and (profile.name != 'riordino' or profile.index[s] in (profile.pinned or {})))


def rank_secrets(store: Store, run: int, profile: Profile, ref: Reference, gold: Gold, secrets: list[str]) -> None:
    """Salva le prime 20 di ogni segreta e le misure che servono i vettori (posizioni delle associazioni verificate)."""
    done = 0
    for number, secret in enumerate(secrets, start=1):
        if store.top(run, secret):
            continue   # già salvata: l'esecuzione è stata ripresa
        entry = gold.get(secret)
        order = ranking.order(profile, profile.index[secret])
        top = [profile.words[i] for i in order[1:1 + 20]]
        slots = grade_slots(secret, top, ref, entry, {}, {})
        store.save_top(run, secret, top, [s.in_gold for s in slots], [s.kind == 'variante' for s in slots])
        if entry:
            ids = [profile.index[w] for w in entry.groups if w in profile.index]
            rows = [SecretMetricRow(secret, GROUPS, float(len({entry.groups[w] for w in entry.groups if w in profile.index})))]
            if ids:
                positions = np.empty(len(order), dtype=np.int64)
                positions[order] = np.arange(1, len(order) + 1)
                found = positions[ids]
                rows += [SecretMetricRow(secret, 'posizione_mediana_verificate', float(np.median(found)))]
                rows += [SecretMetricRow(secret, f'verificate_entro_{k}', float(np.mean(found <= k))) for k in (10, 100, 1000)]
            store.save_secret_metrics(run, rows)
        done += 1
        if done % 250 == 0:
            say(f'  {number}/{len(secrets)} segrete')


def judge_stage(args, store: Store, run: int, ref: Reference, gold: Gold, profile: Profile, secrets: list[str], backend,
                live_guard_fn: Callable[[str], None]) -> tuple[int, dict, Callable[[], None]]:
    """Qwen sulle parole delle prime 20 che né Luca né le associazioni verificate coprono; poi i controlli del giudice."""
    live_guard_fn(args.server)
    own = backend is None
    backend = backend or QwenBackend()
    close = (lambda: backend.close()) if own and hasattr(backend, 'close') else (lambda: None)
    judge = Judge(store, backend, backend.model)
    human = store.human_verdicts()
    if args.giudice == 'campione':
        in_sample = {r.secret for r in store.sample()}
        targets = [s for s in secrets if s in in_sample]
    else:
        targets = [s for s in secrets if split.is_measure(s)]
    failed = 0
    try:
        for secret in targets:
            slots = grade_slots(secret, store.top(run, secret), ref, gold.get(secret), human, {})
            words = [s.word for s in slots if s.kind == 'senza_voto']
            if words and judge.grade(secret, gold[secret].gloss if secret in gold else None, words) is None:
                failed += 1
        development = [s for s in secrets if not split.is_measure(s) and s in gold]
        result = controls(judge, gold, profile.words, ref, development, seed=0, size=50)
    except BaseException:
        close()
        raise
    return failed, result, close


def secret_values(secret: str, top: list[str], ref: Reference, entry, human, verdicts, groups: int) -> dict[str, float | None]:
    slots = grade_slots(secret, top, ref, entry, human, verdicts)
    window = slots[:10]
    counted = [s for s in window if s.kind != 'variante']

    def share(predicate):
        return sum(predicate(s) for s in counted) / len(counted) if counted else None
    return {
        'precision_10_verificata': precision_verified(slots, entry is not None),
        'precision_10_giudicata': precision_judged(slots),
        'ndcg_20': ndcg20(slots, entry, (), groups),
        'accezione': sense_share(slots),
        'valutazione_umana': human_share(slots),
        'varianti_top10': sum(s.kind == 'variante' for s in window) / len(window) if window else None,
        'fuori_riferimento_top10': sum(not s.in_reference for s in window) / len(window) if window else None,
        'pos_noun': share(lambda s: s.pos == 'NOUN'), 'pos_verb': share(lambda s: s.pos == 'VERB'),
        'pos_adj': share(lambda s: s.pos == 'ADJ'), 'pos_altro': share(lambda s: s.pos == 'ALTRO'),
    }


def stored_by_secret(store: Store, run: int, metric: str) -> dict[str, float]:
    rows = store.con.execute('SELECT s.word, m.value FROM run_secret_metrics m JOIN words s ON s.id = m.secret_id '
                             'JOIN metric_names n ON n.id = m.metric_id WHERE m.run_id = ? AND n.name = ? AND m.value IS NOT NULL',
                             (run, metric))
    return dict(rows.fetchall())


def run_secrets(store: Store, run: int) -> list[str]:
    rows = store.con.execute('SELECT DISTINCT s.word FROM run_top t JOIN words s ON s.id = t.secret_id WHERE t.run_id = ? ORDER BY s.word', (run,))
    return [w for (w,) in rows]


def aggregate(store: Store, run: int, ref: Reference, gold: Gold, version: str | None) -> list[MetricRow]:
    """Le metriche di ogni segreta e, per ogni sottoinsieme, media con intervallo (bootstrap sulle segrete)."""
    human = store.human_verdicts()
    groups = stored_by_secret(store, run, GROUPS)
    diagnostics = {name: stored_by_secret(store, run, name) for name in DIAGNOSTICS}
    buckets: dict[tuple[str, str], list[float]] = {}
    per_secret: list[SecretMetricRow] = []
    verdicts_of: dict[str, dict] = {}
    for secret in run_secrets(store, run):
        verdicts = store.judge_verdicts(secret, version) if version else {}
        verdicts_of[secret] = verdicts
        values = secret_values(secret, store.top(run, secret), ref, gold.get(secret), human, verdicts, int(groups.get(secret, 0)))
        values.update({name: diagnostics[name].get(secret) for name in DIAGNOSTICS})
        for metric, value in values.items():
            if value is None:
                continue
            per_secret.append(SecretMetricRow(secret, metric, value))
            for subset in split.subsets(split.split_of(secret), secret in gold, ref.secrets[secret]):
                buckets.setdefault((metric, subset), []).append(value)
    store.save_secret_metrics(run, per_secret)
    rows = []
    for (metric, subset), values in sorted(buckets.items()):
        low, high = bootstrap(values)
        rows.append(MetricRow(metric, subset, float(np.mean(values)), low, high, len(values)))
    agree = [int((verdicts_of[s][w].grade >= 1) == (v == 'naturale')) for (s, w), v in human.items()
             if s in verdicts_of and v in ('naturale', 'non_naturale') and w in verdicts_of[s]]
    if agree:
        low, high = bootstrap(agree)
        rows.append(MetricRow('giudice_accordo_umano', 'campione', float(np.mean(agree)), low, high, len(agree)))
    return rows


def coverage_rows(ref: Reference, gold: Gold, profile: Profile) -> list[MetricRow]:
    secrets = len(ref.secrets)
    with_vector = sum(s in profile.index for s in ref.secrets)
    with_gold = sum(s in gold for s in ref.secrets)
    words = [w for entry in gold.values() for w in entry.groups]
    in_vocab = sum(w in profile.index for w in words)
    return [MetricRow('copertura_segrete_con_vettore', 'tutte', with_vector / secrets, None, None, secrets),
            MetricRow('copertura_segrete_con_associazioni', 'tutte', with_gold / secrets, None, None, secrets),
            MetricRow('copertura_associazioni_nel_vocabolario', 'tutte', in_vocab / len(words) if words else None, None, None, len(words))]


def write_report(store: Store, run: int, reports: Path) -> Path:
    head = store.con.execute('SELECT r.id, p.name, p.vectors_sha256, p.dim, p.words, r.status, r.created_at, r.finished_at, r.evaluator_version, '
                             'r.judge_version, r.split_rule, r.reference_sha256, r.gold_sha256 FROM runs r JOIN profiles p ON p.id = r.profile_id '
                             'WHERE r.id = ?', (run,)).fetchone()
    metrics = [dict(zip(('metrica', 'sottoinsieme', 'valore', 'minimo', 'massimo', 'n'), row)) for row in store.con.execute(
        'SELECT metrica, sottoinsieme, value, low, high, n FROM v_run_metrics WHERE run_id = ? ORDER BY metrica, sottoinsieme', (run,))]
    keys = ('run', 'profile', 'vectors_sha256', 'dim', 'words', 'status', 'created_at', 'finished_at', 'evaluator_version',
            'judge_version', 'split_rule', 'reference_sha256', 'gold_sha256')
    report = dict(zip(keys, head), metrics=metrics)
    reports.mkdir(parents=True, exist_ok=True)
    base = reports / f'valutazione_{head[1]}_{run}'
    base.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    with base.with_suffix('.csv').open('w', encoding='utf-8', newline='') as f:
        out = csv.writer(f)
        out.writerow(['metrica', 'sottoinsieme', 'valore', 'minimo', 'massimo', 'n'])
        out.writerows([m[k] for k in ('metrica', 'sottoinsieme', 'valore', 'minimo', 'massimo', 'n')] for m in metrics)
    return base.with_suffix('.json')


def unchanged(args, ref: Reference, gold_sha: str) -> None:
    ref.check_unchanged()
    if gold_fingerprint(Path(args.giochi)) != gold_sha:
        raise ReferenceChanged('Le associazioni verificate sono cambiate durante la valutazione: ricalcola da capo')


def cmd_valuta(args, backend, live_guard_fn) -> int:
    ref, gold = load_inputs(args)
    profile, origin = load_profile(args)
    store = Store(Path(args.risultati))
    close = lambda: None
    try:
        if args.giudice == 'campione' and not store.sample():
            raise MissingData('Manca il campione: lancia prima  evaluate_context_ranking.py campione')
        pid = store.profile_id(profile.name, origin, profile.sha256, profile.vectors.shape[1], len(profile.words))
        version = judge_version() if args.giudice != 'no' else None
        gold_sha = gold_fingerprint(Path(args.giochi))
        run = store.open_run(pid, ref.fingerprint(), gold_sha, version)
        say(f'Esecuzione {"ripresa" if run else "nuova"}: profilo {profile.name}, giudice {args.giudice}')
        run = run or store.start_run(pid, version, ref.fingerprint(), gold_sha)
        secrets = considered_secrets(ref, gold, profile)
        say(f'{len(secrets)} segrete da classificare')
        rank_secrets(store, run, profile, ref, gold, secrets)
        extra: list[MetricRow] = coverage_rows(ref, gold, profile)
        if args.giudice != 'no':
            failed, result, close = judge_stage(args, store, run, ref, gold, profile, secrets, backend, live_guard_fn)
            extra += [MetricRow('giudice_sensibilita', 'sviluppo:tutte', result['sensibilita'], None, None, result['coppie_verificate']),
                      MetricRow('giudice_specificita', 'sviluppo:tutte', result['specificita'], None, None, result['coppie_casuali']),
                      MetricRow('segrete_non_giudicate', 'tutte', float(failed), None, None, len(secrets))]
            say(f"Giudice: sensibilità {result['sensibilita']}, specificità {result['specificita']}, segrete non giudicate {failed}")
        try:
            unchanged(args, ref, gold_sha)
        except ReferenceChanged as error:
            store.finish_run(run, 'annullata')
            say(f'Esecuzione annullata: {error}')
            return CHANGED
        store.save_metrics(run, extra + aggregate(store, run, ref, gold, version))
        store.finish_run(run, 'completa')
        store.vacuum()
        say(f'Rapporto: {write_report(store, run, Path(args.rapporti))}')
        return OK
    finally:
        close()
        store.close()


# --- ricalcola ---

def cmd_ricalcola(args, backend, live_guard_fn) -> int:
    ref, gold = load_inputs(args)
    with closing(Store(Path(args.risultati))) as store:
        if args.esecuzione:
            runs = store.con.execute("SELECT id, judge_version, reference_sha256, gold_sha256 FROM runs WHERE id = ? AND status = 'completa'",
                                     (args.esecuzione,)).fetchall()
        else:
            runs = store.con.execute("SELECT id, judge_version, reference_sha256, gold_sha256 FROM runs WHERE id IN "
                                     "(SELECT MAX(id) FROM runs WHERE status = 'completa' GROUP BY profile_id)").fetchall()
        if not runs:
            raise MissingData('Nessuna esecuzione completa da ricalcolare: lancia prima valuta')
        for run, version, ref_sha, gold_sha in runs:
            if ref.fingerprint() != ref_sha or gold_fingerprint(Path(args.giochi)) != gold_sha:
                say(f'Esecuzione {run}: raw 2.0 o le associazioni sono cambiati dopo la valutazione, rilancia valuta.')
                return CHANGED
            store.save_metrics(run, aggregate(store, run, ref, gold, version))
            say(f'Esecuzione {run} ricalcolata: {write_report(store, run, Path(args.rapporti))}')
        store.vacuum()
    return OK


# --- parità ---

def cmd_parita(args, backend, live_guard_fn) -> int:
    ref, _ = load_inputs(args)
    profile, _ = load_profile(args)
    secrets = [s for s in considered_secrets(ref, {}, profile) if split.is_measure(s)][:args.segrete]
    data = {'profile': profile.name, 'vectors_sha256': profile.sha256,
            'secrets': [{'secret': s, 'top': [profile.words[i] for i in ranking.top(profile, profile.index[s], k=20)]} for s in secrets]}
    out = Path(args.rapporti)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f'parita_{profile.name}.json'
    target.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    say(f'{len(secrets)} segrete scritte in {target}')
    return OK


# --- riga di comando ---

def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--raw2', default=str(paths.RAW2), help='parole_ita_raw_2.0.sqlite3 (sola lettura)')
    common.add_argument('--giochi', default=str(paths.GIOCHI), help='giochi.sqlite3 (sola lettura)')
    common.add_argument('--morphit', default=str(paths.MORPHIT), help='morphit_048.txt (python script/fetch_morphit.py)')
    common.add_argument('--risultati', default=str(paths.RESULTS), help='il database dei risultati, l\'unico in cui si scrive')
    common.add_argument('--rapporti', default=str(paths.REPORTS), help='cartella dei rapporti JSON e CSV')
    common.add_argument('--vettori-dir', default=str(paths.VECTORS_DIR))
    common.add_argument('--pipeline-b', default=str(paths.PIPELINE_B))
    common.add_argument('--export-riordino', default=str(paths.RIORDINO))
    common.add_argument('--server', default='http://127.0.0.1:3001', help='Zerocade, per sapere se c\'è una diretta')

    profile = argparse.ArgumentParser(add_help=False)
    which = profile.add_mutually_exclusive_group(required=True)
    which.add_argument('--profilo', choices=sorted(SCHEMAS), help='un profilo pubblicato nel gioco')
    which.add_argument('--candidato', metavar='NOME', help='un profilo non ancora pubblicato: con --vettori, --vocab e --dim')
    profile.add_argument('--vettori', help='file float32 dei vettori unitari (candidato)')
    profile.add_argument('--vocab', help='una parola per riga, nello stesso ordine dei vettori (candidato)')
    profile.add_argument('--dim', type=int, help='dimensioni dei vettori (candidato)')

    parser = argparse.ArgumentParser(prog='evaluate_context_ranking.py', description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    sample = commands.add_parser('campione', parents=[common], help='sceglie il campione di segrete da rivedere a mano')
    sample.add_argument('--seme', type=int, default=DEFAULT_SEED)
    sample.add_argument('--blocco', action='store_true', help='aggiunge un blocco al campione già creato')
    run = commands.add_parser('valuta', parents=[common, profile], help='classifica le segrete con un profilo e calcola le metriche')
    run.add_argument('--giudice', choices=('no', 'campione', 'misura'), default='campione')
    redo = commands.add_parser('ricalcola', parents=[common], help='ricalcola le metriche con i verdetti umani nuovi (niente Qwen né vettori)')
    redo.add_argument('--esecuzione', type=int, help='id dell\'esecuzione; senza, l\'ultima completa di ogni profilo')
    parity = commands.add_parser('parita', parents=[common, profile], help='scrive le prime 20 di alcune segrete per il confronto con il server')
    parity.add_argument('--segrete', type=int, default=20)
    return parser


COMMANDS = {'campione': cmd_campione, 'valuta': cmd_valuta, 'ricalcola': cmd_ricalcola, 'parita': cmd_parita}


def main(argv: list[str] | None = None, *, backend=None, live_guard_fn: Callable[[str], None] = live_guard) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, 'candidato', None) and not (args.vettori and args.vocab and args.dim):
        build_parser().error('--candidato richiede --vettori, --vocab e --dim')
    try:
        return COMMANDS[args.command](args, backend, live_guard_fn)
    except MissingData as error:
        print(f'Dati mancanti: {error}', file=sys.stderr)
        return MISSING
