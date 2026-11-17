import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABOO_RULES } from '../packages/shared/src/taboo.ts'
import {
  DEFAULT_CONFIG, initialState, remainingAt, skipsLeft, streakOf, transition, type CardRef, type Effect, type MachineInput, type MatchState, type Transition,
} from '../apps/server/src/taboo-machine.ts'

const M = 'match-1'
let cardSeq = 0
const card = (difficulty: 1 | 2 | 3 = 1, category: CardRef['category'] = 'A'): CardRef => ({ code: `${category}${String(++cardSeq).padStart(2, '0')}`, revision: 1, difficulty, category })

// A small coordinator: it runs the effects that ask for a card, so a test can write "answer" and "skip" and read the result.
class Driver {
  state: MatchState = initialState()
  now = 1000
  log: Effect[] = []
  errors: string[] = []
  difficulty: 1 | 2 | 3 = 1
  apply(input: MachineInput): Transition {
    const t = transition(this.state, input)
    this.state = t.state
    if (t.error) this.errors.push(t.error.code)
    this.log.push(...t.effects)
    return t
  }
  // Runs a transition and then answers every "draw-card" it asked for, as the coordinator does.
  step(input: MachineInput): Transition {
    const t = this.apply(input)
    for (const e of t.effects) {
      if (e.type === 'draw-card') this.apply({ type: 'card-drawn', matchId: M, round: e.round, now: this.now, exposure: e.exposure, card: card(this.difficulty, e.category ?? 'A') })
    }
    return t
  }
  start(config = DEFAULT_CONFIG) { return this.apply({ type: 'start-match', matchId: M, config }) }
  startRound() { return this.step({ type: 'start-round', matchId: M, now: this.now }) }
  answer(winner: string | null = 'tiktok:a') { return this.step({ type: 'answer', matchId: M, now: this.now, exposure: this.state.active!.exposure, winner }) }
  skip() { return this.step({ type: 'skip', matchId: M, now: this.now, exposure: this.state.active!.exposure }) }
  taboo(exposure = this.state.active?.exposure ?? 0) { return this.step({ type: 'taboo', matchId: M, now: this.now, exposure }) }
  timeout() {
    this.now = this.state.deadline
    return this.step({ type: 'timeout', matchId: M, round: this.state.round, now: this.now })
  }
  // Plays a whole round that ends by the timeout.
  playRound(answers = 0) {
    this.startRound()
    for (let i = 0; i < answers; i++) this.answer()
    return this.timeout()
  }
  closed(type: 'close-card') { return this.log.filter((e): e is Extract<Effect, { type: 'close-card' }> => e.type === type) }
}

const category = (d: Driver) => d.apply({ type: 'set-category', matchId: M, category: 'C' })
const narrative = (d: Driver) => d.apply({ type: 'set-narrative', matchId: M, narrative: 'thriller' })

test('start: the configuration is validated and fixed for the match (I10)', () => {
  const d = new Driver()
  assert.equal(d.apply({ type: 'start-match', matchId: M, config: { ...DEFAULT_CONFIG, threshold: 1 } }).error?.code, 'bad-input')
  assert.equal(d.apply({ type: 'start-match', matchId: M, config: { ...DEFAULT_CONFIG, intermissionMs: 5_000 } }).error?.code, 'bad-input')
  assert.equal(d.apply({ type: 'start-match', matchId: M, config: { ...DEFAULT_CONFIG, intermissionMs: 31_000 } }).error?.code, 'bad-input')
  d.start({ ...DEFAULT_CONFIG, threshold: 30 })
  assert.equal(d.state.phase, 'intermission')
  assert.equal(d.state.round, 1)
  assert.equal(d.state.config.threshold, 30)
  assert.equal(d.start().error?.code, 'wrong-phase') // a second start does not change the snapshot
  assert.equal(d.state.config.threshold, 30)
  assert.throws(() => { (d.state.config as { threshold: number }).threshold = 5 }, TypeError) // frozen
})

test('a round: the timer of 90 s, a card asked from the deck, the card opens with the time left', () => {
  const d = new Driver()
  d.start()
  const t = d.startRound()
  assert.equal(d.state.phase, 'round')
  assert.deepEqual(d.log.filter((e) => e.type === 'set-timer'), [{ type: 'set-timer', round: 1, ms: TABOO_RULES.roundMs }])
  assert.equal(d.state.deadline, d.now + TABOO_RULES.roundMs)
  assert.ok(t.effects.some((e) => e.type === 'draw-card'))
  assert.ok(d.state.active)
  assert.equal(d.state.active!.availableMs, TABOO_RULES.roundMs)
  assert.equal(remainingAt(d.state, d.now + 10_000), 80_000)
})

