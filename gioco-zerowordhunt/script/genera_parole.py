"""ZeroWordHunt : Genera Parole.

Crea (o rigenera) in `database/giochi_v2.sqlite3` la tabella `zerowordhunt_parole` con tutte le parole di `normalizzata` (RAW 2.0) di almeno
4 lettere e con un IWFS (Italian Word Familiarity Score) di almeno 50. Il RAW 2.0 si legge in sola lettura: serve aver eseguito prima
"ZeroCade : Normalizzare parole RAW", che calcola l'IWFS. La vista `zerowordhunt` ha le colonne che il server legge.

Sostituisce soltanto le tabelle e la vista di ZeroWordHunt: il resto di giochi_v2 (per esempio le segrete di ZeroContext) resta com'è.
La sostituzione è atomica, con backup prima di toccare un file esistente: se lo script fallisce, la tabella precedente resta intatta."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3

from filelock import FileLock

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parents[1]
DEFAULT_RAW = ROOT / 'database' / 'parole_ita_raw_2.0.sqlite3'
DEFAULT_DB = ROOT / 'database' / 'giochi_v2.sqlite3'
DEFAULT_REPORT = HERE / 'reports' / 'giochi_v2_zerowordhunt.json'
DEFAULT_BACKUPS = ROOT / 'gioco-zeroassociations' / 'database-backups'
MIN_LENGTH, MIN_IWFS = 4, 50.0
SCHEMA_VERSION = 'zerowordhunt-parole-1'
CONFIDENCE = {'LOW': 1, 'MEDIUM': 2, 'HIGH': 3}

# Ordine di eliminazione: prima la vista, poi le tabelle.
OBJECTS = (('VIEW', 'zerowordhunt'), ('TABLE', 'zerowordhunt_meta'), ('TABLE', 'zerowordhunt_parole'))
SCHEMA = '''
CREATE TABLE zerowordhunt_parole(
 id INTEGER PRIMARY KEY,
 parola TEXT NOT NULL UNIQUE,
 lunghezza INTEGER NOT NULL CHECK(lunghezza>=1),
 iwfs REAL NOT NULL CHECK(iwfs>=0 AND iwfs<=100),
 iwfs_completo INTEGER NOT NULL CHECK(iwfs_completo IN (0,1)),
 confidenza INTEGER NOT NULL CHECK(confidenza BETWEEN 1 AND 3),
 lettere_semplici INTEGER GENERATED ALWAYS AS (parola NOT GLOB '*[^a-z]*') VIRTUAL
) STRICT;
CREATE INDEX zerowordhunt_parole_iwfs ON zerowordhunt_parole(iwfs);
CREATE INDEX zerowordhunt_parole_lunghezza ON zerowordhunt_parole(lunghezza);
CREATE TABLE zerowordhunt_meta(
 nome TEXT PRIMARY KEY,
 valore TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE VIEW zerowordhunt AS
 SELECT parola, lunghezza, iwfs,
        CASE iwfs_completo WHEN 1 THEN 'FULL' ELSE 'PARTIAL' END AS iwfs_stato,
        CASE confidenza WHEN 3 THEN 'HIGH' WHEN 2 THEN 'MEDIUM' ELSE 'LOW' END AS iwfs_confidenza,
        lettere_semplici
 FROM zerowordhunt_parole;
'''


class PreconditionError(ValueError):
    pass


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def load_words(raw_db, min_length=MIN_LENGTH, min_iwfs=MIN_IWFS):
    """Le parole di `normalizzata` valide (`lexical_validity`=VALID: niente nomi propri o forestierismi da rivedere) con almeno `min_length` lettere e IWFS ≥ `min_iwfs`, dopo aver controllato che l'IWFS ci sia ed
    derivi dalla normalizzazione corrente. Restituisce (righe, informazioni sulla sorgente, conteggi)."""
    with closing(readonly(raw_db)) as con:
        if not con.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='normalizzata'").fetchone():
            raise PreconditionError('Manca la tabella normalizzata: eseguire prima "ZeroCade : Normalizzare parole RAW"')
        columns = {r[1] for r in con.execute('PRAGMA table_info(normalizzata)')}
        missing = {'iwfs', 'iwfs_status', 'iwfs_confidence'} - columns
        if missing:
            raise PreconditionError('normalizzata non ha l\'IWFS (' + ', '.join(sorted(missing)) +
                                    '): rieseguire "ZeroCade : Normalizzare parole RAW"')
        meta = dict(con.execute('SELECT name,value FROM meta'))
        if meta.get('normalizzazione_stato') != 'aggiornata':
            raise PreconditionError('normalizzata non è aggiornata: rieseguire "ZeroCade : Normalizzare parole RAW"')
        total = con.execute('SELECT count(*) FROM normalizzata').fetchone()[0]
        if not total:
            raise PreconditionError('La tabella normalizzata è vuota: eseguire "ZeroCade : Normalizzare parole RAW"')
        rows = []
        for word, length, iwfs, status, confidence in con.execute(
                '''SELECT parola, length(parola), iwfs, iwfs_status, iwfs_confidence FROM normalizzata
                   WHERE is_single_word=1 AND lexical_validity='VALID' AND length(parola)>=? AND iwfs IS NOT NULL AND iwfs>=? ORDER BY parola''', (min_length, min_iwfs)):
            if confidence not in CONFIDENCE:
                continue  # NONE: senza dati non c'è un IWFS (non succede con iwfs non nullo)
            rows.append((word, length, iwfs, int(status == 'FULL'), CONFIDENCE[confidence]))
        if not rows:
            raise PreconditionError(f'Nessuna parola con almeno {min_length} lettere e IWFS ≥ {min_iwfs}: la tabella precedente non è stata toccata')
        model = json.loads(meta.get('iwfs_model') or '{}')
        normalization = json.loads(meta.get('normalizzazione_report') or '{}')
    counts = {'normalizzata': total, 'selezionate': len(rows), 'iwfs_completo': sum(r[3] for r in rows),
              'iwfs_parziale': sum(1 - r[3] for r in rows), 'lettere_semplici': sum(1 for r in rows if r[0].isascii() and r[0].isalpha()),
              'per_confidenza': {name: sum(1 for r in rows if r[4] == level) for name, level in CONFIDENCE.items()}}
    source = {'database': str(Path(raw_db).resolve()), 'normalization_version': model.get('normalization_version'),
              'iwfs_model_version': model.get('model_version'), 'source_words_sha256': normalization.get('source_words_sha256')}
    return rows, source, counts


def build(con, rows, source, counts, min_length, min_iwfs):
    """Ricrea soltanto le tabelle e la vista di ZeroWordHunt, in una transazione; il resto del DB resta com'è."""
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('BEGIN IMMEDIATE')
    try:
        for kind, name in OBJECTS:
            con.execute(f'DROP {kind} IF EXISTS {name}')
        for statement in SCHEMA.split(';\n'):
            if statement.strip():
                con.execute(statement)
        con.executemany('INSERT INTO zerowordhunt_parole(parola,lunghezza,iwfs,iwfs_completo,confidenza) VALUES (?,?,?,?,?)', rows)
        meta = {'schema': SCHEMA_VERSION, 'generato_il_utc': datetime.now(timezone.utc).isoformat(),
                'origine': source['database'], 'lunghezza_minima': str(min_length), 'iwfs_minimo': str(min_iwfs),
                'versione_normalizzazione_iwfs': str(source.get('normalization_version')),
                'versione_modello_iwfs': str(source.get('iwfs_model_version')),
                'impronta_normalizzazione': str(source.get('source_words_sha256')),
                'parole': str(len(rows)), 'conteggi': json.dumps(counts, ensure_ascii=False)}
        con.executemany('INSERT INTO zerowordhunt_meta VALUES (?,?)', meta.items())
        if con.execute('PRAGMA foreign_key_check').fetchone() or con.execute('SELECT count(*) FROM zerowordhunt_parole').fetchone()[0] != len(rows):
            raise ValueError('Verifica della tabella zerowordhunt_parole non superata')
        con.execute('COMMIT')
    except BaseException:
        con.execute('ROLLBACK')
        raise
    return meta


