"""Strumento del mazzo di ZeroTaboo: regolamento -> fonte JSON -> database -> verifica -> CSV.

    python mazzo.py parse      ZEROTABOO.md  ->  data/mazzo-v3.0.json   (una volta; poi la fonte è il JSON)
    python mazzo.py validate   controlla la fonte JSON (errori bloccanti e avvisi editoriali)
    python mazzo.py import     costruisce database/ZeroTaboo.sqlite3 (file temporaneo, verifica, poi sostituzione)
    python mazzo.py verify     confronta il database con la fonte
    python mazzo.py export     scrive un CSV con BOM

Gli avvisi editoriali si mostrano, non si correggono da soli (decisione D18): D09 senza alias, E08 con alias discordanti,
Taboo con la stessa radice del bersaglio (D03, D06, F07). Nessuna dipendenza esterna.
"""
from __future__ import annotations

import argparse
import csv
from contextlib import closing
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import unicodedata

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent
SOURCE = HERE / 'data' / 'mazzo-v3.0.json'
RULES = HERE / 'ZEROTABOO.md'
DB = ROOT / 'database' / 'ZeroTaboo.sqlite3'
DECK_VERSION = 'v3.0'
CATEGORY_CARDS = {'A': 12, 'B': 10, 'C': 10, 'D': 10, 'E': 10, 'F': 10}
LEVEL = {'🟢': 1, '🟡': 2, '🔴': 3}
LEVEL_NAME = {1: 'Facile', 2: 'Media', 3: 'Difficile'}
CODE = re.compile(r'^[A-F][0-9][0-9]$')
APOSTROPHES = "'’‘ʼ＇`´"

SCHEMA = '''
PRAGMA foreign_keys = ON;
CREATE TABLE categorie (n INTEGER PRIMARY KEY, codice TEXT NOT NULL UNIQUE, nome TEXT NOT NULL) STRICT;
CREATE TABLE livelli   (n INTEGER PRIMARY KEY CHECK (n BETWEEN 1 AND 3), nome TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE stati     (n INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE carte     (n INTEGER PRIMARY KEY, codice TEXT NOT NULL UNIQUE CHECK (codice GLOB '[A-F][0-9][0-9]'),
                        categoria INTEGER NOT NULL REFERENCES categorie(n)) STRICT;
CREATE TABLE revisioni (n INTEGER PRIMARY KEY, carta INTEGER NOT NULL REFERENCES carte(n),
                        revisione INTEGER NOT NULL CHECK (revisione >= 1), bersaglio TEXT NOT NULL,
                        livello_iniziale INTEGER NOT NULL REFERENCES livelli(n),
                        livello_corrente INTEGER NOT NULL REFERENCES livelli(n),
                        stato INTEGER NOT NULL REFERENCES stati(n),
                        qualita INTEGER CHECK (qualita BETWEEN 0 AND 100),
                        nota TEXT,
                        UNIQUE (carta, revisione)) STRICT;
CREATE TABLE parole    (n INTEGER PRIMARY KEY, testo TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE revisione_taboo (revisione INTEGER NOT NULL REFERENCES revisioni(n),
                        posizione INTEGER NOT NULL CHECK (posizione BETWEEN 1 AND 5),
                        parola INTEGER NOT NULL REFERENCES parole(n),
                        PRIMARY KEY (revisione, posizione), UNIQUE (revisione, parola)) STRICT, WITHOUT ROWID;
CREATE TABLE risposte  (revisione INTEGER NOT NULL REFERENCES revisioni(n), testo TEXT NOT NULL,
                        PRIMARY KEY (revisione, testo)) STRICT, WITHOUT ROWID;
CREATE TABLE risposte_escluse (revisione INTEGER NOT NULL REFERENCES revisioni(n), testo TEXT NOT NULL,
                        PRIMARY KEY (revisione, testo)) STRICT, WITHOUT ROWID;
CREATE TABLE avvisi    (n INTEGER PRIMARY KEY, revisione INTEGER NOT NULL REFERENCES revisioni(n), tipo TEXT NOT NULL,
                        dettaglio TEXT NOT NULL) STRICT;
CREATE TABLE meta      (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
-- L'ultima revisione di ogni carta, nella forma di ZEROTABOO.md §11.
CREATE VIEW mazzo_corrente AS
 SELECT c.codice AS card_id, r.revisione AS revision, r.bersaglio AS target, cat.codice AS category_id,
        r.livello_iniziale AS difficulty_initial, r.livello_corrente AS difficulty_current, s.nome AS status, r.qualita AS quality_score,
        (SELECT json_group_array(p.testo) FROM (SELECT p.testo FROM revisione_taboo t JOIN parole p ON p.n = t.parola
                                                 WHERE t.revisione = r.n ORDER BY t.posizione) p) AS taboo_words,
        (SELECT json_group_array(testo) FROM (SELECT testo FROM risposte WHERE revisione = r.n ORDER BY testo)) AS accepted_answers
 FROM revisioni r JOIN carte c ON c.n = r.carta JOIN categorie cat ON cat.n = c.categoria JOIN stati s ON s.n = r.stato
 WHERE r.revisione = (SELECT max(revisione) FROM revisioni WHERE carta = r.carta);
'''