test('I1/I2: one active card; a closed card is never reopened; an old exposure is ignored (I11)', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const first = d.state.active!.exposure
  // a second card arriving while one is active is ignored
  const extra = d.apply({ type: 'card-drawn', matchId: M, round: 1, now: d.now, exposure: first + 1, card: card() })
  assert.equal(extra.ignored, 'stale')
  assert.equal(d.state.active!.exposure, first)
  d.answer()
  assert.notEqual(d.state.active!.exposure, first)
  const again = d.apply({ type: 'answer', matchId: M, now: d.now, exposure: first, winner: 'tiktok:b' })
  assert.equal(again.ignored, 'stale') // I2/I11: the card is closed
  assert.equal(d.closed('close-card').length, 1)
})

test('I3: one winner per exposure; the first answer closes the card and the next card comes at once', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const exposure = d.state.active!.exposure
  d.answer('tiktok:a')
  const second = d.apply({ type: 'answer', matchId: M, now: d.now, exposure, winner: 'tiktok:b' })
  assert.equal(second.ignored, 'stale')
  const closed = d.closed('close-card')
  assert.equal(closed.length, 1)
  assert.equal(closed[0].closed.winner, 'tiktok:a')
  assert.equal(d.state.team, 1)
})

test('I7: an answer 1 ms before the deadline counts, at the deadline it does not, even if the timer has not fired', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const exposure = d.state.active!.exposure
  const late = d.apply({ type: 'answer', matchId: M, now: d.state.deadline, exposure, winner: 'tiktok:a' })
  assert.equal(late.ignored, 'late')
  assert.equal(d.state.team, 0)
  const ok = d.step({ type: 'answer', matchId: M, now: d.state.deadline - 1, exposure, winner: 'tiktok:a' })
  assert.equal(ok.ignored, undefined)
  assert.equal(d.state.team, 1)
})

test('D6: a correct answer of the other platform closes the card with the team points and no individual winner', () => {
  const d = new Driver()
  d.start(); d.startRound()
  d.answer(null)
  const closed = d.closed('close-card')[0].closed
  assert.equal(closed.outcome, 'solved')
  assert.equal(closed.winner, null)
  assert.equal(d.state.team, 1)
})

test('I5: two skips per round, the third is refused; a skip scores nothing and resets the streak', () => {
  const d = new Driver()
  d.start(); d.startRound()
  d.answer(); d.answer()
  assert.equal(streakOf(d.state), 2)
  assert.equal(skipsLeft(d.state), 2)
  d.skip()
  assert.equal(streakOf(d.state), 0)
  d.skip()
  assert.equal(skipsLeft(d.state), 0)
  const before = d.state.active!.exposure
  assert.equal(d.skip().error?.code, 'no-skips-left')
  assert.equal(d.state.active!.exposure, before) // the card stays active
  assert.equal(d.state.team, 2)
})

test('I5: the skips are per round', () => {
  const d = new Driver()
  d.start(); d.startRound(); d.skip(); d.skip()
  d.timeout()
  assert.equal(skipsLeft(d.state), 2)
  d.startRound()
  assert.equal(skipsLeft(d.state), 2)
})

test('I12: one Taboo penalty per card; a second click does nothing; the score never goes below 0 (I4)', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const exposure = d.state.active!.exposure
  d.taboo(exposure)
  assert.equal(d.state.team, 0) // -1 would be below zero
  // the same click again, on the card that was just penalised
  assert.equal(d.apply({ type: 'taboo', matchId: M, now: d.now, exposure }).error?.code, 'already-penalized')
  d.answer(); d.answer()
  assert.equal(d.state.team, 2)
  d.taboo()
  assert.equal(d.state.team, 1)
  assert.equal(streakOf(d.state), 0)
})

test('a command with an old version is refused with a typed error and does nothing', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const version = d.state.version
  d.answer()
  const t = d.apply({ type: 'skip', matchId: M, now: d.now, exposure: d.state.active!.exposure, expectedVersion: version })
  assert.equal(t.error?.code, 'stale-version')
  assert.equal(skipsLeft(d.state), 2)
})

test('I11: inputs of another match or another round are ignored', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const exposure = d.state.active!.exposure
  assert.equal(d.apply({ type: 'answer', matchId: 'old-match', now: d.now, exposure, winner: 'tiktok:a' }).ignored, 'stale')
  assert.equal(d.apply({ type: 'timeout', matchId: M, round: 2, now: d.state.deadline }).ignored, 'stale')
  assert.equal(d.apply({ type: 'timeout', matchId: M, round: 1, now: d.now + 1 }).ignored, 'early') // the timer fired early: not yet
  assert.equal(d.state.phase, 'round')
})

