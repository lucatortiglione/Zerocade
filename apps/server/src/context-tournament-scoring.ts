import { BAND_STRENGTH, TOURNAMENT_RULES, bandInfo, tournamentBand, type TournamentBand, type TournamentRow } from '@zerocade/shared'

// ZeroContext tournament: the points of a round and the standings, as pure functions of the accepted guesses
// (regolamento §§4-9, specifica §6). Nothing here keeps state: the server recomputes from its saved records, so a
// retry or a restart can never count a guess twice.

// An accepted guess, in the official order (`seq`, the server's arrival order).
export interface ScoredGuess {
  seq: number
  window: number
  player: string
  position: number
}

export interface PlayerRound {
  pioneer: number
  jackpot: number
  blueCount: number
  bluePenalty: number
  // Pioneer bonuses in the orange and red bands (a tie-break, §9).
  redOrange: number
  // Pioneer bands this player unlocked (for "Pioniere Supremo").
  bands: number
  solved: boolean
}

export interface RoundOutcome {
  solved: boolean
  solvedBy: string | null
  // seq of the winning guess; later guesses of the round do not count.
  solvedSeq: number | null
  pioneerTotal: number
  jackpot: number
  // Pioneer points of each counted guess (seq -> points).
  pioneerBySeq: Map<number, number>
  players: Map<string, PlayerRound>
  // The best position a player reached (the lifeline does not count), null before any guess.
  best: number | null
  achievements: { holeInOne: string | null; supremePioneers: string[]; fireUnderIce: string | null }
}

// Blue attempts are counted but never cost points (decided 15/11/2026): the Ice filter's penalty is always 0.
export const bluePenalty = (_blueCount: number) => 0

export const netPoints = (p: Pick<PlayerRound, 'pioneer' | 'jackpot' | 'bluePenalty'>) => p.pioneer + p.jackpot - p.bluePenalty

// The round, guess by guess in the official order: the high-water mark of the Pioneer bonus, the jackpot to the first
// target (100 minus the Pioneer points given, skipped bands included), the blue filter. Guesses after the target
// change nothing.
export function scoreRound(guesses: readonly ScoredGuess[]): RoundOutcome {
  const ordered = [...guesses].sort((a, b) => a.seq - b.seq)
  const players = new Map<string, PlayerRound>()
  const pioneerBySeq = new Map<number, number>()
  const of = (id: string) => {
    let p = players.get(id)
    if (!p) players.set(id, (p = { pioneer: 0, jackpot: 0, blueCount: 0, bluePenalty: 0, redOrange: 0, bands: 0, solved: false }))
    return p
  }
  let highWater = 0
  let pioneerTotal = 0
  let solvedBy: string | null = null
  let solvedSeq: number | null = null
  let jackpot = 0
  let best: number | null = null
  let holeInOne: string | null = null
  ordered.forEach((g, i) => {
    if (solvedBy !== null) return
    const player = of(g.player)
    best = best === null ? g.position : Math.min(best, g.position)
    const band: TournamentBand = tournamentBand(g.position)
    if (band === 'target') {
      solvedBy = g.player
      solvedSeq = g.seq
      jackpot = TOURNAMENT_RULES.jackpotTotal - pioneerTotal
      player.jackpot += jackpot
      player.solved = true
      if (i === 0) holeInOne = g.player
      return
    }
    if (band === 'blue') {
      player.blueCount++
      return
    }
    const strength = BAND_STRENGTH[band]
    if (strength > highWater) {
      const points = bandInfo(band).pioneer
      highWater = strength
      pioneerTotal += points
      player.pioneer += points
      player.bands++
      if (band === 'red' || band === 'orange') player.redOrange++
      pioneerBySeq.set(g.seq, points)
    }
  })
  for (const p of players.values()) p.bluePenalty = bluePenalty(p.blueCount)
  const solver = solvedBy === null ? null : players.get(solvedBy)
  return {
    solved: solvedBy !== null,
    solvedBy,
    solvedSeq,
    pioneerTotal,
    jackpot,
    pioneerBySeq,
    players,
    best,
    achievements: {
      holeInOne,
      supremePioneers: [...players].filter(([, p]) => p.bands >= 3).map(([id]) => id),
      fireUnderIce: solver && solver.bluePenalty >= 3 ? solvedBy : null,
    },
  }
}

// One player's totals over the settled rounds of a tournament.
export interface PlayerTotals {
  player: string
  nickname: string
  avatar?: string
  points: number
  delta: number
  solved: number
  redOrange: number
  bluePenalty: number
}

// The order of §9: net points, then rounds solved, then orange/red Pioneer bonuses, then fewer blue penalty points;
// a tie that remains is ex aequo (same place). Players at zero, or below, are listed too.
export const compareTotals = (a: PlayerTotals, b: PlayerTotals) =>
  b.points - a.points || b.solved - a.solved || b.redOrange - a.redOrange || a.bluePenalty - b.bluePenalty

export function standings(totals: readonly PlayerTotals[]): TournamentRow[] {
  const sorted = [...totals].sort((a, b) => compareTotals(a, b) || a.nickname.localeCompare(b.nickname, 'it') || a.player.localeCompare(b.player))
  const rows: TournamentRow[] = []
  sorted.forEach((t, i) => {
    const prev = sorted[i - 1]
    const place = prev && compareTotals(prev, t) === 0 ? rows[i - 1].place : i + 1
    rows.push({ place, tied: false, nickname: t.nickname, ...(t.avatar && { avatar: t.avatar }), points: t.points, delta: t.delta,
      solved: t.solved, redOrange: t.redOrange, bluePenalty: t.bluePenalty })
  })
  for (const r of rows) r.tied = rows.filter((x) => x.place === r.place).length > 1
  return rows
}

// The Top 10 (§13.6): the first ten rows, and whether the 10th place is shared with someone left out.
export function topTen(rows: readonly TournamentRow[]): { top10: TournamentRow[]; tieAtTen: boolean } {
  const top10 = rows.slice(0, 10)
  const tieAtTen = rows.length > 10 && rows[10].place === rows[9].place
  return { top10, tieAtTen }
}