# ---- Normalizzazione: la stessa di apps/server/src/taboo-answer.ts (casi condivisi in data/normalizzazione-casi.json) ----

def tokenize(text: str) -> list[str]:
    folded = unicodedata.normalize('NFD', text)
    folded = ''.join(c for c in folded if not unicodedata.category(c).startswith('M')).lower()
    for a in APOSTROPHES:
        folded = folded.replace(a, ' ')
    return re.findall(r'[^\W_]+', folded)


def answer_key(text: str) -> str:
    return ''.join(tokenize(text))


def shares_root(taboo: str, target: str) -> bool:
    for a in tokenize(taboo):
        for b in tokenize(target):
            if len(a) >= 3 and a == b:
                return True
            p = 0
            while p < len(a) and p < len(b) and a[p] == b[p]:
                p += 1
            if p >= 4 and p >= 0.6 * min(len(a), len(b)):
                return True
    return False


# ---- Lettura del regolamento ----

def _bold(cell: str) -> str:
    m = re.search(r'\*\*(.+?)\*\*', cell)
    return (m.group(1) if m else cell).strip()


def parse_rules(text: str) -> dict:
    categories: dict[str, str] = {}
    cards: list[dict] = []
    current = None
    in_aliases = False
    aliases: dict[str, tuple[list[str], list[str]]] = {}
    for line in text.splitlines():
        m = re.match(r'^### Categoria ([A-F]) · (.+)$', line)
        if m:
            current = m.group(1)
            categories[current] = m.group(2).strip()
            in_aliases = False
            continue
        if line.startswith('### Alias approvati'):
            in_aliases = True
            current = None
            continue
        if line.startswith('## '):
            in_aliases = False
            current = None
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')] if line.startswith('|') else []
        if current and len(cells) >= 5 and re.fullmatch(r'`[A-F][0-9][0-9]`', cells[0]):
            code = cells[0].strip('`')
            cards.append({
                'card_id': code, 'revision': 1, 'category_id': current, 'target': _bold(cells[1]).upper(),
                'difficulty_initial': LEVEL[cells[2].strip()], 'difficulty_current': LEVEL[cells[2].strip()],
                'taboo_words': [w.strip() for w in cells[3].split(',')], 'accepted_answers': [], 'excluded_answers': [],
                'note': cells[4], 'quality_score': None, 'status': 'playtest',
            })
        elif in_aliases and len(cells) >= 4 and re.fullmatch(r'[A-F][0-9][0-9]', cells[0]):
            ok = [a.strip() for a in cells[2].split(';') if a.strip()]
            no = [a.strip() for a in cells[3].split(',') if a.strip()]
            aliases[cells[0]] = (ok, no)
    for card in cards:
        ok, no = aliases.get(card['card_id'], ([], []))
        card['accepted_answers'], card['excluded_answers'] = ok, no
    return {'deck_version': DECK_VERSION, 'rules': 'ZEROTABOO.md v3.0', 'categories': categories, 'cards': cards}


# ---- Validazione ----

