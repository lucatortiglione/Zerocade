import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// The server's database, apart from the real one.
process.env.ZEROCADE_DB = join(mkdtempSync(join(tmpdir(), 'zerocade-lb-')), 'test.db')
const { PERIODS, leaderboards, periodStart, recordScore } = await import('../apps/server/src/scores.ts')

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
// Thursday 12 November 2026, noon.
const now = new Date(2026, 10, 12, 12)

test('a period begins at midnight today, Monday, the first of the month; all time at the beginning', () => {
  assert.equal(periodStart('giorno', now, 0), at(2026, 11, 12, 0))
  assert.equal(periodStart('settimana', now, 0), at(2026, 11, 9, 0)) // Monday
  assert.equal(periodStart('mese', now, 0), at(2026, 11, 1, 0))
  assert.equal(periodStart('sempre', now, 0), 0)
  assert.equal(periodStart('sessione', now, 12345), 12345)
  // on a Sunday the week still began the Monday before
  assert.equal(periodStart('settimana', new Date(2026, 10, 15, 9), 0), at(2026, 11, 9, 0))
  assert.deepEqual(PERIODS.map((p) => p.label), ['Sessione', 'Giorno', 'Settimana', 'Mese', 'All Time'])
})

test('points are summed per viewer in each period, and only whole positive points count', () => {
  const key = 'room'
  const luna = { id: 'l', nickname: 'luna' }
  const marco = { id: 'm', nickname: 'marco' }
  assert.equal(recordScore(key, 'context', luna, 50, at(2026, 11, 12, 9)), true) // today
  assert.equal(recordScore(key, 'context', luna, 30, at(2026, 11, 10, 9)), true) // this week
  assert.equal(recordScore(key, 'context', marco, 70, at(2026, 11, 3, 9)), true) // this month
  assert.equal(recordScore(key, 'context', marco, 500, at(2026, 9, 3, 9)), true) // older
  assert.equal(recordScore(key, 'zerowordle', marco, 999, at(2026, 11, 12, 9)), true) // another game
  assert.equal(recordScore(key, 'context', luna, 0), false)
  assert.equal(recordScore(key, 'context', luna, -4), false)
  assert.equal(recordScore(key, 'context', luna, 2.5), false)
  assert.equal(recordScore(key, 'context', { id: '', nickname: 'x' }, 5), false)

  const b = leaderboards(key, 'context', 10, now)
  const line = (rows: typeof b.giorno) => rows.map((r) => `${r.rank}.${r.name}:${r.points}`).join(' ')
  assert.equal(line(b.sessione), '') // nothing since this server started
  assert.equal(line(b.giorno), '1.luna:50')
  assert.equal(line(b.settimana), '1.luna:80')
  assert.equal(line(b.mese), '1.luna:80 2.marco:70')
  assert.equal(line(b.sempre), '1.marco:570 2.luna:80')
  assert.equal(leaderboards(key, 'context', 1, now).sempre.length, 1)
  assert.equal(leaderboards('altra', 'context', 10, now).sempre.length, 0)
})

test('a viewer shows with the latest name and picture, and a tie goes to who scored first', () => {
  const key = 'room2'
  recordScore(key, 'g', { id: 'a', nickname: 'vecchio', avatar: 'https://x/a.png' }, 10, at(2026, 11, 1))
  recordScore(key, 'g', { id: 'b', nickname: 'beta' }, 20, at(2026, 11, 2))
  recordScore(key, 'g', { id: 'a', nickname: 'nuovo', avatar: 'https://x/b.png' }, 10, at(2026, 11, 3))
  const rows = leaderboards(key, 'g', 10, now).sempre
  assert.deepEqual(rows.map((r) => [r.rank, r.name, r.points, r.avatar]), [
    [1, 'nuovo', 20, 'https://x/b.png'], // 'a' got to 20 on the 3rd, but started on the 1st: ahead on a tie, by its latest name
    [2, 'beta', 20, null],
  ])
})
