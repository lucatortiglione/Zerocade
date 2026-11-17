// ZeroTaboo: match, round and card as a pure state machine (ZEROTABOO.md §1, §3, §5, §6; guide §4.6).
// `transition(state, input)` returns the next state and the effects the coordinator (taboo.ts) must run: timers, draws from
// the deck, saves, emissions. It reads no clock, no randomness, no database: the time (`now`, monotonic ms) comes with the input.
//
// Invariants (each has a test, tests/taboo-machine.test.ts):
//  I1 one active card at most; I2 a closed card is never reopened; I3 one winner per exposure at most; I4 the team's score is
//  never below 0; I5 skips used <= 2 per round; I6 Jackpot <= 1 and sung <= 1 per match, never on the same card; I7 no answer
//  is accepted at or after the deadline, even if the timer has not fired yet; I9 no card twice in a match (the coordinator's
//  deck guarantees it); I10 the configuration is the one of the start; I11 an input for an old match, round or exposure is
//  ignored; I12 one Taboo penalty per card.
import {
  TABOO_RULES, TABOO_ROUND_PLANS, TABOO_NARRATIVES,
  type TabooCategory, type TabooConfig, type TabooDifficulty, type TabooErrorCode, type TabooNarrative, type TabooOutcome, type TabooPhase,
  type TabooRoundPlan,
} from '@zerocade/shared'
import { correctionDeltas, rectifyToTaboo, scoreRound, type CardResult, type ScoreEvent } from './taboo-scoring.js'

export interface CardRef {
  code: string
  revision: number
  difficulty: TabooDifficulty
  category: TabooCategory
}

export interface ActiveCard {
  exposure: number
  card: CardRef
  openedAt: number // monotonic ms
  availableMs: number // the round's time left when it opened (§9.1: under 20 s it is out of the calibration)
  jackpot: boolean
  sung: boolean
  interrupted: boolean // a technical interruption touched this exposure (§9.1)
}

export interface ClosedCard {
  exposure: number
  card: CardRef
  outcome: TabooOutcome
  winner: string | null // player id; null for every outcome but a solved card closed by an eligible player (D6)
  doubled: boolean
  jackpot: boolean
  sung: boolean
  interrupted: boolean
  solveMs: number | null
  closedAt: number
}

export interface RoundRecord {
  number: number
  category: TabooCategory | null
  narrative: TabooNarrative | null
  skipsUsed: number
  results: CardResult[]
  cards: ClosedCard[] // parallel to `results`
  startedAt: number
}

export interface MatchState {
  version: number
  matchId: string | null
  phase: TabooPhase
  config: TabooConfig
  round: number // the round in play, or about to start (intermission)
  rounds: RoundRecord[] // the rounds started, in order
  team: number
  reachedThreshold: { round: number } | null // D10: recorded when reached; the match goes on to the last round
  jackpotUsed: boolean
  sungUsed: boolean
  deadline: number // monotonic ms; meaningful in `round`
  remainingMs: number // frozen while suspended
  suspendedFrom: 'round' | 'intermission' | null
  exposureSeq: number // the last exposure number handed out
  awaiting: { exposure: number; jackpot: boolean } | null // a card was asked from the deck and has not arrived
  active: ActiveCard | null
  lastClosed: ClosedCard | null
  chosenCategory: TabooCategory | null
  chosenNarrative: TabooNarrative | null
  outcome: 'won' | 'lost' | 'cancelled' | null
}

export const DEFAULT_CONFIG: TabooConfig = Object.freeze({
  threshold: TABOO_RULES.thresholdDefault, platform: 'tiktok', intermissionMs: TABOO_RULES.intermissionDefaultMs, mode: 'standard',
  rulesVersion: TABOO_RULES.version,
})

export const initialState = (): MatchState => ({
  version: 0, matchId: null, phase: 'setup', config: DEFAULT_CONFIG, round: 0, rounds: [], team: 0, reachedThreshold: null,
  jackpotUsed: false, sungUsed: false, deadline: 0, remainingMs: 0, suspendedFrom: null, exposureSeq: 0, awaiting: null, active: null,
  lastClosed: null, chosenCategory: null, chosenNarrative: null, outcome: null,
})

