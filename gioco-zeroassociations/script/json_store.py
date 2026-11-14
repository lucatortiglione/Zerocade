"""Documenti JSON compatti nelle tabelle dei risultati del DB di lavoro (14/11/2026, DIRETTIVE.md §1, §3).

Ogni tabella di SPECS diventa:
- una tabella compatta, <nome>_rows o simile, con le stesse colonne tranne i documenti;
- un dizionario dei documenti in JSONB, il formato binario di SQLite: ogni documento distinto una volta sola,
  la riga ne porta il numero (per i token NLP, tutti diversi, solo il JSONB nella riga);
- una vista con il nome e le colonne di prima, che restituisce i documenti come testo JSON, e i trigger per
  scrivere e cancellare da lì.
Chi legge e chi scrive non cambia. Il testo che torna è il JSON minimo (senza spazi, caratteri non ASCII in
chiaro invece di \\u…): lo stesso contenuto, non per forza gli stessi caratteri. Per questo le attestazioni
dell'inventario, su cui si calcolano impronte del testo, hanno regole proprie (prompt_inventory_schema.sql).

compact(con, nome) converte la tabella del formato di prima (se c'è) e crea gli oggetti mancanti; gli strumenti
lo chiamano dopo il loro DDL, così anche un DB nuovo nasce compatto.
"""
from __future__ import annotations

import re
import sqlite3

FLAG = 'INTEGER NOT NULL CHECK({0} IN (0,1))'

# Colonne nell'ordine di prima. Un documento: (colonna di prima, colonna nuova, NULL ammesso, nel dizionario).
SPECS = {
    'raw__context_evaluation_terms': {
        'rows': 'raw__context_evaluation_term_rows', 'docs': 'raw__context_evaluation_details',
        'columns': [('run', 'INTEGER NOT NULL REFERENCES raw__context_evaluation_runs(n)'), ('prompt', 'TEXT NOT NULL'),
                    ('secret_code', 'INTEGER NOT NULL REFERENCES raw__context_evaluation_codes(n)'),
                    ('guess_code', 'INTEGER NOT NULL REFERENCES raw__context_evaluation_codes(n)')]
                   + [(c, FLAG.format(c)) for c in ('in_inventory', 'livecade', 'current_secret', 'current_vocab',
                                                    'fasttext', 'numberbatch')]
                   + [('details_json', ('details', True, True))],
        'key': ('run', 'prompt'), 'extra': ''},
    'raw__nlp_db_audit_words': {
        'rows': 'raw__nlp_db_audit_word_rows', 'docs': 'raw__nlp_db_audit_results',
        'columns': [('run_id', 'TEXT NOT NULL REFERENCES raw__nlp_db_audit_runs(id)'), ('word', 'TEXT NOT NULL'),
                    ('result_json', ('result', False, True))],
        'key': ('run_id', 'word'), 'extra': ''},
    'raw__word_utility_results': {
        'rows': 'raw__word_utility_result_rows', 'docs': 'raw__word_utility_documents',
        'columns': [('run_id', 'TEXT NOT NULL REFERENCES raw__word_utility_runs(id)'), ('word', 'TEXT NOT NULL'),
                    ('features_json', ('features', False, True)), ('verdicts_json', ('verdicts', False, True))],
        'key': ('run_id', 'word'), 'extra': ''},
    'raw__nlp_analyses': {
        'rows': 'raw__nlp_analysis_rows', 'docs': None,
        'columns': [('id', 'TEXT NOT NULL'), ('model_id', 'TEXT NOT NULL REFERENCES raw__nlp_models(id)'),
                    ('context', 'TEXT NOT NULL'),
                    ('scope', "TEXT NOT NULL CHECK(scope IN ('contextual','isolated'))"),
                    ('tokens_json', ('tokens', False, False)), ('analyzed_at', 'TEXT NOT NULL')],
        'key': ('id',), 'extra': ',UNIQUE(model_id,context,scope)'},
}


def documents(spec):
    return [(old, new, nullable, shared) for old, decl in spec['columns'] if isinstance(decl, tuple)
            for new, nullable, shared in [decl]]


def stored_columns(spec):
    return [decl[0] if isinstance(decl, tuple) else name for name, decl in spec['columns']]


