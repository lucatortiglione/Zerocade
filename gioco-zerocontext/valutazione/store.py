"""Database dei risultati (database/ZeroContext_Valutazione.sqlite3): l'unico in cui il valutatore scrive.

Normalizzato come chiedono le direttive: chiavi intere, WITHOUT ROWID sulle tabelle a chiave composta, chiavi esterne,
viste con i nomi leggibili. Lo legge anche il server (apps/server/src/context-evaluation.ts), che vi scrive solo i
verdetti umani: lo schema è in `Store.ddl()` e in tests/fixtures/context-evaluation-schema.sql.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Literal

from valutazione import EVALUATOR_VERSION, paths
from valutazione.common import norm
from valutazione.split import SPLIT_RULE

SCHEMA_VERSION = 1
TOP = 20  # parole salvate per segreta: le posizioni 2..21

DDL = '''
CREATE TABLE words(id INTEGER PRIMARY KEY, word TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE metric_names(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE subset_names(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE profiles(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, origin TEXT NOT NULL, vectors_sha256 TEXT NOT NULL,
  dim INTEGER NOT NULL, words INTEGER NOT NULL, UNIQUE(name, vectors_sha256)) STRICT;
CREATE TABLE runs(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('in_corso','completa','annullata')),
  evaluator_version TEXT NOT NULL, judge_version TEXT, split_rule TEXT NOT NULL,
  reference_sha256 TEXT NOT NULL, gold_sha256 TEXT NOT NULL) STRICT;
CREATE TABLE run_top(
  run_id INTEGER NOT NULL REFERENCES runs(id), secret_id INTEGER NOT NULL REFERENCES words(id),
  position INTEGER NOT NULL CHECK(position BETWEEN 2 AND 21), word_id INTEGER NOT NULL REFERENCES words(id),
  verified INTEGER NOT NULL CHECK(verified IN (0,1)), variant INTEGER NOT NULL CHECK(variant IN (0,1)),
  PRIMARY KEY(run_id, secret_id, position)) STRICT, WITHOUT ROWID;
CREATE TABLE sample(
  secret_id INTEGER PRIMARY KEY REFERENCES words(id), has_gold INTEGER NOT NULL CHECK(has_gold IN (0,1)),
  block INTEGER NOT NULL, seed INTEGER NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE judge_verdicts(
  secret_id INTEGER NOT NULL REFERENCES words(id), word_id INTEGER NOT NULL REFERENCES words(id),
  judge_version TEXT NOT NULL, model TEXT NOT NULL,
  grade INTEGER NOT NULL CHECK(grade IN (0,1,2)), sense_ok INTEGER CHECK(sense_ok IS NULL OR sense_ok IN (0,1)),
  reason TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(secret_id, word_id, judge_version, model)) STRICT, WITHOUT ROWID;
CREATE TABLE human_verdicts(
  secret_id INTEGER NOT NULL REFERENCES words(id), word_id INTEGER NOT NULL REFERENCES words(id),
  verdict TEXT NOT NULL CHECK(verdict IN ('naturale','non_naturale','non_so')), updated_at TEXT NOT NULL,
  PRIMARY KEY(secret_id, word_id)) STRICT, WITHOUT ROWID;
CREATE TABLE run_metrics(
  run_id INTEGER NOT NULL REFERENCES runs(id), metric_id INTEGER NOT NULL REFERENCES metric_names(id),
  subset_id INTEGER NOT NULL REFERENCES subset_names(id),
  value REAL, low REAL, high REAL, n INTEGER NOT NULL,
  PRIMARY KEY(run_id, metric_id, subset_id)) STRICT, WITHOUT ROWID;
CREATE TABLE run_secret_metrics(
  run_id INTEGER NOT NULL REFERENCES runs(id), secret_id INTEGER NOT NULL REFERENCES words(id),
  metric_id INTEGER NOT NULL REFERENCES metric_names(id), value REAL,
  PRIMARY KEY(run_id, secret_id, metric_id)) STRICT, WITHOUT ROWID;

CREATE VIEW v_runs AS
  SELECT r.id AS id, p.name AS profilo, r.status AS status, r.created_at AS created_at, r.finished_at AS finished_at,
         r.judge_version AS judge_version, r.evaluator_version AS evaluator_version, r.split_rule AS split_rule,
         r.reference_sha256 AS reference_sha256, r.gold_sha256 AS gold_sha256
  FROM runs r JOIN profiles p ON p.id = r.profile_id;
CREATE VIEW v_run_metrics AS
  SELECT m.run_id AS run_id, p.name AS profilo, r.created_at AS created_at, r.status AS status, r.judge_version AS judge_version,
         mn.name AS metrica, sn.name AS sottoinsieme, m.value AS value, m.low AS low, m.high AS high, m.n AS n
  FROM run_metrics m JOIN runs r ON r.id = m.run_id JOIN profiles p ON p.id = r.profile_id
       JOIN metric_names mn ON mn.id = m.metric_id JOIN subset_names sn ON sn.id = m.subset_id;
CREATE VIEW v_sample_top AS
  SELECT r.id AS run_id, p.name AS profilo, s.word AS secret, sm.block AS block, sm.has_gold AS has_gold,
         t.position AS position, w.word AS word, t.verified AS verified, t.variant AS variant,
         (SELECT h.verdict FROM human_verdicts h WHERE h.secret_id = t.secret_id AND h.word_id = t.word_id) AS human,
         (SELECT j.grade FROM judge_verdicts j WHERE j.secret_id = t.secret_id AND j.word_id = t.word_id
            AND j.judge_version = r.judge_version ORDER BY j.created_at DESC LIMIT 1) AS judge_grade,
         (SELECT j.sense_ok FROM judge_verdicts j WHERE j.secret_id = t.secret_id AND j.word_id = t.word_id
            AND j.judge_version = r.judge_version ORDER BY j.created_at DESC LIMIT 1) AS judge_sense_ok,
         (SELECT j.reason FROM judge_verdicts j WHERE j.secret_id = t.secret_id AND j.word_id = t.word_id
            AND j.judge_version = r.judge_version ORDER BY j.created_at DESC LIMIT 1) AS judge_reason
  FROM sample sm JOIN words s ON s.id = sm.secret_id
       JOIN run_top t ON t.secret_id = sm.secret_id JOIN runs r ON r.id = t.run_id AND r.status = 'completa'
       JOIN profiles p ON p.id = r.profile_id JOIN words w ON w.id = t.word_id
  WHERE t.position <= 11;
PRAGMA user_version = 1;
'''

HumanVerdict = Literal['naturale', 'non_naturale', 'non_so']


@dataclass(frozen=True)
class Verdict:
    word: str
    grade: int
    sense_ok: bool | None
    reason: str


@dataclass(frozen=True)
class SampleRow:
    secret: str
    has_gold: bool
    block: int


@dataclass(frozen=True)
class MetricRow:
    metric: str
    subset: str
    value: float | None
    low: float | None
    high: float | None
    n: int


@dataclass(frozen=True)
class SecretMetricRow:
    secret: str
    metric: str
    value: float | None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


class Store:
    def __init__(self, path: Path = paths.RESULTS):
        self.path = Path(path)
        self.con = sqlite3.connect(self.path)
        self.con.execute('PRAGMA journal_mode = WAL')
        self.con.execute('PRAGMA synchronous = NORMAL')   # con il WAL basta: un taglio di corrente può perdere solo gli ultimi salvataggi
        self.con.execute('PRAGMA foreign_keys = ON')
        self.con.execute('PRAGMA busy_timeout = 5000')
        if self.con.execute('PRAGMA user_version').fetchone()[0] == 0:
            self.con.executescript(self.ddl())
        elif self.con.execute('PRAGMA user_version').fetchone()[0] != SCHEMA_VERSION:
            raise ValueError(f'{self.path.name}: versione dello schema non supportata')

    @staticmethod
    def ddl() -> str:
        return DDL

    def close(self) -> None:
        self.con.close()

    def vacuum(self) -> None:
        self.con.execute('VACUUM')

    # --- parole, nomi, profili ---

    def _id(self, table: str, column: str, value: str) -> int:
        with self.con:
            self.con.execute(f'INSERT OR IGNORE INTO {table}({column}) VALUES (?)', (value,))
        return self.con.execute(f'SELECT id FROM {table} WHERE {column} = ?', (value,)).fetchone()[0]

    def word_id(self, word: str) -> int:
        return self._id('words', 'word', norm(word))

    def word_ids(self, words: list[str]) -> list[int]:
        """Gli id di molte parole con una sola transazione (una per parola sarebbe lentissima con migliaia di segrete)."""
        normalized = [norm(w) for w in words]
        with self.con:
            self.con.executemany('INSERT OR IGNORE INTO words(word) VALUES (?)', [(w,) for w in dict.fromkeys(normalized)])
        found: dict[str, int] = {}
        unique = list(dict.fromkeys(normalized))
        for start in range(0, len(unique), 500):
            chunk = unique[start:start + 500]
            marks = ','.join('?' * len(chunk))
            found.update(self.con.execute(f'SELECT word, id FROM words WHERE word IN ({marks})', chunk).fetchall())
        return [found[w] for w in normalized]

    def profile_id(self, name: str, origin: str, vectors_sha256: str, dim: int, words: int) -> int:
        with self.con:
            self.con.execute('INSERT OR IGNORE INTO profiles(name, origin, vectors_sha256, dim, words) VALUES (?,?,?,?,?)',
                             (name, origin, vectors_sha256, dim, words))
        return self.con.execute('SELECT id FROM profiles WHERE name = ? AND vectors_sha256 = ?', (name, vectors_sha256)).fetchone()[0]

    # --- esecuzioni ---

    def start_run(self, profile_id: int, judge_version: str | None, reference_sha256: str, gold_sha256: str) -> int:
        with self.con:
            cur = self.con.execute(
                'INSERT INTO runs(profile_id, created_at, status, evaluator_version, judge_version, split_rule, reference_sha256, gold_sha256)'
                " VALUES (?,?,'in_corso',?,?,?,?,?)",
                (profile_id, _now(), EVALUATOR_VERSION, judge_version, SPLIT_RULE, reference_sha256, gold_sha256))
        return cur.lastrowid

    def finish_run(self, run_id: int, status: Literal['completa', 'annullata']) -> None:
        with self.con:
            self.con.execute('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?', (status, _now(), run_id))

    def open_run(self, profile_id: int, reference_sha256: str, gold_sha256: str, judge_version: str | None) -> int | None:
        """L'esecuzione interrotta con gli stessi ingressi, da riprendere; altrimenti None."""
        row = self.con.execute(
            "SELECT id FROM runs WHERE profile_id = ? AND status = 'in_corso' AND reference_sha256 = ? AND gold_sha256 = ?"
            ' AND judge_version IS ? ORDER BY id DESC LIMIT 1', (profile_id, reference_sha256, gold_sha256, judge_version)).fetchone()
        return row[0] if row else None

    # --- prime 20 ---

    def save_top(self, run_id: int, secret: str, words: list[str], verified: list[bool], variant: list[bool]) -> None:
        if not len(words) == len(verified) == len(variant):
            raise ValueError('words, verified e variant devono avere la stessa lunghezza')
        if len(words) > TOP:
            raise ValueError(f'Al più {TOP} parole per segreta (posizioni 2..{TOP + 1})')
        secret_id, *ids = self.word_ids([secret, *words])
        with self.con:
            self.con.execute('DELETE FROM run_top WHERE run_id = ? AND secret_id = ?', (run_id, secret_id))
            self.con.executemany('INSERT INTO run_top VALUES (?,?,?,?,?,?)',
                                 [(run_id, secret_id, 2 + i, wid, int(verified[i]), int(variant[i])) for i, wid in enumerate(ids)])

    def top(self, run_id: int, secret: str) -> list[str]:
        rows = self.con.execute('SELECT w.word FROM run_top t JOIN words w ON w.id = t.word_id '
                                'JOIN words s ON s.id = t.secret_id WHERE t.run_id = ? AND s.word = ? ORDER BY t.position',
                                (run_id, norm(secret))).fetchall()
        return [w for (w,) in rows]

    # --- verdetti ---

    def judge_verdict(self, secret: str, word: str, judge_version: str, model: str) -> Verdict | None:
        row = self.con.execute(
            'SELECT j.grade, j.sense_ok, j.reason FROM judge_verdicts j JOIN words s ON s.id = j.secret_id '
            'JOIN words w ON w.id = j.word_id WHERE s.word = ? AND w.word = ? AND j.judge_version = ? AND j.model = ?',
            (norm(secret), norm(word), judge_version, model)).fetchone()
        return Verdict(norm(word), row[0], None if row[1] is None else bool(row[1]), row[2]) if row else None

    def save_judge_verdicts(self, secret: str, judge_version: str, model: str, verdicts: list[Verdict]) -> None:
        secret_id, *ids = self.word_ids([secret, *(v.word for v in verdicts)])
        now = _now()
        with self.con:  # una transazione: o tutti i verdetti della segreta o nessuno
            self.con.executemany(
                'INSERT OR REPLACE INTO judge_verdicts VALUES (?,?,?,?,?,?,?,?)',
                [(secret_id, wid, judge_version, model, v.grade, None if v.sense_ok is None else int(v.sense_ok), v.reason, now)
                 for wid, v in zip(ids, verdicts)])

    def judge_verdicts(self, secret: str, judge_version: str) -> dict[str, Verdict]:
        """I verdetti di una versione del giudice per tutte le parole della segreta, di qualunque modello: per ogni parola
        vale il più recente. Serve al ricalcolo, che non ha un modello in mano."""
        rows = self.con.execute(
            'SELECT w.word, j.grade, j.sense_ok, j.reason FROM judge_verdicts j JOIN words s ON s.id = j.secret_id '
            'JOIN words w ON w.id = j.word_id WHERE s.word = ? AND j.judge_version = ? ORDER BY j.created_at, j.model',
            (norm(secret), judge_version))
        return {w: Verdict(w, g, None if sense is None else bool(sense), reason) for w, g, sense, reason in rows}

    def save_human_verdict(self, secret: str, word: str, verdict: HumanVerdict) -> None:
        secret_id, word_id = self.word_id(secret), self.word_id(word)
        with self.con:
            self.con.execute('INSERT INTO human_verdicts VALUES (?,?,?,?) ON CONFLICT(secret_id, word_id) '
                             'DO UPDATE SET verdict = excluded.verdict, updated_at = excluded.updated_at',
                             (secret_id, word_id, verdict, _now()))

    def human_verdicts(self) -> dict[tuple[str, str], HumanVerdict]:
        rows = self.con.execute('SELECT s.word, w.word, h.verdict FROM human_verdicts h JOIN words s ON s.id = h.secret_id '
                                'JOIN words w ON w.id = h.word_id')
        return {(s, w): v for s, w, v in rows}

    # --- campione ---

    def sample(self) -> list[SampleRow]:
        rows = self.con.execute('SELECT w.word, s.has_gold, s.block FROM sample s JOIN words w ON w.id = s.secret_id '
                                'ORDER BY s.block, w.word')
        return [SampleRow(w, bool(g), b) for w, g, b in rows]

    def add_sample(self, rows: list[SampleRow], seed: int) -> None:
        ids = self.word_ids([r.secret for r in rows])
        with self.con:
            self.con.executemany('INSERT OR IGNORE INTO sample VALUES (?,?,?,?)',
                                 [(i, int(r.has_gold), r.block, seed) for i, r in zip(ids, rows)])

    # --- metriche ---

    def save_metrics(self, run_id: int, rows: list[MetricRow]) -> None:
        prepared = [(run_id, self._id('metric_names', 'name', r.metric), self._id('subset_names', 'name', r.subset),
                     r.value, r.low, r.high, r.n) for r in rows]
        with self.con:
            self.con.executemany('INSERT OR REPLACE INTO run_metrics VALUES (?,?,?,?,?,?,?)', prepared)

    def save_secret_metrics(self, run_id: int, rows: list[SecretMetricRow]) -> None:
        ids = self.word_ids([r.secret for r in rows])
        prepared = [(run_id, sid, self._id('metric_names', 'name', r.metric), r.value) for sid, r in zip(ids, rows)]
        with self.con:
            self.con.executemany('INSERT OR REPLACE INTO run_secret_metrics VALUES (?,?,?,?)', prepared)