def verify(path, rows):
    """Rilegge il file scritto e lo confronta con la sorgente, riga per riga."""
    with closing(readonly(path)) as con:
        if con.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or con.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('DB giochi_v2 non integro')
        stored = list(con.execute('SELECT parola,lunghezza,iwfs,iwfs_completo,confidenza FROM zerowordhunt_parole ORDER BY parola'))
    if stored != rows:
        raise ValueError('Le parole scritte non coincidono con quelle di normalizzata')


def generate(raw_db=DEFAULT_RAW, db=DEFAULT_DB, report_path=DEFAULT_REPORT, backup_root=DEFAULT_BACKUPS,
             min_length=MIN_LENGTH, min_iwfs=MIN_IWFS, plan=False):
    rows, source, counts = load_words(raw_db, min_length, min_iwfs)
    summary = {'task': 'ZeroWordHunt : Genera Parole', 'database': str(Path(db).resolve()), 'tabella': 'zerowordhunt_parole',
               'vista': 'zerowordhunt', 'lunghezza_minima': min_length, 'iwfs_minimo': min_iwfs, 'conteggi': counts,
               'origine': source, 'plan_only': plan}
    if plan:
        return summary
    db = Path(db)
    db.parent.mkdir(parents=True, exist_ok=True)
    with FileLock(str(db.resolve()) + '.lock', timeout=0):
        if db.exists():
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            backup = Path(backup_root) / f'giochi_v2-{stamp}.sqlite3'
            backup.parent.mkdir(parents=True, exist_ok=True)
            with closing(readonly(db)) as original, closing(sqlite3.connect(backup)) as target:
                original.backup(target)
            summary['backup'] = str(backup)
        with closing(sqlite3.connect(db, isolation_level=None, timeout=30)) as con:
            summary['meta'] = build(con, rows, source, counts, min_length, min_iwfs)
            con.execute('PRAGMA optimize')
            con.execute('VACUUM')
        verify(db, rows)
    summary.update(size_bytes=db.stat().st_size, sha256=sha256(db))
    report_path = Path(report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-db', type=Path, default=DEFAULT_RAW, help='RAW 2.0 da cui si legge normalizzata (sola lettura)')
    parser.add_argument('--db', type=Path, default=DEFAULT_DB, help='DB dei giochi in cui si scrive la tabella')
    parser.add_argument('--report', type=Path, default=DEFAULT_REPORT)
    parser.add_argument('--backup-root', type=Path, default=DEFAULT_BACKUPS)
    parser.add_argument('--min-length', type=int, default=MIN_LENGTH)
    parser.add_argument('--min-iwfs', type=float, default=MIN_IWFS)
    parser.add_argument('--plan', action='store_true', help='Calcola e conta senza scrivere')
    args = parser.parse_args(argv)
    if not args.raw_db.is_file():
        raise FileNotFoundError(f'RAW 2.0 assente: {args.raw_db}. Eseguire prima "ZeroCade : Aggiornamento parole RAW"')
    print(json.dumps(generate(args.raw_db, args.db, args.report, args.backup_root, args.min_length, args.min_iwfs, args.plan),
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
