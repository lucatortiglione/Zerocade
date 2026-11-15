import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tournamentBand } from '../packages/shared/src/index.ts'
import { bluePenalty, netPoints, scoreRound, standings, topTen, type PlayerTotals, type ScoredGuess } from '../apps/server/src/context-tournament-scoring.ts'

let seq = 0
const g = (player: string, position: number, window = 1): ScoredGuess => ({ seq: ++seq, window, player, position })
const net = (outcome: ReturnType<typeof scoreRound>, player: string) => netPoints(outcome.players.get(player)!)
const positive = (outcome: ReturnType<typeof scoreRound>) =>
  [...outcome.players.values()].reduce((sum, p) => sum + p.pioneer + p.jackpot, 0)

test('the official bands are exclusive, with their exact boundaries (§2)', () => {
  const cases: [number, string][] = [[1, 'target'], [2, 'red'], [100, 'red'], [101, 'orange'], [600, 'orange'], [601, 'yellow'],
    [2500, 'yellow'], [2501, 'cyan'], [7500, 'cyan'], [7501, 'blue'], [99999, 'blue']]
  for (const [position, band] of cases) assert.equal(tournamentBand(position), band, String(position))
})

test('A: a direct jump to red gives 15, the solver 85, 100 in all (T08)', () => {
  const o = scoreRound([g('anna', 42), g('bruno', 1)])
  assert.equal(net(o, 'anna'), 15)
  assert.equal(net(o, 'bruno'), 85)
  assert.equal(positive(o), 100)
  assert.equal(o.players.get('anna')!.redOrange, 1)
})

test('B: cyan then yellow then the target: 5, 10, 85 (§11)', () => {
  const o = scoreRound([g('a', 5000), g('b', 2000), g('c', 1)])
  assert.deepEqual(['a', 'b', 'c'].map((p) => net(o, p)), [5, 10, 85])
})

test('the full climb pays 40 to the pioneers and 60 to the jackpot (T09)', () => {
  const o = scoreRound([g('a', 7000), g('b', 2000), g('c', 500), g('d', 50), g('e', 1)])
  assert.equal(o.pioneerTotal, 40)
  assert.equal(o.jackpot, 60)
  assert.equal(positive(o), 100)
})

test('a band already passed gives nothing more, and skipped bands never pay later (high-water mark)', () => {
  const o = scoreRound([g('a', 300), g('b', 5000), g('c', 1500), g('d', 200)])
  assert.equal(net(o, 'a'), 10) // orange first
  assert.equal(net(o, 'b'), 0) // cyan after orange: skipped for good
  assert.equal(net(o, 'c'), 0)
  assert.equal(net(o, 'd'), 0) // orange again
  assert.equal(o.solved, false)
  assert.equal(o.jackpot, 0)
})

test('the target as the very first guess pays 100 and is a Hole in One (T10)', () => {
  const o = scoreRound([g('anna', 1), g('bruno', 40)])
  assert.equal(net(o, 'anna'), 100)
  assert.equal(o.achievements.holeInOne, 'anna')
  assert.equal(o.players.has('bruno'), false) // after the target nothing counts
})

test('C: an unsolved round keeps the pioneers and pays no jackpot (T11)', () => {
  const o = scoreRound([g('a', 6000), g('b', 50)])
  assert.equal(o.solved, false)
  assert.equal(positive(o), 20)
})

test('blue attempts are counted but never cost points (decided 15/11/2026, replaces T12)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(bluePenalty), [0, 0, 0, 0, 0, 0, 0, 0])
  const o = scoreRound(Array.from({ length: 7 }, (_, i) => g('mario', 9000 + i)))
  assert.equal(o.players.get('mario')!.blueCount, 7)
  assert.equal(o.players.get('mario')!.bluePenalty, 0)
  assert.equal(net(o, 'mario'), 0)
})

test('in a window with the target, the guesses before it count and those after do not (T07)', () => {
  const o = scoreRound([g('a', 3000, 5), g('b', 1, 5), g('c', 80, 5), g('d', 9000, 5)])
  assert.equal(net(o, 'a'), 5)
  assert.equal(net(o, 'b'), 95)
  assert.equal(o.players.has('c'), false)
  assert.equal(o.players.has('d'), false)
})

test('achievements: Pioniere Supremo; Fuoco sotto il Ghiaccio never, as blue has no penalty', () => {
  const blue = Array.from({ length: 5 }, (_, i) => g('ice', 8000 + i))
  const o = scoreRound([g('sup', 7000), g('sup', 2000), g('sup', 400), ...blue, g('ice', 1)])
  assert.deepEqual(o.achievements.supremePioneers, ['sup'])
  assert.equal(o.achievements.fireUnderIce, null)
})

const t = (player: string, points: number, solved = 0, redOrange = 0, blue = 0): PlayerTotals =>
  ({ player, nickname: player, points, delta: 0, solved, redOrange, bluePenalty: blue })

test('standings follow §9 and keep true ties ex aequo, negative points included (T22)', () => {
  const rows = standings([t('neg', -3), t('a', 50, 1), t('b', 50, 2), t('c', 50, 1, 2), t('d', 50, 1, 2, 1), t('e', 50, 1, 2, 1)])
  assert.deepEqual(rows.map((r) => [r.nickname, r.place, r.tied]), [
    ['b', 1, false], ['c', 2, false], ['d', 3, true], ['e', 3, true], ['a', 5, false], ['neg', 6, false]])
})

test('the Top 10 shows ten rows and says when the 10th place is shared', () => {
  const many = Array.from({ length: 12 }, (_, i) => t(`p${String(i).padStart(2, '0')}`, i < 9 ? 100 - i : 10))
  const { top10, tieAtTen } = topTen(standings(many))
  assert.equal(top10.length, 10)
  assert.equal(tieAtTen, true)
  assert.equal(topTen(standings(many.slice(0, 4))).top10.length, 4)
})
