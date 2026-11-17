import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  correctionDeltas, rankPlayers, rectifyToTaboo, redHunters, scoreRound, tally, teamInForm, voiceOfChat, type CardResult, type Win,
} from '../apps/server/src/taboo-scoring.ts'

const solved = (difficulty: 1 | 2 | 3, doubled = false): CardResult => ({ kind: 'solved', difficulty, doubled })

test('ZEROTABOO §4 examples, verbatim: easy, medium, hard in a row = 1 + 2 + 3 + 1 = 7', () => {
  assert.equal(scoreRound(0, [solved(1), solved(2), solved(3)]).team, 7)
})

test('ZEROTABOO §4 examples, verbatim: with the hard one as Jackpot = 1 + 2 + (3 x 2) + 1 = 10', () => {
  const r = scoreRound(0, [solved(1), solved(2), solved(3, true)])
  assert.equal(r.team, 10)
  assert.deepEqual(r.events.map((e) => [e.index, e.kind, e.delta]), [[0, 'base', 1], [1, 'base', 2], [2, 'base', 6], [2, 'streak', 1]])
})

test('the streak bonus is +1 at 3, 6, 9 consecutive cards, and it is not doubled', () => {
  const r = scoreRound(0, Array.from({ length: 9 }, () => solved(1, true)))
  assert.equal(r.team, 9 * 2 + 3) // 9 doubled base points + three bonuses of 1
  assert.equal(r.events.filter((e) => e.kind === 'streak').length, 3)
})

test('a skip, a Taboo card and a timeout reset the streak', () => {
  for (const breaker of [{ kind: 'skipped' }, { kind: 'taboo' }, { kind: 'round_timeout' }] as CardResult[]) {
    const r = scoreRound(10, [solved(1), solved(1), breaker, solved(1)])
    assert.equal(r.events.filter((e) => e.kind === 'streak').length, 0, breaker.kind)
    assert.equal(r.streak, 1)
  }
})

test('Taboo: -1, never below 0, and a skip gives nothing', () => {
  assert.equal(scoreRound(5, [{ kind: 'taboo' }]).team, 4)
  assert.equal(scoreRound(0, [{ kind: 'taboo' }, { kind: 'taboo' }]).team, 0)
  assert.deepEqual(scoreRound(0, [{ kind: 'taboo' }]).events, [{ index: 0, kind: 'penalty', delta: 0 }]) // the violation is recorded, worth 0
  assert.equal(scoreRound(3, [{ kind: 'skipped' }]).team, 3)
  assert.equal(scoreRound(3, [{ kind: 'round_timeout' }]).team, 3)
})

test('the team never goes below zero, whatever the results (seeded property)', () => {
  let seed = 7
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
  const kinds = (): CardResult => {
    const n = next() % 6
    return n === 0 ? { kind: 'skipped' } : n === 1 ? { kind: 'taboo' } : n === 2 ? { kind: 'round_timeout' } : solved(((next() % 3) + 1) as 1 | 2 | 3, next() % 4 === 0)
  }
  for (let i = 0; i < 500; i++) {
    const results = Array.from({ length: next() % 30 }, kinds)
    const start = next() % 20
    const r = scoreRound(start, results)
    assert.ok(r.team >= 0)
    // The events add up to the final score, and every running total stays at or above zero.
    assert.equal(start + r.events.reduce((a, e) => a + e.delta, 0), r.team)
    let running = start
    for (const d of r.deltas) {
      running += d
      assert.ok(running >= 0)
    }
  }
})

test('rectification: the win becomes a Taboo card, the round is computed again, and only differences are appended', () => {
  const before: CardResult[] = [solved(1), solved(2), solved(3), solved(1)]
  const after = rectifyToTaboo(before, 1)
  assert.deepEqual(after[1], { kind: 'taboo' })
  const old = scoreRound(0, before)
  const fresh = scoreRound(0, after)
  assert.equal(old.team, 1 + 2 + 3 + 1 + 1) // 8: bonus at the third card
  assert.equal(fresh.team, 1 - 1 + 3 + 1) // the penalty takes 1 and the streak restarts after it: 1, taboo, 3, 1 -> no bonus
  const deltas = correctionDeltas(0, before, after)
  // Applying the corrections to the old events gives exactly the new total: the past is not rewritten, it is corrected.
  assert.equal(old.team + deltas.reduce((a, d) => a + d.delta, 0), fresh.team)
  assert.throws(() => rectifyToTaboo(before, 9), RangeError)
  assert.throws(() => rectifyToTaboo([{ kind: 'skipped' }], 0), RangeError)
})

test('rectification keeps the minimum of zero in a later penalty', () => {
  const before: CardResult[] = [solved(1), { kind: 'taboo' }, { kind: 'taboo' }]
  const after = rectifyToTaboo(before, 0)
  assert.equal(scoreRound(0, after).team, 0)
})

const win = (id: string, difficulty: 1 | 2 | 3, nickname = id): Win => ({ id, nickname, difficulty })

test('standings: wins, then hard wins, then medium wins; what is left is ex aequo (1, 1, 3)', () => {
  const wins: Win[] = [
    win('tiktok:a', 3), win('tiktok:a', 1),
    win('tiktok:b', 2), win('tiktok:b', 2),
    win('tiktok:c', 3), win('tiktok:c', 1),
    win('tiktok:d', 1),
  ]
  const ranked = rankPlayers(tally(wins))
  assert.deepEqual(ranked.map((p) => [p.id, p.place]), [['tiktok:a', 1], ['tiktok:c', 1], ['tiktok:b', 3], ['tiktok:d', 4]])
  // The player is the id, not the nickname: the same nickname on two platforms is two players, and a changed nickname is one.
  const two = tally([win('tiktok:1', 1, 'Anna'), win('twitch:1', 1, 'Anna'), win('tiktok:1', 1, 'Anna2')])
  assert.equal(two.length, 2)
  assert.equal(two.find((t) => t.id === 'tiktok:1')!.nickname, 'Anna2')
})

test('the avatar stays with the player in the standings', () => {
  const t = tally([{ id: 'tiktok:1', nickname: 'A', avatar: 'https://x/y.png', difficulty: 1 }])
  assert.equal(rankPlayers(t)[0].avatar, 'https://x/y.png')
})

test('symbolic awards: hard-win hunters (ties together), voice of the chat, team in form', () => {
  const t = tally([win('a', 3), win('b', 3), win('c', 2)])
  assert.deepEqual(redHunters(t).map((p) => p.id), ['a', 'b'])
  assert.deepEqual(redHunters(tally([win('c', 2)])), [])
  const rounds = new Map<string, Set<number>>([['a', new Set([1, 2, 3])], ['b', new Set([1, 2])]])
  assert.deepEqual(voiceOfChat(rounds), ['a'])
  assert.equal(teamInForm([solved(1), solved(1), solved(1)]), true)
  assert.equal(teamInForm([solved(1), { kind: 'skipped' }, solved(1), solved(1)]), false)
})
