import type Database from 'better-sqlite3'
import { OPEN_STATUSES, TOURNAMENT_RULES, type TournamentStatus, type TournamentSummary } from '@zerocade/shared'
import { compareTotals, netPoints, standings, type PlayerTotals, type RoundOutcome } from './context-tournament-scoring.js'
import type { BackupEvent, BackupSnapshot, TournamentBackup } from './context-tournament-backup.js'

// ZeroContext tournament: what is saved (specifica §8), in the server's working database (zerocade.db), apart from
// the ordinary leaderboards (game_scores): a tournament may have negative points, and its points never go there.
// Every accepted guess is saved before its window closes; a round's points are written once, in one transaction,
// and only from the saved guesses; a voided round removes them, and the standings are rebuilt from what remains.

const TOURNAMENTS = `
CREATE TABLE IF NOT EXISTS context_tournaments (
  id TEXT PRIMARY KEY,
  room_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','intermission','suspended','completed','cancelled')),
  -- NULL: no limit of rounds, the organiser ends the tournament.
  total_rounds INTEGER CHECK(total_rounds IS NULL OR total_rounds IN (${TOURNAMENT_RULES.rounds.join(',')})),
  intermission_ms INTEGER NOT NULL CHECK(intermission_ms >= ${TOURNAMENT_RULES.intermissionMinMs}),
  audience TEXT NOT NULL,
  corpus_hash TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  suspended_reason TEXT,
  -- When the last round was settled: the Top 10 stays at least intermission_ms from then.
  intermission_since INTEGER
);`
const TOURNAMENT_COLUMNS = 'id, room_key, status, total_rounds, intermission_ms, audience, corpus_hash, rules_version, created_at, '
  + 'finished_at, suspended_reason, intermission_since'

const SCHEMA = `${TOURNAMENTS}
CREATE UNIQUE INDEX IF NOT EXISTS context_one_open_tournament_per_room
  ON context_tournaments(room_key) WHERE status IN ('active','intermission','suspended');
CREATE TABLE IF NOT EXISTS context_tournament_players (
  tournament_id TEXT NOT NULL REFERENCES context_tournaments(id),
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, player_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS context_tournament_rounds (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES context_tournaments(id),
  round_number INTEGER NOT NULL CHECK(round_number >= 1),
  attempt INTEGER NOT NULL CHECK(attempt >= 1),
  status TEXT NOT NULL CHECK(status IN ('playing','settled','voided')),
  secret_idx INTEGER NOT NULL,
  buoy_idx INTEGER,
  buoy_window INTEGER,
  current_window INTEGER NOT NULL DEFAULT 0 CHECK(current_window BETWEEN 0 AND ${TOURNAMENT_RULES.windowsPerRound}),
  remaining_ms INTEGER NOT NULL DEFAULT ${TOURNAMENT_RULES.windowMs},
  started_at INTEGER NOT NULL,
  settled_at INTEGER,
  solved_by TEXT,
  close_reason TEXT,
  achievements TEXT,
  UNIQUE (tournament_id, round_number, attempt)
);
CREATE UNIQUE INDEX IF NOT EXISTS context_one_live_round
  ON context_tournament_rounds(tournament_id, round_number) WHERE status <> 'voided';
CREATE TABLE IF NOT EXISTS context_tournament_guesses (
  round_id TEXT NOT NULL REFERENCES context_tournament_rounds(id),
  ingress_seq INTEGER NOT NULL,
  window_index INTEGER NOT NULL CHECK(window_index BETWEEN 1 AND ${TOURNAMENT_RULES.windowsPerRound}),
  source_message_key TEXT,
  player_id TEXT NOT NULL,
  word_idx INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 1),
  received_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, ingress_seq),
  UNIQUE (round_id, window_index, player_id),
  UNIQUE (round_id, word_idx)
) WITHOUT ROWID;
CREATE UNIQUE INDEX IF NOT EXISTS context_guess_message
  ON context_tournament_guesses(round_id, source_message_key) WHERE source_message_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS context_tournament_round_scores (
  round_id TEXT NOT NULL REFERENCES context_tournament_rounds(id),
  player_id TEXT NOT NULL,
  pioneer_points INTEGER NOT NULL DEFAULT 0 CHECK(pioneer_points >= 0),
  jackpot_points INTEGER NOT NULL DEFAULT 0 CHECK(jackpot_points >= 0),
  blue_count INTEGER NOT NULL DEFAULT 0,
  blue_penalty INTEGER NOT NULL DEFAULT 0 CHECK(blue_penalty BETWEEN 0 AND ${TOURNAMENT_RULES.bluePenaltyMax}),
  red_orange_count INTEGER NOT NULL DEFAULT 0,
  solved INTEGER NOT NULL DEFAULT 0 CHECK(solved IN (0,1)),
  PRIMARY KEY (round_id, player_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS context_tournament_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL REFERENCES context_tournaments(id),
  round_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  at INTEGER NOT NULL
);
`

