// ZeroTaboo against DIRETTIVE.md: bounded memory (§3), errors that do not escape (§7), a versioned schema and its migration (§8, appendix).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { TABOO_RULES } from '../packages/shared/src/index.ts'
import { OTHER_WRONG, TABOO_SCHEMA_VERSION, TabooStore } from '../apps/server/src/taboo-db.ts'
import { setup, viewer } from './helpers/tabooHarness.ts'

test('§3: the wrong answers of a card are capped in memory before they pile up; the rest is counted together', () => {
  const h = setup()
  assert.deepEqual(h.startMatch(), { ok: true })
  assert.deepEqual(h.startRound(), { ok: true })
  for (let i = 0; i < 600; i++) h.say(viewer(`u${i}`), `zz${i}`, `m${i}`)
  const wrong = Reflect.get(h.room, 'wrong') as Map<string, number>
  assert.ok(wrong.size <= TABOO_RULES.maxWrongAnswerTexts, `size ${wrong.size}`)
  assert.ok((wrong.get(OTHER_WRONG) ?? 0) > 300)
  assert.equal([...wrong.values()].reduce((a, b) => a + b, 0), 600) // nothing is lost: it is counted
})

function withReport() {
  const h = setup()
  h.startMatch()
  h.startRound()
  const first = h.exposure()
  assert.deepEqual(h.cmd({ type: 'skip', exposure: first }), { ok: true }) // closes the card: the report is about a closed one
  assert.deepEqual(h.cmd({ type: 'report', exposure: first, reason: 'late violation' }), { ok: true })
  h.endRound()
  const report = h.room.admin().reports[0]
  assert.ok(report)
  return { h, report }
}

test('§7: a failing store in decide() becomes a typed reply, not an exception; the report stays pending', () => {
  const { h, report } = withReport()
  h.store.rejectReport = () => { throw new Error('disk I/O error') }
  const reply = h.cmd({ type: 'decide', report: report.id, verifiable: false, reason: 'cannot verify' })
  assert.equal(reply.ok, false)
  if (!reply.ok) assert.equal(reply.error, 'unavailable')
  assert.equal(h.room.admin().reports.length, 1)
})

test('§7: control() never throws, whatever the store does', () => {
  const { h, report } = withReport()
  h.store.applyCorrection = () => { throw new Error('boom') }
  assert.doesNotThrow(() => h.cmd({ type: 'decide', report: report.id, verifiable: true, reason: 'x' }))
  h.store.pendingReports = () => { throw new Error('boom') }
  assert.doesNotThrow(() => h.room.admin())
})

test('the pending reports are read from the store once, not at every emission', () => {
  const { h } = withReport()
  let reads = 0
  const original = h.store.pendingReports.bind(h.store)
  h.store.pendingReports = (m) => { reads++; return original(m) }
  h.room.admin()
  h.room.admin()
  h.room.admin()
  assert.equal(reads, 0) // already cached by the previous emission
})

test('§8: the schema carries its version; a database of a newer program is refused, untouched', () => {
  const db = new Database(':memory:')
  new TabooStore(db)
  assert.equal(db.prepare("SELECT value FROM taboo_meta WHERE name = 'schema_version'").pluck().get(), String(TABOO_SCHEMA_VERSION))
  db.prepare("UPDATE taboo_meta SET value = '99' WHERE name = 'schema_version'").run()
  assert.throws(() => new TabooStore(db), /newer than this program/)
  assert.equal(db.prepare("SELECT value FROM taboo_meta WHERE name = 'schema_version'").pluck().get(), '99')
})

test('appendix SQLite: the repeated words are integer keys into lookups, and `hint_mode` is derived, not stored', () => {
  const db = new Database(':memory:')
  new TabooStore(db)
  const type = (table: string, column: string) => (db.prepare('SELECT type FROM pragma_table_info(?) WHERE name = ?').pluck().get(table, column) as string | undefined)
  for (const [table, column] of [['taboo_matches', 'platform'], ['taboo_matches', 'status'], ['taboo_matches', 'rules_version'], ['taboo_matches', 'deck_version'],
    ['taboo_players', 'platform'], ['taboo_moderation', 'kind'], ['taboo_moderation', 'status'], ['taboo_rounds', 'category'], ['taboo_rounds', 'narrative']]) {
    assert.equal(type(table, column), 'INTEGER', `${table}.${column}`)
  }
  assert.equal(type('taboo_exposures', 'hint_mode'), undefined)
  assert.ok((db.prepare('SELECT name FROM pragma_table_info(?)').pluck().all('taboo_exposure_report') as string[]).includes('hint_mode'))
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})

