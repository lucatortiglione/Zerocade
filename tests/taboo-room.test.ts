import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABOO_RULES } from '../packages/shared/src/taboo.ts'
import { setup, viewer, seeded, type Harness } from './helpers/tabooHarness.ts'

const begin = (h: Harness, extra: Record<string, unknown> = {}) => {
  assert.deepEqual(h.startMatch(extra), { ok: true })
  assert.deepEqual(h.startRound(), { ok: true })
}
const solve = (h: Harness, who = 'a', id = '') => { h.say(viewer(who), h.target(), id); h.clock.advance(TABOO_RULES.guessCooldownMs + 1) }

test('a real match needs the bridge; a practice match does not; an old version is refused', () => {
  const h = setup({ bridge: false })
  assert.equal((h.startMatch() as { error: string }).error, 'bridge-missing')
  assert.equal((h.room.control({ type: 'start-match', expectedVersion: 99 }) as { error: string }).error, 'stale-version')
  assert.deepEqual(h.startMatch({ mode: 'practice' }), { ok: true })
  assert.equal(h.state().mode, 'practice')
  assert.equal(h.state().phase, 'intermission')
})

test('the match: the target wins, the next card comes at once, the score and the standings follow, skips are limited (criteria 3, 5)', () => {
  const h = setup()
  begin(h)
  const first = h.state().difficulty!
  assert.equal(h.state().forbidden.length, 5) // D26: the five Taboo words of the open card are shown
  h.say(viewer('anna'), h.target())
  assert.equal(h.state().team, first)
  assert.equal(h.state().lastWinner?.user?.nickname, 'anna')
  assert.equal(h.state().leaders[0].nickname, 'anna')
  assert.equal(h.state().revealed?.outcome, 'solved') // the answer is shown only after the closure
  assert.deepEqual(h.cmd({ type: 'skip', exposure: h.exposure() }), { ok: true })
  assert.deepEqual(h.cmd({ type: 'skip', exposure: h.exposure() }), { ok: true })
  assert.equal((h.cmd({ type: 'skip', exposure: h.exposure() }) as { error: string }).error, 'no-skips-left')
  assert.equal(h.state().skipsLeft, 0)
  assert.equal(h.state().streak, 0)
})

test('the round lasts 90 s on the clock; at the deadline the open card closes with 0 points and the interval begins', () => {
  const h = setup()
  begin(h)
  const before = h.state().team
  h.clock.advance(TABOO_RULES.roundMs - 1)
  assert.equal(h.state().phase, 'round')
  h.clock.advance(1)
  assert.equal(h.state().phase, 'intermission')
  assert.equal(h.state().round, 2)
  assert.equal(h.state().team, before)
  assert.equal(h.state().roundSummary?.timeout, 1)
  assert.equal(h.clock.pending, 0) // no timer left running between rounds
})

test('I7: an answer at the deadline is late even if the timer has not fired', () => {
  const h = setup()
  begin(h)
  h.clock.now += TABOO_RULES.roundMs // the clock passes the deadline but the timer callback has not been run
  h.say(viewer('late'), h.target())
  assert.equal(h.state().team, 0)
  assert.equal(h.room.admin().metrics.ignored.late, 1)
})

test('the next round starts on the button, after the interval of 20 s (D9); the first one starts at once', () => {
  const h = setup()
  begin(h)
  h.clock.advance(TABOO_RULES.roundMs)
  const early = h.startRound() as { ok: false; message: string }
  assert.equal(early.ok, false)
  assert.match(early.message, /Intervallo in corso/)
  h.clock.advance(TABOO_RULES.intermissionDefaultMs - 1)
  assert.equal(h.startRound().ok, false)
  h.clock.advance(1)
  assert.deepEqual(h.startRound(), { ok: true })
  assert.equal(h.state().round, 2)
})

test('D2: of two correct answers, the first message that arrived wins; the second finds the card closed', () => {
  const h = setup()
  begin(h)
  const exposure = h.exposure()
  const target = h.target()
  h.say(viewer('first'), target, 'm1')
  h.say(viewer('second'), target, 'm2')
  assert.equal(h.state().lastWinner?.user?.nickname, 'first')
  assert.deepEqual(h.state().leaders.map((l) => l.nickname), ['first'])
  assert.notEqual(h.room.admin().card?.exposure, exposure) // the next card is open
})

