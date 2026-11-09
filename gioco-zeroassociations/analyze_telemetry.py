"""Cosa dice la chat sui bacini: difficoltà misurata, parole mai trovate, associazioni attese.

Legge i CSV che la dashboard scarica con ZeroAssociazioni selezionato (Round e Tentativi:
/api/word-association/rounds.csv e guesses.csv) e, se c'è, prompt.sqlite3 per conoscere i
bacini interi. Scrive un rapporto JSON e, a richiesta, le parole che la chat scrive spesso e che
il bacino non contiene, come proposte da revisionare (AWAITING_SEMANTIC_REVIEW).

Non modifica il database e non approva nulla: una parola scritta da molti spettatori è un
indizio di naturalezza, ma entra in un bacino solo dopo la revisione semantica prevista dalle
direttive (import-reviewed). Nessun dato sugli spettatori: il server conserva solo i conteggi.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from statistics import median
import sys

from verified_pools import DEFAULT_DB, Pool, load_pools

SCHEMA = 'zeroassociazioni-telemetry-report-1'


def read_csv(path: Path) -> list[dict]:
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def measured_difficulty(drawn: int, found: int, min_rounds: int, easy: float, hard: float) -> str | None:
    if drawn < min_rounds: return None
    rate = found/drawn
    return 'easy' if rate >= easy else 'hard' if rate < hard else 'medium'


def analyze(guesses: list[dict], rounds: list[dict] | None = None, pools: list[Pool] | None = None, *,
            min_rounds=5, easy=0.75, hard=0.4, candidate_rounds=3, candidate_share=0.2) -> dict:
    by_ref = {p.ref: p for p in pools or []}
    info = {r['round']: r for r in rounds or []}
    per_ref: dict[str, dict] = defaultdict(lambda: {'prompt': '', 'rounds': set(), 'drawn': Counter(), 'found': Counter(),
                                                    'ms': defaultdict(list), 'hinted': Counter(), 'wrong': Counter(),
                                                    'wrong_rounds': defaultdict(set)})
    for g in guesses:
        ref = per_ref[g['ref']]
        ref['prompt'] = g['prompt']
        ref['rounds'].add(g['round'])
        kind, word = g['kind'], g['word']
        if kind in ('found', 'missed'):
            ref['drawn'][word] += 1
        if kind == 'found':
            ref['found'][word] += 1
            if g.get('at_ms') not in (None, ''): ref['ms'][word].append(int(g['at_ms']))
            if g.get('hinted') in ('1', 1, 'true', True): ref['hinted'][word] += 1
        elif kind == 'wrong':
            count = int(g.get('count') or 1)
            ref['wrong'][word] += count
            ref['wrong_rounds'][word].add(g['round'])

    prompts = []
    proposals = []
    for key, ref in sorted(per_ref.items(), key=lambda kv: kv[1]['prompt']):
        pool = by_ref.get(key)
        played = len(ref['rounds'])
        words = []
        for word, drawn in sorted(ref['drawn'].items()):
            found = ref['found'][word]
            measured = measured_difficulty(drawn, found, min_rounds, easy, hard)
            editorial = pool.answers.get(word, {}).get('difficulty') if pool else None
            flags = []
            if drawn >= min_rounds and found == 0: flags.append('mai_trovata')
            if measured and editorial and editorial != 'unrated' and measured != editorial: flags.append('difficoltà_diversa')
            ms = ref['ms'][word]
            words.append({
                'word': word, 'drawn': drawn, 'found': found, 'found_rate': round(found/drawn, 3),
                'median_seconds': round(median(ms)/1000, 1) if ms else None,
                'hinted_rate': round(ref['hinted'][word]/found, 3) if found else None,
                'measured_difficulty': measured, 'editorial_difficulty': editorial, 'flags': flags,
                'difficulty_basis': (f'gameplay_telemetry: trovata in {found} round su {drawn}'
                                     + (f', mediana {round(median(ms)/1000)} s' if ms else '')) if measured else None,
            })
        chat = []
        for guess, count in ref['wrong'].most_common():
            in_rounds = len(ref['wrong_rounds'][guess])
            pool_word = pool.answer_for(guess) if pool else None
            entry = {'guess': guess, 'count': count, 'rounds': in_rounds, 'round_share': round(in_rounds/played, 3)}
            if pool_word:
                # Una parola del bacino non estratta in quel round: la chat la conferma.
                entry.update(kind='nel_bacino', pool_word=pool_word)
            elif in_rounds >= candidate_rounds and in_rounds/played >= candidate_share:
                entry['kind'] = 'candidata'
                proposals.append({
                    'prompt': ref['prompt'], 'ref': key, 'sense_description': pool.sense if pool else None,
                    'word': guess, 'source': 'gameplay_telemetry',
                    'evidence': {'rounds': in_rounds, 'rounds_played': played, 'count': count},
                    'status': 'AWAITING_SEMANTIC_REVIEW', 'database_inserted': False})
            else:
                continue
            chat.append(entry)
        completed = [r for r in ref['rounds'] if r in info and info[r]['found'] == info[r]['total']]
        prompts.append({
            'prompt': ref['prompt'], 'ref': key, 'in_database': pool is not None, 'rounds': played,
            'completed_rounds': len(completed) if info else None,
            'words': words,
            'pool_words_never_drawn': sorted(set(pool.answers) - set(ref['drawn'])) if pool else None,
            'chat_words': chat,
        })
    flags = Counter(f for p in prompts for w in p['words'] for f in w['flags'])
    return {
        'schema': SCHEMA,
        'thresholds': {'min_rounds': min_rounds, 'easy_found_rate': easy, 'hard_found_rate': hard,
                       'candidate_rounds': candidate_rounds, 'candidate_round_share': candidate_share},
        'summary': {'prompts': len(prompts), 'rounds': sum(p['rounds'] for p in prompts),
                    'words_measured': sum(1 for p in prompts for w in p['words'] if w['measured_difficulty']),
                    'never_found': flags['mai_trovata'], 'difficulty_differs': flags['difficoltà_diversa'],
                    'candidates': len(proposals)},
        'prompts': prompts,
        'proposals': proposals,
        'approval': False,
    }


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--guesses', type=Path, required=True, help='CSV «Tentativi» (word-association-tentativi.csv)')
    ap.add_argument('--rounds', type=Path, help='CSV «Round» (word-association-round.csv): round completati')
    ap.add_argument('--db', type=Path, default=DEFAULT_DB, help='prompt.sqlite3, per i bacini interi (facoltativo)')
    ap.add_argument('--output', type=Path, help='Rapporto JSON (non sovrascrive un file esistente)')
    ap.add_argument('--proposals', type=Path, help='JSONL delle parole candidate, da revisionare')
    ap.add_argument('--min-rounds', type=int, default=5, help='Round minimi per misurare una parola')
    ap.add_argument('--candidate-rounds', type=int, default=3)
    ap.add_argument('--candidate-share', type=float, default=0.2)
    args = ap.parse_args(argv)
    pools = load_pools(args.db) if args.db and args.db.exists() else []
    report = analyze(read_csv(args.guesses), read_csv(args.rounds) if args.rounds else None, pools,
                     min_rounds=args.min_rounds, candidate_rounds=args.candidate_rounds, candidate_share=args.candidate_share)
    report['generated_at'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    report['sources'] = {'guesses': {'path': str(args.guesses), 'sha256': sha256(args.guesses)}}
    if args.rounds: report['sources']['rounds'] = {'path': str(args.rounds), 'sha256': sha256(args.rounds)}
    report['sources']['pools'] = {'path': str(args.db), 'count': len(pools)} if pools else None
    if args.output:
        with args.output.open('x', encoding='utf-8') as stream: json.dump(report, stream, ensure_ascii=False, indent=2)
    if args.proposals:
        with args.proposals.open('x', encoding='utf-8') as stream:
            for row in report['proposals']: stream.write(json.dumps(row, ensure_ascii=False)+'\n')
    print(json.dumps(report['summary'] if args.output else report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
