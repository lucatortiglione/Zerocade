"""Giocatori simulati con un LLM locale: recuperabilità dei bacini e bozze di nuovi bacini.

recall   Per ogni bacino verificato, K giocatori indipendenti vedono soltanto il prompt (con
         --with-hint anche l'accezione, come quando il gioco la mostra) e scrivono le parole che
         direbbero. Per ogni risposta: in quanti giocatori compare, anche flessa. Una risposta
         che quasi nessuno dice è poco recuperabile; una parola detta da molti e assente dal
         bacino diventa una proposta da revisionare.
propose  Per prompt nuovi, le parole su cui concorda almeno metà dei giocatori, come bozza di
         bacino (UNREVIEWED_LOCAL_DRAFT). Le associazioni si cercano partendo dal concetto, non
         dalle definizioni.

Diagnosi, non approvazione: niente entra nel database senza la revisione semantica
(import-reviewed), e la prova vera resta la telemetria del gioco (analyze_telemetry.py).
L'LLM è un server locale compatibile OpenAI (llama.cpp), lo stesso di draft_words_locally.py.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
from typing import Callable
import urllib.request

from verified_pools import DEFAULT_DB, Pool, answer_key, keys_of, load_pools

DEFAULT_ENDPOINT = 'http://127.0.0.1:19472'
WORD = r'^[a-zàèéìòù]+$'
SYSTEM = '''Sei uno spettatore italiano che gioca in diretta a un gioco di associazioni di parole.
Vedi una parola: in chat devi indovinare le parole nascoste collegate a essa. Scrivi le parole
che ti vengono in mente per prime, dalla più ovvia alla meno ovvia: parole italiane singole,
minuscole, comuni, senza ripetere la parola mostrata e senza frasi.
Rispondi in JSON: {"words": [...]}.'''

# sample(prompt, hint, count, seed) -> parole scritte da un giocatore
Sampler = Callable[[str, str | None, int, int], list[str]]


def http_sampler(endpoint: str, model: str | None = None, temperature: float = 0.9, timeout: int = 120) -> Sampler:
    def sample(prompt: str, hint: str | None, count: int, seed: int) -> list[str]:
        schema = {'type': 'object', 'additionalProperties': False, 'required': ['words'], 'properties': {
            'words': {'type': 'array', 'minItems': 3, 'maxItems': count, 'items': {'type': 'string', 'pattern': WORD}}}}
        user = {'parola': prompt, 'quante': count, **({'significato': hint} if hint else {})}
        body = {'messages': [{'role': 'system', 'content': SYSTEM},
                             {'role': 'user', 'content': json.dumps(user, ensure_ascii=False)}],
                'temperature': temperature, 'seed': seed, 'max_tokens': 40*count + 100,
                'response_format': {'type': 'json_schema', 'json_schema': {'name': 'guesses', 'strict': True, 'schema': schema}}}
        if model: body['model'] = model
        request = urllib.request.Request(endpoint.rstrip('/')+'/v1/chat/completions', headers={'Content-Type': 'application/json'},
                                         data=json.dumps(body, ensure_ascii=False).encode('utf-8'))
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = json.load(response)
        return json.loads(raw['choices'][0]['message']['content'])['words']
    return sample


def players(sample: Sampler, prompt: str, hint: str | None, k: int, count: int) -> list[list[str]]:
    """K giocatori; ognuno conta una parola una volta sola, il prompt stesso non conta."""
    out = []
    for seed in range(k):
        seen, words = set(), []
        for word in sample(prompt, hint, count, seed):
            key = answer_key(word)
            if key and key != answer_key(prompt) and key not in seen:
                seen.add(key)
                words.append(word.strip().casefold())
        out.append(words)
    return out


def recall(pool: Pool, sample: Sampler, k=8, count=15, with_hint=False, low=0.25, candidate_share=0.5) -> dict:
    said = players(sample, pool.prompt, pool.sense if with_hint else None, k, count)
    keys = [{answer_key(w) for w in words} for words in said]
    answers = []
    for word in sorted(pool.answers):
        forms = keys_of(word, pool.pos)
        hits = sum(1 for player in keys if player & forms)
        answers.append({'word': word, 'players': hits, 'recall': round(hits/k, 3),
                        'flags': ['poco_recuperabile'] if hits/k < low else []})
    tally, surface = Counter(), {}
    for words in said:
        for w in words:
            if pool.answer_for(w) is None:
                tally[answer_key(w)] += 1
                surface.setdefault(answer_key(w), w)
    needed = math.ceil(k*candidate_share)
    candidates = [{'word': surface[key], 'players': n} for key, n in tally.most_common() if n >= needed]
    return {'prompt': pool.prompt, 'ref': pool.ref, 'sense': pool.sense, 'with_hint': with_hint, 'players': k,
            'mean_recall': round(sum(a['recall'] for a in answers)/len(answers), 3) if answers else None,
            'answers': answers, 'candidates': candidates}


def propose(prompt: str, sample: Sampler, k=8, count=15, keep=15, hint: str | None = None) -> dict:
    said = players(sample, prompt, hint, k, count)
    tally, surface = Counter(), {}
    for words in said:
        for w in words:
            tally[answer_key(w)] += 1
            surface.setdefault(answer_key(w), w)
    needed = math.ceil(k/2)
    words = [{'word': surface[key], 'players': n} for key, n in tally.most_common() if n >= needed][:keep]
    return {'prompt': prompt, 'sense_hint': hint, 'players': k, 'words': words,
            'status': 'UNREVIEWED_LOCAL_DRAFT', 'database_inserted': False}


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--endpoint', default=DEFAULT_ENDPOINT)
    ap.add_argument('--model')
    ap.add_argument('--players', type=int, default=8, help='Giocatori simulati per prompt')
    ap.add_argument('--words', type=int, default=15, help='Parole scritte da ogni giocatore')
    ap.add_argument('--output', type=Path, required=True, help='JSON (recall) o JSONL (propose); non sovrascritto')
    sub = ap.add_subparsers(dest='command', required=True)
    rec = sub.add_parser('recall', help='Recuperabilità dei bacini verificati')
    rec.add_argument('--db', type=Path, default=DEFAULT_DB)
    rec.add_argument('--prompts', nargs='+', help='Solo questi prompt')
    rec.add_argument('--with-hint', action='store_true', help="I giocatori vedono anche l'accezione")
    pro = sub.add_parser('propose', help='Bozze di bacino per prompt nuovi')
    pro.add_argument('prompts', nargs='+')
    args = ap.parse_args(argv)
    sample = http_sampler(args.endpoint, args.model)
    started = datetime.now(timezone.utc).isoformat(timespec='seconds')
    if args.command == 'recall':
        pools = [p for p in load_pools(args.db) if not args.prompts or p.prompt in args.prompts]
        results = []
        for pool in pools:
            results.append(recall(pool, sample, args.players, args.words, args.with_hint))
            print(f"{pool.prompt}: richiamo medio {results[-1]['mean_recall']}", file=sys.stderr, flush=True)
        report = {'schema': 'zeroassociazioni-llm-recall-1', 'started_at': started, 'endpoint': args.endpoint,
                  'model': args.model, 'players': args.players, 'words_per_player': args.words,
                  'diagnostic_only': True, 'pools': results}
        with args.output.open('x', encoding='utf-8') as stream: json.dump(report, stream, ensure_ascii=False, indent=2)
        weak = sum(1 for r in results for a in r['answers'] if a['flags'])
        print(json.dumps({'pools': len(results), 'weak_answers': weak, 'output': str(args.output)}, ensure_ascii=False))
    else:
        with args.output.open('x', encoding='utf-8') as stream:
            for prompt in args.prompts:
                draft = {**propose(prompt, sample, args.players, args.words), 'model': args.model, 'created_at': started}
                stream.write(json.dumps(draft, ensure_ascii=False)+'\n')
        print(json.dumps({'drafts': len(args.prompts), 'output': str(args.output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