test('rounds 3 and 4 need the voted category and the narrative; the intervals ask for them', () => {
  const d = new Driver()
  d.start()
  d.playRound() // round 1
  d.playRound() // round 2: the interval of round 3 asks for the category
  assert.equal(d.state.round, 3)
  assert.ok(d.log.some((e) => e.type === 'choose-category'))
  assert.equal(d.startRound().error?.code, 'bad-input')
  category(d)
  d.playRound()
  assert.equal(d.state.round, 4)
  assert.ok(d.log.some((e) => e.type === 'choose-narrative'))
  assert.equal(d.startRound().error?.code, 'bad-input')
  assert.equal(d.apply({ type: 'set-narrative', matchId: M, narrative: 'pirata' as never }).error?.code, 'bad-input')
  narrative(d)
  d.playRound()
  assert.equal(d.state.round, 5)
  // the category can only be set in the interval of round 3
  assert.equal(d.apply({ type: 'set-category', matchId: M, category: 'B' }).error?.code, 'wrong-phase')
})

test('the drawn card of round 3 is asked with the voted category', () => {
  const d = new Driver()
  d.start(); d.playRound(); d.playRound(); category(d)
  d.startRound()
  const asked = d.log.filter((e): e is Extract<Effect, { type: 'draw-card' }> => e.type === 'draw-card').at(-1)!
  assert.equal(asked.category, 'C')
})

test('I6: Jackpot only on the first card of round 5, once; the base points are doubled', () => {
  const d = new Driver()
  d.start(); d.playRound(); d.playRound(); category(d); d.playRound(); narrative(d); d.playRound()
  assert.equal(d.state.round, 5)
  d.difficulty = 3
  d.startRound()
  assert.equal(d.state.active!.jackpot, true)
  assert.equal(d.state.jackpotUsed, true)
  const before = d.state.team
  d.answer()
  assert.equal(d.state.team - before, 6) // 3 x 2
  assert.equal(d.state.active!.jackpot, false) // only the first card
  assert.equal(d.closed('close-card').at(-1)!.closed.doubled, true)
})

test('I6: the sung card, only in the last 20 s, once per match, never on the Jackpot card', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const exposure = d.state.active!.exposure
  const sing = (now: number) => d.apply({ type: 'sing', matchId: M, now, exposure: d.state.active!.exposure })
  assert.equal(sing(d.now + 1000).error?.code, 'wrong-phase') // too early
  assert.equal(sing(d.state.deadline).error?.code, 'wrong-phase') // at the deadline
  const edge = d.state.deadline - TABOO_RULES.sungWindowMs
  assert.equal(sing(edge - 1).error?.code, 'wrong-phase')
  assert.equal(sing(edge).error, undefined)
  assert.equal(d.state.active!.sung, true)
  assert.equal(sing(edge + 1).error?.code, 'bad-input') // not twice
  d.now = edge + 5000
  d.step({ type: 'answer', matchId: M, now: d.now, exposure, winner: 'tiktok:a' })
  assert.equal(d.closed('close-card').at(-1)!.closed.doubled, true)
  assert.equal(d.state.team, 2) // an easy card (1) doubled
  // once per match: a new card in the same match cannot be sung
  assert.equal(sing(d.state.deadline - 1000).error?.code, 'bad-input')
})

test('the sung card cannot be on the Jackpot card', () => {
  const d = new Driver()
  d.start(); d.playRound(); d.playRound(); category(d); d.playRound(); narrative(d); d.playRound()
  d.startRound()
  assert.equal(d.state.active!.jackpot, true)
  assert.equal(d.apply({ type: 'sing', matchId: M, now: d.state.deadline - 1000, exposure: d.state.active!.exposure }).error?.code, 'bad-input')
})

test('the timeout closes the open card with 0 points and moves to the next interval; after round 5 the match ends', () => {
  const d = new Driver()
  d.start(); d.startRound()
  d.answer()
  const t = d.timeout()
  assert.equal(d.state.phase, 'intermission')
  assert.equal(d.state.round, 2)
  assert.equal(d.closed('close-card').at(-1)!.closed.outcome, 'round_timeout')
  assert.ok(t.effects.some((e) => e.type === 'round-end'))
  assert.equal(d.state.team, 1)
  assert.equal(d.state.active, null)
  assert.equal(d.state.awaiting, null)
  d.playRound(); category(d); d.playRound(); narrative(d); d.playRound(); const last = d.playRound()
  assert.equal(d.state.phase, 'finished')
  assert.ok(last.effects.some((e) => e.type === 'match-end'))
  assert.equal(d.state.outcome, 'lost') // 1 point out of 25
})

