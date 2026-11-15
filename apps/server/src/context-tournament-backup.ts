import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// ZeroContext tournament: a copy of the standings after every round, in a SQLite file apart from zerocade.db, so that
// a lost or damaged score can be put back (ContextTournamentStore.restoreFromBackup). Every settled round, voided round
// and reset of the standings adds a snapshot: the standings as shown, and the raw points of each settled round, which
// is all that is needed to rebuild the totals. Snapshots are only added, never changed.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL,
  room_key TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN ('round-settled','round-voided','standings-reset','before-restore')),
  round_number INTEGER,
  rounds_settled INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS backup_snapshots_by_tournament ON backup_snapshots(tournament_id, id);
CREATE TABLE IF NOT EXISTS backup_standings (
  snapshot_id INTEGER NOT NULL REFERENCES backup_snapshots(id),
  player_id TEXT NOT NULL,
  place INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT,
  points INTEGER NOT NULL,
  solved INTEGER NOT NULL,
  red_orange INTEGER NOT NULL,
  blue_penalty INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, player_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS backup_round_scores (
  snapshot_id INTEGER NOT NULL REFERENCES backup_snapshots(id),
  round_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  pioneer_points INTEGER NOT NULL,
  jackpot_points INTEGER NOT NULL,
  blue_count INTEGER NOT NULL,
  blue_penalty INTEGER NOT NULL,
  red_orange_count INTEGER NOT NULL,
  solved INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, round_id, player_id)
) WITHOUT ROWID;
`

export type BackupEvent = 'round-settled' | 'round-voided' | 'standings-reset' | 'before-restore'

export interface BackupStanding {
  player: string
  place: number
  nickname: string
  avatar: string | null
  points: number
  solved: number
  redOrange: number
  bluePenalty: number
}

export interface BackupRoundScore {
  roundId: string
  roundNumber: number
  player: string
  pioneer: number
  jackpot: number
  blueCount: number
  bluePenalty: number
  redOrange: number
  solved: number
}

export interface BackupInput {
  tournamentId: string
  roomKey: string
  event: BackupEvent
  roundNumber: number | null
  at: number
  standings: BackupStanding[]
  scores: BackupRoundScore[]
}

export interface BackupSnapshot {
  id: number
  tournamentId: string
  roomKey: string
  event: BackupEvent
  roundNumber: number | null
  roundsSettled: number
  at: number
  standings: BackupStanding[]
}

type Row = Record<string, unknown>

export class TournamentBackup {
  constructor(private readonly db: Database.Database) {
    db.exec(SCHEMA)
  }

  static open(file: string): TournamentBackup {
    mkdirSync(dirname(file), { recursive: true })
    const db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL') // a backup that may be lost with a power cut is of no use
    db.pragma('foreign_keys = ON')
    return new TournamentBackup(db)
  }

  record(s: BackupInput): number {
    return this.db.transaction(() => {
      const rounds = new Set(s.scores.map((x) => x.roundId)).size
      const id = Number(this.db.prepare(`INSERT INTO backup_snapshots (tournament_id, room_key, event, round_number, rounds_settled, at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(s.tournamentId, s.roomKey, s.event, s.roundNumber, rounds, s.at).lastInsertRowid)
      const standing = this.db.prepare(`INSERT INTO backup_standings (snapshot_id, player_id, place, nickname, avatar, points, solved,
        red_orange, blue_penalty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const p of s.standings) standing.run(id, p.player, p.place, p.nickname, p.avatar, p.points, p.solved, p.redOrange, p.bluePenalty)
      const score = this.db.prepare(`INSERT INTO backup_round_scores (snapshot_id, round_id, round_number, player_id, pioneer_points,
        jackpot_points, blue_count, blue_penalty, red_orange_count, solved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const r of s.scores) score.run(id, r.roundId, r.roundNumber, r.player, r.pioneer, r.jackpot, r.blueCount, r.bluePenalty, r.redOrange, r.solved)
      return id
    })()
  }

  // The tournament's snapshots, latest first.
  list(tournamentId: string, limit = 100): Omit<BackupSnapshot, 'standings'>[] {
    return (this.db.prepare('SELECT * FROM backup_snapshots WHERE tournament_id = ? ORDER BY id DESC LIMIT ?').all(tournamentId, limit) as Row[])
      .map((r) => ({ id: r.id as number, tournamentId: r.tournament_id as string, roomKey: r.room_key as string, event: r.event as BackupEvent,
        roundNumber: (r.round_number as number | null) ?? null, roundsSettled: r.rounds_settled as number, at: r.at as number }))
  }

  // One snapshot with its standings, or the latest one of the tournament when `id` is null.
  snapshot(tournamentId: string, id: number | null = null): BackupSnapshot | null {
    const r = (id === null
      ? this.db.prepare('SELECT * FROM backup_snapshots WHERE tournament_id = ? ORDER BY id DESC LIMIT 1').get(tournamentId)
      : this.db.prepare('SELECT * FROM backup_snapshots WHERE tournament_id = ? AND id = ?').get(tournamentId, id)) as Row | undefined
    if (!r) return null
    const standings = (this.db.prepare('SELECT * FROM backup_standings WHERE snapshot_id = ? ORDER BY place, nickname').all(r.id) as Row[]).map((p) => ({
      player: p.player_id as string, place: p.place as number, nickname: p.nickname as string, avatar: (p.avatar as string | null) ?? null,
      points: p.points as number, solved: p.solved as number, redOrange: p.red_orange as number, bluePenalty: p.blue_penalty as number,
    }))
    return { id: r.id as number, tournamentId: r.tournament_id as string, roomKey: r.room_key as string, event: r.event as BackupEvent,
      roundNumber: (r.round_number as number | null) ?? null, roundsSettled: r.rounds_settled as number, at: r.at as number, standings }
  }

  scores(snapshotId: number): BackupRoundScore[] {
    return (this.db.prepare('SELECT * FROM backup_round_scores WHERE snapshot_id = ? ORDER BY round_number, player_id').all(snapshotId) as Row[])
      .map((r) => ({ roundId: r.round_id as string, roundNumber: r.round_number as number, player: r.player_id as string,
        pioneer: r.pioneer_points as number, jackpot: r.jackpot_points as number, blueCount: r.blue_count as number,
        bluePenalty: r.blue_penalty as number, redOrange: r.red_orange_count as number, solved: r.solved as number }))
  }
}
