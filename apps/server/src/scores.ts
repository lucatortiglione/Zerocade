import { gameBoard, insertGameScore, leaderboardResets, setLeaderboardReset } from './db.js'
import { sessionSince } from './sessions.js'

// The leaderboards of every game: session, day, week, month and all time. The points come from the overlays (a
// canvas game reports each one it awards) and from the games the server runs (ZeroWords, ZeroQuizz); they are
// stored one row each and summed per viewer for each period. The dates are the server's local time.

export const PERIODS = [
  { id: 'sessione', label: 'Sessione' },
  { id: 'giorno', label: 'Giorno' },
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
  { id: 'sempre', label: 'All Time' },
] as const
export type PeriodId = (typeof PERIODS)[number]['id']

export interface BoardEntry {
  rank: number
  name: string
  avatar: string | null
  points: number
}
export type Boards = Record<PeriodId, BoardEntry[]>

// When a period begins: the session's start (the game was chosen or restarted), midnight today, Monday's
// midnight, the first of the month, or the beginning of time.
export function periodStart(period: PeriodId, now: Date, sessionStart: number): number {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case 'sessione':
      return sessionStart
    case 'giorno':
      return day.getTime()
    case 'settimana':
      return new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7)).getTime()
    case 'mese':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    case 'sempre':
      return 0
  }
}

const MAX_POINTS = 100_000

// One award of points. Anything that is not a whole number of points, or has no viewer, is dropped.
export function recordScore(
  key: string,
  gameId: string,
  user: { id: string; nickname: string; avatar?: string },
  points: number,
  at = Date.now(),
): boolean {
  if (!Number.isInteger(points) || points <= 0 || points > MAX_POINTS) return false
  if (!user.id || !user.nickname || user.id.length > 64 || user.nickname.length > 32) return false
  insertGameScore(key, gameId, { id: user.id, nickname: user.nickname, avatar: user.avatar }, points, at)
  return true
}

export const isPeriod = (id: unknown): id is PeriodId => PERIODS.some((p) => p.id === id)

// Resets one leaderboard of a game (one period) from `at`: that period counts only the points after it, the other
// periods stay as they were. Nothing is deleted. Returns the moment of the reset.
export function resetLeaderboard(key: string, gameId: string, period: PeriodId, at = Date.now()): number {
  setLeaderboardReset(key, gameId, period, at)
  return at
}

// When each period of a game was last reset (period -> time), for the dashboard.
export const leaderboardResetTimes = (key: string, gameId: string): Partial<Record<PeriodId, number>> => leaderboardResets(key, gameId)

export function leaderboards(key: string, gameId: string, limit = 10, now = new Date()): Boards {
  const start = sessionSince(key, gameId)
  const resets = leaderboardResets(key, gameId)
  const out = {} as Boards
  for (const { id } of PERIODS) {
    // A period begins at its natural start, or later if it was reset since.
    const since = Math.max(periodStart(id, now, start), resets[id] ?? 0)
    out[id] = gameBoard(key, gameId, since, limit).map((row, i) => ({
      rank: i + 1,
      name: row.nickname,
      avatar: row.avatar,
      points: row.points,
    }))
  }
  return out
}