test('D10: the threshold is recorded when reached and the match goes on to round 5, even if the score then falls', () => {
  const d = new Driver()
  d.start({ ...DEFAULT_CONFIG, threshold: 5 })
  d.difficulty = 3
  d.startRound(); d.answer(); d.answer()
  assert.deepEqual(d.state.reachedThreshold, { round: 1 })
  assert.ok(d.closed('close-card').some((c) => c.reachedNow))
  d.timeout()
  assert.equal(d.state.phase, 'intermission') // it does not end
  d.startRound()
  d.taboo(); d.taboo(); d.taboo(); d.taboo()
  d.timeout(); category(d); d.playRound(); narrative(d); d.playRound(); d.playRound()
  assert.equal(d.state.phase, 'finished')
  assert.equal(d.state.outcome, 'won') // the win was recorded when the threshold was reached
})

test('suspend and resume: the time left is frozen, the exposure is marked as interrupted, the timer is set again', () => {
  const d = new Driver()
  d.start(); d.startRound()
  const exposure = d.state.active!.exposure
  d.now += 30_000
  const s = d.apply({ type: 'suspend', matchId: M, now: d.now })
  assert.equal(d.state.phase, 'suspended')
  assert.equal(d.state.remainingMs, 60_000)
  assert.ok(s.effects.some((e) => e.type === 'clear-timer'))
  assert.equal(d.state.active!.interrupted, true)
  // nothing is accepted while suspended
  assert.equal(d.apply({ type: 'answer', matchId: M, now: d.now, exposure, winner: 'tiktok:a' }).ignored, 'stale')
  d.now += 600_000 // ten minutes of pause
  const r = d.apply({ type: 'resume', matchId: M, now: d.now })
  assert.equal(d.state.phase, 'round')
  assert.equal(d.state.deadline, d.now + 60_000)
  assert.deepEqual(r.effects.filter((e) => e.type === 'set-timer'), [{ type: 'set-timer', round: 1, ms: 60_000 }])
  d.answer()
  assert.equal(d.closed('close-card').at(-1)!.closed.interrupted, true)
  assert.equal(d.apply({ type: 'resume', matchId: M, now: d.now }).error?.code, 'wrong-phase')
})

test('suspend while a card is being drawn: the draw is asked again on resume', () => {
  const d = new Driver()
  d.start()
  d.apply({ type: 'start-round', matchId: M, now: d.now }) // no card-drawn: the draw is pending
  assert.ok(d.state.awaiting)
  d.apply({ type: 'suspend', matchId: M, now: d.now })
  const r = d.apply({ type: 'resume', matchId: M, now: d.now })
  assert.ok(r.effects.some((e) => e.type === 'draw-card'))
})

test('rectification after the round: the win is revoked, the score is computed again, only corrections are emitted', () => {
  const d = new Driver()
  d.start(); d.startRound()
  d.answer(); d.answer(); d.answer() // 1 + 1 + 1 + 1 (bonus) = 4
  assert.equal(d.state.team, 4)
  d.timeout()
  const t = d.apply({ type: 'rectify', matchId: M, round: 1, index: 1 })
  assert.equal(t.error, undefined)
  assert.equal(d.state.team, 1 - 1 + 1) // 1, taboo (-1), 1: no streak bonus
  const correction = t.effects.find((e) => e.type === 'correction')
  assert.ok(correction && correction.type === 'correction')
  assert.equal(correction.team, 1)
  assert.equal(d.state.rounds[0].cards[1].outcome, 'taboo')
  assert.equal(d.apply({ type: 'rectify', matchId: M, round: 1, index: 1 }).error?.code, 'bad-input') // already a Taboo card
  d.startRound()
  assert.equal(d.apply({ type: 'rectify', matchId: M, round: 1, index: 0 }).error?.code, 'wrong-phase') // not during a round
})

test('cancel and dismiss', () => {
  const d = new Driver()
  assert.equal(d.apply({ type: 'cancel', matchId: M }).ignored, 'stale') // no match yet: an input for a match that is not there
  d.start(); d.startRound()
  const t = d.apply({ type: 'cancel', matchId: M })
  assert.equal(d.state.phase, 'cancelled')
  assert.ok(t.effects.some((e) => e.type === 'clear-timer'))
  assert.equal(d.apply({ type: 'dismiss', matchId: M }).error, undefined)
  assert.equal(d.state.phase, 'setup')
  assert.equal(d.start().error, undefined) // a new match can start
})

test('the version grows with every accepted transition and never with an ignored one', () => {
  const d = new Driver()
  const v0 = d.state.version
  d.start()
  assert.equal(d.state.version, v0 + 1)
  const v = d.state.version
  d.apply({ type: 'answer', matchId: M, now: d.now, exposure: 99, winner: 'x' })
  assert.equal(d.state.version, v)
})