export interface TournamentRecord {
  id: string
  roomKey: string
  status: TournamentStatus
  totalRounds: number | null
  intermissionMs: number
  audience: string
  corpusHash: string
  rulesVersion: string
  createdAt: number
  finishedAt: number | null
  suspendedReason: string | null
  intermissionSince: number | null
}

export interface RoundRecord {
  id: string
  tournamentId: string
  number: number
  attempt: number
  status: 'playing' | 'settled' | 'voided'
  secret: number
  buoy: number | null
  buoyWindow: number | null
  window: number
  remainingMs: number
  startedAt: number
  settledAt: number | null
  solvedBy: string | null
  closeReason: string | null
  achievements: string[]
}

export interface GuessRecord {
  roundId: string
  seq: number
  window: number
  messageKey: string | null
  player: string
  word: number
  position: number
  receivedAt: number
}

export interface PlayerRecord {
  player: string
  nickname: string
  avatar: string | null
}

type Row = Record<string, unknown>
const tournamentOf = (r: Row): TournamentRecord => ({
  id: r.id as string, roomKey: r.room_key as string, status: r.status as TournamentStatus, totalRounds: (r.total_rounds as number | null) ?? null,
  intermissionMs: r.intermission_ms as number, audience: r.audience as string, corpusHash: r.corpus_hash as string,
  rulesVersion: r.rules_version as string, createdAt: r.created_at as number, finishedAt: (r.finished_at as number | null) ?? null,
  suspendedReason: (r.suspended_reason as string | null) ?? null, intermissionSince: (r.intermission_since as number | null) ?? null,
})
const roundOf = (r: Row): RoundRecord => ({
  id: r.id as string, tournamentId: r.tournament_id as string, number: r.round_number as number, attempt: r.attempt as number,
  status: r.status as RoundRecord['status'], secret: r.secret_idx as number, buoy: (r.buoy_idx as number | null) ?? null,
  buoyWindow: (r.buoy_window as number | null) ?? null, window: r.current_window as number, remainingMs: r.remaining_ms as number,
  startedAt: r.started_at as number, settledAt: (r.settled_at as number | null) ?? null, solvedBy: (r.solved_by as string | null) ?? null,
  closeReason: (r.close_reason as string | null) ?? null, achievements: r.achievements ? (JSON.parse(r.achievements as string) as string[]) : [],
})
const guessOf = (r: Row): GuessRecord => ({
  roundId: r.round_id as string, seq: r.ingress_seq as number, window: r.window_index as number,
  messageKey: (r.source_message_key as string | null) ?? null, player: r.player_id as string, word: r.word_idx as number,
  position: r.position as number, receivedAt: r.received_at as number,
})

