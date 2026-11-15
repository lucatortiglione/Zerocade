import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { LevelSource } from '../apps/server/src/wordgen/levels.ts'
import { disposeGameRooms, RoomParticipants } from '../apps/server/src/gameRooms.ts'

class ControlledWorker extends EventEmitter {
  sent: number[] = []
  terminated = 0
  postMessage(n: number) { this.sent.push(n) }
  async terminate() { this.terminated++; return 0 }
  unref() {}
}

test('level requests coalesce, saturate explicitly, and all pending work settles on close', async () => {
  const worker = new ControlledWorker()
  const source = new LevelSource(() => worker, 2, 5000)
  const one = source.get(1)
  assert.equal(source.get(1), one)
  const two = source.get(2)
  const rejected = Promise.all([assert.rejects(one, /chiuso/), assert.rejects(two, /chiuso/)])
  await assert.rejects(source.get(3), /coda/)
  await assert.rejects(source.get(NaN), /non valido/)
  assert.deepEqual(worker.sent, [1, 2])
  const first = source.close()
  assert.equal(first, source.close())
  await first; await rejected
  assert.equal(worker.terminated, 1)
  await assert.rejects(source.get(1), /chiuso/)
})

test('a failed old generator cannot clear its replacement when its exit arrives late', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const old = new ControlledWorker(), next = new ControlledWorker()
  let starts = 0
  const source = new LevelSource(() => ++starts === 1 ? old : next, 2, 5000)
  const a = assert.rejects(source.get(1), /old failure/)
  old.emit('error', new Error('old failure'))
  await a
  const b = assert.rejects(source.get(2), /second failure/)
  old.emit('exit', 1)
  next.emit('message', { n: 2, error: 'second failure' })
  await b
  assert.equal(starts, 2)
  assert.equal(next.terminated, 0)
  await source.close()
})

test('a stalled native job has a deadline and terminates its owned worker', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const worker = new ControlledWorker()
  const source = new LevelSource(() => worker, 2, 20)
  await assert.rejects(source.get(1), /Tempo massimo/)
  assert.equal(worker.terminated, 1)
  await source.close()
})

test('room shutdown disposes every room even if one cleanup fails', () => {
  const disposed: number[] = []
  const rooms = new Map([['a', { dispose() { disposed.push(1); throw new Error('first') } }], ['b', { dispose() { disposed.push(2) } }]])
  assert.throws(() => disposeGameRooms(rooms), AggregateError)
  assert.deepEqual(disposed, [1, 2])
  assert.equal(rooms.size, 0)
})

test('server games preserve admitted players at capacity and signal rejection only once', () => {
  const players = new RoomParticipants(2)
  const issues: string[] = []
  const report = (message: string) => issues.push(message)
  assert.equal(players.accept('a', report), true)
  assert.equal(players.accept('b', report), true)
  for (let n = 0; n < 100; n++) assert.equal(players.accept(String(n), report), false)
  assert.equal(issues.length, 1)
  assert.equal(players.accept('a', report), true)
  players.clear()
  assert.equal(players.accept('new', report), true)
})

test('the real source generator loads its lexicon and produces a valid level off the main thread', async () => {
  const source = new LevelSource()
  try {
    const level = await source.get(1)
    assert.equal(level.id, 1)
    assert.ok(level.words.length >= 2)
    assert.match(level.letters, /^[A-Z]{6,9}$/)
    assert.equal(source.ready(1), level)
    assert.equal(await source.get(1), level)
  } finally { await source.close() }
})