def validate(deck: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    cards = deck['cards']
    if len(cards) != 62:
        errors.append(f'Le carte sono {len(cards)}, non 62')
    per = {c: sum(1 for k in cards if k['category_id'] == c) for c in CATEGORY_CARDS}
    for c, n in CATEGORY_CARDS.items():
        if per.get(c) != n:
            errors.append(f'Categoria {c}: {per.get(c)} carte, attese {n}')
    if any(k['category_id'] not in CATEGORY_CARDS for k in cards):
        errors.append('Categoria fuori dalle sei del mazzo v3.0 (le carte G-J non vanno caricate)')
    seen_codes: set[str] = set()
    targets: dict[str, str] = {}
    for k in cards:
        code = k['card_id']
        if not CODE.match(code) or code in seen_codes:
            errors.append(f'{code}: ID non valido o duplicato')
        seen_codes.add(code)
        if not CODE.match(code) or not code.startswith(k['category_id']):
            errors.append(f'{code}: l\'ID non corrisponde alla categoria {k["category_id"]}')
        key = answer_key(k['target'])
        if not key:
            errors.append(f'{code}: bersaglio vuoto')
        if re.search(r'\(.*\)', k['target']):
            errors.append(f'{code}: bersaglio nel formato «A (B)», che concede due soluzioni')
        if key in targets:
            errors.append(f'{code}: bersaglio uguale a quello di {targets[key]}')
        targets[key] = code
        if k['difficulty_initial'] not in (1, 2, 3) or k['difficulty_current'] not in (1, 2, 3):
            errors.append(f'{code}: difficoltà non valida')
        taboo = k['taboo_words']
        keys = [answer_key(w) for w in taboo]
        if len(taboo) != 5 or len(set(keys)) != 5 or '' in keys:
            errors.append(f'{code}: servono esattamente cinque Taboo distinti, ce ne sono {len(set(keys))}')
        if k.get('quality_score') is not None and not 0 <= k['quality_score'] <= 100:
            errors.append(f'{code}: punteggio di qualità fuori da 0-100')
    for k in cards:
        code = k['card_id']
        own = answer_key(k['target'])
        for a in k['accepted_answers']:
            ak = answer_key(a)
            if not ak:
                errors.append(f'{code}: alias vuoto')
            elif ak != own and ak in targets:
                errors.append(f'{code}: l\'alias «{a}» è il bersaglio di {targets[ak]}')
        for w in k['taboo_words']:
            if shares_root(w, k['target']):
                warnings.append(f'{code}: il Taboo «{w}» ha la stessa radice di una parola del bersaglio «{k["target"]}»')
        if not k['accepted_answers'] and 'preautorizzare' in k.get('note', ''):
            warnings.append(f'{code}: la nota chiede alias da preautorizzare, ma non ce n\'è nessuno')
        # Le parole tra «» nelle note sono quasi sempre Taboo sostituiti; contano solo quelle di una nota che parla di alias.
        for quoted in re.findall(r'«(.+?)»', k.get('note', '')) if 'alias' in k.get('note', '').lower() else []:
            if answer_key(quoted) not in {answer_key(a) for a in k['accepted_answers']}:
                warnings.append(f'{code}: la nota cita l\'alias «{quoted}», che non è nella tabella degli alias')
    return errors, warnings


# ---- Database ----

def build_db(deck: dict, path: Path) -> None:
    errors, warnings = validate(deck)
    if errors:
        raise SystemExit('Mazzo non valido:\n - ' + '\n - '.join(errors))
    with closing(sqlite3.connect(path)) as db:
        db.executescript(SCHEMA)
        db.executemany('INSERT INTO livelli VALUES (?,?)', LEVEL_NAME.items())
        db.execute("INSERT INTO stati VALUES (1, 'playtest')")
        db.executemany('INSERT INTO categorie VALUES (?,?,?)', [(i, c, deck['categories'][c]) for i, c in enumerate(sorted(deck['categories']), 1)])
        category = {c: i for i, c in enumerate(sorted(deck['categories']), 1)}
        words: dict[str, int] = {}
        for n, k in enumerate(deck['cards'], 1):
            db.execute('INSERT INTO carte VALUES (?,?,?)', (n, k['card_id'], category[k['category_id']]))
            db.execute('INSERT INTO revisioni VALUES (?,?,?,?,?,?,?,?,?)',
                       (n, n, k['revision'], k['target'], k['difficulty_initial'], k['difficulty_current'], 1, k.get('quality_score'), k.get('note')))
            for pos, w in enumerate(k['taboo_words'], 1):
                if w not in words:
                    words[w] = len(words) + 1
                    db.execute('INSERT INTO parole VALUES (?,?)', (words[w], w))
                db.execute('INSERT INTO revisione_taboo VALUES (?,?,?)', (n, pos, words[w]))
            db.executemany('INSERT INTO risposte VALUES (?,?)', [(n, a) for a in k['accepted_answers']])
            db.executemany('INSERT INTO risposte_escluse VALUES (?,?)', [(n, a) for a in k['excluded_answers']])
        by_code = {k['card_id']: i for i, k in enumerate(deck['cards'], 1)}
        for w in warnings:
            code = w.split(':', 1)[0]
            kind = 'radice' if 'stessa radice' in w else 'alias' if 'alias' in w else 'altro'
            db.execute('INSERT INTO avvisi (revisione, tipo, dettaglio) VALUES (?,?,?)', (by_code[code], kind, w))
        db.executemany('INSERT INTO meta VALUES (?,?)', [('deck_version', deck['deck_version']), ('rules', deck['rules']), ('cards', str(len(deck['cards']))),
                                                         ('verified', 'true')])
        db.commit()
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or db.execute('PRAGMA foreign_key_check').fetchall():
            raise SystemExit('Il database costruito non è integro')


def read_db(path: Path) -> dict:
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        rows = db.execute('SELECT card_id, revision, target, category_id, difficulty_initial, difficulty_current, status, quality_score,'
                          ' taboo_words, accepted_answers FROM mazzo_corrente ORDER BY card_id').fetchall()
        cats = dict(db.execute('SELECT codice, nome FROM categorie'))
        excluded = {c: [t for t, in db.execute('SELECT e.testo FROM risposte_escluse e JOIN revisioni r ON r.n = e.revisione JOIN carte k ON k.n = r.carta'
                                               ' WHERE k.codice = ? ORDER BY e.testo', (c,))] for c, *_ in rows}
        meta = dict(db.execute('SELECT name, value FROM meta'))
    return {'meta': meta, 'categories': cats, 'cards': [
        {'card_id': r[0], 'revision': r[1], 'target': r[2], 'category_id': r[3], 'difficulty_initial': r[4], 'difficulty_current': r[5],
         'status': r[6], 'quality_score': r[7], 'taboo_words': json.loads(r[8]), 'accepted_answers': sorted(json.loads(r[9])),
         'excluded_answers': excluded[r[0]]} for r in rows]}


def verify(deck: dict, path: Path) -> list[str]:
    stored = read_db(path)
    problems: list[str] = []
    if stored['categories'] != deck['categories']:
        problems.append('Categorie diverse dalla fonte')
    by = {k['card_id']: k for k in stored['cards']}
    if set(by) != {k['card_id'] for k in deck['cards']}:
        problems.append('Le carte del database non sono quelle della fonte')
    for k in deck['cards']:
        s = by.get(k['card_id'])
        if s is None:
            continue
        for field in ('revision', 'target', 'category_id', 'difficulty_initial', 'difficulty_current', 'status', 'taboo_words'):
            if s[field] != k[field]:
                problems.append(f'{k["card_id"]}: {field} diverso dalla fonte')
        if s['accepted_answers'] != sorted(k['accepted_answers']) or s['excluded_answers'] != sorted(k['excluded_answers']):
            problems.append(f'{k["card_id"]}: alias diversi dalla fonte')
    if stored['meta'].get('deck_version') != deck['deck_version']:
        problems.append('Versione del mazzo diversa')
    return problems


def replace_atomically(deck: dict, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(suffix='.sqlite3', dir=target.parent)
    os.close(fd)
    temporary = Path(name)
    try:
        temporary.unlink()
        build_db(deck, temporary)
        problems = verify(deck, temporary)
        if problems:
            raise SystemExit('Verifica fallita:\n - ' + '\n - '.join(problems))
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()


def load_source(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('command', choices=['parse', 'validate', 'import', 'verify', 'export'])
    ap.add_argument('--source', type=Path, default=SOURCE)
    ap.add_argument('--rules', type=Path, default=RULES)
    ap.add_argument('--db', type=Path, default=DB)
    ap.add_argument('--csv', type=Path, default=HERE / 'data' / 'mazzo-v3.0.csv')
    args = ap.parse_args(argv)
    if args.command == 'parse':
        deck = parse_rules(args.rules.read_text(encoding='utf-8'))
        args.source.parent.mkdir(parents=True, exist_ok=True)
        args.source.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Scritta la fonte: {args.source} ({len(deck["cards"])} carte)')
        return 0
    deck = load_source(args.source)
    if args.command == 'validate':
        errors, warnings = validate(deck)
        for e in errors:
            print('ERRORE:', e)
        for w in warnings:
            print('AVVISO:', w)
        print(f'{len(deck["cards"])} carte, {len(errors)} errori, {len(warnings)} avvisi')
        return 1 if errors else 0
    if args.command == 'import':
        replace_atomically(deck, args.db)
        _, warnings = validate(deck)
        print(f'Costruito {args.db} ({len(deck["cards"])} carte, {len(warnings)} avvisi editoriali da rivedere)')
        return 0
    if args.command == 'verify':
        problems = verify(deck, args.db)
        for p in problems:
            print('DIVERSO:', p)
        print('Il database coincide con la fonte' if not problems else f'{len(problems)} differenze')
        return 1 if problems else 0
    stored = read_db(args.db)
    with args.csv.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['card_id', 'revision', 'category_id', 'target', 'difficulty_initial', 'difficulty_current', 'status', 'taboo_words', 'accepted_answers'])
        for k in stored['cards']:
            # Un campo che inizia con = + - @ sarebbe una formula in un foglio di calcolo: si neutralizza.
            cells = [k['card_id'], k['revision'], k['category_id'], k['target'], k['difficulty_initial'], k['difficulty_current'], k['status'],
                     ' | '.join(k['taboo_words']), ' | '.join(k['accepted_answers'])]
            writer.writerow([("'" + c) if isinstance(c, str) and c[:1] in '=+-@' else c for c in cells])
    print(f'Esportato {args.csv}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