// Until 15/11/2026 a tournament had 5 or 7 rounds (total_rounds NOT NULL); now it may have no limit (NULL). SQLite
// cannot change a column's constraints: the table is rebuilt with its rows, the foreign keys of its children kept
// (https://sqlite.org/lang_altertable.html#otheralter). Its index comes back with SCHEMA.
function allowEndless(db: Database.Database) {
  const sql = (db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'context_tournaments'").get() as Row | undefined)?.sql
  if (typeof sql !== 'string' || !/total_rounds INTEGER NOT NULL/.test(sql)) return
  const enforced = db.pragma('foreign_keys', { simple: true }) === 1
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(TOURNAMENTS.replace('CREATE TABLE IF NOT EXISTS context_tournaments', 'CREATE TABLE context_tournaments_next'))
      db.exec(`INSERT INTO context_tournaments_next (${TOURNAMENT_COLUMNS}) SELECT ${TOURNAMENT_COLUMNS} FROM context_tournaments`)
      db.exec('DROP TABLE context_tournaments')
      db.exec('ALTER TABLE context_tournaments_next RENAME TO context_tournaments')
      if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Tornei: riferimenti rotti dopo la migrazione delle manche infinite.')
    })()
  } finally {
    if (enforced) db.pragma('foreign_keys = ON')
  }
}

export class ContextTournamentStore {
  // `backup`: the separate file where the standings are copied after every round (context-tournament-backup.ts).
  constructor(private readonly db: Database.Database, private readonly backup: TournamentBackup | null = null) {
    allowEndless(db)
    db.exec(SCHEMA)
  }

