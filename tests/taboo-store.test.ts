import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { TabooStore, type CloseInput } from '../apps/server/src/taboo-db.ts'
import { correctionDeltas, rectifyToTaboo, scoreRound, type CardResult } from '../apps/server/src/taboo-scoring.ts'

const NOW = Date.now()
const fresh = () => {
  const db = new Database(':memory:')
  return { db, store: new TabooStore(db) }
}
const newMatch = (store: TabooStore, over: Partial<Parameters<TabooStore['startMatch']>[0]> = {}) =>
  store.startMatch({ id: `m-${Math.random()}`, roomKey: 'room', mode: 'standard', platform: 'tiktok', threshold: 25, rulesVersion: 'taboo-3.0', deckVersion: 'v3.0', at: NOW, ...over })
const exposure = (store: TabooStore, round: number, seq: number, over: Partial<Parameters<TabooStore['openExposure']>[0]> = {}) =>
  store.openExposure({ round, seq, cardCode: `A0${seq}`, cardRevision: 1, difficulty: 1, startMs: NOW, availableMs: 80_000, jackpot: false, ...over })
const close = (over: Partial<CloseInput> = {}): CloseInput => ({
  outcome: 'solved', endMs: NOW + 5000, solveMs: 5000, sung: false, interrupted: false, activeGuessers: 3, guessCount: 7,
  winner: { platform: 'tiktok', userId: 'tiktok:1', receivedMs: 5000, messageKey: 'tiktok:m1', alias: null }, events: [{ index: 0, kind: 'base', delta: 1 }],
  match: 1, at: NOW, ...over,
})

test('the schema is idempotent, also when two connections open the same file (the worker imports db.ts too)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taboo-'))
  const file = join(dir, 'z.db')
  const a = new Database(file)
  const b = new Database(file)
  try {
    new TabooStore(a)
    new TabooStore(b)
    new TabooStore(a)
    assert.equal(a.prepare('SELECT count(*) FROM taboo_outcomes').pluck().get(), 4)
    assert.equal(a.prepare('SELECT count(*) FROM taboo_modes').pluck().get(), 2)
    assert.equal(a.prepare('SELECT count(*) FROM taboo_score_kinds').pluck().get(), 4)
    assert.equal(a.pragma('foreign_keys', { simple: true }), 1)
  } finally {
    a.close(); b.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a closed card has one outcome, one winner and its events, in one transaction; a second closure is refused (I2, I3)', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const r = store.startRound(m, 1, null, null, NOW)
  const e = exposure(store, r, 1)
  store.closeExposure(e, close({ match: m }))
  assert.equal(db.prepare('SELECT count(*) FROM taboo_winners').pluck().get(), 1)
  assert.equal(store.matchScore(m), 1)
  assert.throws(() => store.closeExposure(e, close({ match: m, winner: { platform: 'tiktok', userId: 'tiktok:2', receivedMs: 6000, messageKey: null, alias: null } })), /già chiusa/)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_winners').pluck().get(), 1)
  assert.equal(store.matchScore(m), 1)
  // the database itself refuses a second winner of the same exposure
  assert.throws(() => db.prepare('INSERT INTO taboo_winners (exposure, player, received_ms) VALUES (?, 1, 1)').run(e), /UNIQUE|PRIMARY/)
})

test('the real clock gives fractional milliseconds: the store rounds them (the strict integer columns refuse a REAL)', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1, { availableMs: 89_999.532, startMs: NOW + 0.4 })
  store.closeExposure(e, close({ match: m, endMs: NOW + 1234.5678, solveMs: 1234.5678, winner: { platform: 'tiktok', userId: 'tiktok:1', receivedMs: 1234.5678, messageKey: null, alias: null } }))
  assert.equal(db.prepare('SELECT available_ms FROM taboo_exposures').pluck().get(), 90_000)
  assert.equal(db.prepare('SELECT solve_ms FROM taboo_exposures').pluck().get(), 1235)
  assert.equal(db.prepare('SELECT received_ms FROM taboo_winners').pluck().get(), 1235)
})

test('a failure in the middle of a closure leaves nothing behind: the card stays open, no winner, no event', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1)
  assert.throws(() => store.closeExposure(e, close({ match: m, events: [{ index: 0, kind: 'bogus' as never, delta: 1 }] })))
  assert.equal(db.prepare('SELECT outcome FROM taboo_exposures WHERE n = ?').pluck().get(e), null)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_winners').pluck().get(), 0)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_score_events').pluck().get(), 0)
  store.closeExposure(e, close({ match: m })) // and it can still be closed properly
})