// The schema of version 1 as it was written before the lookups: text columns, and `hint_mode`.
const V1 = `
CREATE TABLE taboo_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE taboo_outcomes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE taboo_modes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE taboo_score_kinds (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE taboo_players (n INTEGER PRIMARY KEY, platform TEXT NOT NULL CHECK (platform IN ('tiktok','twitch')), ref TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE taboo_matches (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, room_key TEXT NOT NULL, mode INTEGER NOT NULL REFERENCES taboo_modes(n),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','twitch')), threshold INTEGER NOT NULL CHECK (threshold > 0), rules_version TEXT NOT NULL,
  deck_version TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('active','suspended','finished','cancelled'))) STRICT;
CREATE TABLE taboo_rounds (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n), number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 5),
  category TEXT, narrative TEXT, skips_used INTEGER NOT NULL DEFAULT 0 CHECK (skips_used BETWEEN 0 AND 2), started_at INTEGER, ended_at INTEGER,
  UNIQUE (match, number)) STRICT;
CREATE TABLE taboo_exposures (n INTEGER PRIMARY KEY, round INTEGER NOT NULL REFERENCES taboo_rounds(n), seq INTEGER NOT NULL, card_code TEXT NOT NULL,
  card_revision INTEGER NOT NULL, difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3), start_ms INTEGER NOT NULL, end_ms INTEGER,
  available_ms INTEGER NOT NULL, outcome INTEGER REFERENCES taboo_outcomes(n), solve_ms INTEGER,
  jackpot INTEGER NOT NULL DEFAULT 0, sung INTEGER NOT NULL DEFAULT 0, interrupted INTEGER NOT NULL DEFAULT 0,
  active_guessers INTEGER NOT NULL DEFAULT 0, guess_count INTEGER NOT NULL DEFAULT 0, hint_mode TEXT, UNIQUE (round, seq)) STRICT;
CREATE TABLE taboo_winners (exposure INTEGER PRIMARY KEY REFERENCES taboo_exposures(n), player INTEGER NOT NULL REFERENCES taboo_players(n),
  received_ms INTEGER NOT NULL, message_key TEXT, alias TEXT) STRICT;
CREATE TABLE taboo_wrong_answers (exposure INTEGER NOT NULL REFERENCES taboo_exposures(n), text TEXT NOT NULL, count INTEGER NOT NULL CHECK (count > 0),
  PRIMARY KEY (exposure, text)) STRICT, WITHOUT ROWID;
CREATE TABLE taboo_moderation (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n), exposure INTEGER REFERENCES taboo_exposures(n),
  kind TEXT NOT NULL CHECK (kind IN ('violation','technical')), status TEXT NOT NULL CHECK (status IN ('pending','applied','rejected')),
  reported_at INTEGER NOT NULL, violation_at INTEGER, actor TEXT NOT NULL, reason TEXT NOT NULL) STRICT;
CREATE TABLE taboo_score_events (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n), exposure INTEGER REFERENCES taboo_exposures(n),
  kind INTEGER NOT NULL REFERENCES taboo_score_kinds(n), delta INTEGER NOT NULL, corrects INTEGER REFERENCES taboo_score_events(n),
  moderation INTEGER REFERENCES taboo_moderation(n), at INTEGER NOT NULL) STRICT;
CREATE TRIGGER taboo_score_events_no_update BEFORE UPDATE ON taboo_score_events BEGIN SELECT RAISE(ABORT, 'taboo_score_events is append-only'); END;
CREATE VIEW taboo_match_scores AS SELECT match, SUM(delta) AS team FROM taboo_score_events GROUP BY match;
CREATE VIEW taboo_effective_winners AS SELECT w.* FROM taboo_winners w;
CREATE VIEW taboo_exposure_report AS SELECT e.n AS exposure, e.hint_mode FROM taboo_exposures e;
CREATE VIEW taboo_comparable_exposures AS SELECT * FROM taboo_exposure_report;
INSERT INTO taboo_outcomes (n, name) VALUES (1,'solved'),(2,'skipped'),(3,'taboo'),(4,'round_timeout');
INSERT INTO taboo_modes (n, name) VALUES (1,'standard'),(2,'practice');
INSERT INTO taboo_score_kinds (n, name) VALUES (1,'base'),(2,'streak'),(3,'penalty'),(4,'correction');
INSERT INTO taboo_meta (name, value) VALUES ('pseudonym_key', 'aa');
INSERT INTO taboo_players (n, platform, ref) VALUES (7, 'twitch', 'ref-7');
INSERT INTO taboo_matches VALUES (3, 'm-3', 'room', 1, 'twitch', 25, 'taboo-3.0', 'v3.0', 1000, 2000, 'finished');
INSERT INTO taboo_rounds VALUES (5, 3, 2, 'C', 'thriller', 1, 1000, 1900);
INSERT INTO taboo_exposures VALUES (9, 5, 1, 'C01', 2, 2, 1000, 1500, 80000, 1, 500, 0, 1, 0, 4, 6, 'sung');
INSERT INTO taboo_winners VALUES (9, 7, 500, 'twitch:m1', NULL);
INSERT INTO taboo_wrong_answers VALUES (9, 'banana', 2);
INSERT INTO taboo_moderation VALUES (4, 3, 9, 'violation', 'pending', 1600, NULL, 'dashboard', 'late');
INSERT INTO taboo_score_events VALUES (11, 3, 9, 1, 4, NULL, NULL, 1500);
`