  // A copy of the standings and of the settled rounds' points. It never stops the game: a failure is only logged.
  private backupNow(tournamentId: string, event: BackupEvent, roundNumber: number | null, at: number) {
    if (!this.backup) return
    try {
      const t = this.tournament(tournamentId)
      if (!t) return
      const totals = this.totals(tournamentId)
      const sorted = [...totals].sort((a, b) => compareTotals(a, b) || a.nickname.localeCompare(b.nickname, 'it') || a.player.localeCompare(b.player))
      const avatars = new Map(this.players(tournamentId).map((p) => [p.player, p.avatar]))
      const standing = sorted.map((p, i) => {
        let place = i + 1
        for (let j = i; j > 0 && compareTotals(sorted[j - 1], p) === 0; j--) place = j
        return { player: p.player, place, nickname: p.nickname, avatar: avatars.get(p.player) ?? null, points: p.points, solved: p.solved,
          redOrange: p.redOrange, bluePenalty: p.bluePenalty }
      })
      const scores = (this.db.prepare(`SELECT s.*, r.round_number FROM context_tournament_round_scores s
        JOIN context_tournament_rounds r ON r.id = s.round_id WHERE r.tournament_id = ? AND r.status = 'settled'`).all(tournamentId) as Row[])
        .map((r) => ({ roundId: r.round_id as string, roundNumber: r.round_number as number, player: r.player_id as string,
          pioneer: r.pioneer_points as number, jackpot: r.jackpot_points as number, blueCount: r.blue_count as number,
          bluePenalty: r.blue_penalty as number, redOrange: r.red_orange_count as number, solved: r.solved as number }))
      this.backup.record({ tournamentId, roomKey: t.roomKey, event, roundNumber, at, standings: standing, scores })
    } catch (err) {
      console.warn(`[context-tournament] backup della classifica non riuscito: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  backups(tournamentId: string) {
    return this.backup?.list(tournamentId) ?? []
  }

  // Puts the standings back as they were in a snapshot of the backup file (the latest one when `snapshotId` is null):
  // the points of the rounds it holds are written again, the rounds settled after it stop counting (voided), the players
  // it lists are enrolled again. Needs the tournament and its rounds in this database (guesses and rounds are not in
  // the backup) and no round in play. The standings as they are now are copied to the backup first, so a restore can
  // be undone. Returns the snapshot used.
  restoreFromBackup(tournamentId: string, snapshotId: number | null, at: number, actor: string): BackupSnapshot {
    if (!this.backup) throw new Error('Il backup della classifica non è attivo.')
    const snap = this.backup.snapshot(tournamentId, snapshotId)
    if (!snap) throw new Error('Nessuna copia della classifica per questo torneo.')
    const scores = this.backup.scores(snap.id)
    const t = this.tournament(tournamentId)
    if (!t) throw new Error('Il torneo non è più nel database: la copia non basta a ricrearlo.')
    if (this.playing(tournamentId)) throw new Error('C\'è una manche in corso: chiudila o annullala prima.')
    const known = new Set((this.db.prepare('SELECT id FROM context_tournament_rounds WHERE tournament_id = ?').all(tournamentId) as Row[]).map((r) => r.id as string))
    const missing = [...new Set(scores.map((s) => s.roundId))].filter((id) => !known.has(id))
    if (missing.length) throw new Error(`Mancano nel database le manche ${missing.join(', ')}: la copia non può essere applicata.`)
    this.backupNow(tournamentId, 'before-restore', null, at)
    this.db.transaction(() => {
      const kept = new Set(scores.map((s) => s.roundId))
      this.db.prepare(`DELETE FROM context_tournament_round_scores WHERE round_id IN
        (SELECT id FROM context_tournament_rounds WHERE tournament_id = ?)`).run(tournamentId)
      const voidStmt = this.db.prepare("UPDATE context_tournament_rounds SET status = 'voided', close_reason = ? WHERE id = ?")
      const settleStmt = this.db.prepare("UPDATE context_tournament_rounds SET status = 'settled', close_reason = NULL WHERE id = ?")
      for (const r of this.rounds(tournamentId)) {
        if (kept.has(r.id)) settleStmt.run(r.id)
        else if (r.status === 'settled') voidStmt.run('Classifica ripristinata da una copia', r.id)
      }
      const insert = this.db.prepare(`INSERT INTO context_tournament_round_scores (round_id, player_id, pioneer_points, jackpot_points,
        blue_count, blue_penalty, red_orange_count, solved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const s of scores) insert.run(s.roundId, s.player, s.pioneer, s.jackpot, s.blueCount, s.bluePenalty, s.redOrange, s.solved)
      this.db.prepare('DELETE FROM context_tournament_players WHERE tournament_id = ?').run(tournamentId)
      for (const p of snap.standings) this.enrol(tournamentId, p.player, p.nickname, p.avatar, at)
      const last = t.totalRounds !== null && snap.roundsSettled >= t.totalRounds
      this.db.prepare(`UPDATE context_tournaments SET status = ?, intermission_since = ?, suspended_reason = NULL,
        finished_at = CASE WHEN ? THEN ? ELSE NULL END WHERE id = ?`).run(last ? 'completed' : 'intermission', at, last ? 1 : 0, at, tournamentId)
      this.audit(tournamentId, null, 'standings-restored', actor, { snapshot: snap.id, snapshotAt: snap.at, rounds: snap.roundsSettled }, at)
    })()
    return snap
  }

  openIn(roomKey: string): TournamentRecord | null {
    const r = this.db.prepare(`SELECT * FROM context_tournaments WHERE room_key = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})`)
      .get(roomKey, ...OPEN_STATUSES) as Row | undefined
    return r ? tournamentOf(r) : null
  }

  allOpen(): TournamentRecord[] {
    return (this.db.prepare(`SELECT * FROM context_tournaments WHERE status IN (${OPEN_STATUSES.map(() => '?').join(',')})`)
      .all(...OPEN_STATUSES) as Row[]).map(tournamentOf)
  }

  tournament(id: string): TournamentRecord | null {
    const r = this.db.prepare('SELECT * FROM context_tournaments WHERE id = ?').get(id) as Row | undefined
    return r ? tournamentOf(r) : null
  }