test('the pseudonym is stable for a user, different for another, and the nickname is never stored', () => {
  const { db, store } = fresh()
  assert.equal(store.pseudonym('tiktok:1'), store.pseudonym('tiktok:1'))
  assert.notEqual(store.pseudonym('tiktok:1'), store.pseudonym('twitch:1'))
  assert.match(store.pseudonym('tiktok:1'), /^[0-9a-f]{32}$/)
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1)
  store.closeExposure(e, close({ match: m }))
  const player = db.prepare('SELECT * FROM taboo_players').get() as Record<string, unknown>
  assert.deepEqual(Object.keys(player).sort(), ['n', 'platform', 'ref'])
  assert.equal(player.ref, store.pseudonym('tiktok:1'))
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM taboo_winners').all()).includes('tiktok:1'))
  // the key lives in the same database: a second store on it gives the same pseudonyms
  assert.equal(new TabooStore(db).pseudonym('tiktok:1'), store.pseudonym('tiktok:1'))
  assert.notEqual(fresh().store.pseudonym('tiktok:1'), store.pseudonym('tiktok:1')) // another database, another key
})

test('score events are append-only: no update, and no delete of a recent match', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1)
  store.closeExposure(e, close({ match: m }))
  assert.throws(() => db.prepare('UPDATE taboo_score_events SET delta = 99').run(), /append-only/)
  assert.throws(() => db.prepare('DELETE FROM taboo_score_events').run(), /append-only/)
  store.setMatchStatus(m, 'finished', NOW)
  assert.throws(() => db.prepare('DELETE FROM taboo_score_events').run(), /append-only/) // still inside the retention
})

test('the effective views: a rectified win is not a win, and its outcome is a Taboo one (§3.5), without rewriting the past', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const r = store.startRound(m, 1, null, null, NOW)
  const results: CardResult[] = [
    { kind: 'solved', difficulty: 1, doubled: false }, { kind: 'solved', difficulty: 2, doubled: false }, { kind: 'solved', difficulty: 3, doubled: false },
  ]
  const exposures: number[] = []
  const score = scoreRound(0, results)
  results.forEach((res, i) => {
    const e = exposure(store, r, i + 1, { difficulty: i + 1 })
    exposures.push(e)
    store.closeExposure(e, close({ match: m, events: score.events.filter((x) => x.index === i), winner: { platform: 'tiktok', userId: `tiktok:${i}`, receivedMs: 1, messageKey: null, alias: null } }))
  })
  assert.equal(store.matchScore(m), 7)
  const events = db.prepare('SELECT count(*) FROM taboo_score_events').pluck().get() as number
  // the contested card is the second one: the violation came before the winning answer
  const report = store.report({ match: m, exposure: exposures[1], kind: 'violation', reportedAt: NOW, violationAt: NOW - 1000, actor: 'dashboard', reason: 'Parola vietata detta prima' })
  assert.deepEqual(store.pendingReports(m).map((p) => p.id), [report])
  const after = rectifyToTaboo(results, 1)
  const deltas = correctionDeltas(0, results, after).map((d) => ({ exposure: exposures[d.index], delta: d.delta }))
  store.applyCorrection(report, m, deltas, NOW)
  // the team's score is the reducer's, computed again: the events add up
  assert.equal(store.matchScore(m), scoreRound(0, after).team)
  // the past is not rewritten: the old events are still there, the corrections were added
  assert.ok((db.prepare('SELECT count(*) FROM taboo_score_events').pluck().get() as number) > events)
  assert.equal(db.prepare("SELECT count(*) FROM taboo_score_events WHERE kind = (SELECT n FROM taboo_score_kinds WHERE name = 'correction') AND corrects IS NOT NULL").pluck().get(), deltas.length)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_winners').pluck().get(), 3) // the winner rows stay
  assert.equal(db.prepare('SELECT count(*) FROM taboo_effective_winners').pluck().get(), 2) // the effective ones do not
  const outcomes = db.prepare('SELECT outcome FROM taboo_exposure_report ORDER BY exposure').pluck().all()
  assert.deepEqual(outcomes, ['solved', 'taboo', 'solved'])
  assert.equal(db.prepare('SELECT outcome FROM taboo_exposures WHERE n = ?').pluck().get(exposures[1]), 1) // the stored outcome is untouched
  assert.deepEqual(store.pendingReports(m), [])
  assert.throws(() => store.applyCorrection(report, m, deltas, NOW), /già decisa/) // a decision is taken once
})

