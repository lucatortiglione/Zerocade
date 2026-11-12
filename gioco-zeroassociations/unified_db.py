"""Il DB unico di ZeroAssociazioni: zeroassociazioni.sqlite3, uno "schema" per ognuno dei sei DB storici.

SQLite non ha schemi dentro un file: qui lo schema è il prefisso `<schema>__` delle tabelle, degli
indici, delle viste e dei trigger. Gli schemi e i file da cui vengono:

  raw       prompt_raw.sqlite3       la raccolta, database operativo (con l'inventario lessicale)
  game      prompt.sqlite3           i bacini verificati letti dal gioco
  validi    prompt_validi.sqlite3    prompt validati con le parole associate
  filtrati  prompt_filtrati.sqlite3  candidati e filtri
  finale    prompt_finale.sqlite3    prompt, parole e collegamenti della lavorazione finale
  scartati  prompt_scartati.sqlite3  scarti, con il motivo

Gli script non cambiano il modo di indicare i DB: continuano a passare i vecchi percorsi
(`prompt_raw.sqlite3`, …). Quando il DB unico esiste ed è verificato, un vecchio percorso significa
"lo schema corrispondente del DB unico": le istruzioni SQL, scritte con i nomi senza prefisso,
vengono riscritte al volo (riscrivi). Un file con un altro nome (le copie temporanee, i test) resta
un normale DB a sé. Con ZEROASSOC_DB=legacy si usano di nuovo i vecchi file.

Comandi:
  python unified_db.py build [--replace]  crea il DB unico copiando i sei DB (i vecchi restano)
  python unified_db.py verify             confronta ogni tabella con il suo file d'origine
  python unified_db.py status             schemi, oggetti, righe e dimensioni
  python unified_db.py export SCHEMA OUT  scrive uno schema come DB a sé (senza prefissi)
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

ROOT = Path(__file__).resolve().parent
# ZEROASSOC_UNIFIED sposta il DB unico (per provare le scritture su una copia).
UNIFIED = Path(os.environ.get('ZEROASSOC_UNIFIED') or ROOT / 'zeroassociazioni.sqlite3')
SEP = '__'

# Il file storico -> lo schema del DB unico.
SCHEMAS = {
    'prompt_raw.sqlite3': 'raw',
    'prompt.sqlite3': 'game',
    'prompt_validi.sqlite3': 'validi',
    'prompt_filtrati.sqlite3': 'filtrati',
    'prompt_finale.sqlite3': 'finale',
    'prompt_scartati.sqlite3': 'scartati',
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


def schema_of(path) -> str | None:
    """Lo schema di un vecchio percorso (solo quelli accanto agli script), altrimenti None."""
    p = Path(str(path).split('?')[0].removeprefix('file:').lstrip('/') if str(path).startswith('file:') else path)
    try:
        p = p.resolve()
    except OSError:
        return None
    return SCHEMAS.get(p.name) if p.parent == ROOT else None


def exists(path) -> bool:
    """Il DB c'è: come schema del DB unico, oppure come file."""
    schema = schema_of(path) if active() else None
    if schema:
        return bool(objects_of(schema))
    return Path(path).exists()


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
        return f"ATTACH DATABASE '{'file:' + UNIFIED.as_posix() + mode if mode else UNIFIED.as_posix()}' AS {alias};"

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
        return sqlite3.connect(path, uri=uri, **kwargs)
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
    sources = sources or {schema: ROOT / name for name, schema in SCHEMAS.items()}
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
            out.execute(f"ATTACH DATABASE 'file:{src_path.as_posix()}?mode=ro' AS src")
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
    """Ogni tabella del DB unico deve avere le stesse righe del file d'origine."""
    con = sqlite3.connect(f'file:{unified.as_posix()}?mode=ro', uri=True)
    result: dict = {'tables': {}, 'problems': []}
    for schema, file in con.execute('SELECT name,source_file FROM zerodb_schemas').fetchall():
        src = sqlite3.connect(f'file:{(unified.parent / file).as_posix()}?mode=ro', uri=True)
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
    con.execute(f"ATTACH DATABASE 'file:{Path(source).as_posix()}?mode=ro' AS src")
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
        print(json.dumps({'ok': result['ok'], 'problems': result['problems'], 'tables': len(result['tables'])}, indent=2))
        return 0 if result['ok'] else 1
    elif args.command == 'status':
        print(json.dumps(status(), indent=2, ensure_ascii=False))
    elif args.command == 'export':
        print(json.dumps(export_schema(args.schema, args.output), indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