export type MachineInput =
  | { type: 'start-match'; matchId: string; config: TabooConfig; expectedVersion?: number }
  | { type: 'start-round'; matchId: string; now: number; expectedVersion?: number }
  | { type: 'card-drawn'; matchId: string; round: number; now: number; exposure: number; card: CardRef }
  | { type: 'answer'; matchId: string; now: number; exposure: number; winner: string | null }
  | { type: 'skip'; matchId: string; now: number; exposure: number; expectedVersion?: number }
  | { type: 'taboo'; matchId: string; now: number; exposure: number; expectedVersion?: number }
  | { type: 'sing'; matchId: string; now: number; exposure: number; expectedVersion?: number }
  | { type: 'set-category'; matchId: string; category: TabooCategory; expectedVersion?: number }
  | { type: 'set-narrative'; matchId: string; narrative: TabooNarrative }
  | { type: 'timeout'; matchId: string; round: number; now: number }
  | { type: 'suspend'; matchId: string; now: number }
  | { type: 'resume'; matchId: string; now: number; expectedVersion?: number }
  | { type: 'cancel'; matchId: string; expectedVersion?: number }
  | { type: 'dismiss'; matchId: string; expectedVersion?: number }
  | { type: 'rectify'; matchId: string; round: number; index: number }

export type Effect =
  | { type: 'draw-card'; round: number; exposure: number; jackpot: boolean; category: TabooCategory | null; mix: TabooRoundPlan['mix'] }
  | { type: 'round-start'; round: number; category: TabooCategory | null; narrative: TabooNarrative | null }
  | { type: 'set-timer'; round: number; ms: number }
  | { type: 'clear-timer' }
  | { type: 'open-card'; round: number; card: ActiveCard }
  | { type: 'close-card'; round: number; closed: ClosedCard; events: ScoreEvent[]; team: number; reachedNow: boolean }
  | { type: 'round-end'; round: number; team: number }
  | { type: 'match-end'; outcome: 'won' | 'lost' | 'cancelled'; team: number }
  | { type: 'correction'; round: number; index: number; deltas: { index: number; delta: number }[]; team: number }
  | { type: 'choose-category' } // the interval of round 3: the chat votes, the coordinator sets the winner
  | { type: 'choose-narrative' } // the interval of round 4: the bot picks one at random

export interface Transition {
  state: MatchState
  effects: Effect[]
  ignored?: 'stale' | 'late' | 'early' | 'duplicate'
  error?: { code: TabooErrorCode; message: string }
}

const ignore = (state: MatchState, why: NonNullable<Transition['ignored']>): Transition => ({ state, effects: [], ignored: why })
const fail = (state: MatchState, code: TabooErrorCode, message: string): Transition => ({ state, effects: [], error: { code, message } })
const planOf = (round: number): TabooRoundPlan | undefined => TABOO_ROUND_PLANS.find((p) => p.number === round)

export const currentRound = (state: MatchState): RoundRecord | undefined => state.rounds.find((r) => r.number === state.round)
export const skipsLeft = (state: MatchState): number => TABOO_RULES.skipsPerRound - (state.phase === 'round' || state.phase === 'suspended' ? currentRound(state)?.skipsUsed ?? 0 : 0)
export const streakOf = (state: MatchState): number => {
  const r = currentRound(state)
  return r && (state.phase === 'round' || state.phase === 'suspended') ? scoreRound(0, r.results).streak : 0
}

// The team's score through the rounds in order: each round starts where the previous one ended.
function totalTeam(rounds: readonly RoundRecord[]): number {
  return rounds.reduce((team, r) => scoreRound(team, r.results).team, 0)
}
const teamBefore = (rounds: readonly RoundRecord[], round: number): number => totalTeam(rounds.filter((r) => r.number < round))

// The time a round has left at `now`, never negative.
export const remainingAt = (state: MatchState, now: number): number =>
  state.phase === 'round' ? Math.max(0, state.deadline - now) : state.phase === 'suspended' ? state.remainingMs : 0

// The next card of the round: the plan's mix, the voted category in round 3, the Jackpot first card of round 5.
function drawEffect(state: MatchState, jackpot: boolean): { state: MatchState; effect: Effect } {
  const plan = planOf(state.round)!
  const exposure = state.exposureSeq + 1
  return {
    state: { ...state, exposureSeq: exposure, awaiting: { exposure, jackpot } },
    effect: { type: 'draw-card', round: state.round, exposure, jackpot, category: plan.votesCategory ? state.chosenCategory : null, mix: plan.mix },
  }
}

