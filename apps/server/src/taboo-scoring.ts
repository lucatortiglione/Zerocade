// ZeroTaboo scoring (ZEROTABOO.md §4, §10). Pure functions: the same reducer gives the live score and the correction of a
// contested card, because "reaccreditare gli eventi nell'ordine corretto" (§3.5) means to compute again, not to patch by hand.
import { TABOO_RULES, type TabooDifficulty } from '@zerocade/shared'

export type CardResult =
  | { kind: 'solved'; difficulty: TabooDifficulty; doubled: boolean } // doubled: Jackpot or sung card, never both
  | { kind: 'skipped' }
  | { kind: 'taboo' }
  | { kind: 'round_timeout' }

export type ScoreKind = 'base' | 'streak' | 'penalty'
export interface ScoreEvent {
  index: number // the position of the card in the round's results
  kind: ScoreKind
  delta: number
}

export interface RoundScore {
  team: number // the team's score at the end of the round
  events: ScoreEvent[]
  deltas: number[] // the total delta of each card, in order
  streak: number // consecutive correct cards at the end (it resets at the end of the round)
}

// The points of one round from the team's score at its start and the results in order. The streak is per round (§4).
export function scoreRound(start: number, results: readonly CardResult[]): RoundScore {
  let team = Math.max(0, start)
  let streak = 0
  const events: ScoreEvent[] = []
  const deltas: number[] = []
  results.forEach((result, index) => {
    const before = team
    if (result.kind === 'solved') {
      // Only the base points are doubled; the streak bonus is fixed (§4).
      const base = TABOO_RULES.basePoints[result.difficulty] * (result.doubled ? TABOO_RULES.doubleMultiplier : 1)
      team += base
      events.push({ index, kind: 'base', delta: base })
      streak++
      if (streak % TABOO_RULES.streakEvery === 0) {
        team += TABOO_RULES.streakBonus
        events.push({ index, kind: 'streak', delta: TABOO_RULES.streakBonus })
      }
    } else {
      streak = 0
      if (result.kind === 'taboo') {
        const penalty = Math.min(TABOO_RULES.tabooPenalty, team) // never below 0
        team -= penalty
        events.push({ index, kind: 'penalty', delta: penalty === 0 ? 0 : -penalty }) // not -0
      }
    }
    deltas.push(team - before)
  })
  return { team, events, deltas, streak }
}

// §3.5: a violation before the winning answer revokes the win: the card becomes a Taboo one (−1, streak reset).
export function rectifyToTaboo(results: readonly CardResult[], index: number): CardResult[] {
  if (!Number.isInteger(index) || index < 0 || index >= results.length || results[index].kind !== 'solved')
    throw new RangeError('Only a solved card can be rectified to a Taboo one')
  return results.map((r, i) => (i === index ? { kind: 'taboo' } : r))
}

// The correction events: for every card whose total changed, the difference to append (append-only: the past is not rewritten).
export function correctionDeltas(start: number, before: readonly CardResult[], after: readonly CardResult[]): { index: number; delta: number }[] {
  const a = scoreRound(start, before).deltas
  const b = scoreRound(start, after).deltas
  const out: { index: number; delta: number }[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (b[i] ?? 0) - (a[i] ?? 0)
    if (delta !== 0) out.push({ index: i, delta })
  }
  return out
}

// ---- Individual standings (§4): wins, then hard wins, then medium wins; what is left is ex aequo ----

export interface Win {
  id: string // Viewer.id (`${platform}:${id}`): the nickname can be changed, the id identifies the player
  nickname: string
  avatar?: string
  difficulty: TabooDifficulty
}

export interface PlayerTally {
  id: string
  nickname: string
  avatar?: string
  solved: number
  hard: number
  medium: number
}
export type RankedPlayer = PlayerTally & { place: number }

// The tallies from the list of wins: one source of truth, so a revoked win is just a win that is not in the list.
export function tally(wins: readonly Win[]): PlayerTally[] {
  const by = new Map<string, PlayerTally>()
  for (const win of wins) {
    const t = by.get(win.id) ?? { id: win.id, nickname: win.nickname, solved: 0, hard: 0, medium: 0 }
    t.nickname = win.nickname // the latest nickname
    if (win.avatar) t.avatar = win.avatar
    t.solved++
    if (win.difficulty === 3) t.hard++
    if (win.difficulty === 2) t.medium++
    by.set(win.id, t)
  }
  return [...by.values()]
}

// Ex aequo: the same place for the equal ones, the next place skips them (1, 1, 3), as the tournament does.
export function rankPlayers(tallies: readonly PlayerTally[]): RankedPlayer[] {
  const sorted = [...tallies].sort((a, b) => b.solved - a.solved || b.hard - a.hard || b.medium - a.medium || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out: RankedPlayer[] = []
  sorted.forEach((t, i) => {
    const prev = out[i - 1]
    const same = prev && prev.solved === t.solved && prev.hard === t.hard && prev.medium === t.medium
    out.push({ ...t, place: same ? prev.place : i + 1 })
  })
  return out
}

// ---- Symbolic awards (§10): badges, never points ----

// Cacciatore di Rosse: the most hard wins (at least one); a tie is ex aequo.
export function redHunters(tallies: readonly PlayerTally[]): PlayerTally[] {
  const most = Math.max(0, ...tallies.map((t) => t.hard))
  return most > 0 ? tallies.filter((t) => t.hard === most) : []
}

// Voce della Chat: at least three rounds with at least one distinct message each. `rounds`: player id -> rounds with a message.
export function voiceOfChat(rounds: ReadonlyMap<string, ReadonlySet<number>>): string[] {
  return [...rounds].filter(([, set]) => set.size >= 3).map(([id]) => id).sort()
}

// Squadra in Forma: three cards in a row in a round.
export const teamInForm = (results: readonly CardResult[]): boolean => scoreRound(0, results).events.some((e) => e.kind === 'streak')