test('at most 50 reports wait per match; a reason is cut at 300 characters', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  for (let i = 0; i < 50; i++) store.report({ match: m, exposure: null, kind: 'technical', reportedAt: NOW, violationAt: null, actor: 'dashboard', reason: 'x'.repeat(400) })
  assert.throws(() => store.report({ match: m, exposure: null, kind: 'technical', reportedAt: NOW, violationAt: null, actor: 'dashboard', reason: 'y' }), RangeError)
  assert.equal(db.prepare('SELECT max(length(reason)) FROM taboo_moderation').pluck().get(), 300)
  store.rejectReport(1)
  store.report({ match: m, exposure: null, kind: 'technical', reportedAt: NOW, violationAt: null, actor: 'dashboard', reason: 'ok' }) // one less waiting
})

test('wrong answers are kept aggregated, without the user, cut at 40 characters and at 200 texts per exposure', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1)
  const counts = new Map<string, number>([['banana', 3], ['x'.repeat(80), 1]])
  for (let i = 0; i < 300; i++) counts.set(`parola${i}`, 1)
  store.addWrongAnswers(e, counts)
  store.addWrongAnswers(e, new Map([['banana', 2]]))
  assert.equal(db.prepare('SELECT count(*) FROM taboo_wrong_answers').pluck().get(), 200)
  assert.equal(db.prepare("SELECT count FROM taboo_wrong_answers WHERE text = 'banana'").pluck().get(), 5) // known texts keep counting at the cap
  assert.ok((db.prepare("SELECT count FROM taboo_wrong_answers WHERE text = '(altro)'").pluck().get() as number) > 100) // the rest is counted together
  assert.equal(db.prepare('SELECT max(length(text)) FROM taboo_wrong_answers').pluck().get(), 40)
  assert.ok(!db.prepare('SELECT name FROM pragma_table_info(?)').pluck().all('taboo_wrong_answers').includes('user'))
})

test('the comparable sample (§9.1): no practice mode, at least 20 s, no Taboo error, no technical interruption', () => {
  const { db, store } = fresh()
  const play = (mode: 'standard' | 'practice', over: { available?: number; outcome?: 'solved' | 'taboo'; interrupted?: boolean }) => {
    const m = newMatch(store, { mode })
    const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1, { availableMs: over.available ?? 80_000 })
    store.closeExposure(e, close({ match: m, outcome: over.outcome ?? 'solved', interrupted: over.interrupted ?? false, winner: over.outcome === 'taboo' ? null : close().winner, events: [] }))
  }
  play('standard', {})
  play('practice', {})
  play('standard', { available: 19_999 })
  play('standard', { outcome: 'taboo' })
  play('standard', { interrupted: true })
  assert.equal(db.prepare('SELECT count(*) FROM taboo_exposure_report').pluck().get(), 5)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_comparable_exposures').pluck().get(), 1)
})

test('the report has the names of ZEROTABOO §3.7 and §9.1', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 2, 'C', null, NOW), 1)
  store.closeExposure(e, close({ match: m }))
  const names = db.prepare('SELECT name FROM pragma_table_info(?)').pluck().all('taboo_exposure_report') as string[]
  for (const n of ['card_id', 'card_revision', 'session_id', 'mode', 'difficulty_at_play', 'round_number', 'start_time', 'end_time', 'seconds_available_when_started', 'outcome',
    'solve_time_s', 'active_guessers', 'guess_count', 'winner_id', 'hint_mode', 'taboo_word_id']) assert.ok(names.includes(n), n)
})

test('the room\'s last two standard matches give the cards to leave out (§5); other rooms and practice do not', () => {
  const { store } = fresh()
  const play = (roomKey: string, code: string, at: number, mode: 'standard' | 'practice' = 'standard', status: 'finished' | 'cancelled' | 'active' = 'finished') => {
    const m = newMatch(store, { roomKey, mode, at })
    const e = exposure(store, store.startRound(m, 1, null, null, at), 1, { cardCode: code })
    store.closeExposure(e, close({ match: m, events: [] }))
    if (status !== 'active') store.setMatchStatus(m, status, at + 1)
  }
  play('room', 'A01', 1)
  play('room', 'A02', 2)
  play('room', 'A03', 3)
  play('other', 'B01', 4)
  play('room', 'C01', 5, 'practice')
  assert.deepEqual([...store.recentCards('room')].sort(), ['A02', 'A03'])
  assert.deepEqual([...store.recentCards('room', 1)], ['A03'])
  assert.deepEqual([...store.recentCards('nobody')], [])
})