// Closes the active card with an outcome and asks for the next one. Returns the effects in the order to run them.
function closeActive(state: MatchState, outcome: TabooOutcome, now: number, winner: string | null, next: boolean): Transition {
  const active = state.active!
  const round = currentRound(state)!
  const doubled = outcome === 'solved' && (active.jackpot || active.sung)
  const result: CardResult = outcome === 'solved'
    ? { kind: 'solved', difficulty: active.card.difficulty, doubled }
    : { kind: outcome }
  const closed: ClosedCard = {
    exposure: active.exposure, card: active.card, outcome, winner: outcome === 'solved' ? winner : null, doubled, jackpot: active.jackpot,
    sung: active.sung, interrupted: active.interrupted, solveMs: outcome === 'solved' ? Math.max(0, now - active.openedAt) : null, closedAt: now,
  }
  const results = [...round.results, result]
  const start = teamBefore(state.rounds, state.round)
  const scored = scoreRound(start, results)
  const index = results.length - 1
  const updatedRound: RoundRecord = {
    ...round, results, cards: [...round.cards, closed], skipsUsed: round.skipsUsed + (outcome === 'skipped' ? 1 : 0),
  }
  const reachedNow = state.reachedThreshold === null && scored.team >= state.config.threshold
  let next1: MatchState = {
    ...state, rounds: state.rounds.map((r) => (r === round ? updatedRound : r)), team: scored.team, active: null, lastClosed: closed,
    reachedThreshold: reachedNow ? { round: state.round } : state.reachedThreshold, version: state.version + 1,
  }
  const effects: Effect[] = [{ type: 'close-card', round: state.round, closed, events: scored.events.filter((e) => e.index === index), team: scored.team, reachedNow }]
  if (next) {
    const drawn = drawEffect(next1, false)
    next1 = drawn.state
    effects.push(drawn.effect)
  }
  return { state: next1, effects }
}

function endRound(state: MatchState, now: number): Transition {
  const effects: Effect[] = [{ type: 'clear-timer' }]
  let current = state
  if (current.active) {
    const closed = closeActive(current, 'round_timeout', now, null, false)
    current = closed.state
    effects.push(...closed.effects)
  }
  const last = current.round >= TABOO_RULES.rounds
  effects.push({ type: 'round-end', round: current.round, team: current.team })
  const base: MatchState = { ...current, awaiting: null, active: null, deadline: 0, remainingMs: 0, version: current.version + 1 }
  if (last) {
    const outcome: 'won' | 'lost' = current.reachedThreshold || current.team >= current.config.threshold ? 'won' : 'lost'
    effects.push({ type: 'match-end', outcome, team: current.team })
    return { state: { ...base, phase: 'finished', outcome }, effects }
  }
  const nextRound = current.round + 1
  const plan = planOf(nextRound)!
  if (plan.votesCategory) effects.push({ type: 'choose-category' })
  if (plan.narrative) effects.push({ type: 'choose-narrative' })
  return { state: { ...base, phase: 'intermission', round: nextRound, chosenCategory: null, chosenNarrative: null }, effects }
}

function stale(state: MatchState, input: { matchId?: string; expectedVersion?: number }): Transition | null {
  if (input.matchId !== undefined && input.matchId !== state.matchId) return ignore(state, 'stale')
  if (input.expectedVersion !== undefined && input.expectedVersion !== state.version)
    return fail(state, 'stale-version', 'Il comando si riferisce a uno stato vecchio: riprova.')
  return null
}

