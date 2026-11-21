// ZeroWordHunt's operational store (spec §9): rounds, targets, the guesses that hit a target, the claims and the ordered log of
// events. It lives in the server's own database (zerocade.db, outside Git). Tables are STRICT with integer keys, the repeated
// words (status, end, platform, direction, event type) are small lookup tables (DIRETTIVE appendix SQLite), and the report views
// keep the readable names. A claim is one row per target held by a partial unique index, so a second winner is impossible even
// if the room were wrong; a correction marks the claim revoked and logs it, it never deletes.
//
// The store receives the Database in the constructor, so the tests use `new Database(':memory:')`. Every write is short and
// synchronous; the claim is one `BEGIN IMMEDIATE` transaction (§9.3). Nothing here awaits or does network.
import type Database from 'better-sqlite3'
import { WORDHUNT_RULES, type WordHuntEnd, type WordHuntMode } from '@zerocade/shared'
import { cellNameFor, type Board } from './wordhunt-domain.js'

const DAY_MS = 86_400_000
export const WORDHUNT_SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS wordhunt_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS wordhunt_modes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_statuses (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_ends (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_platforms (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_directions (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_sides (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_outcomes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_event_types (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_participants (n INTEGER PRIMARY KEY, platform INTEGER NOT NULL REFERENCES wordhunt_platforms(n),
  user_id TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT, seen_at INTEGER NOT NULL, UNIQUE (platform, user_id)) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_rounds (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, room_key TEXT NOT NULL,
  mode INTEGER NOT NULL REFERENCES wordhunt_modes(n), seed TEXT NOT NULL, rows INTEGER NOT NULL CHECK (rows > 0),
  cols INTEGER NOT NULL CHECK (cols > 0), checksum TEXT NOT NULL, grid TEXT NOT NULL, duration_ms INTEGER NOT NULL,
  rules_version TEXT NOT NULL, status INTEGER NOT NULL REFERENCES wordhunt_statuses(n), end_reason INTEGER REFERENCES wordhunt_ends(n),
  created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER) STRICT;
CREATE INDEX IF NOT EXISTS wordhunt_rounds_room ON wordhunt_rounds(room_key, created_at);
CREATE TABLE IF NOT EXISTS wordhunt_targets (n INTEGER PRIMARY KEY, round INTEGER NOT NULL REFERENCES wordhunt_rounds(n),
  seq INTEGER NOT NULL, word TEXT NOT NULL, direction INTEGER NOT NULL REFERENCES wordhunt_directions(n),
  start_row INTEGER NOT NULL, start_col INTEGER NOT NULL, end_row INTEGER NOT NULL, end_col INTEGER NOT NULL,
  anchor_row INTEGER NOT NULL, anchor_col INTEGER NOT NULL, side INTEGER NOT NULL REFERENCES wordhunt_sides(n),
  UNIQUE (round, seq), UNIQUE (round, word), UNIQUE (round, anchor_row, anchor_col)) STRICT;
CREATE TABLE IF NOT EXISTS wordhunt_guesses (n INTEGER PRIMARY KEY, round INTEGER NOT NULL REFERENCES wordhunt_rounds(n),
  participant INTEGER NOT NULL REFERENCES wordhunt_participants(n), platform INTEGER NOT NULL REFERENCES wordhunt_platforms(n),
  message_key TEXT, guess TEXT NOT NULL, received_ms INTEGER NOT NULL, receive_seq INTEGER NOT NULL,
  outcome INTEGER NOT NULL REFERENCES wordhunt_outcomes(n), UNIQUE (round, receive_seq)) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS wordhunt_guesses_message ON wordhunt_guesses(message_key) WHERE message_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS wordhunt_claims (n INTEGER PRIMARY KEY, target INTEGER NOT NULL REFERENCES wordhunt_targets(n),
  participant INTEGER NOT NULL REFERENCES wordhunt_participants(n), guess INTEGER NOT NULL UNIQUE REFERENCES wordhunt_guesses(n),
  color TEXT NOT NULL, points INTEGER NOT NULL CHECK (points >= 0), claimed_ms INTEGER NOT NULL, receive_seq INTEGER NOT NULL,
  revoked_at INTEGER, revoke_reason TEXT) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS wordhunt_claims_one ON wordhunt_claims(target) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS wordhunt_claims_participant ON wordhunt_claims(participant);
CREATE TABLE IF NOT EXISTS wordhunt_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, round INTEGER NOT NULL REFERENCES wordhunt_rounds(n),
  type INTEGER NOT NULL REFERENCES wordhunt_event_types(n), payload TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
CREATE INDEX IF NOT EXISTS wordhunt_events_round ON wordhunt_events(round, seq);
CREATE VIEW IF NOT EXISTS wordhunt_claims_report AS
  SELECT r.id AS round_id, t.seq AS target_seq, t.word AS word, p.display_name AS display_name, c.color AS color, c.points AS points,
         c.claimed_ms AS claimed_ms, c.receive_seq AS receive_seq, c.revoked_at AS revoked_at
  FROM wordhunt_claims c JOIN wordhunt_targets t ON t.n = c.target JOIN wordhunt_rounds r ON r.n = t.round
  JOIN wordhunt_participants p ON p.n = c.participant;
`

const LOOKUPS: Record<string, readonly string[]> = {
  wordhunt_modes: ['fixture', 'generated'],
  wordhunt_statuses: ['ready', 'countdown', 'active', 'finished', 'abandoned'],
  wordhunt_ends: ['completed', 'timeout', 'stopped', 'abandoned'],
  wordhunt_platforms: ['tiktok', 'twitch', 'youtube', 'local'],
  wordhunt_directions: ['RIGHT', 'DOWN', 'LEFT', 'UP', 'DOWN_RIGHT', 'DOWN_LEFT', 'UP_RIGHT', 'UP_LEFT'],
  wordhunt_sides: ['before', 'after'],
  wordhunt_outcomes: ['claimed', 'already-claimed'],
  wordhunt_event_types: ['ROUND_CREATED', 'ROUND_STARTED', 'WORD_CLAIMED', 'ROUND_FINISHED', 'ADMIN_CORRECTION'],
}

export type WordHuntStatus = 'ready' | 'countdown' | 'active' | 'finished' | 'abandoned'
export type WordHuntEventType = 'ROUND_CREATED' | 'ROUND_STARTED' | 'WORD_CLAIMED' | 'ROUND_FINISHED' | 'ADMIN_CORRECTION'

export interface WordHuntViewer { id: string; nickname: string; avatar?: string }

export interface ClaimInput {
  roundRow: number
  targetSeq: number
  viewer: WordHuntViewer
  platform: string
  messageKey: string | null
  guess: string
  receivedMs: number
  receiveSeq: number
  color: string
  points: number
  wallMs: number
}

export const CLAIM_BUSY_MS = 150

// better-sqlite3 reports a lock that did not clear in time as SQLITE_BUSY (or SQLITE_BUSY_SNAPSHOT).
export const isBusyError = (error: unknown): boolean => typeof (error as { code?: unknown } | null)?.code === 'string' && (error as { code: string }).code.startsWith('SQLITE_BUSY')

export class WordHuntStore {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA)
    for (const [table, names] of Object.entries(LOOKUPS)) {
      const insert = db.prepare(`INSERT OR IGNORE INTO ${table} (n, name) VALUES (?, ?)`)
      names.forEach((name, i) => insert.run(i + 1, name))
    }
    db.prepare('INSERT OR IGNORE INTO wordhunt_meta (name, value) VALUES (?, ?)').run('schema_version', String(WORDHUNT_SCHEMA_VERSION))
  }

  private lookup(table: string, name: string): number {
    const n = this.db.prepare(`SELECT n FROM ${table} WHERE name = ?`).pluck().get(name) as number | undefined
    if (n === undefined) throw new Error(`wordhunt: valore sconosciuto "${name}" in ${table}`)
    return n
  }

  private participant(viewer: WordHuntViewer, platform: string, now: number): number {
    const p = this.lookup('wordhunt_platforms', LOOKUPS.wordhunt_platforms!.includes(platform) ? platform : 'local')
    // The identity is (platform, user id), never the nickname: the name and the picture are refreshed (§7.1).
    const ref = viewer.id.includes(':') ? viewer.id.slice(viewer.id.indexOf(':') + 1) : viewer.id
    this.db.prepare(
      `INSERT INTO wordhunt_participants (platform, user_id, display_name, avatar_url, seen_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (platform, user_id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url, seen_at = excluded.seen_at`,
    ).run(p, ref, viewer.nickname.slice(0, 64), viewer.avatar ?? null, now)
    return this.db.prepare('SELECT n FROM wordhunt_participants WHERE platform = ? AND user_id = ?').pluck().get(p, ref) as number
  }

  // The round and its targets in one transaction. Returns the row of the round.
  createRound(input: { id: string; roomKey: string; mode: WordHuntMode; board: Board; durationMs: number; now: number }): number {
    return this.db.transaction(() => {
      const { board } = input
      const info = this.db.prepare(
        `INSERT INTO wordhunt_rounds (id, room_key, mode, seed, rows, cols, checksum, grid, duration_ms, rules_version, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.id, input.roomKey, this.lookup('wordhunt_modes', input.mode), board.seed, board.rows, board.cols, board.checksum,
        board.letters.map((l) => l.join('')).join('\n'), input.durationMs, WORDHUNT_RULES.version, this.lookup('wordhunt_statuses', 'ready'), input.now,
      )
      const round = Number(info.lastInsertRowid)
      const target = this.db.prepare(
        `INSERT INTO wordhunt_targets (round, seq, word, direction, start_row, start_col, end_row, end_col, anchor_row, anchor_col, side)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const t of board.targets) {
        const end = t.cells[t.cells.length - 1]!
        target.run(round, t.id, t.word, this.lookup('wordhunt_directions', t.direction), t.start.row, t.start.col, end.row, end.col, t.anchor.row, t.anchor.col, this.lookup('wordhunt_sides', t.side))
      }
      const cellName = cellNameFor(board.rows)
      this.event(round, 'ROUND_CREATED', { id: input.id, mode: input.mode, seed: board.seed, checksum: board.checksum, targets: board.targets.map((t) => [t.word, cellName(t.start), cellName(t.anchor)]) }, input.now)
      return round
    }).immediate()
  }

  setStatus(round: number, status: WordHuntStatus, now: number, end?: WordHuntEnd | 'abandoned'): void {
    this.db.transaction(() => {
      this.db.prepare(
        `UPDATE wordhunt_rounds SET status = ?, end_reason = COALESCE(?, end_reason),
           started_at = CASE WHEN ? = 'active' AND started_at IS NULL THEN ? ELSE started_at END,
           ended_at = CASE WHEN ? IN ('finished', 'abandoned') THEN ? ELSE ended_at END WHERE n = ?`,
      ).run(this.lookup('wordhunt_statuses', status), end ? this.lookup('wordhunt_ends', end) : null, status, now, status, now, round)
      if (status === 'active') this.event(round, 'ROUND_STARTED', {}, now)
      if (status === 'finished') this.event(round, 'ROUND_FINISHED', { end: end ?? 'stopped' }, now)
    }).immediate()
  }

  // §9.3: the guess and the claim in one transaction. `false` when the target already has a holder: nothing is written then
  // except the guess, which is kept with the outcome "already-claimed" up to a cap.
  claim(input: ClaimInput): boolean {
    // The claim runs on the main thread: it waits briefly for the write lock (the persistence worker writes every chat event) and, if the
    // database is still busy, throws, and the room tries again a moment later; the 5 s of the connection would stop the whole server.
    const previous = this.db.pragma('busy_timeout', { simple: true }) as number
    this.db.pragma(`busy_timeout = ${CLAIM_BUSY_MS}`)
    try { return this.claimNow(input) } finally { this.db.pragma(`busy_timeout = ${previous}`) }
  }

  private claimNow(input: ClaimInput): boolean {
    return this.db.transaction(() => {
      const target = this.db.prepare('SELECT n FROM wordhunt_targets WHERE round = ? AND seq = ?').pluck().get(input.roundRow, input.targetSeq) as number | undefined
      if (target === undefined) throw new Error('wordhunt: bersaglio inesistente')
      const participant = this.participant(input.viewer, input.platform, input.wallMs)
      const platform = this.lookup('wordhunt_platforms', LOOKUPS.wordhunt_platforms!.includes(input.platform) ? input.platform : 'local')
      const guess = this.db.prepare(
        `INSERT INTO wordhunt_guesses (round, participant, platform, message_key, guess, received_ms, receive_seq, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.roundRow, participant, platform, input.messageKey, input.guess, input.receivedMs, input.receiveSeq, this.lookup('wordhunt_outcomes', 'claimed'))
      const guessRow = Number(guess.lastInsertRowid)
      const claimed = this.db.prepare(
        `INSERT INTO wordhunt_claims (target, participant, guess, color, points, claimed_ms, receive_seq) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      ).run(target, participant, guessRow, input.color, input.points, input.wallMs, input.receiveSeq)
      if (claimed.changes !== 1) {
        this.db.prepare('UPDATE wordhunt_guesses SET outcome = ? WHERE n = ?').run(this.lookup('wordhunt_outcomes', 'already-claimed'), guessRow)
        return false
      }
      this.event(input.roundRow, 'WORD_CLAIMED', { target: input.targetSeq, word: input.guess, participant, color: input.color, points: input.points, seq: input.receiveSeq }, input.wallMs)
      return true
    }).immediate()
  }

  // §8.4: the correction frees the target again; the claim stays in the table, marked, with the reason, and in the log.
  revoke(roundRow: number, targetSeq: number, reason: string, now: number): boolean {
    return this.db.transaction(() => {
      const changed = this.db.prepare(
        `UPDATE wordhunt_claims SET revoked_at = ?, revoke_reason = ? WHERE revoked_at IS NULL AND target =
           (SELECT n FROM wordhunt_targets WHERE round = ? AND seq = ?)`,
      ).run(now, reason, roundRow, targetSeq).changes
      if (changed === 1) this.event(roundRow, 'ADMIN_CORRECTION', { target: targetSeq, reason }, now)
      return changed === 1
    }).immediate()
  }

  private event(round: number, type: WordHuntEventType, payload: unknown, now: number): void {
    this.db.prepare('INSERT INTO wordhunt_events (round, type, payload, created_at) VALUES (?, ?, ?, ?)').run(round, this.lookup('wordhunt_event_types', type), JSON.stringify(payload), now)
  }

  // The claims of a round that still hold, in the order they were made.
  claims(roundId: string): { word: string; nickname: string; color: string; points: number; seq: number }[] {
    return this.db.prepare(
      `SELECT word, display_name AS nickname, color, points, receive_seq AS seq FROM wordhunt_claims_report WHERE round_id = ? AND revoked_at IS NULL ORDER BY receive_seq`,
    ).all(roundId) as { word: string; nickname: string; color: string; points: number; seq: number }[]
  }

  events(roundId: string): { seq: number; type: string; payload: unknown }[] {
    return (this.db.prepare(
      `SELECT e.seq AS seq, t.name AS type, e.payload AS payload FROM wordhunt_events e JOIN wordhunt_event_types t ON t.n = e.type
       JOIN wordhunt_rounds r ON r.n = e.round WHERE r.id = ? ORDER BY e.seq`,
    ).all(roundId) as { seq: number; type: string; payload: string }[]).map((r) => ({ seq: r.seq, type: r.type, payload: JSON.parse(r.payload) as unknown }))
  }

  guessCount(roundId: string): number {
    return this.db.prepare('SELECT COUNT(*) FROM wordhunt_guesses g JOIN wordhunt_rounds r ON r.n = g.round WHERE r.id = ?').pluck().get(roundId) as number
  }

  // A round left open when the server stopped is closed as abandoned (the next start of the process).
  abandonOpenRounds(now: number): number {
    const done = this.lookup('wordhunt_statuses', 'abandoned')
    return this.db.prepare(
      `UPDATE wordhunt_rounds SET status = ?, end_reason = ?, ended_at = ? WHERE status IN (SELECT n FROM wordhunt_statuses WHERE name IN ('ready', 'countdown', 'active'))`,
    ).run(done, this.lookup('wordhunt_ends', 'abandoned'), now).changes
  }

  // Data older than the retention is removed: the rounds with their targets, guesses, claims and events, then the participants nobody uses.
  purgeExpired(now: number): number {
    const limit = now - WORDHUNT_RULES.retentionDays * DAY_MS
    return this.db.transaction(() => {
      const old = `(SELECT n FROM wordhunt_rounds WHERE created_at < ?)`
      this.db.prepare(`DELETE FROM wordhunt_events WHERE round IN ${old}`).run(limit)
      this.db.prepare(`DELETE FROM wordhunt_claims WHERE target IN (SELECT n FROM wordhunt_targets WHERE round IN ${old})`).run(limit)
      this.db.prepare(`DELETE FROM wordhunt_guesses WHERE round IN ${old}`).run(limit)
      this.db.prepare(`DELETE FROM wordhunt_targets WHERE round IN ${old}`).run(limit)
      const rounds = this.db.prepare('DELETE FROM wordhunt_rounds WHERE created_at < ?').run(limit).changes
      this.db.prepare(
        `DELETE FROM wordhunt_participants WHERE n NOT IN (SELECT participant FROM wordhunt_guesses) AND n NOT IN (SELECT participant FROM wordhunt_claims)`,
      ).run()
      return rounds
    }).immediate()
  }
}