test('D6: a correct answer from the other platform closes the card for the team, with no individual winner', () => {
  const h = setup()
  begin(h)
  const points = h.state().difficulty!
  h.say(viewer('tw', 'twitch'), h.target(), 'w1', 'twitch')
  assert.equal(h.state().team, points)
  assert.equal(h.state().lastWinner?.user, null)
  assert.deepEqual(h.state().leaders, [])
})

test('D5: every comment on an active card is an attempt; one within 2 s does not count and does not move the window', () => {
  const h = setup()
  begin(h)
  const anna = viewer('anna')
  h.say(anna, 'una risposta sbagliata')
  h.clock.advance(1_000)
  h.say(anna, h.target()) // 1 s later: too soon
  assert.equal(h.state().team, 0)
  h.clock.advance(1_000) // 2 s after the first attempt: the window of the first, not the second
  h.say(anna, h.target())
  assert.equal(h.state().team > 0, true)
  assert.equal(h.room.admin().metrics.ignored.cooldown, 1)
})

test('the streamer, "Chi può giocare", duplicates, anonymous users and the other kinds of source are refused', () => {
  const h = setup({ settings: { audience: 'followers' } })
  begin(h)
  const target = h.target()
  h.say(viewer('host', 'tiktok', { host: true }), target)
  h.say(viewer('stranger'), target) // not a follower
  h.say({ id: 'tiktok:anonymous', nickname: 'x' }, target)
  h.say(viewer('sim'), target, '', 'tiktok', 'simulator') // a real match takes the bridge only (D7)
  assert.equal(h.state().team, 0)
  const ignored = h.room.admin().metrics.ignored
  assert.equal(ignored.host, 1)
  assert.equal(ignored.audience, 1)
  assert.equal(ignored.source, 1)
  h.say(viewer('fan', 'tiktok', { follower: true }), target, 'same')
  assert.ok(h.state().team > 0)
})

test('the same message id twice is one message; a message without an id is still taken', () => {
  const h = setup()
  begin(h)
  const anna = viewer('anna')
  h.say(anna, 'sbagliata', 'dup')
  h.clock.advance(3000)
  h.say(anna, 'sbagliata', 'dup')
  assert.equal(h.room.admin().metrics.ignored.duplicate, 1)
  h.say(anna, h.target(), '') // no id: no dedup
  assert.ok(h.state().team > 0)
})

test('D4: a list of hypotheses is ignored, one answer with accessory text is not', () => {
  const h = setup()
  begin(h)
  const target = h.target()
  h.say(viewer('list'), `${target}, altra, ancora`)
  assert.equal(h.state().team, 0)
  assert.equal(h.room.admin().metrics.ignored.multiple, 1)
  h.say(viewer('chatty'), `secondo me è ${target}!`)
  assert.ok(h.state().team > 0)
})

test('Taboo from the director: -1 and the streak reset; a second click on the same card applies nothing (I12)', () => {
  const h = setup()
  begin(h)
  solve(h)
  solve(h)
  const team = h.state().team
  const exposure = h.exposure()
  assert.deepEqual(h.cmd({ type: 'taboo', exposure }), { ok: true })
  assert.equal(h.state().team, team - 1)
  assert.equal(h.state().streak, 0)
  assert.equal((h.cmd({ type: 'taboo', exposure }) as { error: string }).error, 'already-penalized')
  assert.equal(h.state().team, team - 1)
})

test('the bridge lost in a round: the timer freezes, the exposure is interrupted, nothing is accepted; resume needs the bridge (D15, D24)', () => {
  const h = setup()
  begin(h)
  h.clock.advance(30_000)
  h.setBridge(false)
  h.room.bridgeChanged()
  assert.equal(h.state().phase, 'suspended')
  assert.equal(h.state().remainingMs, 60_000)
  assert.equal(h.state().interrupted, true)
  assert.equal(h.clock.pending, 0)
  h.clock.advance(10 * 60_000) // ten minutes pass
  h.say(viewer('a'), h.target())
  assert.equal(h.state().team, 0)
  assert.equal((h.cmd({ type: 'resume' }) as { error: string }).error, 'bridge-missing')
  h.setBridge(true)
  assert.deepEqual(h.cmd({ type: 'resume' }), { ok: true })
  assert.equal(h.state().phase, 'round')
  assert.equal(h.state().remainingMs, 60_000)
  h.say(viewer('a'), h.target())
  assert.ok(h.state().team > 0)
  const row = h.db.prepare('SELECT interrupted FROM taboo_exposures WHERE outcome IS NOT NULL ORDER BY n').pluck().get()
  assert.equal(row, 1) // saved as interrupted: out of the calibration
})