  // A new tournament, its standings at zero. Refused while the room has another one open (unique index).
  create(t: Omit<TournamentRecord, 'status' | 'finishedAt' | 'suspendedReason' | 'intermissionSince'>, actor: string): TournamentRecord {
    return this.db.transaction(() => {
      if (this.openIn(t.roomKey)) throw new Error('C\'è già un torneo in corso in questa stanza.')
      this.db.prepare(`INSERT INTO context_tournaments (id, room_key, status, total_rounds, intermission_ms, audience, corpus_hash,
        rules_version, created_at) VALUES (?, ?, 'intermission', ?, ?, ?, ?, ?, ?)`)
        .run(t.id, t.roomKey, t.totalRounds, t.intermissionMs, t.audience, t.corpusHash, t.rulesVersion, t.createdAt)
      this.audit(t.id, null, 'create', actor, { totalRounds: t.totalRounds, intermissionMs: t.intermissionMs, audience: t.audience,
        corpusHash: t.corpusHash, rules: t.rulesVersion }, t.createdAt)
      return this.tournament(t.id)!
    })()
  }

  setStatus(id: string, status: TournamentStatus, at: number, reason: string | null = null) {
    this.db.prepare(`UPDATE context_tournaments SET status = ?, suspended_reason = ?,
      finished_at = CASE WHEN ? IN ('completed','cancelled') THEN ? ELSE finished_at END WHERE id = ?`).run(status, reason, status, at, id)
  }

  rounds(tournamentId: string): RoundRecord[] {
    return (this.db.prepare('SELECT * FROM context_tournament_rounds WHERE tournament_id = ? ORDER BY round_number, attempt')
      .all(tournamentId) as Row[]).map(roundOf)
  }

  playing(tournamentId: string): RoundRecord | null {
    const r = this.db.prepare("SELECT * FROM context_tournament_rounds WHERE tournament_id = ? AND status = 'playing'").get(tournamentId) as Row | undefined
    return r ? roundOf(r) : null
  }

  // The secrets already played in this tournament, voided rounds included: a target never comes back.
  usedSecrets(tournamentId: string): Set<number> {
    return new Set((this.db.prepare('SELECT secret_idx FROM context_tournament_rounds WHERE tournament_id = ?').all(tournamentId) as Row[])
      .map((r) => r.secret_idx as number))
  }

  startRound(tournamentId: string, number: number, secret: number, buoy: number | null, at: number, actor: string): RoundRecord {
    return this.db.transaction(() => {
      const attempt = ((this.db.prepare('SELECT max(attempt) AS a FROM context_tournament_rounds WHERE tournament_id = ? AND round_number = ?')
        .get(tournamentId, number) as Row).a as number | null ?? 0) + 1
      const id = `${tournamentId}:${number}:${attempt}`
      this.db.prepare(`INSERT INTO context_tournament_rounds (id, tournament_id, round_number, attempt, status, secret_idx, buoy_idx,
        current_window, remaining_ms, started_at) VALUES (?, ?, ?, ?, 'playing', ?, ?, 0, ?, ?)`)
        .run(id, tournamentId, number, attempt, secret, buoy, TOURNAMENT_RULES.windowMs, at)
      this.setStatus(tournamentId, 'active', at)
      this.audit(tournamentId, id, 'round-start', actor, { number, attempt }, at)
      return roundOf(this.db.prepare('SELECT * FROM context_tournament_rounds WHERE id = ?').get(id) as Row)
    })()
  }

  saveWindow(roundId: string, window: number, remainingMs: number) {
    this.db.prepare('UPDATE context_tournament_rounds SET current_window = ?, remaining_ms = ? WHERE id = ?').run(window, Math.max(0, Math.round(remainingMs)), roundId)
  }

  saveBuoy(roundId: string, window: number) {
    this.db.prepare('UPDATE context_tournament_rounds SET buoy_window = ? WHERE id = ? AND buoy_window IS NULL').run(window, roundId)
  }