test('retention: what is older than 90 days goes, what is recent stays, the open match is never touched (D16)', () => {
  const { db, store } = fresh()
  const DAY = 86_400_000
  const play = (userId: string, endedAt: number | null) => {
    const m = newMatch(store, { at: endedAt === null ? NOW : endedAt - 1000 })
    const e = exposure(store, store.startRound(m, 1, null, null, 1), 1)
    store.closeExposure(e, close({ match: m, winner: { platform: 'tiktok', userId, receivedMs: 1, messageKey: null, alias: null } }))
    if (endedAt !== null) store.setMatchStatus(m, 'finished', endedAt)
    return m
  }
  const old = play('tiktok:old', 5 * DAY)
  const recent = play('tiktok:recent', NOW - 10 * DAY)
  const open = play('tiktok:open', null)
  store.addWrongAnswers(1, new Map([['x', 1]]))
  assert.equal(store.purgeExpired(NOW), 1)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_matches WHERE n = ?').pluck().get(old), 0)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_matches WHERE n IN (?, ?)').pluck().get(recent, open), 2)
  assert.equal(store.matchScore(old), 0)
  assert.equal(store.matchScore(recent), 1)
  assert.equal(db.prepare('SELECT count(*) FROM taboo_wrong_answers').pluck().get(), 0)
  assert.deepEqual(db.prepare('SELECT ref FROM taboo_players ORDER BY ref').pluck().all(), [store.pseudonym('tiktok:open'), store.pseudonym('tiktok:recent')].sort())
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  assert.equal(store.purgeExpired(NOW), 0)
})

test('a match left open when the server stops is closed as cancelled at the next start', () => {
  const { db, store } = fresh()
  const a = newMatch(store)
  const b = newMatch(store)
  store.setMatchStatus(b, 'finished', NOW)
  assert.equal(store.abandonOpenMatches(NOW + 1), 1)
  assert.equal(db.prepare('SELECT s.name FROM taboo_matches m JOIN taboo_match_statuses s ON s.n = m.status WHERE m.n = ?').pluck().get(a), 'cancelled')
  assert.equal(db.prepare('SELECT s.name FROM taboo_matches m JOIN taboo_match_statuses s ON s.n = m.status WHERE m.n = ?').pluck().get(b), 'finished')
})

test('the constraints of the schema: Jackpot and sung never together, skips at most 2, threshold above 0', () => {
  const { db, store } = fresh()
  const m = newMatch(store)
  const r = store.startRound(m, 1, null, null, NOW)
  assert.throws(() => db.prepare('UPDATE taboo_rounds SET skips_used = 3 WHERE n = ?').run(r))
  assert.throws(() => db.prepare("INSERT INTO taboo_exposures (round, seq, card_code, card_revision, difficulty, start_ms, available_ms, jackpot, sung) VALUES (?, 9, 'A01', 1, 1, 1, 1, 1, 1)").run(r))
  assert.throws(() => newMatch(store, { threshold: 0 }))
  assert.throws(() => store.startRound(m, 6, null, null, NOW))
})