test('§8: a version 1 database is migrated with all its data, keys and names; the views keep their columns', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(V1)
  const store = new TabooStore(db)
  assert.equal(db.prepare("SELECT value FROM taboo_meta WHERE name = 'schema_version'").pluck().get(), '2')
  assert.equal(db.prepare("SELECT value FROM taboo_meta WHERE name = 'pseudonym_key'").pluck().get(), 'aa') // the key of the pseudonyms survives
  assert.deepEqual(db.prepare('SELECT p.n, pl.name AS platform, p.ref FROM taboo_players p JOIN taboo_platforms pl ON pl.n = p.platform').all(), [{ n: 7, platform: 'twitch', ref: 'ref-7' }])
  assert.deepEqual(db.prepare(`SELECT m.n, pl.name AS platform, s.name AS status, r.name AS rules, d.name AS deck, m.ended_at
    FROM taboo_matches m JOIN taboo_platforms pl ON pl.n = m.platform JOIN taboo_match_statuses s ON s.n = m.status
    JOIN taboo_versions r ON r.n = m.rules_version JOIN taboo_versions d ON d.n = m.deck_version`).all(),
  [{ n: 3, platform: 'twitch', status: 'finished', rules: 'taboo-3.0', deck: 'v3.0', ended_at: 2000 }])
  assert.deepEqual(db.prepare('SELECT r.n, c.code AS category, nr.name AS narrative FROM taboo_rounds r JOIN taboo_categories c ON c.n = r.category JOIN taboo_narratives nr ON nr.n = r.narrative').all(),
    [{ n: 5, category: 'C', narrative: 'thriller' }])
  const report = db.prepare('SELECT exposure, card_id, outcome, hint_mode, category, narrative, winner_id, mode FROM taboo_exposure_report').get()
  assert.deepEqual(report, { exposure: 9, card_id: 'C01', outcome: 'solved', hint_mode: 'sung', category: 'C', narrative: 'thriller', winner_id: 'ref-7', mode: 'standard' })
  assert.equal(db.prepare("SELECT s.name FROM taboo_moderation m JOIN taboo_moderation_statuses s ON s.n = m.status").pluck().get(), 'pending')
  assert.equal(db.prepare('SELECT team FROM taboo_match_scores').pluck().get(), 4)
  assert.equal(db.prepare('SELECT count FROM taboo_wrong_answers').pluck().get(), 2)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
  // the store works on the migrated data, and opening again changes nothing
  assert.equal(store.pendingReports(3).length, 1)
  assert.equal(store.abandonOpenMatches(5000), 0)
  new TabooStore(db)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_exposures').pluck().get(), 1)
})

test('§8: a failed migration leaves the version 1 database as it was', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(V1)
  db.exec("INSERT INTO taboo_matches VALUES (4, 'm-4', 'room', 1, 'tiktok', 25, 'taboo-3.0', 'v3.0', 1, NULL, 'active')")
  // an orphan the old schema could not forbid with foreign keys off: the migration must notice and roll back
  db.pragma('foreign_keys = OFF')
  db.exec("INSERT INTO taboo_rounds VALUES (6, 999, 1, NULL, NULL, 0, 1, NULL)")
  db.pragma('foreign_keys = ON')
  assert.throws(() => new TabooStore(db), /broken foreign keys/)
  assert.equal(db.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'taboo_platforms'").pluck().get(), 0)
  assert.equal(db.prepare('SELECT platform FROM taboo_matches WHERE n = 4').pluck().get(), 'tiktok')
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
})
