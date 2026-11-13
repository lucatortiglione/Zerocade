"""Più DB SQLite in un solo file, uno "schema" ciascuno.

SQLite non ha schemi dentro un file: qui lo schema è il prefisso `<schema>__` di tabelle, indici, viste e
trigger. Uno schema si indica come `<file unico>#<schema>` (address: database/giochi.sqlite3#quizz), la stessa
scrittura del server; il vecchio percorso del DB a sé (gioco-quizzland/data/domande.db) indica ancora lo stesso
schema. Gli strumenti scrivono l'SQL con i nomi senza prefisso, che viene riscritto al volo. È lo stesso meccanismo di gioco-zeroassociations/unified_db.py, qui generico (database/giochi.py).
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

SEP = '__'
IDENT = r'[A-Za-z_][A-Za-z0-9_]*'
TOKEN = re.compile(
    r"""'[^']*(?:''[^']*)*'          # testo
       |"[^"]*(?:""[^"]*)*"          # identificatore tra virgolette
       |--[^\n]*|/\*.*?\*/           # commenti
       |(?P<q>""" + IDENT + r""")\.(?P<n>""" + IDENT + r""")
       |(?P<w>""" + IDENT + r""")
       |\s+|.""",
    re.S | re.X,
)
CREATE = re.compile(r'\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|VIEW|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?(' + IDENT + r')', re.I)
REGISTRY = ('zerodb_meta', 'zerodb_schemas', 'zerodb_objects')


def prefixed(schema: str, name: str) -> str:
    return f'{schema}{SEP}{name}'


def rewrite(sql: str, schema: str, names: set[str]) -> str:
    """L'SQL scritto con i nomi senza prefisso, per lo schema `schema` del file unico. Le colonne non si
    chiamano mai come una tabella (lo controlla build), gli alias dopo AS restano com'erano, i testi pure,
    salvo le ricerche per nome (name = 'tabella')."""
    out: list[str] = []
    last: list[str] = []
    for m in TOKEN.finditer(sql):
        tok = m.group(0)
        if m.group('w'):
            if tok in names and not (last and last[-1] == 'as'):
                tok = prefixed(schema, tok)
            last = (last + [tok.lower()])[-3:]
        elif m.group('q'):
            qual, name = m.group('q'), m.group('n')
            if qual.lower() == 'main' and name in names:
                tok = prefixed(schema, name)
            elif qual in names:
                tok = f'{prefixed(schema, qual)}.{name}'
            last = (last + [name.lower()])[-3:]
        elif tok.startswith('"'):
            inner = tok[1:-1].replace('""', '"')
            if inner in names:
                tok = '"' + prefixed(schema, inner) + '"'
        elif tok.startswith("'") and tok != "''":
            inner = tok[1:-1].replace("''", "'")
            if inner in names and len(last) >= 2 and last[-1] == '=' and last[-2] in ('name', 'tbl_name'):
                tok = "'" + prefixed(schema, inner) + "'"
        elif not tok.isspace() and not tok.startswith(('--', '/*')):
            last = (last + [tok])[-3:]
        out.append(tok)
    return ''.join(out)


def deprefix(text: str, schema: str) -> str:
    return re.sub(rf'\b{re.escape(schema)}{SEP}(?=[A-Za-z_])', '', text)


def _objects(con: sqlite3.Connection) -> list[tuple[str, str, str, str]]:
    return con.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL"
    ).fetchall()


def insertable(con: sqlite3.Connection, table: str) -> str:
    """Le colonne da copiare, senza quelle generate."""
    return ','.join(f'"{r[1]}"' for r in con.execute(f'PRAGMA table_xinfo("{table}")') if r[6] == 0)


def _digest(con: sqlite3.Connection, table: str) -> str:
    """L'impronta delle righe in ordine, non in quello del file: una tabella WITHOUT ROWID le tiene in ordine di
    chiave, la stessa tabella con il rowid in ordine d'inserimento."""
    cols = insertable(con, table)
    h = hashlib.sha256()
    for row in con.execute(f'SELECT {cols} FROM "{table}" ORDER BY {",".join(str(i + 1) for i in range(cols.count(",") + 1))}'):
        h.update(repr(row).encode('utf-8'))
    return h.hexdigest()


class _Connection(sqlite3.Connection):
    schema = ''
    names: set[str] = set()

    def _rw(self, sql: str) -> str:
        new = {m.group(1) for m in CREATE.finditer(sql)} - self.names
        if new:
            # A table (or index) a tool creates joins the schema: from now on its name is prefixed too.
            self.names = self.names | new
            self._created = getattr(self, '_created', set()) | new
        return rewrite(sql, self.schema, self.names)

    def _register(self) -> None:
        created = getattr(self, '_created', set())
        if not created:
            return
        self._created = set()
        for name in created:
            row = super().execute('SELECT type,tbl_name FROM sqlite_schema WHERE name=?', (prefixed(self.schema, name),)).fetchone()
            if row:
                super().execute('INSERT OR IGNORE INTO zerodb_objects(schema,name,type,tbl_name,rows) VALUES(?,?,?,?,NULL)',
                                (self.schema, name, row[0], row[1][len(self.schema) + len(SEP):]))

    def execute(self, sql, *args):
        cur = super().execute(self._rw(sql), *args)
        self._register()
        return cur

    def executemany(self, sql, *args):
        return super().executemany(self._rw(sql), *args)

    def executescript(self, script):
        cur = super().executescript(self._rw(script))
        self._register()
        return cur

    def cursor(self, factory=None):
        con = self

        class _Cursor(sqlite3.Cursor):
            def execute(self, sql, *args):
                return super().execute(con._rw(sql), *args)

            def executemany(self, sql, *args):
                return super().executemany(con._rw(sql), *args)

        return super().cursor(factory or _Cursor)


class SchemaDb:
    """Un file unico (`file`) con uno schema per ogni vecchio DB (`schemas`: percorso -> schema)."""

    def __init__(self, file: Path, schemas: dict[Path, str], legacy_env: str):
        self.file = Path(file)
        self.schemas = {Path(p).resolve(): s for p, s in schemas.items()}
        self.legacy_env = legacy_env

    # --- uso da parte degli strumenti ---

    def address(self, schema: str) -> str:
        """Come si indica uno schema: `<file unico>#<schema>`, per esempio database/giochi.sqlite3#quizz (la stessa
        scrittura del server). Gli strumenti lo passano come un percorso."""
        if schema not in self.schemas.values():
            raise ValueError(f'Schema sconosciuto: {schema}')
        return f'{self.file}#{schema}'

    @staticmethod
    def _split_uri(path) -> tuple[str, str, str]:
        """(prefisso 'file:' o '', percorso, '?parametri' o '') di un percorso o di un URI file:."""
        text = str(path)
        if not text.startswith('file:'):
            return '', text, ''
        body, mark, query = text[5:].partition('?')
        body = unquote(body)
        return 'file:', body.lstrip('/') if os.name == 'nt' else body, mark + query

    def schema_of(self, path) -> str | None:
        """Lo schema indicato da `path`: l'indirizzo `<file unico>#<schema>`, oppure il vecchio percorso del DB a sé
        (gioco-quizzland/data/domande.db, …), che vale ancora."""
        _, text, _ = self._split_uri(path)
        try:
            if '#' in text:
                file, _, schema = text.rpartition('#')
                return schema if Path(file).resolve() == self.file.resolve() and schema in self.schemas.values() else None
            return self.schemas.get(Path(text).resolve())
        except OSError:
            return None

    def file_of(self, path) -> str:
        """Il DB da aprire quando il file unico non si usa (legacy): per un indirizzo, il vecchio file del suo schema
        (anche dentro un URI file:); per ogni altro percorso, il percorso stesso."""
        prefix, text, query = self._split_uri(path)
        if '#' in text:
            file, _, schema = text.rpartition('#')
            legacy = {s: p for p, s in self.schemas.items()}.get(schema)
            if legacy is not None and Path(file).name == self.file.name:
                return prefix + (legacy.as_posix() if prefix else str(legacy)) + query
        return str(path)

    def active(self) -> bool:
        if os.environ.get(self.legacy_env, '').lower() == 'legacy' or not self.file.exists():
            return False
        try:
            con = sqlite3.connect(f'file:{self.file.as_posix()}?mode=ro', uri=True)
            try:
                row = con.execute("SELECT value FROM zerodb_meta WHERE name='verified'").fetchone()
            finally:
                con.close()
        except sqlite3.Error:
            return False
        return bool(row) and row[0] == '1'

    def names_of(self, schema: str) -> set[str]:
        con = sqlite3.connect(f'file:{self.file.as_posix()}?mode=ro', uri=True)
        try:
            return {n for (n,) in con.execute('SELECT name FROM zerodb_objects WHERE schema=?', (schema,))}
        finally:
            con.close()

    def connect(self, path, *, uri: bool = False, **kwargs) -> sqlite3.Connection:
        """sqlite3.connect che, per un vecchio percorso, apre il suo schema nel file unico."""
        schema = self.schema_of(path) if self.active() else None
        if schema is None:
            return sqlite3.connect(self.file_of(path), uri=uri, **kwargs)
        readonly = 'mode=ro' in str(path)
        con = sqlite3.connect(f'file:{self.file.as_posix()}' + ('?mode=ro' if readonly else ''), uri=True, factory=_Connection, **kwargs)
        con.schema = schema
        con.names = self.names_of(schema)
        return con

    def exists(self, path) -> bool:
        schema = self.schema_of(path) if self.active() else None
        return bool(self.names_of(schema)) if schema else Path(self._split_uri(self.file_of(path))[1]).exists()

    def register_new_objects(self, schema: str) -> None:
        """Dopo che uno strumento ha creato tabelle nuove nello schema: le aggiunge all'elenco."""
        con = sqlite3.connect(self.file)
        try:
            for t, name, tbl in con.execute(
                "SELECT type,name,tbl_name FROM sqlite_schema WHERE name LIKE ? ESCAPE '\\'",
                (schema + '\\_\\_%',),
            ).fetchall():
                bare, bare_tbl = name[len(schema) + 2:], tbl[len(schema) + 2:]
                con.execute('INSERT OR IGNORE INTO zerodb_objects(schema,name,type,tbl_name,rows) VALUES(?,?,?,?,NULL)', (schema, bare, t, bare_tbl))
            con.commit()
        finally:
            con.close()

    def register_objects(self, schema: str) -> None:
        """Rimette l'elenco degli oggetti dello schema come sono nel file, dopo che uno strumento ne ha creati,
        rinominati o tolti (register_new_objects li aggiunge soltanto)."""
        prefix = prefixed(schema, '')
        con = sqlite3.connect(self.file, isolation_level=None)
        try:
            objs = [(t, n[len(prefix):], tbl[len(prefix):] if tbl.startswith(prefix) else tbl)
                    for t, n, tbl in con.execute('SELECT type,name,tbl_name FROM sqlite_schema WHERE substr(name,1,?)=? AND sql IS NOT NULL',
                                                 (len(prefix), prefix))]
            counts = {n: con.execute(f'SELECT count(*) FROM "{prefix}{n}"').fetchone()[0] for t, n, _ in objs if t == 'table'}
            con.execute('BEGIN IMMEDIATE')
            con.execute('DELETE FROM zerodb_objects WHERE schema=?', (schema,))
            con.executemany('INSERT INTO zerodb_objects(schema,name,type,tbl_name,rows) VALUES(?,?,?,?,?)',
                            [(schema, n, t, tbl, counts.get(n)) for t, n, tbl in objs])
            con.execute('COMMIT')
        finally:
            con.close()

    # --- costruzione, verifica, import ed export ---

    def _registry(self, out: sqlite3.Connection) -> None:
        out.executescript(
            'CREATE TABLE IF NOT EXISTS zerodb_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;'
            'CREATE TABLE IF NOT EXISTS zerodb_schemas(name TEXT PRIMARY KEY, source_file TEXT NOT NULL, copied_at TEXT NOT NULL) STRICT;'
            'CREATE TABLE IF NOT EXISTS zerodb_objects(schema TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,'
            ' tbl_name TEXT NOT NULL, rows INTEGER, PRIMARY KEY(schema,name)) STRICT;')

    def _copy_in(self, con: sqlite3.Connection, schema: str, source: Path) -> int:
        """Lo schema `schema` diventa il contenuto del DB `source` (dentro una transazione già aperta)."""
        src = sqlite3.connect(f'file:{Path(source).as_posix()}?mode=ro', uri=True)
        objs = _objects(src)
        names = {n for _, n, *_ in objs}
        for t, table, *_ in objs:
            if t == 'table':
                clash = {r[1] for r in src.execute(f'PRAGMA table_info("{table}")')} & names
                if clash:
                    raise SystemExit(f'{source}: la tabella {table} ha colonne che si chiamano come oggetti: {sorted(clash)}')
        src.close()
        for kind in ('trigger', 'view', 'index', 'table'):
            for (name,) in con.execute('SELECT name FROM zerodb_objects WHERE schema=? AND type=?', (schema, kind)).fetchall():
                con.execute(f'DROP {kind.upper()} IF EXISTS "{prefixed(schema, name)}"')
        con.execute('DELETE FROM zerodb_objects WHERE schema=?', (schema,))
        rows = 0
        for t, name, tbl, sql in objs:
            if t == 'table':
                con.execute(rewrite(sql, schema, names))
        for t, name, tbl, sql in objs:
            if t == 'table':
                cols = insertable(con, prefixed(schema, name))
                con.execute(f'INSERT INTO "{prefixed(schema, name)}"({cols}) SELECT {cols} FROM src."{name}"')
        for kind in ('index', 'view', 'trigger'):
            for t, name, tbl, sql in objs:
                if t == kind:
                    con.execute(rewrite(sql, schema, names))
        for t, name, tbl, _sql in objs:
            n = con.execute(f'SELECT count(*) FROM "{prefixed(schema, name)}"').fetchone()[0] if t == 'table' else None
            rows += n or 0
            con.execute('INSERT INTO zerodb_objects VALUES(?,?,?,?,?)', (schema, name, t, tbl, n))
        con.execute('INSERT OR REPLACE INTO zerodb_schemas VALUES(?,?,?)',
                    (schema, str(source), datetime.now(timezone.utc).isoformat()))
        return rows

    def import_schema(self, source: Path, schema: str) -> int:
        """Sostituisce uno schema con il contenuto di un DB a sé (nuovo o ricostruito)."""
        new = not self.file.exists()
        con = sqlite3.connect(self.file, isolation_level=None, uri=True)
        try:
            con.execute('PRAGMA foreign_keys=OFF')
            self._registry(con)
            if new:
                con.execute("INSERT OR IGNORE INTO zerodb_meta VALUES('verified','0')")
            con.execute(f"ATTACH DATABASE 'file:{Path(source).as_posix()}?mode=ro' AS src")
            con.execute('BEGIN IMMEDIATE')
            try:
                rows = self._copy_in(con, schema, source)
                con.execute('COMMIT')
            except BaseException:
                con.execute('ROLLBACK')
                raise
            con.execute('DETACH DATABASE src')
        finally:
            con.close()
        return rows

    def build(self, sources: dict[str, Path], replace: bool = False) -> dict[str, int]:
        """Crea il file unico copiando i vecchi DB (che restano dove sono)."""
        if self.file.exists() and not replace:
            raise SystemExit(f'{self.file.name} esiste già: usare --replace per ricostruirlo')
        fd, tmp = tempfile.mkstemp(prefix=self.file.name + '.', suffix='.part', dir=self.file.parent)
        os.close(fd)
        Path(tmp).unlink()
        target, self.file = self.file, Path(tmp)
        try:
            counts = {schema: self.import_schema(src, schema) for schema, src in sources.items()}
            con = sqlite3.connect(self.file)
            con.execute("INSERT OR REPLACE INTO zerodb_meta VALUES('built_at',?)", (datetime.now(timezone.utc).isoformat(),))
            con.execute("INSERT OR REPLACE INTO zerodb_meta VALUES('verified','0')")
            con.commit()
            con.execute('VACUUM')
            con.close()
            os.replace(self.file, target)
        finally:
            self.file = target
            Path(tmp).unlink(missing_ok=True)
        return counts

    def verify(self, sources: dict[str, Path], mark: bool = True) -> list[str]:
        """Ogni tabella deve avere lo stesso contenuto del vecchio DB d'origine."""
        problems = []
        con = sqlite3.connect(f'file:{self.file.as_posix()}?mode=ro', uri=True)
        for schema, path in sources.items():
            src = sqlite3.connect(f'file:{Path(path).as_posix()}?mode=ro', uri=True)
            tables = [n for t, n, *_ in _objects(src) if t == 'table']
            for table in tables:
                if _digest(src, table) != _digest(con, prefixed(schema, table)):
                    problems.append(f'{schema}.{table}: contenuto diverso')
            src.close()
        if con.execute('PRAGMA foreign_key_check').fetchall():
            problems.append('foreign_key_check: violazioni')
        con.close()
        if mark and not problems:
            self.mark_verified()
        return problems

    def mark_verified(self) -> None:
        rw = sqlite3.connect(self.file)
        rw.execute("INSERT OR REPLACE INTO zerodb_meta VALUES('verified','1')")
        rw.execute("INSERT OR REPLACE INTO zerodb_meta VALUES('verified_at',?)", (datetime.now(timezone.utc).isoformat(),))
        rw.commit()
        rw.close()

    def export_schema(self, schema: str, output: Path) -> dict[str, int]:
        """Uno schema come DB a sé, senza prefissi (com'era il vecchio file)."""
        output = Path(output)
        if output.exists():
            raise SystemExit(f'{output} esiste già')
        con = sqlite3.connect(f'file:{self.file.as_posix()}?mode=ro', uri=True)
        rows = con.execute('SELECT name,type FROM zerodb_objects WHERE schema=?', (schema,)).fetchall()
        if not rows:
            raise SystemExit(f'Schema sconosciuto: {schema}')
        sql_of = dict(con.execute("SELECT name,sql FROM sqlite_schema WHERE name LIKE ? ESCAPE '\\'", (schema + '\\_\\_%',)))
        out = sqlite3.connect(output, isolation_level=None)
        counts = {}
        out.execute('BEGIN')
        for name, t in rows:
            if t == 'table':
                out.execute(deprefix(sql_of[prefixed(schema, name)], schema))
        for name, t in rows:
            if t == 'table':
                cols = insertable(con, prefixed(schema, name))
                marks = ','.join('?' * (cols.count(',') + 1))
                cur = con.execute(f'SELECT {cols} FROM "{prefixed(schema, name)}"')
                while batch := cur.fetchmany(5000):
                    out.executemany(f'INSERT INTO "{name}"({cols}) VALUES({marks})', batch)
                counts[name] = out.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
        for kind in ('index', 'view', 'trigger'):
            for name, t in rows:
                if t == kind:
                    out.execute(deprefix(sql_of[prefixed(schema, name)], schema))
        out.execute('COMMIT')
        out.close()
        con.close()
        return counts

    def status(self) -> dict:
        con = sqlite3.connect(f'file:{self.file.as_posix()}?mode=ro', uri=True)
        info = {'file': str(self.file), 'bytes': self.file.stat().st_size, 'meta': dict(con.execute('SELECT name,value FROM zerodb_meta')), 'schemas': {}}
        for schema, source, copied in con.execute('SELECT name,source_file,copied_at FROM zerodb_schemas ORDER BY name'):
            tables = con.execute("SELECT name,rows FROM zerodb_objects WHERE schema=? AND type='table' ORDER BY name", (schema,)).fetchall()
            info['schemas'][schema] = {'source': source, 'copied_at': copied, 'tables': dict(tables)}
        con.close()
        return info
