// ZeroTaboo's operational store: matches, rounds, card exposures, winners, score events and moderation (ZEROTABOO.md §3.7,
// §9.1, §11; guide §6). It lives in the server's own database (zerocade.db, outside Git); the deck is a file of its own
// (database/ZeroTaboo.sqlite3, read only). Foreign keys do not cross two files: an exposure keeps `card_code` and
// `card_revision`, and the deck loader checks that they exist (the one documented exception to the foreign keys, DIRETTIVE §0).
//
// The store receives the Database in the constructor, so the tests use `new Database(':memory:')`. Every write is short and
// synchronous: one transaction per closed card, one per correction. Nothing here awaits or does network.
//
// Privacy (D16): players are kept as a keyed hash of the user id (HMAC with a local key that stays in this database), never the
// nickname or the avatar; wrong answers only aggregated, without the user; everything older than 90 days is purged.
import { createHmac, randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import { TABOO_CATEGORIES, TABOO_NARRATIVES, TABOO_RULES, type TabooMode, type TabooOutcome, type TabooPlatform } from '@zerocade/shared'
import type { ScoreEvent } from './taboo-scoring.js'

const DAY_MS = 86_400_000

// Schema version 2 (DIRETTIVE appendix SQLite): the repeated words (platform, status, kind, category, narrative, versions) are
// integer keys into small lookup tables; `hint_mode` is derived from `sung` in the report view. Version 1 databases are migrated
// by `migrateV1` below. The names of the views and of their columns are unchanged.
export const TABOO_SCHEMA_VERSION = 2
export const OTHER_WRONG = '(altro)'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS taboo_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS taboo_outcomes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_modes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_score_kinds (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_platforms (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_match_statuses (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_moderation_kinds (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_moderation_statuses (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_categories (n INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_narratives (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_versions (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_players (n INTEGER PRIMARY KEY, platform INTEGER NOT NULL REFERENCES taboo_platforms(n),
  ref TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS taboo_matches (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, room_key TEXT NOT NULL,
  mode INTEGER NOT NULL REFERENCES taboo_modes(n), platform INTEGER NOT NULL REFERENCES taboo_platforms(n),
  threshold INTEGER NOT NULL CHECK (threshold > 0), rules_version INTEGER NOT NULL REFERENCES taboo_versions(n),
  deck_version INTEGER NOT NULL REFERENCES taboo_versions(n), started_at INTEGER NOT NULL, ended_at INTEGER,
  status INTEGER NOT NULL REFERENCES taboo_match_statuses(n)) STRICT;
CREATE INDEX IF NOT EXISTS taboo_matches_room ON taboo_matches(room_key, started_at);
CREATE TABLE IF NOT EXISTS taboo_rounds (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n),
  number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 5), category INTEGER REFERENCES taboo_categories(n),
  narrative INTEGER REFERENCES taboo_narratives(n),
  skips_used INTEGER NOT NULL DEFAULT 0 CHECK (skips_used BETWEEN 0 AND 2), started_at INTEGER, ended_at INTEGER,
  UNIQUE (match, number)) STRICT;
CREATE TABLE IF NOT EXISTS taboo_exposures (n INTEGER PRIMARY KEY, round INTEGER NOT NULL REFERENCES taboo_rounds(n),
  seq INTEGER NOT NULL, card_code TEXT NOT NULL, card_revision INTEGER NOT NULL,
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3), start_ms INTEGER NOT NULL, end_ms INTEGER,
  available_ms INTEGER NOT NULL, outcome INTEGER REFERENCES taboo_outcomes(n), solve_ms INTEGER,
  jackpot INTEGER NOT NULL DEFAULT 0 CHECK (jackpot IN (0,1)), sung INTEGER NOT NULL DEFAULT 0 CHECK (sung IN (0,1)),
  interrupted INTEGER NOT NULL DEFAULT 0 CHECK (interrupted IN (0,1)),
  active_guessers INTEGER NOT NULL DEFAULT 0, guess_count INTEGER NOT NULL DEFAULT 0,
  CHECK (NOT (jackpot AND sung)),
  UNIQUE (round, seq)) STRICT;
CREATE TABLE IF NOT EXISTS taboo_winners (exposure INTEGER PRIMARY KEY REFERENCES taboo_exposures(n),
  player INTEGER NOT NULL REFERENCES taboo_players(n), received_ms INTEGER NOT NULL, message_key TEXT, alias TEXT) STRICT;
CREATE TABLE IF NOT EXISTS taboo_wrong_answers (exposure INTEGER NOT NULL REFERENCES taboo_exposures(n), text TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0), PRIMARY KEY (exposure, text)) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS taboo_moderation (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n),
  exposure INTEGER REFERENCES taboo_exposures(n), kind INTEGER NOT NULL REFERENCES taboo_moderation_kinds(n),
  status INTEGER NOT NULL REFERENCES taboo_moderation_statuses(n), reported_at INTEGER NOT NULL, violation_at INTEGER,
  actor TEXT NOT NULL, reason TEXT NOT NULL CHECK (length(reason) <= ${TABOO_RULES.maxReasonChars})) STRICT;
CREATE TABLE IF NOT EXISTS taboo_score_events (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n),
  exposure INTEGER REFERENCES taboo_exposures(n), kind INTEGER NOT NULL REFERENCES taboo_score_kinds(n), delta INTEGER NOT NULL,
  corrects INTEGER REFERENCES taboo_score_events(n), moderation INTEGER REFERENCES taboo_moderation(n), at INTEGER NOT NULL) STRICT;
-- Append-only: an event is never changed, and it can be deleted only when its match is older than the retention (D16).
CREATE TRIGGER IF NOT EXISTS taboo_score_events_no_update BEFORE UPDATE ON taboo_score_events
  BEGIN SELECT RAISE(ABORT, 'taboo_score_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS taboo_score_events_no_delete BEFORE DELETE ON taboo_score_events
  WHEN COALESCE((SELECT ended_at FROM taboo_matches WHERE n = OLD.match), 9223372036854775807)
       > CAST(strftime('%s', 'now') AS INTEGER) * 1000 - ${TABOO_RULES.telemetryRetentionDays} * ${DAY_MS}
  BEGIN SELECT RAISE(ABORT, 'taboo_score_events is append-only'); END;
-- The effective winners: a win revoked by an applied rectification is not one (the past is not rewritten).
CREATE VIEW IF NOT EXISTS taboo_effective_winners AS
  SELECT w.* FROM taboo_winners w
  WHERE NOT EXISTS (SELECT 1 FROM taboo_moderation m WHERE m.exposure = w.exposure
                    AND m.kind = (SELECT n FROM taboo_moderation_kinds WHERE name = 'violation')
                    AND m.status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'applied'));
CREATE VIEW IF NOT EXISTS taboo_match_scores AS
  SELECT match, SUM(delta) AS team FROM taboo_score_events GROUP BY match;
-- One row per exposure with the names of ZEROTABOO.md §3.7 and §9.1; the effective outcome follows an applied rectification.
CREATE VIEW IF NOT EXISTS taboo_exposure_report AS
  SELECT e.n AS exposure, e.card_code AS card_id, e.card_revision, m.id AS session_id, md.name AS mode,
         e.difficulty AS difficulty_at_play, r.number AS round_number, e.start_ms AS start_time, e.end_ms AS end_time,
         e.available_ms / 1000.0 AS seconds_available_when_started,
         CASE WHEN EXISTS (SELECT 1 FROM taboo_moderation x WHERE x.exposure = e.n
                           AND x.kind = (SELECT n FROM taboo_moderation_kinds WHERE name = 'violation')
                           AND x.status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'applied'))
              THEN 'taboo' ELSE o.name END AS outcome,
         e.solve_ms / 1000.0 AS solve_time_s, e.active_guessers, e.guess_count, p.ref AS winner_id,
         CASE WHEN e.sung = 1 THEN 'sung' END AS hint_mode,
         NULL AS taboo_word_id, e.jackpot, e.sung, e.interrupted, e.available_ms, c.code AS category, nr.name AS narrative
  FROM taboo_exposures e JOIN taboo_rounds r ON r.n = e.round JOIN taboo_matches m ON m.n = r.match
  JOIN taboo_modes md ON md.n = m.mode LEFT JOIN taboo_outcomes o ON o.n = e.outcome
  LEFT JOIN taboo_categories c ON c.n = r.category LEFT JOIN taboo_narratives nr ON nr.n = r.narrative
  LEFT JOIN taboo_effective_winners w ON w.exposure = e.n LEFT JOIN taboo_players p ON p.n = w.player;
-- The comparable sample of §9.1: no experimental mode, at least 20 s available, no Taboo error, no technical interruption.
CREATE VIEW IF NOT EXISTS taboo_comparable_exposures AS
  SELECT * FROM taboo_exposure_report
  WHERE mode = 'standard' AND available_ms >= 20000 AND outcome IS NOT NULL AND outcome <> 'taboo' AND interrupted = 0;
`

const OUTCOMES: readonly TabooOutcome[] = ['solved', 'skipped', 'taboo', 'round_timeout']
const MODES: readonly TabooMode[] = ['standard', 'practice']
const SCORE_KINDS = ['base', 'streak', 'penalty', 'correction'] as const
const PLATFORMS = ['tiktok', 'twitch'] as const
const MATCH_STATUSES = ['active', 'suspended', 'finished', 'cancelled'] as const
const MODERATION_KINDS = ['violation', 'technical'] as const
const MODERATION_STATUSES = ['pending', 'applied', 'rejected'] as const

// The tables of version 1, children first: copied aside, dropped and rebuilt by the migration.
const V1_TABLES = ['taboo_score_events', 'taboo_wrong_answers', 'taboo_winners', 'taboo_moderation', 'taboo_exposures', 'taboo_rounds', 'taboo_matches', 'taboo_players'] as const
const V1_VIEWS = ['taboo_comparable_exposures', 'taboo_exposure_report', 'taboo_match_scores', 'taboo_effective_winners'] as const

export interface MatchInput {
  id: string
  roomKey: string
  mode: TabooMode
  platform: TabooPlatform
  threshold: number
  rulesVersion: string
  deckVersion: string
  at: number
}

export interface ExposureInput {
  round: number // the row number of the round
  seq: number
  cardCode: string
  cardRevision: number
  difficulty: number
  startMs: number
  availableMs: number
  jackpot: boolean
}

export interface CloseInput {
  outcome: TabooOutcome
  endMs: number
  solveMs: number | null
  sung: boolean
  interrupted: boolean
  activeGuessers: number
  guessCount: number
  winner: { platform: TabooPlatform; userId: string; receivedMs: number; messageKey: string | null; alias: string | null } | null
  events: readonly ScoreEvent[]
  match: number
  at: number
}

export class TabooStore {
  constructor(private readonly db: Database.Database) {
    const exists = (name: string) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").pluck().get(name) !== undefined
    const stored = exists('taboo_meta') ? (db.prepare("SELECT value FROM taboo_meta WHERE name = 'schema_version'").pluck().get() as string | undefined) : undefined
    const version = stored === undefined ? (exists('taboo_matches') ? 1 : 0) : Number(stored)
    // A database written by a newer program is not touched: opening it with an older schema could corrupt it.
    if (!Number.isInteger(version) || version > TABOO_SCHEMA_VERSION) throw new Error(`[taboo] schema version ${stored} is newer than this program (${TABOO_SCHEMA_VERSION})`)
    if (version === 1) this.migrateV1()
    db.pragma('foreign_keys = ON')
    db.transaction(() => {
      db.exec(SCHEMA)
      this.seedLookups()
      db.prepare("INSERT OR REPLACE INTO taboo_meta (name, value) VALUES ('schema_version', ?)").run(String(TABOO_SCHEMA_VERSION))
    }).immediate()
  }

  private seedLookups(): void {
    const db = this.db
    for (const [table, names] of [
      ['taboo_outcomes', OUTCOMES], ['taboo_modes', MODES], ['taboo_score_kinds', SCORE_KINDS], ['taboo_platforms', PLATFORMS],
      ['taboo_match_statuses', MATCH_STATUSES], ['taboo_moderation_kinds', MODERATION_KINDS], ['taboo_moderation_statuses', MODERATION_STATUSES],
      ['taboo_narratives', TABOO_NARRATIVES],
    ] as const) {
      const insert = db.prepare(`INSERT OR IGNORE INTO ${table} (n, name) VALUES (?, ?)`)
      names.forEach((name, i) => insert.run(i + 1, name))
    }
    const category = db.prepare('INSERT OR IGNORE INTO taboo_categories (n, code) VALUES (?, ?)')
    TABOO_CATEGORIES.forEach((c, i) => category.run(i + 1, c.code))
  }

  // Version 1 -> 2: the data is copied aside, the tables are rebuilt with the lookups and the data goes back with the same keys.
  // Foreign keys are off only for the rebuild (the pragma is a no-op inside a transaction) and checked before it is committed.
  private migrateV1(): void {
    const db = this.db
    db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        for (const t of V1_TABLES) db.exec(`CREATE TEMP TABLE old_${t} AS SELECT * FROM ${t}`)
        for (const v of V1_VIEWS) db.exec(`DROP VIEW IF EXISTS ${v}`)
        for (const t of V1_TABLES) db.exec(`DROP TABLE ${t}`)
        db.exec(SCHEMA)
        this.seedLookups()
        db.exec(`
          INSERT OR IGNORE INTO taboo_versions (name) SELECT rules_version FROM old_taboo_matches UNION SELECT deck_version FROM old_taboo_matches;
          INSERT INTO taboo_players (n, platform, ref) SELECT n, (SELECT n FROM taboo_platforms WHERE name = o.platform), ref FROM old_taboo_players o;
          INSERT INTO taboo_matches (n, id, room_key, mode, platform, threshold, rules_version, deck_version, started_at, ended_at, status)
            SELECT n, id, room_key, mode, (SELECT n FROM taboo_platforms WHERE name = o.platform), threshold,
                   (SELECT n FROM taboo_versions WHERE name = o.rules_version), (SELECT n FROM taboo_versions WHERE name = o.deck_version),
                   started_at, ended_at, (SELECT n FROM taboo_match_statuses WHERE name = o.status) FROM old_taboo_matches o;
          INSERT INTO taboo_rounds (n, match, number, category, narrative, skips_used, started_at, ended_at)
            SELECT n, match, number, (SELECT n FROM taboo_categories WHERE code = o.category), (SELECT n FROM taboo_narratives WHERE name = o.narrative),
                   skips_used, started_at, ended_at FROM old_taboo_rounds o;
          INSERT INTO taboo_exposures (n, round, seq, card_code, card_revision, difficulty, start_ms, end_ms, available_ms, outcome, solve_ms, jackpot, sung, interrupted, active_guessers, guess_count)
            SELECT n, round, seq, card_code, card_revision, difficulty, start_ms, end_ms, available_ms, outcome, solve_ms, jackpot, sung, interrupted, active_guessers, guess_count FROM old_taboo_exposures;
          INSERT INTO taboo_winners SELECT * FROM old_taboo_winners;
          INSERT INTO taboo_wrong_answers SELECT * FROM old_taboo_wrong_answers;
          INSERT INTO taboo_moderation (n, match, exposure, kind, status, reported_at, violation_at, actor, reason)
            SELECT n, match, exposure, (SELECT n FROM taboo_moderation_kinds WHERE name = o.kind), (SELECT n FROM taboo_moderation_statuses WHERE name = o.status),
                   reported_at, violation_at, actor, reason FROM old_taboo_moderation o;
          INSERT INTO taboo_score_events SELECT * FROM old_taboo_score_events;
        `)
        for (const t of V1_TABLES) db.exec(`DROP TABLE old_${t}`)
        db.prepare("INSERT OR REPLACE INTO taboo_meta (name, value) VALUES ('schema_version', '2')").run()
        const broken = db.pragma('foreign_key_check') as unknown[]
        if (broken.length) throw new Error(`[taboo] migration v1->v2 leaves ${broken.length} broken foreign keys`)
      }).immediate()
    } finally {
      db.pragma('foreign_keys = ON')
    }
  }

  // The local key of the pseudonyms: made once, kept in this database (outside Git), never logged or exported.
  private key(): Buffer {
    const row = this.db.prepare("SELECT value FROM taboo_meta WHERE name = 'pseudonym_key'").pluck().get() as string | undefined
    if (row) return Buffer.from(row, 'hex')
    const fresh = randomBytes(32)
    this.db.prepare("INSERT OR IGNORE INTO taboo_meta (name, value) VALUES ('pseudonym_key', ?)").run(fresh.toString('hex'))
    return Buffer.from(this.db.prepare("SELECT value FROM taboo_meta WHERE name = 'pseudonym_key'").pluck().get() as string, 'hex')
  }

  pseudonym(userId: string): string {
    return createHmac('sha256', this.key()).update(userId).digest('hex').slice(0, 32)
  }

  private player(platform: TabooPlatform, userId: string): number {
    const ref = this.pseudonym(userId)
    this.db.prepare('INSERT OR IGNORE INTO taboo_players (platform, ref) VALUES ((SELECT n FROM taboo_platforms WHERE name = ?), ?)').run(platform, ref)
    return this.db.prepare('SELECT n FROM taboo_players WHERE ref = ?').pluck().get(ref) as number
  }

  startMatch(m: MatchInput): number {
    const mode = this.db.prepare('SELECT n FROM taboo_modes WHERE name = ?').pluck().get(m.mode) as number
    return this.db.transaction(() => {
      const version = this.db.prepare('INSERT INTO taboo_versions (name) VALUES (?) ON CONFLICT (name) DO NOTHING')
      version.run(m.rulesVersion)
      version.run(m.deckVersion)
      return Number(this.db.prepare(
        `INSERT INTO taboo_matches (id, room_key, mode, platform, threshold, rules_version, deck_version, started_at, status)
         VALUES (?, ?, ?, (SELECT n FROM taboo_platforms WHERE name = ?), ?, (SELECT n FROM taboo_versions WHERE name = ?),
                 (SELECT n FROM taboo_versions WHERE name = ?), ?, (SELECT n FROM taboo_match_statuses WHERE name = 'active'))`,
      ).run(m.id, m.roomKey, mode, m.platform, m.threshold, m.rulesVersion, m.deckVersion, m.at).lastInsertRowid)
    }).immediate()
  }

  setMatchStatus(match: number, status: 'active' | 'suspended' | 'finished' | 'cancelled', at: number): void {
    this.db.prepare('UPDATE taboo_matches SET status = (SELECT n FROM taboo_match_statuses WHERE name = ?), ended_at = ? WHERE n = ?')
      .run(status, status === 'finished' || status === 'cancelled' ? at : null, match)
  }

  // A match left open when the server stopped cannot be resumed: it is closed as cancelled, and its exposures stay as they were.
  abandonOpenMatches(at: number): number {
    return this.db.prepare(
      `UPDATE taboo_matches SET status = (SELECT n FROM taboo_match_statuses WHERE name = 'cancelled'), ended_at = ?
       WHERE status IN (SELECT n FROM taboo_match_statuses WHERE name IN ('active','suspended'))`,
    ).run(at).changes
  }

  startRound(match: number, number: number, category: string | null, narrative: string | null, at: number): number {
    return Number(this.db.prepare(
      `INSERT INTO taboo_rounds (match, number, category, narrative, started_at)
       VALUES (?, ?, (SELECT n FROM taboo_categories WHERE code = ?), (SELECT n FROM taboo_narratives WHERE name = ?), ?)`,
    )
      .run(match, number, category, narrative, at).lastInsertRowid)
  }

  endRound(round: number, skipsUsed: number, at: number): void {
    this.db.prepare('UPDATE taboo_rounds SET skips_used = ?, ended_at = ? WHERE n = ?').run(skipsUsed, at, round)
  }

  openExposure(e: ExposureInput): number {
    return Number(this.db.prepare(
      `INSERT INTO taboo_exposures (round, seq, card_code, card_revision, difficulty, start_ms, available_ms, jackpot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(e.round, e.seq, e.cardCode, e.cardRevision, e.difficulty, Math.round(e.startMs), Math.round(e.availableMs), e.jackpot ? 1 : 0).lastInsertRowid)
  }

  // A card's closure is ONE transaction: the outcome, the winner (at most one per exposure: the primary key says so) and the
  // score events. The public state with the new points is emitted only after this returns (DIRETTIVE §9).
  closeExposure(exposure: number, c: CloseInput): void {
    const run = this.db.transaction(() => {
      const outcome = this.db.prepare('SELECT n FROM taboo_outcomes WHERE name = ?').pluck().get(c.outcome) as number
      const changed = this.db.prepare(
        `UPDATE taboo_exposures SET end_ms = ?, outcome = ?, solve_ms = ?, sung = ?, interrupted = ?, active_guessers = ?, guess_count = ?
         WHERE n = ? AND outcome IS NULL`,
      ).run(Math.round(c.endMs), outcome, c.solveMs === null ? null : Math.round(c.solveMs), c.sung ? 1 : 0, c.interrupted ? 1 : 0, c.activeGuessers, c.guessCount, exposure).changes
      if (changed !== 1) throw new Error('Esposizione già chiusa o inesistente') // I2: a closed card is not closed twice
      if (c.winner) {
        const player = this.player(c.winner.platform, c.winner.userId)
        this.db.prepare('INSERT INTO taboo_winners (exposure, player, received_ms, message_key, alias) VALUES (?, ?, ?, ?, ?)')
          .run(exposure, player, Math.round(c.winner.receivedMs), c.winner.messageKey, c.winner.alias)
      }
      const insert = this.db.prepare('INSERT INTO taboo_score_events (match, exposure, kind, delta, at) VALUES (?, ?, (SELECT n FROM taboo_score_kinds WHERE name = ?), ?, ?)')
      for (const e of c.events) insert.run(c.match, exposure, e.kind, e.delta, c.at)
    })
    run.immediate()
  }

  // At most 200 rows per exposure: a text already there keeps counting, a new one beyond the cap goes into "(altro)".
  addWrongAnswers(exposure: number, counts: ReadonlyMap<string, number>): void {
    const upsert = this.db.prepare(
      'INSERT INTO taboo_wrong_answers (exposure, text, count) VALUES (?, ?, ?) ON CONFLICT (exposure, text) DO UPDATE SET count = count + excluded.count',
    )
    const known = this.db.prepare('SELECT 1 FROM taboo_wrong_answers WHERE exposure = ? AND text = ?')
    this.db.transaction(() => {
      let rows = this.db.prepare('SELECT count(*) FROM taboo_wrong_answers WHERE exposure = ?').pluck().get(exposure) as number
      for (const [raw, count] of counts) {
        const text = raw.slice(0, TABOO_RULES.wrongAnswerChars)
        if (known.get(exposure, text)) upsert.run(exposure, text, count)
        else if (rows < TABOO_RULES.maxWrongAnswerTexts - 1) { upsert.run(exposure, text, count); rows++ }
        else {
          if (!known.get(exposure, OTHER_WRONG)) rows++
          upsert.run(exposure, OTHER_WRONG, count)
        }
      }
    }).immediate()
  }

  // ---- Moderation and corrections (§3.5): append-only, with a reason ----

  report(r: { match: number; exposure: number | null; kind: 'violation' | 'technical'; reportedAt: number; violationAt: number | null; actor: string; reason: string }): number {
    // The count and the insert are one transaction: the cap holds even if another connection writes (DIRETTIVE §8).
    return this.db.transaction(() => {
      const pending = this.db.prepare(
        "SELECT count(*) FROM taboo_moderation WHERE match = ? AND status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'pending')",
      ).pluck().get(r.match) as number
      if (pending >= TABOO_RULES.maxModerationPending) throw new RangeError('Troppe segnalazioni in attesa')
      return Number(this.db.prepare(
        `INSERT INTO taboo_moderation (match, exposure, kind, status, reported_at, violation_at, actor, reason)
         VALUES (?, ?, (SELECT n FROM taboo_moderation_kinds WHERE name = ?), (SELECT n FROM taboo_moderation_statuses WHERE name = 'pending'), ?, ?, ?, ?)`,
      ).run(r.match, r.exposure, r.kind, r.reportedAt, r.violationAt, r.actor, r.reason.slice(0, TABOO_RULES.maxReasonChars)).lastInsertRowid)
    }).immediate()
  }

  pendingReports(match: number): { id: number; exposure: number | null; reason: string; at: number }[] {
    return this.db.prepare("SELECT n AS id, exposure, reason, reported_at AS at FROM taboo_moderation WHERE match = ? AND status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'pending') ORDER BY n").all(match) as never
  }

  rejectReport(id: number): void {
    this.db.prepare(`UPDATE taboo_moderation SET status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'rejected')
       WHERE n = ? AND status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'pending')`).run(id)
  }

  // The rectification: the win is revoked (the winner row stays; the view of the effective winners leaves it out) and the
  // differences are appended as events that point to the ones they correct. One transaction.
  applyCorrection(moderation: number, match: number, deltas: readonly { exposure: number; delta: number }[], at: number): void {
    this.db.transaction(() => {
      const changed = this.db.prepare(`UPDATE taboo_moderation SET status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'applied')
         WHERE n = ? AND status = (SELECT n FROM taboo_moderation_statuses WHERE name = 'pending')`).run(moderation).changes
      if (changed !== 1) throw new Error('Segnalazione già decisa o inesistente')
      const insert = this.db.prepare(
        `INSERT INTO taboo_score_events (match, exposure, kind, delta, corrects, moderation, at)
         VALUES (?, ?, (SELECT n FROM taboo_score_kinds WHERE name = 'correction'), ?, (SELECT max(n) FROM taboo_score_events WHERE exposure = ? AND match = ?), ?, ?)`,
      )
      for (const d of deltas) insert.run(match, d.exposure, d.delta, d.exposure, match, moderation, at)
    }).immediate()
  }

  // ---- Reads ----

  matchScore(match: number): number {
    return (this.db.prepare('SELECT team FROM taboo_match_scores WHERE match = ?').pluck().get(match) as number | undefined) ?? 0
  }

  // The codes of the cards played in the room's last `matches` matches (finished or cancelled): the two-matches exclusion (§5).
  recentCards(roomKey: string, matches: number = TABOO_RULES.excludeNextMatches): Set<string> {
    const rows = this.db.prepare(
      `SELECT DISTINCT e.card_code FROM taboo_exposures e JOIN taboo_rounds r ON r.n = e.round
       WHERE r.match IN (SELECT n FROM taboo_matches WHERE room_key = ? AND status IN (SELECT n FROM taboo_match_statuses WHERE name IN ('finished','cancelled')) AND mode = (SELECT n FROM taboo_modes WHERE name = 'standard')
                         ORDER BY started_at DESC LIMIT ?)`,
    ).pluck().all(roomKey, matches) as string[]
    return new Set(rows)
  }

  exposureReport(match: number): unknown[] {
    return this.db.prepare('SELECT * FROM taboo_exposure_report WHERE session_id = (SELECT id FROM taboo_matches WHERE n = ?) ORDER BY exposure').all(match)
  }

  // ---- Telemetry reports (ZEROTABOO.md §9). Computed by the worker or offline, never on the main thread during a live ----

  // The raw exposures with the names of §3.7 and §9.1 (the winner is a pseudonym, never an id or a nickname).
  exposuresTable(): { columns: string[]; rows: (string | number | null)[][] } {
    const stmt = this.db.prepare('SELECT * FROM taboo_exposure_report ORDER BY exposure')
    const columns = stmt.columns().map((c) => c.name)
    return { columns, rows: stmt.raw().all() as (string | number | null)[][] }
  }

  // The calibration of each card on the comparable sample (§9.1), by audience band (1-5, 6-20, 21+ active guessers) and overall.
  // Labels only suggest a level: an alert or a label asks for an editorial review, never changes a level by itself (§9.2).
  calibrationTable(): { columns: string[]; rows: (string | number | null)[][] } {
    interface Row { card_id: string; card_revision: number; session_id: string; outcome: string; solve_time_s: number | null; active_guessers: number; difficulty_at_play: number }
    const comparable = this.db.prepare('SELECT card_id, card_revision, session_id, outcome, solve_time_s, active_guessers, difficulty_at_play FROM taboo_comparable_exposures').all() as Row[]
    // The Taboo rate uses every standard exposure with enough time and no technical interruption, Taboo errors included.
    const eligible = this.db.prepare(
      "SELECT card_id, card_revision, outcome FROM taboo_exposure_report WHERE mode = 'standard' AND available_ms >= 20000 AND interrupted = 0 AND outcome IS NOT NULL",
    ).all() as { card_id: string; card_revision: number; outcome: string }[]
    const quantile = (v: number[], q: number) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * q))] : null)
    const round3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000)
    const bands: [string, (n: number) => boolean][] = [['tutte', () => true], ['1-5', (n) => n <= 5], ['6-20', (n) => n >= 6 && n <= 20], ['21+', (n) => n >= 21]]
    const keys = new Set(comparable.map((r) => `${r.card_id}#${r.card_revision}`))
    const rows: (string | number | null)[][] = []
    for (const key of [...keys].sort()) {
      const [card, rev] = key.split('#')
      const mine = comparable.filter((r) => r.card_id === card && r.card_revision === Number(rev))
      const taboos = eligible.filter((r) => r.card_id === card && r.card_revision === Number(rev))
      for (const [band, inBand] of bands) {
        const part = mine.filter((r) => inBand(r.active_guessers))
        if (!part.length && band !== 'tutte') continue
        const solved = part.filter((r) => r.outcome === 'solved')
        const skipped = part.filter((r) => r.outcome === 'skipped').length
        const timeouts = part.filter((r) => r.outcome === 'round_timeout').length
        const denominator = solved.length + skipped + timeouts // Taboo is outside: it depends on the streamer
        const solveRate = denominator ? solved.length / denominator : null
        const times = solved.map((r) => r.solve_time_s).filter((t): t is number => t !== null)
        const medianTime = quantile(times, 0.5)
        const sessions = new Set(part.map((r) => r.session_id)).size
        const tabooRate = band === 'tutte' && taboos.length ? taboos.filter((r) => r.outcome === 'taboo').length / taboos.length : null
        const skipRate = part.length ? skipped / part.length : null
        let label = 'provvisoria'
        if (part.length >= 20 && sessions >= 4) {
          if (!solved.length) label = 'difficile (provvisoria): revisione editoriale'
          else if (solveRate! >= 0.8 && medianTime! <= 18) label = 'facile'
          else if (solveRate! < 0.45 || medianTime! > 35) label = 'difficile'
          else label = 'media'
        }
        const alerts = [skipRate !== null && skipRate > 0.35 ? 'skip_rate>0.35' : '', tabooRate !== null && tabooRate > 0.25 ? 'taboo_rate>0.25' : ''].filter(Boolean).join(' ')
        rows.push([card, Number(rev), band, part.length, sessions, round3(solveRate), medianTime, quantile(times, 0.9), round3(skipRate), round3(tabooRate),
          quantile(part.map((r) => r.active_guessers), 0.5), mine[0].difficulty_at_play, label, alerts])
      }
    }
    return {
      columns: ['card_id', 'card_revision', 'audience_band', 'eligible_exposures', 'sessions', 'solve_rate', 'p50_solve_time_s', 'p90_solve_time_s', 'skip_rate', 'taboo_rate',
        'median_active_guessers', 'difficulty_at_play', 'suggested_label', 'qa_alerts'],
      rows,
    }
  }

  // ---- Retention (D16) ----

  // Removes what is older than the retention. Run at the start of the server, never during a live. Returns the matches removed.
  purgeExpired(now: number, days: number = TABOO_RULES.telemetryRetentionDays): number {
    const cutoff = now - days * DAY_MS
    return this.db.transaction(() => {
      const old = `(SELECT n FROM taboo_matches WHERE ended_at IS NOT NULL AND ended_at < ${Math.floor(cutoff)})`
      const exposures = `(SELECT e.n FROM taboo_exposures e JOIN taboo_rounds r ON r.n = e.round WHERE r.match IN ${old})`
      this.db.exec(`DELETE FROM taboo_wrong_answers WHERE exposure IN ${exposures}`)
      this.db.exec(`DELETE FROM taboo_winners WHERE exposure IN ${exposures}`)
      // The events point to each other (corrects): the later ones go first.
      this.db.exec(`DELETE FROM taboo_score_events WHERE match IN ${old} AND corrects IS NOT NULL`)
      this.db.exec(`DELETE FROM taboo_score_events WHERE match IN ${old}`)
      this.db.exec(`DELETE FROM taboo_moderation WHERE match IN ${old}`)
      this.db.exec(`DELETE FROM taboo_exposures WHERE round IN (SELECT n FROM taboo_rounds WHERE match IN ${old})`)
      this.db.exec(`DELETE FROM taboo_rounds WHERE match IN ${old}`)
      const removed = this.db.prepare(`DELETE FROM taboo_matches WHERE n IN ${old}`).run().changes
      this.db.exec('DELETE FROM taboo_players WHERE n NOT IN (SELECT player FROM taboo_winners)')
      return removed
    }).immediate()
  }
}