test('the pause button is a technical suspension too; pause and resume are idempotent', () => {
  const h = setup()
  begin(h)
  h.room.pause(true)
  assert.equal(h.state().phase, 'suspended')
  h.room.pause(true)
  assert.equal(h.state().phase, 'suspended')
  h.room.pause(false)
  assert.equal(h.state().phase, 'round')
})

test('round 3: the chat votes with a letter A-F in the interval; the most voted category is drawn (D11)', () => {
  const h = setup()
  begin(h)
  h.endRound(); h.startRound(); h.endRound() // rounds 1 and 2 done: the interval of round 3
  assert.equal(h.state().round, 3)
  h.say(viewer('a'), 'c'); h.say(viewer('b'), 'C'); h.say(viewer('c'), 'D'); h.say(viewer('d'), 'ciao'); h.say(viewer('e'), 'AB')
  h.say(viewer('c'), 'C') // a vote can be changed: the last one counts
  assert.deepEqual(h.startRound(), { ok: true })
  assert.equal(h.state().category, 'C')
  assert.equal(h.room.admin().card!.category, 'C')
})

test('round 3: no vote or a tie is decided by chance, and the audience is told', () => {
  const h = setup({ random: seeded(3) })
  begin(h)
  h.endRound(); h.startRound(); h.endRound()
  h.startRound()
  assert.match(h.state().notice ?? '', /sorte/)
  assert.ok(['A', 'B', 'C', 'D', 'E', 'F'].includes(h.state().category!))
})

test('round 4: the bot picks the narrative constraint at random before the round (D12)', () => {
  const h = setup()
  begin(h)
  h.endRound(); h.startRound(); h.endRound(); h.startRound(); h.endRound()
  assert.equal(h.state().round, 4)
  assert.ok(['telecronista', 'thriller', 'venditore disperato'].includes(h.state().narrative!))
  assert.deepEqual(h.startRound(), { ok: true })
})

test('a whole match: five rounds, the threshold recorded, the data saved and the score reproducible from the events (criterion 3)', () => {
  const h = setup()
  begin(h, { threshold: 5 })
  for (let round = 1; round <= 5; round++) {
    if (round > 1) { h.clock.advance(TABOO_RULES.intermissionDefaultMs); assert.deepEqual(h.startRound(), { ok: true }) }
    for (let i = 0; i < 2; i++) solve(h, `p${i}`)
    h.clock.advance(TABOO_RULES.roundMs)
  }
  assert.equal(h.state().phase, 'finished')
  assert.equal(h.state().reachedThreshold, true)
  const team = h.state().team
  assert.equal(h.db.prepare('SELECT team FROM taboo_match_scores').pluck().get(), team) // the events add up to the live score
  assert.equal(h.db.prepare("SELECT s.name FROM taboo_matches m JOIN taboo_match_statuses s ON s.n = m.status").pluck().get(), 'finished')
  assert.equal(h.db.prepare('SELECT count(*) FROM taboo_rounds').pluck().get(), 5)
  assert.ok((h.db.prepare('SELECT count(*) FROM taboo_exposures WHERE outcome IS NOT NULL').pluck().get() as number) >= 10)
  assert.equal(h.db.prepare('SELECT count(*) FROM taboo_exposures WHERE outcome IS NULL').pluck().get(), 0) // every card closed
  assert.deepEqual(h.cmd({ type: 'dismiss' }), { ok: true })
  assert.equal(h.state().phase, 'setup')
})

test('a failed save freezes the match with a reason the director can read; nothing is shown as saved that was not', () => {
  const h = setup()
  begin(h)
  h.store.closeExposure = () => { throw new Error('disco pieno') }
  h.say(viewer('a'), h.target())
  assert.ok(h.issues.some((m) => /sospesa/.test(m)))
  return Promise.resolve().then(() => {
    assert.equal(h.state().phase, 'suspended')
    assert.match(h.state().notice ?? '', /salvataggio/)
  })
})