  // An accepted guess, saved before its window closes; false when it repeats a player's window, a word or a message.
  addGuess(g: GuessRecord): boolean {
    const r = this.db.prepare(`INSERT OR IGNORE INTO context_tournament_guesses (round_id, ingress_seq, window_index, source_message_key,
      player_id, word_idx, position, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(g.roundId, g.seq, g.window, g.messageKey, g.player, g.word, g.position, g.receivedAt)
    return r.changes === 1
  }

  // A guess and its player's enrolment (the nickname follows the latest seen) in one transaction: one commit, not two,
  // for each of the hundreds of words a busy window brings to the main thread.
  acceptGuess(g: GuessRecord, tournamentId: string, nickname: string, avatar: string | null): boolean {
    return this.db.transaction(() => {
      if (!this.addGuess(g)) return false
      this.enrol(tournamentId, g.player, nickname, avatar, g.receivedAt)
      return true
    })()
  }

  guesses(roundId: string): GuessRecord[] {
    return (this.db.prepare('SELECT * FROM context_tournament_guesses WHERE round_id = ? ORDER BY ingress_seq').all(roundId) as Row[]).map(guessOf)
  }

  lastSeq(roundId: string): number {
    return ((this.db.prepare('SELECT max(ingress_seq) AS s FROM context_tournament_guesses WHERE round_id = ?').get(roundId) as Row).s as number | null) ?? 0
  }

  // Enrolment at the first valid guess (decided 15/11/2026); the nickname follows the latest one seen.
  enrol(tournamentId: string, player: string, nickname: string, avatar: string | null, at: number) {
    this.db.prepare(`INSERT INTO context_tournament_players (tournament_id, player_id, nickname, avatar, joined_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (tournament_id, player_id) DO UPDATE SET nickname = excluded.nickname, avatar = coalesce(excluded.avatar, avatar)`)
      .run(tournamentId, player, nickname.slice(0, 32), avatar, at)
  }

  players(tournamentId: string): PlayerRecord[] {
    return (this.db.prepare('SELECT player_id, nickname, avatar FROM context_tournament_players WHERE tournament_id = ?').all(tournamentId) as Row[])
      .map((r) => ({ player: r.player_id as string, nickname: r.nickname as string, avatar: (r.avatar as string | null) ?? null }))
  }

  // The round's points, once: from the outcome of its saved guesses. A round already settled (a retry) is left as it
  // is and false is returned. The tournament moves on (intermission, or completed after its last round).
  settle(roundId: string, outcome: RoundOutcome, at: number, actor: string, closeReason: string | null, achievements: string[]): boolean {
    const done = this.settleInDb(roundId, outcome, at, actor, closeReason, achievements)
    if (done) this.backupNow(done.tournament, 'round-settled', done.number, at)
    return done !== null
  }

  private settleInDb(roundId: string, outcome: RoundOutcome, at: number, actor: string, closeReason: string | null,
    achievements: string[]): { tournament: string; number: number } | null {
    return this.db.transaction(() => {
      const round = this.db.prepare("SELECT * FROM context_tournament_rounds WHERE id = ? AND status = 'playing'").get(roundId) as Row | undefined
      if (!round) return null
      const insert = this.db.prepare(`INSERT INTO context_tournament_round_scores (round_id, player_id, pioneer_points, jackpot_points,
        blue_count, blue_penalty, red_orange_count, solved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const [player, p] of outcome.players) {
        insert.run(roundId, player, p.pioneer, p.jackpot, p.blueCount, p.bluePenalty, p.redOrange, p.solved ? 1 : 0)
      }
      this.db.prepare(`UPDATE context_tournament_rounds SET status = 'settled', settled_at = ?, solved_by = ?, close_reason = ?,
        achievements = ? WHERE id = ?`).run(at, outcome.solvedBy, closeReason, JSON.stringify(achievements), roundId)
      const t = this.tournament(round.tournament_id as string)!
      const last = t.totalRounds !== null && (round.round_number as number) >= t.totalRounds
      this.db.prepare(`UPDATE context_tournaments SET status = ?, intermission_since = ?, suspended_reason = NULL,
        finished_at = CASE WHEN ? THEN ? ELSE finished_at END WHERE id = ?`).run(last ? 'completed' : 'intermission', at, last ? 1 : 0, at, t.id)
      this.audit(t.id, roundId, 'round-settled', actor, {
        solvedBy: outcome.solvedBy, pioneerTotal: outcome.pioneerTotal, jackpot: outcome.jackpot, closeReason,
        points: Object.fromEntries([...outcome.players].map(([id, p]) => [id, netPoints(p)])),
      }, at)
      return { tournament: t.id, number: round.round_number as number }
    })()
  }

