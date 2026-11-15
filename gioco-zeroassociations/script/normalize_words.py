"""Normalizzazione delle parole del DB di lavoro: un plurale puro lascia il posto al suo singolare.

Un plurale puro (gatti, case, pantaloni... quando il singolare è nella raccolta) non è una parola a sé: il
gioco tiene il singolare. La regola è quella del vocabolario di ZeroContext, gioco-zerocontext/script/
context_vocabulary.pure_plurals: prova esplicita di plurale in GLAFF, Morph-it, Flex-it, UD o Kaikki, singolare
presente nella raccolta, nessuna lettura come lemma proprio né come altra forma flessa.

`apply` registra per ogni plurale puro la decisione DISCARDED (raw.inventory_term_decisions, con storico e il
singolare nel motivo): il task 3 la porta nello schema scartati e toglie la voce da filtrati e validi. Non
tocca le decisioni prese da una persona o da una revisione (INTEGRATED, DEFERRED, DISCARDED con altro
autore) e ritira le proprie se la parola non è più un plurale puro. Si può rilanciare: dà sempre lo stesso esito.

Uso:  python script/normalize_words.py plan|apply [--db percorso] [--limit N]
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / 'gioco-zerocontext' / 'script'))
from context_vocabulary import pure_plurals  # noqa: E402

RAW_DB = ROOT / 'database' / 'parole_ita_raw.sqlite3'
ACTOR = 'normalizzazione automatica (plurali puri)'
REASON = 'Plurale puro di {}: si tiene il singolare'


def reason_for(singulars: list[str]) -> str:
    return REASON.format(', '.join(singulars))


def detect(path: Path) -> dict[str, list[str]]:
    """I plurali puri tra le parole singole della raccolta, ognuno con i suoi singolari."""
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as con:
        words = [w for w, in con.execute('SELECT prompt FROM raw__inventory_terms WHERE is_single_word = 1')]
    return pure_plurals(words, path)


def plan(path: Path, plurals: dict[str, list[str]]) -> dict:
    """Che cosa farebbe `apply`, senza scrivere."""
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as con:
        decided = {p: (d, a) for p, d, a in con.execute('SELECT prompt, decision, actor FROM raw__inventory_term_decisions')}
        valid = {p for p, in con.execute('SELECT lemma FROM validi__prompts')} \
            if con.execute("SELECT 1 FROM sqlite_schema WHERE name = 'validi__prompts'").fetchone() else set()
    new = [w for w in plurals if w not in decided]
    own = [w for w in plurals if decided.get(w, ('', ''))[1] == ACTOR]
    manual = [w for w in plurals if w in decided and decided[w][1] != ACTOR]
    stale = [w for w, (_, actor) in decided.items() if actor == ACTOR and w not in plurals]
    return {'plurals': len(plurals), 'new': new, 'already': own, 'kept_manual': manual, 'withdrawn': stale,
            'valid_among_new': sorted(w for w in new if w in valid)}


def apply(path: Path, plurals: dict[str, list[str]]) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(path)) as con:
        con.execute('BEGIN IMMEDIATE')
        decided = {p: (d, a) for p, d, a in con.execute('SELECT prompt, decision, actor FROM raw__inventory_term_decisions')}
        history = []
        add = []
        for word, singulars in plurals.items():
            if word in decided and decided[word][1] != ACTOR:
                continue
            reason = reason_for(singulars)
            if word in decided and decided[word][0] == 'DISCARDED':
                current = con.execute('SELECT reason FROM raw__inventory_term_decisions WHERE prompt = ?', (word,)).fetchone()[0]
                if current == reason:
                    continue
            add.append((word, 'DISCARDED', reason, ACTOR, now))
            history.append(('TERM', word, 'DISCARDED', reason, ACTOR, now))
        con.executemany('''INSERT INTO raw__inventory_term_decisions VALUES (?,?,?,?,?)
            ON CONFLICT(prompt) DO UPDATE SET decision = excluded.decision, reason = excluded.reason,
            actor = excluded.actor, decided_at = excluded.decided_at''', add)
        stale = [w for w, (_, actor) in decided.items() if actor == ACTOR and w not in plurals]
        con.executemany('DELETE FROM raw__inventory_term_decisions WHERE prompt = ?', [(w,) for w in stale])
        history += [('TERM', w, 'WITHDRAWN', 'Non è più un plurale puro: la decisione automatica è ritirata', ACTOR, now) for w in stale]
        con.executemany('''INSERT INTO raw__inventory_decision_history (subject_type, subject_id, decision, reason, actor, decided_at)
            VALUES (?,?,?,?,?,?)''', history)
        con.commit()
    return {'recorded': len(add), 'withdrawn': len(stale)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('command', choices=['plan', 'apply'])
    ap.add_argument('--db', type=Path, default=RAW_DB)
    ap.add_argument('--limit', type=int, default=15, help='esempi da mostrare')
    args = ap.parse_args(argv)
    plurals = detect(args.db)
    p = plan(args.db, plurals)
    print(f"Plurali puri trovati: {p['plurals']:,}")
    print(f"  da registrare ora: {len(p['new']):,}; già registrati: {len(p['already']):,}; "
          f"già decisi da una persona o da una revisione (lasciati): {len(p['kept_manual']):,}; da ritirare: {len(p['withdrawn']):,}")
    print(f"  tra quelli da registrare, oggi validi nel gioco: {len(p['valid_among_new']):,}")
    for w in p['new'][:args.limit]:
        print(f'    {w} -> {", ".join(plurals[w])}')
    if args.command == 'apply':
        done = apply(args.db, plurals)
        print(f"Registrate {done['recorded']:,} decisioni, ritirate {done['withdrawn']:,}. "
              'Ora: task 3 (scarta quelle non utili e filtrate), poi il resto della catena.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