def ddl(name: str) -> str:
    """Dizionario, tabella compatta, vista con il nome di prima e trigger; tutto IF NOT EXISTS."""
    spec, docs = SPECS[name], SPECS[name]['docs']
    out = []
    if docs:
        out.append(f'CREATE TABLE IF NOT EXISTS {docs}(\n n INTEGER PRIMARY KEY, doc BLOB NOT NULL UNIQUE '
                   f'CHECK(json_valid(doc,4))\n) STRICT;')
    cols = []
    for old, decl in spec['columns']:
        if not isinstance(decl, tuple):
            cols.append(f' {old} {decl}')
            continue
        new, nullable, shared = decl
        null = '' if nullable else ' NOT NULL'
        cols.append(f' {new} INTEGER{null} REFERENCES {docs}(n)' if shared else
                    f' {new} BLOB{null} CHECK({new} IS NULL OR json_valid({new},4))')
    out.append(f'CREATE TABLE IF NOT EXISTS {spec["rows"]}(\n' + ',\n'.join(cols) +
               f',\n PRIMARY KEY({",".join(spec["key"])}){spec["extra"]}\n) STRICT, WITHOUT ROWID;')
    select, joins = [], []
    for i, (old, decl) in enumerate(spec['columns']):
        if not isinstance(decl, tuple):
            select.append(f't.{old}')
        elif decl[2]:
            select.append(f'json(d{i}.doc) AS {old}')
            joins.append(f' LEFT JOIN {docs} d{i} ON d{i}.n=t.{decl[0]}')
        else:
            select.append(f'json(t.{decl[0]}) AS {old}')
    out.append(f'CREATE VIEW IF NOT EXISTS {name} AS\n SELECT {",".join(select)}\n FROM {spec["rows"]} t'
               + ''.join(joins) + ';')
    body = [f' INSERT INTO {docs}(doc) SELECT jsonb(NEW.{old}) WHERE NEW.{old} IS NOT NULL\n'
            f'  AND NOT EXISTS(SELECT 1 FROM {docs} WHERE doc=jsonb(NEW.{old}));'
            for old, _, _, shared in documents(spec) if shared]
    values = []
    for old, decl in spec['columns']:
        if not isinstance(decl, tuple):
            values.append(f'NEW.{old}')
        elif decl[2]:
            values.append(f'(SELECT n FROM {docs} WHERE doc=jsonb(NEW.{old}))')
        else:
            values.append(f'jsonb(NEW.{old})')
    body.append(f' INSERT INTO {spec["rows"]}({",".join(stored_columns(spec))})\n  VALUES ({",".join(values)});')
    out.append(f'CREATE TRIGGER IF NOT EXISTS {name}__insert INSTEAD OF INSERT ON {name} BEGIN\n'
               + '\n'.join(body) + '\nEND;')
    where = ' AND '.join(f'{k}=OLD.{k}' for k in spec['key'])
    out.append(f'CREATE TRIGGER IF NOT EXISTS {name}__delete INSTEAD OF DELETE ON {name} BEGIN\n'
               f' DELETE FROM {spec["rows"]} WHERE {where};\nEND;')
    return '\n'.join(out) + '\n'


def conversion(name: str) -> str:
    """Le righe della tabella di prima nella forma compatta; poi la tabella lascia il posto alla vista."""
    spec, docs = SPECS[name], SPECS[name]['docs']
    tables = ddl(name).split('CREATE VIEW')[0]
    sql = [tables]
    for old, _, _, shared in documents(spec):
        if shared:
            sql.append(f'INSERT INTO {docs}(doc) SELECT DISTINCT jsonb({old}) FROM {name} o WHERE {old} IS NOT NULL\n'
                       f' AND NOT EXISTS(SELECT 1 FROM {docs} d WHERE d.doc=jsonb(o.{old}));')
    values = []
    for old, decl in spec['columns']:
        if not isinstance(decl, tuple):
            values.append(f'o.{old}')
        elif decl[2]:
            values.append(f'(SELECT n FROM {docs} d WHERE d.doc=jsonb(o.{old}))')
        else:
            values.append(f'jsonb(o.{old})')
    sql.append(f'INSERT INTO {spec["rows"]}({",".join(stored_columns(spec))})\n'
               f' SELECT {",".join(values)} FROM {name} o;')
    sql.append(f'DROP TABLE {name};')
    return '\n'.join(sql) + '\n'


def quote(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


def children(con: sqlite3.Connection, name: str) -> list[tuple[str, str]]:
    """Le tabelle con una chiave esterna verso `name`, con il loro CREATE."""
    found = []
    for table, sql in con.execute("SELECT name,sql FROM sqlite_schema WHERE type='table' AND sql IS NOT NULL").fetchall():
        if any(fk[2] == name for fk in con.execute(f'PRAGMA foreign_key_list({quote(table)})')):
            found.append((table, sql))
    return found


def compact(con: sqlite3.Connection, name: str) -> bool:
    """Porta la tabella `name` (prefissata, nel DB di `con`) alla forma compatta; True se l'ha convertita.

    Senza la tabella di prima né la vista non fa nulla: la crea il DDL dello strumento che la usa.
    Una vista non può essere il padre di una chiave esterna: le tabelle figlie passano alla tabella compatta,
    con la procedura di SQLite per i cambi di schema che non toccano i dati salvati (writable_schema: cambia solo
    il nome nel REFERENCES). Tutte le chiavi esterne si controllano prima del COMMIT; un errore annulla tutto."""
    found = con.execute('SELECT type FROM sqlite_schema WHERE name=?', (name,)).fetchone()
    if found is None:
        return False
    converted = found[0] == 'table'
    spec = SPECS[name]
    script = ['PRAGMA foreign_keys=OFF;', 'BEGIN IMMEDIATE;', conversion(name) if converted else '', ddl(name)]
    if converted:
        kids = children(con, name)
        if kids:
            script.append('PRAGMA writable_schema=ON;')
            for table, sql in kids:
                retargeted = re.sub(r'(REFERENCES\s+)"?' + re.escape(name) + r'"?(\s*\()', r'\g<1>' + spec['rows'] + r'\2', sql)
                script.append(f"UPDATE sqlite_schema SET sql={quote(retargeted)} WHERE type='table' AND name={quote(table)};")
            script.append('PRAGMA writable_schema=RESET;')
        checks = [spec['rows']] + [table for table, _ in kids]
        script.append('CREATE TEMP TABLE json_store_guard(ok INTEGER NOT NULL CHECK(ok=1));')
        script.append('INSERT INTO json_store_guard SELECT ' + ' AND '.join(
            f'NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check({quote(t)}))' for t in checks) + ';')
        script.append('DROP TABLE temp.json_store_guard;')
    script.append('COMMIT;')
    enforced = con.execute('PRAGMA foreign_keys').fetchone()[0]
    try:
        con.executescript('\n'.join(script) + '\n')
    except BaseException:
        if con.in_transaction:
            con.rollback()
        raise
    finally:
        con.execute('PRAGMA foreign_keys=' + ('ON' if enforced else 'OFF'))
    return converted