  // A round that does not count (§10, §13.3.5): in play or the last one settled. Its points, if written, are removed;
  // the same round number is played again with another secret.
  voidRound(roundId: string, reason: string, at: number, actor: string): boolean {
    const round = this.db.transaction(() => {
      const round = this.db.prepare("SELECT * FROM context_tournament_rounds WHERE id = ? AND status IN ('playing','settled')").get(roundId) as Row | undefined
      if (!round) return null
      const removed = this.db.prepare('DELETE FROM context_tournament_round_scores WHERE round_id = ?').run(roundId).changes
      this.db.prepare("UPDATE context_tournament_rounds SET status = 'voided', close_reason = ? WHERE id = ?").run(reason, roundId)
      this.db.prepare(`UPDATE context_tournaments SET status = 'intermission', intermission_since = ?, suspended_reason = NULL, finished_at = NULL
        WHERE id = ?`).run(at, round.tournament_id)
      this.audit(round.tournament_id as string, roundId, 'round-voided', actor, { reason, removedScores: removed, wasSettled: round.status === 'settled' }, at)
      return round
    })()
    if (!round) return false
    this.backupNow(round.tournament_id as string, 'round-voided', round.round_number as number, at)
    return true
  }

  // "Azzera classifica" (asked 15/11/2026): every round settled so far stops counting, as if voided (its points are
  // removed), and the players leave the standings until their next valid guess; the tournament starts again from round 1
  // with the same settings, on secrets not yet played. Guesses, rounds and history stay: the audit keeps the standings
  // as they were. Refused while a round is in play. Returns how many rounds were voided.
  resetStandings(tournamentId: string, reason: string, at: number, actor: string, before: unknown): number {
    // The standings as they were go to the backup first: a reset by mistake can be undone from that copy.
    this.backupNow(tournamentId, 'standings-reset', null, at)
    return this.db.transaction(() => {
      if (this.playing(tournamentId)) throw new Error('C\'è una manche in corso: chiudila o annullala prima.')
      const removed = this.db.prepare(`DELETE FROM context_tournament_round_scores WHERE round_id IN
        (SELECT id FROM context_tournament_rounds WHERE tournament_id = ? AND status = 'settled')`).run(tournamentId).changes
      const voided = this.db.prepare(`UPDATE context_tournament_rounds SET status = 'voided', close_reason = ?
        WHERE tournament_id = ? AND status = 'settled'`).run(`Classifica azzerata: ${reason}`, tournamentId).changes
      const players = this.db.prepare('DELETE FROM context_tournament_players WHERE tournament_id = ?').run(tournamentId).changes
      this.db.prepare(`UPDATE context_tournaments SET status = 'intermission', intermission_since = NULL, suspended_reason = NULL,
        finished_at = NULL WHERE id = ?`).run(tournamentId)
      this.audit(tournamentId, null, 'standings-reset', actor, { reason, voidedRounds: voided, removedScores: removed, players, standings: before }, at)
      return voided
    })()
  }