test('dispose: the timers are cancelled and a late callback does nothing', () => {
  const h = setup()
  begin(h)
  assert.ok(h.clock.pending > 0)
  h.room.dispose()
  assert.equal(h.clock.pending, 0)
  const before = h.publics.length
  h.clock.advance(10 * TABOO_RULES.roundMs)
  assert.equal(h.publics.length, before)
  assert.equal(h.db.prepare('SELECT s.name FROM taboo_matches m JOIN taboo_match_statuses s ON s.n = m.status').pluck().get(), 'cancelled')
  assert.equal((h.room.control({ type: 'cancel', expectedVersion: 0 }) as { error: string }).error, 'unavailable')
})

test('practice mode: only the simulator plays, and the match is outside the comparable sample', () => {
  const h = setup({ bridge: false })
  h.startMatch({ mode: 'practice' })
  h.startRound()
  h.say(viewer('b'), h.target(), 'x', 'tiktok', 'bridge') // a bridge message in practice: refused
  assert.equal(h.state().team, 0)
  h.say(viewer('sim'), h.target(), '', 'tiktok', 'simulator')
  assert.ok(h.state().team > 0)
  assert.equal(h.db.prepare('SELECT count(*) FROM taboo_comparable_exposures').pluck().get(), 0)
})

test('the state is emitted at most every 200 ms for the chat, at once for a change of card or phase', () => {
  const h = setup()
  begin(h)
  const before = h.publics.length
  for (let i = 0; i < 50; i++) h.say(viewer(`u${i}`), 'sbagliata')
  assert.ok(h.publics.length - before <= 1)
})

test('contested card: a report in the interval, a verifiable violation revokes the win and corrects the score; an unverifiable one does not', () => {
  const h = setup()
  begin(h)
  solve(h, 'anna'); solve(h, 'bruno'); solve(h, 'carla')
  const exposures = h.room.admin().state.leaders.length // three winners
  assert.equal(exposures, 3)
  const second = (h.db.prepare('SELECT seq FROM taboo_exposures ORDER BY n LIMIT 1 OFFSET 1').pluck().get() as number)
  h.clock.advance(TABOO_RULES.roundMs)
  const team = h.state().team
  assert.deepEqual(h.cmd({ type: 'report', exposure: second, reason: 'Parola vietata detta prima della risposta', violationAfterMs: 4000 }), { ok: true })
  const report = h.room.admin().reports[0]
  assert.equal(report.reason.startsWith('Parola vietata'), true)
  assert.equal((h.cmd({ type: 'decide', report: 999, verifiable: true, reason: 'x' }) as { error: string }).error, 'bad-input')
  assert.deepEqual(h.cmd({ type: 'decide', report: report.id, verifiable: true, reason: 'Violazione prima della risposta' }), { ok: true })
  assert.ok(h.state().team < team)
  assert.match(h.state().correction ?? '', /Rettifica/)
  assert.deepEqual(h.state().leaders.map((l) => l.nickname).sort(), ['anna', 'carla'])
  assert.equal(h.db.prepare("SELECT team FROM taboo_match_scores").pluck().get(), h.state().team)
  assert.equal(h.room.admin().reports.length, 0)
})

test('a report during a round cannot be decided until the interval; an unverifiable one leaves the score alone', () => {
  const h = setup()
  begin(h)
  solve(h, 'anna')
  const seq = h.db.prepare('SELECT seq FROM taboo_exposures ORDER BY n LIMIT 1').pluck().get() as number
  h.cmd({ type: 'report', exposure: seq, reason: 'forse' })
  const id = h.room.admin().reports[0].id
  assert.equal((h.cmd({ type: 'decide', report: id, verifiable: true, reason: 'x' }) as { error: string }).error, 'wrong-phase')
  h.clock.advance(TABOO_RULES.roundMs)
  const team = h.state().team
  assert.deepEqual(h.cmd({ type: 'decide', report: id, verifiable: false, reason: 'non verificabile' }), { ok: true })
  assert.equal(h.state().team, team)
  assert.match(h.state().correction ?? '', /non verificabile/)
})

test('the director listens: ZeroFollowerBot\'s voice is told to skip comments only while a card is open (D22)', () => {
  const h = setup()
  assert.equal(h.room.listening(), false)
  begin(h)
  assert.equal(h.room.listening(), true)
  h.clock.advance(TABOO_RULES.roundMs)
  assert.equal(h.room.listening(), false)
})
