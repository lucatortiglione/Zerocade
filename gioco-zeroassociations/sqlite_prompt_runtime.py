"""SQLite ufficiale 3.54.1 isolato: non modifica Python né il DB del server."""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import zipfile

VERSION = '3.54.1'
URL = 'https://www.sqlite.org/2026/sqlite-tools-win-x64-3540100.zip'
SHA3 = 'e171f3993a992edf076746926dd52b5e2ebfabaee38818e74987e1d8112ab987'
CACHE = Path(os.environ.get('LOCALAPPDATA', Path.home()/'.cache'))/'Zerocade/sqlite-3.54.1'


def sqlite_executable(explicit: Path | None = None) -> Path:
    exe = Path(explicit) if explicit else CACHE/'sqlite3.exe'
    if not exe.exists():
        if explicit or os.name != 'nt':
            raise RuntimeError('Indicare --sqlite con un eseguibile SQLite 3.54.1')
        CACHE.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(URL, headers={'User-Agent': 'Zerocade-prompt-database/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read(20_000_001)
        if hashlib.sha3_256(data).hexdigest() != SHA3:
            raise RuntimeError('Hash SHA3-256 del runtime SQLite non corrispondente')
        with tempfile.TemporaryFile() as archive:
            archive.write(data); archive.seek(0)
            with zipfile.ZipFile(archive) as bundle:
                member = next(n for n in bundle.namelist() if n.split('/')[-1] == 'sqlite3.exe')
                # Un solo file noto: niente estrazione di percorsi arbitrari dal ZIP.
                payload = bundle.read(member)
        temporary = CACHE/'sqlite3.exe.part'
        temporary.write_bytes(payload)
        temporary.replace(exe)
    result = subprocess.run([str(exe), '-version'], capture_output=True, text=True,
                            check=True, creationflags=window_flags())
    if result.stdout.split()[0] != VERSION:
        raise RuntimeError(f'Richiesto SQLite {VERSION}, trovato: {result.stdout.strip()}')
    return exe


def window_flags():
    return subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def literal(value):
    """I testi sono literal esadecimali: nessuna interpolazione di codice SQL/CLI."""
    if value is None: return 'NULL'
    if isinstance(value, bool): return str(int(value))
    if isinstance(value, int): return str(value)
    if isinstance(value, float):
        import math
        if not math.isfinite(value): raise ValueError('Numero non finito')
        return repr(value)
    return "CAST(X'" + str(value).encode('utf-8').hex() + "' AS TEXT)"


class SQLite:
    def __init__(self, path: Path, executable: Path | None = None):
        self.path = Path(path).resolve()
        self.executable = sqlite_executable(executable)

    def run(self, sql: str, *, rows=False):
        args = [str(self.executable), '-batch', '-bail']
        if rows: args.append('-json')
        args.append(str(self.path))
        result = subprocess.run(args, input='PRAGMA foreign_keys=ON;\n'+sql,
            capture_output=True, encoding='utf-8', creationflags=window_flags())
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout or '[]') if rows else result.stdout

    def dump(self, output: Path, objects: list[str] | None = None):
        """Il dump SQL completo, oppure delle sole tabelle e viste `objects`."""
        if objects is not None and not all(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', o) for o in objects):
            raise ValueError('Nome di tabella non valido per il dump')
        command = '.dump' + ''.join(' '+o for o in objects or [])
        output = Path(output)
        output.parent.mkdir(parents=True,exist_ok=True)
        handle, name = tempfile.mkstemp(prefix=output.name+'.',suffix='.part',dir=output.parent)
        temporary = Path(name)
        try:
            with os.fdopen(handle,'wb') as stream:
                result = subprocess.run([str(self.executable), '-batch', '-bail', str(self.path), command],
                    stdout=stream, stderr=subprocess.PIPE, creationflags=window_flags())
            if result.returncode: raise RuntimeError(result.stderr.decode('utf-8'))
            temporary.replace(output)
        finally:
            temporary.unlink(missing_ok=True)
