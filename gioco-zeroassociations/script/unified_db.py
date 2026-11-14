"""Il DB unico di ZeroAssociazioni: database/parole_ita_raw.sqlite3, uno "schema" per ognuno dei sei DB storici.

SQLite non ha schemi dentro un file: qui lo schema è il prefisso `<schema>__` delle tabelle, degli
indici, delle viste e dei trigger. Gli schemi (e il file storico da cui vengono):

  raw       la raccolta, database operativo, con l'inventario lessicale  (prompt_raw.sqlite3)
  game      i bacini verificati: viste sugli oggetti di raw              (prompt.sqlite3)
  validi    prompt validati con le parole associate                     (prompt_validi.sqlite3)
  filtrati  candidati e filtri                                          (prompt_filtrati.sqlite3)
  finale    prompt, parole e collegamenti della lavorazione finale      (prompt_finale.sqlite3)
  scartati  scarti, con il motivo                                       (prompt_scartati.sqlite3)
  candidati i buoni prompt scelti fra i filtrati                        (nato nel DB unico)

Uno schema si indica come `database/parole_ita_raw.sqlite3#raw` (address('raw')), la stessa scrittura del
server: gli strumenti lo passano come un percorso, e le istruzioni SQL, scritte con i nomi senza prefisso,
vengono riscritte al volo (riscrivi). Il vecchio nome del file (`prompt_raw.sqlite3`, …) indica ancora lo
stesso schema, perché i metadati e le ricevute già scritti lo contengono; same_db li riconosce uguali. Un file
con un altro nome (le copie temporanee, i test) resta un normale DB a sé. Con ZEROASSOC_DB=legacy un
indirizzo torna al vecchio file del suo schema (file_of).

I sei file storici non ci sono più (13/11/2026). Il DB unico quindi non si ricostruisce più da quei file, e
verify confronta solo gli schemi la cui origine è ancora un file a sé. Va tenuta una copia di sicurezza del DB
unico.

Comandi:
  python script/unified_db.py build [--replace]  crea il DB unico copiando i sei DB (servono tutti e sei i file)
  python script/unified_db.py verify             confronta ogni tabella con il suo file d'origine, se c'è ancora
  python script/unified_db.py status             schemi, oggetti, righe e dimensioni
  python script/unified_db.py export SCHEMA OUT  scrive uno schema come DB a sé (senza prefissi)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
# I DB stanno nella cartella dei DB del repository (database/), non accanto agli script.
DB_DIR = ROOT.parent / 'database'
# ZEROASSOC_UNIFIED sposta il DB unico (per provare le scritture su una copia).
UNIFIED = Path(os.environ.get('ZEROASSOC_UNIFIED') or DB_DIR / 'parole_ita_raw.sqlite3')
SEP = '__'

# Il file storico -> lo schema del DB unico. Gli strumenti indicano gli schemi con address(); questi nomi restano
# validi per i percorsi già scritti nei metadati e nelle ricevute.
SCHEMAS = {
    'prompt_raw.sqlite3': 'raw',
    'prompt.sqlite3': 'game',
    'prompt_validi.sqlite3': 'validi',
    'prompt_filtrati.sqlite3': 'filtrati',
    'prompt_finale.sqlite3': 'finale',
    'prompt_scartati.sqlite3': 'scartati',
    # Nato nel DB unico (13/11/2026), senza un file storico: i candidati scelti fra i filtrati.
    'prompt_candidati.sqlite3': 'candidati',
}
FILES = {schema: name for name, schema in SCHEMAS.items()}
REGISTRY = ('zerodb_meta', 'zerodb_schemas', 'zerodb_objects')

IDENT = r'[A-Za-z_][A-Za-z0-9_]*'
TOKEN = re.compile(
    r"""'[^']*(?:''[^']*)*'      # testo
       |"[^"]*(?:""[^"]*)*"       # identificatore tra virgolette
       |--[^\n]*|/\*.*?\*/        # commenti
       |(?P<q>""" + IDENT + r""")\.(?P<n>""" + IDENT + r""")   # qualificatore.nome
       |(?P<w>""" + IDENT + r""")                              # parola
       |\s+|.""",
    re.S | re.X,
)
CREATE = re.compile(
    r'\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|VIEW|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?(' + IDENT + r')', re.I)
ATTACH = re.compile(r'\bATTACH\s+(?:DATABASE\s+)?(.+?)\s+AS\s+(' + IDENT + r')\s*;', re.I | re.S)
HEXNAME = re.compile(r"((?:tbl_)?name\s*=\s*)CAST\s*\(\s*X'([0-9A-Fa-f]*)'\s+AS\s+TEXT\s*\)", re.I)
HEXTEXT = re.compile(r"CAST\s*\(\s*X'([0-9A-Fa-f]*)'\s+AS\s+TEXT\s*\)", re.I)


def address(schema: str) -> Path:
    """Come si indica uno schema del DB unico: `<DB unico>#<schema>`, per esempio
    database/parole_ita_raw.sqlite3#raw (la stessa scrittura del server). Gli strumenti lo passano come un percorso."""
    if schema not in FILES:
        raise ValueError(f'Schema sconosciuto: {schema}')
    return UNIFIED.parent / f'{UNIFIED.name}#{schema}'


def schema_of(path) -> str | None:
    """Lo schema indicato da `path`, altrimenti None. Vale l'indirizzo `<DB unico>#<schema>` (anche come URI
    file:, dove # diventa %23) e vale ancora il vecchio nome del file (nella cartella dei DB, o accanto agli script
    dove stava prima): lo usano i metadati e le ricevute già scritti."""
    text = str(path)
    if text.startswith('file:'):
        text = unquote(text.split('?')[0].removeprefix('file:').lstrip('/'))
    if '#' in text:
        file, _, schema = text.rpartition('#')
        try:
            same = Path(file).resolve() == UNIFIED.resolve()
        except OSError:
            return None
        return schema if same and schema in FILES else None
    try:
        p = Path(text).resolve()
    except OSError:
        return None
    return SCHEMAS.get(p.name) if p.parent in (DB_DIR.resolve(), ROOT) else None


def file_of(path) -> Path:
    """Il file da aprire quando il DB unico non si usa (ZEROASSOC_DB=legacy): per un indirizzo, il vecchio file del
    suo schema nella cartella dei DB; per ogni altro percorso, il percorso stesso."""
    text = str(path)
    if '#' in Path(text).name:
        file, _, schema = text.rpartition('#')
        if Path(file).name == UNIFIED.name and schema in FILES:
            return Path(file).parent / FILES[schema]
    return Path(path)


def sibling(path, schema: str) -> Path:
    """Il DB `schema` che accompagna `path`: lo schema del DB unico, se `path` ne indica uno; altrimenti il file
    con il nome storico dello schema nella stessa cartella (le copie a sé e i test)."""
    return address(schema) if schema_of(path) else Path(path).with_name(FILES[schema])


def same_db(a, b) -> bool:
    """`a` e `b` indicano lo stesso DB: lo stesso schema (con l'indirizzo o con il vecchio nome) o lo stesso file."""
    sa, sb = schema_of(a), schema_of(b)
    if sa or sb:
        return sa == sb
    return Path(a).resolve() == Path(b).resolve()


def exists(path) -> bool:
    """Il DB c'è: come schema del DB unico, oppure come file."""
    schema = schema_of(path) if active() else None
    if schema:
        return bool(objects_of(schema))
    return file_of(path).exists()


def active() -> bool:
    """Il DB unico va usato al posto dei vecchi file."""
    if os.environ.get('ZEROASSOC_DB', '').lower() == 'legacy' or not UNIFIED.exists():
        return False
    return _state().get('verified') == '1'


_cache: dict = {}


def _state() -> dict:
    key = (UNIFIED.stat().st_mtime_ns, UNIFIED.stat().st_size) if UNIFIED.exists() else None
    if _cache.get('key') != key:
        _cache.clear()
        _cache['key'] = key
        meta: dict = {}
        objects: dict[str, set[str]] = {}
        if key:
            try:
                con = sqlite3.connect(f'file:{UNIFIED.as_posix()}?mode=ro', uri=True)
                meta = dict(con.execute('SELECT name,value FROM zerodb_meta'))
                for schema, name in con.execute('SELECT schema,name FROM zerodb_objects'):
                    objects.setdefault(schema, set()).add(name)
                con.close()
            except sqlite3.Error:
                meta, objects = {}, {}
        _cache.update(meta=meta, objects=objects)
    return {**_cache['meta'], '_objects': _cache['objects']}


def objects_of(schema: str) -> set[str]:
    return set(_state()['_objects'].get(schema, ()))


def prefixed(schema: str, name: str) -> str:
    return f'{schema}{SEP}{name}'


def riscrivi(sql: str, schema: str | None, names: set[str] | None = None, aliases: dict[str, str] | None = None,
             in_unified: bool = True) -> str:
    """L'SQL scritto con i nomi senza prefisso, riscritto per il DB unico.

    `schema`: lo schema a cui si riferiscono i nomi senza qualificatore (None: nessuno, il DB principale
    non è quello unico). `aliases`: gli alias di ATTACH -> schema. `in_unified`: i nomi qualificati con un
    alias stanno nel DB principale (vanno solo prefissati) oppure in un DB attaccato (alias.schema__nome).
    """
    aliases = aliases or {}
    names = names if names is not None else (objects_of(schema) if schema else set())
    if schema and names:
        # I nomi passati come CAST(X'…' AS TEXT) (sqlite_prompt_runtime.literal): ricerche per nome nello schema.
        def hexname(m: re.Match) -> str:
            try:
                name = bytes.fromhex(m.group(2)).decode('utf-8')
            except ValueError:
                return m.group(0)
            if name not in names:
                return m.group(0)
            return f"{m.group(1)}CAST(X'{prefixed(schema, name).encode('utf-8').hex().upper()}' AS TEXT)"
        sql = HEXNAME.sub(hexname, sql)
    out: list[str] = []
    last: list[str] = []  # ultimi token significativi, per i nomi dentro i testi (name = 'x')

    def prefix_for(qual: str | None) -> tuple[str | None, str | None]:
        """(schema dei nomi, qualificatore da conservare)."""
        if qual is None or qual.lower() == 'main':
            return schema, None
        if qual in aliases:
            return aliases[qual], (None if in_unified else qual)
        return None, qual

    for m in TOKEN.finditer(sql):
        tok = m.group(0)
        if m.group('w'):
            if schema and tok in names and not (last and last[-1] == 'as'):
                tok = prefixed(schema, tok)
            last = (last + [m.group('w').lower()])[-3:]
        elif m.group('q'):
            qual, name = m.group('q'), m.group('n')
            target, keep = prefix_for(qual)
            if target and name in objects_of(target):
                tok = (keep + '.' if keep else '') + prefixed(target, name)
            elif target is None and schema and qual in names:  # tabella.colonna
                tok = f'{prefixed(schema, qual)}.{name}'
            last = (last + [name.lower()])[-3:]
        elif tok.startswith('"') and schema:
            inner = tok[1:-1].replace('""', '"')
            if inner in names:
                tok = '"' + prefixed(schema, inner) + '"'
        elif tok.startswith("'") and schema and tok != "''":
            inner = tok[1:-1].replace("''", "'")
            # Solo le ricerche per nome nello schema del DB (name = 'tabella').
            if inner in names and len(last) >= 2 and last[-1] == '=' and last[-2] in ('name', 'tbl_name'):
                tok = "'" + prefixed(schema, inner) + "'"
        elif not tok.isspace() and not tok.startswith(('--', '/*')):
            last = (last + [tok])[-3:]
        out.append(tok)
    return ''.join(out)


def deprefix(text: str, schema: str) -> str:
    """Il contrario di riscrivi, per i dump SQL: `raw__prompts` -> `prompts`."""
    return re.sub(rf'\b{re.escape(schema)}{SEP}(?=[A-Za-z_])', '', text)


def prepare_sql(sql: str, schema: str | None, aliases: dict[str, str] | None = None,
                main_is_unified: bool = False) -> tuple[str, dict[str, str]]:
    """Riscrive un blocco di SQL (anche con più istruzioni). Gestisce ATTACH e le nuove CREATE.

    Restituisce l'SQL pronto e gli alias noti. Un ATTACH di un vecchio DB diventa: niente (il DB principale è
    già quello unico) oppure un ATTACH del DB unico con lo stesso alias.
    """
    aliases = dict(aliases or {})
    names = set(objects_of(schema)) if schema else set()
    for m in CREATE.finditer(sql):
        if schema and not re.search(r'\bTEMP(?:ORARY)?\b', sql[max(0, m.start() - 30):m.start() + 20], re.I):
            names.add(m.group(1))

    def attach(m: re.Match) -> str:
        expr, alias = m.group(1).strip(), m.group(2)
        hexed = HEXTEXT.fullmatch(expr)
        target = bytes.fromhex(hexed.group(1)).decode('utf-8') if hexed else (
            expr[1:-1].replace("''", "'") if expr.startswith("'") and expr.endswith("'") else None)
        other = schema_of(target) if target and active() else None
        if other is None:
            return m.group(0)
        aliases[alias] = other
        if main_is_unified:
            return ''  # lo stesso file: i nomi con l'alias vengono prefissati e basta
        mode = '?mode=ro' if 'mode=ro' in target else ''
        # Text for sqlite3.exe, which has no parameters: an apostrophe in the path is doubled.
        path = (UNIFIED.resolve().as_uri() + mode if mode else UNIFIED.as_posix()).replace("'", "''")
        return f"ATTACH DATABASE '{path}' AS {alias};"

    sql = ATTACH.sub(attach, sql)
    return riscrivi(sql, schema, names, aliases, in_unified=main_is_unified), aliases


# --- connessioni Python ---------------------------------------------------------------------------

class _Cursor(sqlite3.Cursor):
    def execute(self, sql, *args):
        return super().execute(self.connection.rewrite(sql), *args)

    def executemany(self, sql, *args):
        return super().executemany(self.connection.rewrite(sql), *args)

    def executescript(self, script):
        return super().executescript(self.connection.rewrite(script))


class Connection(sqlite3.Connection):
    """Una connessione al DB unico che accetta l'SQL scritto per un vecchio DB (nomi senza prefisso)."""
    schema: str | None = None
    aliases: dict[str, str]

    def rewrite(self, sql: str) -> str:
        sql, self.aliases = prepare_sql(sql, self.schema, getattr(self, 'aliases', {}), main_is_unified=True)
        return sql

    def execute(self, sql, *args):
        return super().execute(self.rewrite(sql), *args)

    def executemany(self, sql, *args):
        return super().executemany(self.rewrite(sql), *args)

    def executescript(self, script):
        return super().executescript(self.rewrite(script))

    def cursor(self, factory=_Cursor):
        return super().cursor(factory)


def connect(path, *, readonly: bool = False, uri: bool = False, **kwargs) -> sqlite3.Connection:
    """sqlite3.connect che, per un vecchio percorso, apre lo schema corrispondente del DB unico.

    `path` può essere un percorso o un URI `file:…?mode=ro` (uri=True). Per ogni altro file è sqlite3.connect.
    """
    schema = schema_of(path) if active() else None
    if schema is None:
        return sqlite3.connect(path if uri else file_of(path), uri=uri, **kwargs)
    target = f'file:{UNIFIED.as_posix()}' + ('?mode=ro' if readonly or 'mode=ro' in str(path) else '')
    con = sqlite3.connect(target, uri=True, factory=Connection, **kwargs)
    con.schema = schema
    con.aliases = {}
    return con


# --- costruzione e verifica ----------------------------------------------------------------------

def _objects(con: sqlite3.Connection) -> list[tuple[str, str, str, str]]:
    return con.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL"
    ).fetchall()


def insertable(con: sqlite3.Connection, table: str, qualifier: str = '') -> str:
    """Le colonne da copiare, senza quelle generate (che SQLite non permette di scrivere)."""
    q = f'"{qualifier}".' if qualifier else ''
    cols = [r[1] for r in con.execute(f'PRAGMA {q}table_xinfo("{table}")') if r[6] in (0,)]
    return ','.join(f'"{c}"' for c in cols)


def build(replace: bool = False, sources: dict[str, Path] | None = None, output: Path = UNIFIED) -> dict:
    sources = sources or {schema: DB_DIR / name for name, schema in SCHEMAS.items()}
    if any(Path(p).resolve() == Path(output).resolve() for p in sources.values()):
        raise SystemExit(f"{Path(output).name} è il DB unico e anche l'origine di uno schema: "
                         'non si ricostruisce dai vecchi file (per uno schema solo, import_schema)')
    missing = [str(p) for p in sources.values() if not Path(p).exists()]
    if missing:
        raise SystemExit('DB mancanti: ' + ', '.join(missing))
    if output.exists():
        if not replace:
            raise SystemExit(f'{output.name} esiste già: usare --replace per ricostruirlo')
    fd, tmp = tempfile.mkstemp(prefix=output.name + '.', suffix='.part', dir=output.parent)
    os.close(fd)
    Path(tmp).unlink()
    report: dict = {'schemas': {}}
    out = sqlite3.connect(tmp, isolation_level=None, uri=True)
    try:
        out.execute('PRAGMA journal_mode=OFF')
        out.execute('PRAGMA synchronous=OFF')
        out.execute('PRAGMA foreign_keys=OFF')
        out.executescript(
            'CREATE TABLE zerodb_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;'
            'CREATE TABLE zerodb_schemas(name TEXT PRIMARY KEY, source_file TEXT NOT NULL, source_bytes INTEGER NOT NULL,'
            ' source_mtime TEXT NOT NULL, copied_at TEXT NOT NULL) STRICT;'
            'CREATE TABLE zerodb_objects(schema TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, tbl_name TEXT NOT NULL,'
            ' rows INTEGER, PRIMARY KEY(schema,name)) STRICT;')
        for schema, src_path in sources.items():
            src_path = Path(src_path)
            src = sqlite3.connect(f'file:{src_path.as_posix()}?mode=ro', uri=True)
            objs = _objects(src)
            by_type = {k: [o for o in objs if o[0] == k] for k in ('table', 'view', 'index', 'trigger')}
            names = {n for t, n, *_ in objs}
            # I nomi di colonna non devono coincidere con i nomi degli oggetti: la riscrittura è per parola.
            for (t, table, _, _sql) in by_type['table']:
                cols = {r[1] for r in src.execute(f'PRAGMA table_info("{table}")')}
                clash = cols & names
                if clash:
                    raise SystemExit(f'{src_path.name}: la tabella {table} ha colonne che si chiamano come oggetti: {sorted(clash)}')
            rewrite = lambda sql: riscrivi(sql, schema, names)  # noqa: E731
            counts = {}
            out.execute('BEGIN')
            for _, name, tbl, sql in by_type['table']:
                out.execute(rewrite(sql))
            out.execute('COMMIT')
            # The path as a parameter, as a URI: an apostrophe or a # in a folder name does not break the SQL.
            out.execute('ATTACH DATABASE ? AS src', (Path(src_path).resolve().as_uri() + '?mode=ro',))
            out.execute('BEGIN')
            for _, name, *_r in by_type['table']:
                cols = insertable(out, prefixed(schema, name))
                out.execute(f'INSERT INTO "{prefixed(schema, name)}"({cols}) SELECT {cols} FROM src."{name}"')
                counts[name] = out.execute(f'SELECT count(*) FROM "{prefixed(schema, name)}"').fetchone()[0]
            out.execute('COMMIT')
            out.execute('DETACH DATABASE src')
            out.execute('BEGIN')
            for kind in ('index', 'view', 'trigger'):  # dopo i dati: i trigger non scattano durante la copia
                for _, name, tbl, sql in by_type[kind]:
                    out.execute(rewrite(sql))
            for t, name, tbl, _sql in objs:
                out.execute('INSERT INTO zerodb_objects VALUES(?,?,?,?,?)',
                            (schema, name, t, tbl, counts.get(name) if t == 'table' else None))
            st = src_path.stat()
            out.execute('INSERT INTO zerodb_schemas VALUES(?,?,?,?,?)', (
                schema, src_path.name, st.st_size, datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                datetime.now(timezone.utc).isoformat()))
            out.execute('COMMIT')
            src.close()
            report['schemas'][schema] = {'tables': len(by_type['table']), 'rows': sum(counts.values())}
        out.execute("INSERT INTO zerodb_meta VALUES('built_at',?)", (datetime.now(timezone.utc).isoformat(),))
        out.execute("INSERT INTO zerodb_meta VALUES('verified','0')")
        out.execute('PRAGMA journal_mode=DELETE')
        out.close()
        os.replace(tmp, output)
    finally:
        try:
            out.close()
        except sqlite3.Error:
            pass
        Path(tmp).unlink(missing_ok=True)
    return report


def _digest(con: sqlite3.Connection, table: str) -> tuple[int, str]:
    """Numero di righe e impronta dell'intero contenuto."""
    cols = insertable(con, table)
    h = hashlib.sha256()
    n = 0
    # Nell'ordine di scansione: la copia è fatta con INSERT … SELECT, che lo conserva.
    for row in con.execute(f'SELECT {cols} FROM "{table}"'):
        h.update(repr(row).encode('utf-8'))
        n += 1
    return n, h.hexdigest()


def verify(unified: Path = UNIFIED, *, deep: bool = True, mark: bool = True) -> dict:
    """Ogni tabella del DB unico deve avere le stesse righe del file d'origine, se quel file c'è ancora.

    Un'origine cancellata, o il cui nome è passato al DB unico stesso, non si confronta (`skipped`)."""
    con = sqlite3.connect(f'file:{unified.as_posix()}?mode=ro', uri=True)
    result: dict = {'tables': {}, 'problems': [], 'skipped': []}
    for schema, file in con.execute('SELECT name,source_file FROM zerodb_schemas').fetchall():
        origin = unified.parent / file
        if not origin.exists() or origin.resolve() == unified.resolve():
            result['skipped'].append(schema)
            continue
        src = sqlite3.connect(f'file:{origin.as_posix()}?mode=ro', uri=True)
        tables = [n for t, n, *_ in _objects(src) if t == 'table']
        for table in tables:
            a = src.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
            b = con.execute(f'SELECT count(*) FROM "{prefixed(schema, table)}"').fetchone()[0]
            same = a == b
            if same and deep and a:
                same = _digest(src, table) == _digest(con, prefixed(schema, table))
            result['tables'][f'{schema}.{table}'] = {'rows': b, 'ok': same}
            if not same:
                result['problems'].append(f'{schema}.{table}: origine {a} righe, DB unico {b} (o contenuto diverso)')
        have = {n for (n,) in con.execute("SELECT name FROM zerodb_objects WHERE schema=? AND type='table'", (schema,))}
        if have != set(tables):
            result['problems'].append(f'{schema}: tabelle diverse {sorted(have ^ set(tables))}')
        src.close()
    bad = con.execute('PRAGMA foreign_key_check').fetchall()
    if bad:
        result['problems'].append(f'foreign_key_check: {len(bad)} violazioni')
    con.close()
    result['ok'] = not result['problems']
    if mark and result['ok']:
        rw = sqlite3.connect(unified)
        rw.execute("UPDATE zerodb_meta SET value='1' WHERE name='verified'")
        rw.execute("INSERT OR REPLACE INTO zerodb_meta VALUES('verified_at',?)", (datetime.now(timezone.utc).isoformat(),))
        rw.commit()
        rw.close()
    return result


def import_schema(source: Path, schema: str, unified: Path = UNIFIED) -> dict:
    """Sostituisce lo schema `schema` con il contenuto del DB `source` (una copia appena ricostruita)."""
    src = sqlite3.connect(f'file:{Path(source).as_posix()}?mode=ro', uri=True)
    objs = _objects(src)
    by_type = {k: [o for o in objs if o[0] == k] for k in ('table', 'view', 'index', 'trigger')}
    names = {n for t, n, *_ in objs}
    con = sqlite3.connect(unified, isolation_level=None, uri=True)
    con.execute('PRAGMA foreign_keys=OFF')
    # The path as a parameter, as a URI: an apostrophe or a # in a folder name does not break the SQL.
    con.execute('ATTACH DATABASE ? AS src', (Path(source).resolve().as_uri() + '?mode=ro',))
    counts = {}
    try:
        con.execute('BEGIN IMMEDIATE')
        old = con.execute('SELECT name,type FROM zerodb_objects WHERE schema=?', (schema,)).fetchall()
        for kind in ('trigger', 'view', 'index', 'table'):
            for name, t in old:
                if t == kind:
                    con.execute(f'DROP {kind.upper()} IF EXISTS "{prefixed(schema, name)}"')
        con.execute('DELETE FROM zerodb_objects WHERE schema=?', (schema,))
        rewrite = lambda sql: riscrivi(sql, schema, names)  # noqa: E731
        for _t, name, _tbl, sql in by_type['table']:
            con.execute(rewrite(sql))
        for _t, name, *_r in by_type['table']:
            cols = insertable(con, prefixed(schema, name))
            con.execute(f'INSERT INTO "{prefixed(schema, name)}"({cols}) SELECT {cols} FROM src."{name}"')
            counts[name] = con.execute(f'SELECT count(*) FROM "{prefixed(schema, name)}"').fetchone()[0]
        for kind in ('index', 'view', 'trigger'):
            for _t, name, tbl, sql in by_type[kind]:
                con.execute(rewrite(sql))
        for t, name, tbl, _sql in objs:
            con.execute('INSERT INTO zerodb_objects VALUES(?,?,?,?,?)', (schema, name, t, tbl, counts.get(name) if t == 'table' else None))
        con.execute('UPDATE zerodb_schemas SET copied_at=? WHERE name=?', (datetime.now(timezone.utc).isoformat(), schema))
        con.execute('COMMIT')
    except BaseException:
        if con.in_transaction:
            con.execute('ROLLBACK')
        raise
    finally:
        con.close()
        src.close()
    _cache.clear()
    return {'schema': schema, 'rows': sum(counts.values())}


def link_schema(schema: str, source: str, names: list[str], unified: Path = UNIFIED) -> dict:
    """Lo schema `schema` diventa una vista per ognuno degli oggetti `names` dello schema `source` dello stesso file
    (`schema__x` AS SELECT * FROM `source__x`): le stesse righe, sempre aggiornate, senza copiarle. Gli oggetti di
    prima dello schema spariscono, nella stessa transazione."""
    con = sqlite3.connect(unified, isolation_level=None)
    try:
        con.execute('PRAGMA foreign_keys=OFF')
        con.execute('BEGIN IMMEDIATE')
        try:
            kinds = dict(con.execute('SELECT name,type FROM zerodb_objects WHERE schema=?', (source,)))
            missing = [n for n in names if kinds.get(n) not in ('table', 'view')]
            if missing:
                raise ValueError(f'{source}: nessuna tabella o vista {", ".join(missing)}')
            old = con.execute('SELECT name,type FROM zerodb_objects WHERE schema=?', (schema,)).fetchall()
            for kind in ('trigger', 'view', 'index', 'table'):
                for name, t in old:
                    if t == kind:
                        con.execute(f'DROP {kind.upper()} IF EXISTS "{prefixed(schema, name)}"')
            con.execute('DELETE FROM zerodb_objects WHERE schema=?', (schema,))
            for name in names:
                con.execute(f'CREATE VIEW "{prefixed(schema, name)}" AS SELECT * FROM "{prefixed(source, name)}"')
                con.execute('INSERT INTO zerodb_objects VALUES(?,?,?,?,?)', (schema, name, 'view', name, None))
            con.execute('UPDATE zerodb_schemas SET copied_at=? WHERE name=?', (datetime.now(timezone.utc).isoformat(), schema))
            con.execute('COMMIT')
        except BaseException:
            if con.in_transaction:
                con.execute('ROLLBACK')
            raise
    finally:
        con.close()
    _cache.clear()
    return {'schema': schema, 'source': source, 'views': len(names)}


def register_objects(schema: str, unified: Path = UNIFIED) -> dict:
    """Rimette in zerodb_objects gli oggetti dello schema come sono nel file, dopo che uno strumento ne ha creati o
    tolti con il suo SQL (la riscrittura dà il prefisso ai nomi nuovi, ma non li registra)."""
    prefix = prefixed(schema, '')
    con = sqlite3.connect(unified, isolation_level=None)
    try:
        objs = [(t, n[len(prefix):], tbl[len(prefix):] if tbl.startswith(prefix) else tbl)
                for t, n, tbl in con.execute('SELECT type,name,tbl_name FROM sqlite_schema WHERE substr(name,1,?)=? AND sql IS NOT NULL',
                                             (len(prefix), prefix))]
        counts = {n: con.execute(f'SELECT count(*) FROM "{prefix}{n}"').fetchone()[0] for t, n, _ in objs if t == 'table'}
        con.execute('BEGIN IMMEDIATE')
        con.execute('DELETE FROM zerodb_objects WHERE schema=?', (schema,))
        con.executemany('INSERT INTO zerodb_objects VALUES(?,?,?,?,?)', [(schema, n, t, tbl, counts.get(n)) for t, n, tbl in objs])
        con.execute('COMMIT')
    finally:
        con.close()
    _cache.clear()
    return {'schema': schema, 'objects': len(objs)}


def export_schema(schema: str, output: Path, unified: Path = UNIFIED) -> dict:
    """Uno schema come DB a sé, senza prefissi: com'era il vecchio file."""
    con = sqlite3.connect(f'file:{unified.as_posix()}?mode=ro', uri=True)
    rows = con.execute('SELECT name,type FROM zerodb_objects WHERE schema=?', (schema,)).fetchall()
    if not rows:
        raise SystemExit(f'Schema sconosciuto: {schema}')
    names = {n for n, _ in rows}
    output = Path(output)
    if output.exists():
        raise SystemExit(f'{output} esiste già')
    out = sqlite3.connect(output, isolation_level=None)
    counts = {}
    sql_of = {n: s for n, s in con.execute(
        'SELECT name,sql FROM sqlite_schema WHERE name LIKE ?', (schema + SEP + '%',))}
    out.execute('BEGIN')
    for name, t in rows:
        if t == 'table':
            out.execute(deprefix(sql_of[prefixed(schema, name)], schema))
    for name, t in rows:
        if t == 'table':
            cols = insertable(con, prefixed(schema, name))
            q = ','.join('?' * (cols.count(',') + 1))
            cursor = con.execute(f'SELECT {cols} FROM "{prefixed(schema, name)}"')
            while batch := cursor.fetchmany(5000):
                out.executemany(f'INSERT INTO "{name}"({cols}) VALUES({q})', batch)
            counts[name] = out.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
    for kind in ('index', 'view', 'trigger'):
        for name, t in rows:
            if t == kind:
                out.execute(deprefix(sql_of[prefixed(schema, name)], schema))
    out.execute('COMMIT')
    out.close()
    con.close()
    return {'schema': schema, 'tables': counts}


def status(unified: Path = UNIFIED) -> dict:
    con = sqlite3.connect(f'file:{unified.as_posix()}?mode=ro', uri=True)
    info = {'file': unified.name, 'bytes': unified.stat().st_size, 'meta': dict(con.execute('SELECT name,value FROM zerodb_meta')),
            'schemas': {}}
    for schema, file, copied in con.execute('SELECT name,source_file,copied_at FROM zerodb_schemas'):
        objs = con.execute('SELECT type,count(*),sum(rows) FROM zerodb_objects WHERE schema=? GROUP BY type', (schema,)).fetchall()
        info['schemas'][schema] = {'source': file, 'copied_at': copied,
                                    **{t: {'n': n, **({'rows': r} if r is not None else {})} for t, n, r in objs}}
    con.close()
    return info


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest='command', required=True)
    b = sub.add_parser('build', help='crea il DB unico dai sei DB')
    b.add_argument('--replace', action='store_true')
    b.add_argument('--no-verify', action='store_true')
    v = sub.add_parser('verify')
    v.add_argument('--quick', action='store_true', help='solo i conteggi di righe')
    sub.add_parser('status')
    e = sub.add_parser('export')
    e.add_argument('schema')
    e.add_argument('output', type=Path)
    args = ap.parse_args(argv)
    if args.command == 'build':
        report = build(args.replace)
        print(json.dumps(report, indent=2))
        if not args.no_verify:
            result = verify()
            print(json.dumps({'ok': result['ok'], 'problems': result['problems']}, indent=2))
            return 0 if result['ok'] else 1
    elif args.command == 'verify':
        result = verify(deep=not args.quick, mark=not args.quick)
        print(json.dumps({'ok': result['ok'], 'problems': result['problems'], 'tables': len(result['tables']),
                          'senza_origine': result['skipped']}, indent=2))
        return 0 if result['ok'] else 1
    elif args.command == 'status':
        print(json.dumps(status(), indent=2, ensure_ascii=False))
    elif args.command == 'export':
        print(json.dumps(export_schema(args.schema, args.output), indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
