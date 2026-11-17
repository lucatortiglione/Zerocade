"""Normalizzazione RAW: maschile se equivalente, numero scelto per frequenza.

La decisione del 16/11/2026 preferisce il maschile solo se la relazione morfologica
è attestata; mantiene il femminile autonomo. Il plurale prevale sul singolare solo
se ha Zipf maggiore (wordfreq italiano); a parità prevale il singolare. Non usa
desinenze per inventare equivalenze e conserva le forme con letture incompatibili.

`apply` registra per ogni variante non canonica la decisione DISCARDED (raw.inventory_term_decisions,
con storico, rappresentante e frequenze nel motivo): il task 3 la porta nello schema scartati. Non
tocca le decisioni prese da una persona o da una revisione (INTEGRATED, DEFERRED, DISCARDED con altro
autore) e ritira le proprie se la nuova politica non esclude più la parola. Non elimina attestazioni
e non pubblica automaticamente i giochi. Si può rilanciare: dà sempre lo stesso esito.

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
from canonical_word_forms import detect_canonical  # noqa: E402

RAW_DB = ROOT / 'database' / 'parole_ita_raw.sqlite3'
LEGACY_ACTOR = 'normalizzazione automatica (plurali puri)'
ACTOR = 'normalizzazione automatica (genere e numero)'
OWN_ACTORS = {ACTOR, LEGACY_ACTOR}
REASON = 'Plurale puro di {}: si tiene il singolare'


def reason_for(singulars: list[str]) -> str:
    return REASON.format(', '.join(singulars))


def detect(path: Path, frequency=None) -> dict[str, list[str]]:
    return detect_canonical(path, frequency)


def plan(path: Path, plurals: dict[str, list[str]]) -> dict:
    """Che cosa farebbe `apply`, senza scrivere."""
    with closing(sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)) as con:
        decided = {p: (d, a) for p, d, a in con.execute('SELECT prompt, decision, actor FROM raw__inventory_term_decisions')}
        valid = {p for p, in con.execute('SELECT lemma FROM validi__prompts')} \
            if con.execute("SELECT 1 FROM sqlite_schema WHERE name = 'validi__prompts'").fetchone() else set()
    new = [w for w in plurals if w not in decided]
    own = [w for w in plurals if decided.get(w, ('', ''))[1] in OWN_ACTORS]
    manual = [w for w in plurals if w in decided and decided[w][1] not in OWN_ACTORS]
    stale = [w for w, (_, actor) in decided.items() if actor in OWN_ACTORS and w not in plurals]
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
            if word in decided and decided[word][1] not in OWN_ACTORS:
                continue
            reason = getattr(plurals, 'reasons', {}).get(word, reason_for(singulars))
            if word in decided and decided[word][0] == 'DISCARDED':
                current = con.execute('SELECT reason FROM raw__inventory_term_decisions WHERE prompt = ?', (word,)).fetchone()[0]
                if current == reason:
                    continue
            add.append((word, 'DISCARDED', reason, ACTOR, now))
            history.append(('TERM', word, 'DISCARDED', reason, ACTOR, now))
        con.executemany('''INSERT INTO raw__inventory_term_decisions VALUES (?,?,?,?,?)
            ON CONFLICT(prompt) DO UPDATE SET decision = excluded.decision, reason = excluded.reason,
            actor = excluded.actor, decided_at = excluded.decided_at''', add)
        stale = [w for w, (_, actor) in decided.items() if actor in OWN_ACTORS and w not in plurals]
        con.executemany('DELETE FROM raw__inventory_term_decisions WHERE prompt = ?', [(w,) for w in stale])
        history += [('TERM', w, 'WITHDRAWN', 'Non esclusa dalla nuova politica di genere e numero: decisione automatica ritirata', ACTOR, now) for w in stale]
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
    print(f"Varianti non canoniche trovate: {p['plurals']:,}")
    print(f"  da registrare ora: {len(p['new']):,}; già registrati: {len(p['already']):,}; "
          f"già decisi da una persona o da una revisione (lasciati): {len(p['kept_manual']):,}; da ritirare: {len(p['withdrawn']):,}")
    print(f"  tra quelli da registrare, oggi validi nel gioco: {len(p['valid_among_new']):,}")
    for w in p['new'][:args.limit]:
        print(f'    {w} -> {", ".join(plurals[w])}: {getattr(plurals, "reasons", {}).get(w, "")}')
    if args.command == 'apply':
        done = apply(args.db, plurals)
        print(f"Registrate {done['recorded']:,} decisioni, ritirate {done['withdrawn']:,}. "
              'Ora: task 3 (scarta quelle non utili e filtrate), poi il resto della catena.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