  // Every player's totals over the settled rounds, with the points of the last settled round; players at zero too.
  totals(tournamentId: string): PlayerTotals[] {
    const last = (this.db.prepare(`SELECT id FROM context_tournament_rounds WHERE tournament_id = ? AND status = 'settled'
      ORDER BY round_number DESC, attempt DESC LIMIT 1`).get(tournamentId) as Row | undefined)?.id as string | undefined
    const rows = this.db.prepare(`SELECT p.player_id, p.nickname, p.avatar,
        coalesce(sum(s.pioneer_points + s.jackpot_points - s.blue_penalty), 0) AS points,
        coalesce(sum(s.solved), 0) AS solved, coalesce(sum(s.red_orange_count), 0) AS red_orange,
        coalesce(sum(s.blue_penalty), 0) AS blue_penalty,
        coalesce(sum(CASE WHEN s.round_id = ? THEN s.pioneer_points + s.jackpot_points - s.blue_penalty END), 0) AS delta
      FROM context_tournament_players p
      LEFT JOIN context_tournament_rounds r ON r.tournament_id = p.tournament_id AND r.status = 'settled'
      LEFT JOIN context_tournament_round_scores s ON s.round_id = r.id AND s.player_id = p.player_id
      WHERE p.tournament_id = ? GROUP BY p.player_id`).all(last ?? '', tournamentId) as Row[]
    return rows.map((r) => ({
      player: r.player_id as string, nickname: r.nickname as string, ...(r.avatar ? { avatar: r.avatar as string } : {}),
      points: r.points as number, delta: r.delta as number, solved: r.solved as number, redOrange: r.red_orange as number,
      bluePenalty: r.blue_penalty as number,
    }))
  }

  audit(tournamentId: string, roundId: string | null, type: string, actor: string, payload: unknown, at: number) {
    this.db.prepare('INSERT INTO context_tournament_audit (tournament_id, round_id, event_type, actor, payload, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tournamentId, roundId, type, actor, JSON.stringify(payload), at)
  }

  auditLog(tournamentId: string): { type: string; actor: string; payload: unknown; at: number; roundId: string | null }[] {
    return (this.db.prepare('SELECT * FROM context_tournament_audit WHERE tournament_id = ? ORDER BY id').all(tournamentId) as Row[])
      .map((r) => ({ type: r.event_type as string, actor: r.actor as string, payload: JSON.parse(r.payload as string), at: r.at as number,
        roundId: (r.round_id as string | null) ?? null }))
  }

  // "Elimina storico" (asked 15/11/2026): finished tournaments (completed or cancelled) of the room, with their rounds,
  // guesses, points, players and registry: all of them, or just `id`. One still shown on screen (`keep`) and any
  // open one stay. Returns how many were deleted.
  deleteFinished(roomKey: string, id: string | null, keep: string | null): number {
    return this.db.transaction(() => {
      const ids = (this.db.prepare(`SELECT id FROM context_tournaments WHERE room_key = ? AND status IN ('completed','cancelled')
        AND (? IS NULL OR id = ?) AND id IS NOT ?`).all(roomKey, id, id, keep) as Row[]).map((r) => r.id as string)
      for (const t of ids) {
        for (const table of ['context_tournament_guesses', 'context_tournament_round_scores'])
          this.db.prepare(`DELETE FROM ${table} WHERE round_id IN (SELECT id FROM context_tournament_rounds WHERE tournament_id = ?)`).run(t)
        for (const table of ['context_tournament_rounds', 'context_tournament_players', 'context_tournament_audit'])
          this.db.prepare(`DELETE FROM ${table} WHERE tournament_id = ?`).run(t)
        this.db.prepare('DELETE FROM context_tournaments WHERE id = ?').run(t)
      }
      return ids.length
    })()
  }

  // The room's tournaments, latest first (§13.2: the history stays available).
  history(roomKey: string, limit = 50): TournamentSummary[] {
    const list = (this.db.prepare('SELECT * FROM context_tournaments WHERE room_key = ? ORDER BY created_at DESC LIMIT ?').all(roomKey, limit) as Row[])
      .map(tournamentOf)
    return list.map((t) => {
      const totals = this.totals(t.id)
      const played = (this.db.prepare("SELECT count(*) AS n FROM context_tournament_rounds WHERE tournament_id = ? AND status = 'settled'").get(t.id) as Row).n as number
      return { id: t.id, status: t.status, totalRounds: t.totalRounds, roundsPlayed: played, players: totals.length,
        createdAt: t.createdAt, finishedAt: t.finishedAt,
        // The first place, ex aequo included (§9).
        winners: t.status !== 'completed' ? [] : standings(totals).filter((r) => r.place === 1).map((r) => r.nickname) }
    })
  }
}