export function transition(state: MatchState, input: MachineInput): Transition {
  if (input.type === 'start-match') {
    if (input.expectedVersion !== undefined && input.expectedVersion !== state.version) return fail(state, 'stale-version', 'Il comando si riferisce a uno stato vecchio: riprova.')
    if (state.phase !== 'setup') return fail(state, 'wrong-phase', 'Una partita è già in corso.')
    const { threshold } = input.config
    if (!Number.isInteger(threshold) || threshold < TABOO_RULES.thresholdMin || threshold > TABOO_RULES.thresholdMax)
      return fail(state, 'bad-input', 'La soglia non è valida.')
    const { intermissionMs } = input.config
    if (intermissionMs < TABOO_RULES.intermissionMinMs || intermissionMs > TABOO_RULES.intermissionMaxMs)
      return fail(state, 'bad-input', 'La durata dell\'intervallo deve stare tra 15 e 30 secondi.')
    // The configuration is the snapshot of the start and never changes (I10).
    return { state: { ...initialState(), version: state.version + 1, matchId: input.matchId, phase: 'intermission', round: 1, config: Object.freeze({ ...input.config }) }, effects: [] }
  }

  const old = stale(state, input)
  if (old) return old

  switch (input.type) {
    case 'start-round': {
      if (state.phase !== 'intermission') return fail(state, 'wrong-phase', 'Il round parte dall\'intervallo.')
      const plan = planOf(state.round)!
      if (plan.votesCategory && !state.chosenCategory) return fail(state, 'bad-input', 'Manca la categoria votata.')
      if (plan.narrative && !state.chosenNarrative) return fail(state, 'bad-input', 'Manca il vincolo narrativo.')
      const record: RoundRecord = { number: state.round, category: state.chosenCategory, narrative: state.chosenNarrative, skipsUsed: 0, results: [], cards: [], startedAt: input.now }
      const jackpot = plan.jackpotFirst && !state.jackpotUsed
      const base: MatchState = {
        ...state, phase: 'round', rounds: [...state.rounds, record], deadline: input.now + TABOO_RULES.roundMs, remainingMs: TABOO_RULES.roundMs,
        active: null, lastClosed: null, version: state.version + 1,
      }
      const drawn = drawEffect(base, jackpot)
      return {
        state: drawn.state,
        effects: [
          { type: 'round-start', round: state.round, category: state.chosenCategory, narrative: state.chosenNarrative },
          { type: 'set-timer', round: state.round, ms: TABOO_RULES.roundMs },
          drawn.effect,
        ],
      }
    }

    case 'card-drawn': {
      if (state.phase !== 'round' || input.round !== state.round || !state.awaiting || state.awaiting.exposure !== input.exposure) return ignore(state, 'stale')
      if (input.now >= state.deadline) return ignore(state, 'late') // I7: the round is over; the timer will close it
      const active: ActiveCard = {
        exposure: input.exposure, card: input.card, openedAt: input.now, availableMs: Math.max(0, state.deadline - input.now),
        jackpot: state.awaiting.jackpot, sung: false, interrupted: false,
      }
      return {
        state: { ...state, awaiting: null, active, jackpotUsed: state.jackpotUsed || active.jackpot, version: state.version + 1 },
        effects: [{ type: 'open-card', round: state.round, card: active }],
      }
    }

    case 'answer': {
      if (state.phase !== 'round' || !state.active || state.active.exposure !== input.exposure) return ignore(state, 'stale')
      if (input.now >= state.deadline) return ignore(state, 'late') // I7
      return closeActive(state, 'solved', input.now, input.winner, true)
    }

    case 'skip': {
      if (state.phase !== 'round' || !state.active) return fail(state, 'no-active-card', 'Non c\'è una carta attiva.')
      if (state.active.exposure !== input.exposure) return fail(state, 'no-active-card', 'La carta è cambiata: riprova.')
      if (input.now >= state.deadline) return fail(state, 'wrong-phase', 'Il round è finito.')
      if (skipsLeft(state) <= 0) return fail(state, 'no-skips-left', 'Non restano skip in questo round.')
      return closeActive(state, 'skipped', input.now, null, true)
    }

    case 'taboo': {
      if (state.phase === 'round' && !state.active && state.lastClosed?.exposure === input.exposure && state.lastClosed.outcome === 'taboo')
        return fail(state, 'already-penalized', 'La penalità di questa carta è già stata applicata.') // I12
      if (state.phase !== 'round' || !state.active) return fail(state, 'no-active-card', 'Non c\'è una carta attiva.')
      if (state.active.exposure !== input.exposure) {
        return state.lastClosed?.exposure === input.exposure && state.lastClosed.outcome === 'taboo'
          ? fail(state, 'already-penalized', 'La penalità di questa carta è già stata applicata.')
          : fail(state, 'no-active-card', 'La carta è cambiata: riprova.')
      }
      if (input.now >= state.deadline) return fail(state, 'wrong-phase', 'Il round è finito.')
      return closeActive(state, 'taboo', input.now, null, true)
    }

    case 'sing': {
      if (state.phase !== 'round' || !state.active || state.active.exposure !== input.exposure) return fail(state, 'no-active-card', 'Non c\'è una carta attiva.')
      if (state.sungUsed || state.active.jackpot || state.active.sung) return fail(state, 'bad-input', 'La carta cantata non è disponibile.')
      if (input.now >= state.deadline || input.now < state.deadline - TABOO_RULES.sungWindowMs)
        return fail(state, 'wrong-phase', 'La carta cantata si attiva solo negli ultimi 20 secondi del round.')
      return { state: { ...state, sungUsed: true, active: { ...state.active, sung: true }, version: state.version + 1 }, effects: [] }
    }

    case 'set-category': {
      const plan = planOf(state.round)
      if (state.phase !== 'intermission' || !plan?.votesCategory) return fail(state, 'wrong-phase', 'La categoria si sceglie nell\'intervallo del round 3.')
      return { state: { ...state, chosenCategory: input.category, version: state.version + 1 }, effects: [] }
    }

    case 'set-narrative': {
      const plan = planOf(state.round)
      if (state.phase !== 'intermission' || !plan?.narrative) return fail(state, 'wrong-phase', 'Il vincolo si sceglie nell\'intervallo del round 4.')
      if (!(TABOO_NARRATIVES as readonly string[]).includes(input.narrative)) return fail(state, 'bad-input', 'Vincolo non valido.')
      return { state: { ...state, chosenNarrative: input.narrative, version: state.version + 1 }, effects: [] }
    }

    case 'timeout': {
      if (state.phase !== 'round' || input.round !== state.round) return ignore(state, 'stale')
      if (input.now < state.deadline) return ignore(state, 'early')
      return endRound(state, input.now)
    }

    case 'suspend': {
      if (state.phase !== 'round' && state.phase !== 'intermission') return ignore(state, 'duplicate')
      const wasRound = state.phase === 'round'
      return {
        state: {
          ...state, phase: 'suspended', suspendedFrom: wasRound ? 'round' : 'intermission', remainingMs: wasRound ? Math.max(0, state.deadline - input.now) : 0,
          // The exposure in play is marked: a technical interruption keeps it out of the calibration (§9.1).
          active: state.active ? { ...state.active, interrupted: true } : null, version: state.version + 1,
        },
        effects: wasRound ? [{ type: 'clear-timer' }] : [],
      }
    }

    case 'resume': {
      if (state.phase !== 'suspended') return fail(state, 'wrong-phase', 'La partita non è sospesa.')
      if (state.suspendedFrom === 'intermission')
        return { state: { ...state, phase: 'intermission', suspendedFrom: null, version: state.version + 1 }, effects: [] }
      const resumed: MatchState = { ...state, phase: 'round', suspendedFrom: null, deadline: input.now + state.remainingMs, version: state.version + 1 }
      const effects: Effect[] = [{ type: 'set-timer', round: state.round, ms: state.remainingMs }]
      if (state.awaiting) {
        const plan = planOf(state.round)!
        effects.push({ type: 'draw-card', round: state.round, exposure: state.awaiting.exposure, jackpot: state.awaiting.jackpot, category: plan.votesCategory ? state.chosenCategory : null, mix: plan.mix })
      }
      return { state: resumed, effects }
    }

    case 'cancel': {
      if (state.phase === 'setup' || state.phase === 'finished' || state.phase === 'cancelled') return fail(state, 'wrong-phase', 'Non c\'è una partita da annullare.')
      return {
        state: { ...state, phase: 'cancelled', outcome: 'cancelled', awaiting: null, active: null, suspendedFrom: null, version: state.version + 1 },
        effects: [{ type: 'clear-timer' }, { type: 'match-end', outcome: 'cancelled', team: state.team }],
      }
    }

    case 'dismiss': {
      if (state.phase !== 'finished' && state.phase !== 'cancelled') return fail(state, 'wrong-phase', 'La partita non è finita.')
      return { state: { ...initialState(), version: state.version + 1 }, effects: [] }
    }

    case 'rectify': {
      if (state.phase !== 'intermission' && state.phase !== 'finished') return fail(state, 'wrong-phase', 'Le rettifiche si applicano tra i round.')
      const target = state.rounds.find((r) => r.number === input.round)
      if (!target) return fail(state, 'bad-input', 'Round non valido.')
      if (target.results[input.index]?.kind !== 'solved') return fail(state, 'bad-input', 'Solo una carta risolta si può rettificare.')
      const start = teamBefore(state.rounds, target.number)
      const after = rectifyToTaboo(target.results, input.index)
      const deltas = correctionDeltas(start, target.results, after)
      const cards = target.cards.map((c, i) => (i === input.index ? { ...c, outcome: 'taboo' as const, winner: null, doubled: false } : c))
      const rounds = state.rounds.map((r) => (r === target ? { ...r, results: after, cards } : r))
      const team = totalTeam(rounds)
      return {
        state: { ...state, rounds, team, version: state.version + 1 },
        effects: [{ type: 'correction', round: input.round, index: input.index, deltas, team }],
      }
    }
  }
}
