"""python script/genera_associazioni_qwen.py pilota|genera ...: associazioni di Qwen per le segrete che non hanno quelle verificate.

pilota  prova Qwen su N segrete di MISURA che hanno associazioni verificate (che Qwen non vede): tempo per segreta, quante delle
        verificate ritrova e come cambia la Precision@10 verificata delle liste riordinate quando le sue parole vanno in cima.
genera  chiede a Qwen le associazioni delle segrete senza associazioni verificate (o di tutte con --tutte) e scrive le liste
        riordinate con le sue parole in cima. Riprendibile: le risposte già avute stanno nella cache."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import statistics
import sys
import time

from valutazione import paths, profiles
from valutazione.gold import load_gold
from valutazione.metrics import grade_slots, precision_verified
from valutazione.reference import load_reference
from valutazione.split import is_measure

from riordino.generate import Generator, QwenBackend, merge_generated

POS_NAMES = {'NOUN': 'sostantivo', 'VERB': 'verbo', 'ADJ': 'aggettivo', 'ALTRO': 'altro'}


def _precision(secret: str, words: list[str], ref, gold) -> float | None:
    slots = grade_slots(secret, words[:20], ref, gold[secret], {}, {})
    return precision_verified(slots)


def _log(text: str) -> None:
    print(text, file=sys.stderr, flush=True)


def pilot(args, ref, gold, vocab, lists, generator) -> int:
    candidates = sorted(s for s in ref.secrets if s in gold and is_measure(s) and s in lists)
    random.Random(args.seme).shuffle(candidates)
    chosen = candidates[:args.n]
    before, after, recall, seconds, hits_found, sizes, failed = [], [], [], [], 0, [], 0
    rows = []
    for number, secret in enumerate(chosen, 1):
        started = time.monotonic()
        words = generator.words_for(secret, POS_NAMES[ref.pos(secret)], ref, vocab)
        took = time.monotonic() - started
        if words is None:
            failed += 1
            _log(f'[{number}/{len(chosen)}] {secret}: nessuna risposta valida')
            continue
        usable = {w for w in gold[secret].groups if w in vocab and not ref.is_variant(w, secret)}
        found = usable & set(words)
        merged = merge_generated({secret: lists[secret]}, {secret: words}, ref)[secret]
        b, a = _precision(secret, lists[secret], ref, gold), _precision(secret, merged, ref, gold)
        before.append(b)
        after.append(a)
        if usable:
            recall.append(len(found) / len(usable))
        seconds.append(took)
        sizes.append(len(words))
        rows.append({'segreta': secret, 'parole': words, 'ritrovate': sorted(found), 'p10_prima': b, 'p10_dopo': a})
        _log(f'[{number}/{len(chosen)}] {secret}: {len(words)} parole, {len(found)}/{len(usable)} verificate, P@10 {b:.2f} -> {a:.2f} ({took:.0f} s)')
    mean = lambda xs: round(statistics.fmean(xs), 3) if xs else None
    summary = {'segrete': len(chosen), 'senza_risposta': failed, 'parole_per_segreta': mean(sizes), 'secondi_per_segreta': mean(seconds),
               'secondi_mediana': round(statistics.median(seconds), 1) if seconds else None,
               'quota_verificate_ritrovate': mean(recall), 'p10_riordino': mean(before), 'p10_con_qwen': mean(after)}
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    if args.report:
        Path(args.report).write_text(json.dumps({'riassunto': summary, 'segrete': rows}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return 0


def generate(args, ref, gold, vocab, lists, generator) -> int:
    todo = sorted(s for s in lists if (args.tutte or s not in gold) and s in ref.secrets)
    if args.limite:
        todo = todo[:args.limite]
    generated, failed = {}, 0
    for number, secret in enumerate(todo, 1):
        words = generator.words_for(secret, POS_NAMES[ref.pos(secret)], ref, vocab)
        if words is None:
            failed += 1
            _log(f'[{number}/{len(todo)}] {secret}: nessuna risposta valida')
            continue
        generated[secret] = words
        if number % 25 == 0:
            _log(f'[{number}/{len(todo)}] {secret}')
    merged = merge_generated(lists, generated, ref)
    Path(args.out).write_text(json.dumps(merged, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(generated)} segrete con parole di Qwen su {len(todo)} richieste ({failed} senza risposta valida); liste in {args.out}')
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='comando', required=True)
    for name in ('pilota', 'genera'):
        p = sub.add_parser(name)
        p.add_argument('--lista', required=True, help='liste riordinate (JSON {segreta: [parole]}), senza le associazioni verificate per il pilota')
        p.add_argument('--cache', required=True, help='file JSONL con le risposte di Qwen (riprendibile)')
        p.add_argument('--profilo', default='original', help='profilo che fissa il vocabolario giocabile')
        p.add_argument('--raw2', default=str(paths.RAW2))
        p.add_argument('--giochi', default=str(paths.GIOCHI))
        p.add_argument('--morphit', default=str(paths.MORPHIT))
        p.add_argument('--modello', help='file GGUF di un altro modello (più piccolo e veloce) al posto di Qwen 27B di ZeroAssociazioni; senza verifica SHA-256')
        p.add_argument('--strati-gpu', type=int, default=99, help='strati sulla GPU con --modello')
        if name == 'pilota':
            p.add_argument('--n', type=int, default=30)
            p.add_argument('--seme', type=int, default=5)
            p.add_argument('--report')
        else:
            p.add_argument('--out', required=True)
            p.add_argument('--tutte', action='store_true', help='anche le segrete che hanno già associazioni verificate')
            p.add_argument('--limite', type=int, help='solo le prime N segrete (in ordine alfabetico)')
    args = ap.parse_args(argv)
    ref = load_reference(Path(args.raw2), Path(args.morphit))
    gold = load_gold(Path(args.giochi))
    vocab = set(profiles.load_published(args.profilo).index)
    lists = json.loads(Path(args.lista).read_text(encoding='utf-8'))
    backend = QwenBackend(model_file=Path(args.modello) if args.modello else None, gpu_layers=args.strati_gpu)
    try:
        generator = Generator(backend, Path(args.cache))
        return (pilot if args.comando == 'pilota' else generate)(args, ref, gold, vocab, lists, generator)
    finally:
        backend.close()


if __name__ == '__main__':
    raise SystemExit(main())