test('calibration (§9.2): the thresholds, the provisional label under 20 exposures or 4 sessions, Taboo outside the solve rate, alerts, bands', () => {
  const { db, store } = fresh()
  const sessions: number[] = []
  const session = (i: number) => (sessions[i] ??= newMatch(store))
  const rounds = new Map<number, number>()
  let seq = 0
  // one exposure of `code` in session `i`
  const play = (code: string, i: number, outcome: 'solved' | 'skipped' | 'taboo' | 'round_timeout', solveSeconds: number | null, guessers: number, over: Partial<CloseInput> = {}) => {
    const m = session(i)
    const r = rounds.get(m) ?? store.startRound(m, 1, null, null, NOW)
    rounds.set(m, r)
    const e = exposure(store, r, ++seq, { cardCode: code, availableMs: 80_000 })
    store.closeExposure(e, close({ match: m, outcome, solveMs: solveSeconds === null ? null : solveSeconds * 1000, activeGuessers: guessers, events: [],
      winner: outcome === 'solved' ? { platform: 'tiktok', userId: `tiktok:${seq}`, receivedMs: 1, messageKey: null, alias: null } : null, ...over }))
  }
  const row = (code: string, band = 'tutte') => store.calibrationTable().rows.find((r) => r[0] === code && r[2] === band)!
  // A01: 20 solved (median 10 s) + 4 skipped over 5 sessions: 20/24 = 0.833, median 10 -> easy
  for (let i = 0; i < 20; i++) play('A01', i % 5, 'solved', 10, 8)
  for (let i = 0; i < 4; i++) play('A01', i % 5, 'skipped', null, 8)
  assert.equal(row('A01')[12], 'facile')
  assert.equal(row('A01')[5], 0.833)
  // A02: 20 exposures, 8 solved: 8/20 = 0.4 -> hard
  for (let i = 0; i < 8; i++) play('A02', i % 5, 'solved', 20, 3)
  for (let i = 0; i < 12; i++) play('A02', i % 5, 'round_timeout', null, 3)
  assert.equal(row('A02')[12], 'difficile')
  // A03: solved 70 % but slow (median 40 s > 35): hard by the time
  for (let i = 0; i < 14; i++) play('A03', i % 5, 'solved', 40, 12)
  for (let i = 0; i < 6; i++) play('A03', i % 5, 'skipped', null, 12)
  assert.equal(row('A03')[12], 'difficile')
  // A04: in between -> medium
  for (let i = 0; i < 15; i++) play('A04', i % 5, 'solved', 25, 12)
  for (let i = 0; i < 5; i++) play('A04', i % 5, 'round_timeout', null, 12)
  assert.equal(row('A04')[12], 'media')
  // A05: under 20 exposures -> provisional; A06: 20 exposures but only 3 sessions -> provisional
  for (let i = 0; i < 19; i++) play('A05', i % 5, 'solved', 5, 4)
  assert.equal(row('A05')[12], 'provvisoria')
  for (let i = 0; i < 20; i++) play('A06', i % 3, 'solved', 5, 4)
  assert.equal(row('A06')[12], 'provvisoria')
  // A07: nobody solved it in 20 exposures -> hard (provisional), editorial review
  for (let i = 0; i < 20; i++) play('A07', i % 5, 'round_timeout', null, 2)
  assert.match(row('A07')[12] as string, /revisione editoriale/)
  // A08: Taboo outside the solve rate: 10 solved + 10 Taboo -> solve rate 1.0, but the Taboo rate alerts (comparable sample has no Taboo)
  for (let i = 0; i < 10; i++) play('A08', i % 5, 'solved', 5, 6)
  for (let i = 0; i < 10; i++) play('A08', i % 5, 'taboo', null, 6)
  assert.equal(row('A08')[5], 1)
  assert.equal(row('A08')[9], 0.5)
  assert.match(row('A08')[13] as string, /taboo_rate/)
  // A09: skip rate over 0.35 alerts; a practice match and an interrupted exposure are not in the sample
  for (let i = 0; i < 10; i++) play('A09', i % 5, 'skipped', null, 6)
  for (let i = 0; i < 10; i++) play('A09', i % 5, 'solved', 5, 6)
  assert.match(row('A09')[13] as string, /skip_rate/)
  play('A09', 0, 'solved', 5, 6, { interrupted: true })
  assert.equal(row('A09')[3], 20)
  // bands: the same card split by active guessers (1-5, 6-20, 21+)
  for (let i = 0; i < 3; i++) play('B01', i, 'solved', 5, 2)
  for (let i = 0; i < 3; i++) play('B01', i, 'solved', 5, 30)
  assert.equal(row('B01', '1-5')[3], 3)
  assert.equal(row('B01', '21+')[3], 3)
  assert.equal(row('B01', '6-20', ) === undefined, true)
  assert.equal(row('B01')[3], 6)
  void db
})

test('the raw export has the names of §3.7 and §9.1 and the winner only as a pseudonym', () => {
  const { store } = fresh()
  const m = newMatch(store)
  const e = exposure(store, store.startRound(m, 1, null, null, NOW), 1)
  store.closeExposure(e, close({ match: m }))
  const t = store.exposuresTable()
  assert.ok(t.columns.includes('winner_id') && t.columns.includes('seconds_available_when_started'))
  const winner = t.rows[0][t.columns.indexOf('winner_id')]
  assert.equal(winner, store.pseudonym('tiktok:1'))
  assert.ok(!JSON.stringify(t.rows).includes('tiktok:1'))
})
