import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, after } from 'node:test'
import Database from 'better-sqlite3'
import type { Worker } from 'node:worker_threads'

process.env.ZEROCADE_DB = join(mkdtempSync(join(tmpdir(), 'zerocade-workers-')), 'test.db')
const { InfrastructureClient } = await import('../apps/server/src/infrastructureClient.ts')
const { closeDb, insertGameScore } = await import('../apps/server/src/db.ts')
after(() => closeDb())

test('concurrent infrastructure close calls share one drain of all accepted writes', async () => {
  const writer = new InfrastructureClient('close-once', 64)
  await writer.run('barrier', null)
  const accepted = Array.from({ length: 12 }, (_, n) => writer.run('event', {
    key: 'close-once', creator: '', game: 'context', event: { type: 'comment', user: { id: 'a', nickname: 'Tester' }, text: String(n) },
  }))
  const closing = writer.close()
  assert.equal(writer.close(), closing)
  await Promise.all(accepted)
  await closing
  assert.equal(writer.metrics().queued, 0)
  assert.equal(writer.metrics().unknownOutcomes, 0)
  assert.equal(writer.close(), closing)
})

test('live persistence and reports run on separate real threads, with ordered commits and read barriers', async () => {
  const writer = new InfrastructureClient('test-writer', 256)
  const reader = new InfrastructureClient('test-reader', 16)
  try {
    const user = { id: 'a', nickname: 'Tester' }
    const gift = { type: 'gift' as const, giftId: 'rose', count: 2, user }
    let ticks = 0
    const pulse = setInterval(() => ticks++, 1)
    try {
      for (let batch = 0; batch < 4; batch++) {
        await Promise.all(Array.from({ length: 50 }, (_, i) => writer.run('event', {
          key: 'room', creator: '', game: 'context', event: { type: 'comment', user, text: `${batch * 50 + i}` },
        })))
      }
    } finally { clearInterval(pulse) }
    assert.ok(ticks > 0, 'main thread must continue handling its timer')
    const donors = await writer.run('event', { key: 'room', creator: '', game: 'context', event: gift })
    assert.equal(donors?.[0].id, 'a')
    await writer.run('barrier', null)
    const rows = await reader.run('events', { key: 'room', limit: 500 })
    assert.equal(rows.length, 201)
    assert.equal(rows[0].type, 'gift')
    assert.deepEqual(rows.slice(1).map((row) => JSON.parse(row.payload).text), Array.from({ length: 200 }, (_, i) => String(199 - i)))
    const feed = await reader.run('feed', { since: 0 })
    assert.equal(feed.gifts[0].count, 2)
    insertGameScore('room', 'context', user, 25, 100)
    const boards = await reader.run('boards', { key: 'room', game: 'context', limit: 10, at: 200, start: 0 })
    assert.equal(boards.boards.sessione[0].points, 25, 'reader uses the main thread session boundary')
    const csv = await reader.run('export', { kind: 'wa-rounds' })
    assert.ok(csv.startsWith('\ufeff'))
    const saved = await writer.run('padSave', { key: 'room', input: {} })
    assert.equal(typeof saved.error, 'string')
    assert.ok(saved.board.pads.length > 0)
    const committing = writer.run('event', { key: 'room', creator: '', game: 'context', event: { type: 'comment', user, text: 'must survive' } })
    await assert.rejects(writer.run('padSave', { key: 'room', input: { uncloneable: () => {} } }),
      (error) => error instanceof Error && 'outcome' in error && error.outcome === 'not-started')
    await committing
    await writer.run('barrier', null)
    const latest = await reader.run('events', { key: 'room', limit: 1 })
    assert.equal(JSON.parse(latest[0].payload).text, 'must survive', 'new invalid work cannot cancel an older commit')
    assert.equal(writer.metrics().bytes, 0)
  } finally { await reader.close(); await writer.close() }
  await assert.rejects(writer.run('barrier', null), /chiusura/)
})

test('a saturated worker refuses work explicitly instead of creating an unbounded queue', async () => {
  const client = new InfrastructureClient('test-full', 0)
  await assert.rejects(client.run('barrier', null), /coda piena/)
  await client.close()
  const small = new InfrastructureClient('byte-budget', 10, process.env.ZEROCADE_DB, 128)
  await assert.rejects(small.run('padSave', { key: 'room', input: { data: 'x'.repeat(1000) } }), /budget/)
  assert.equal(small.metrics().queued, 0)
  await small.close()
})

test('a killed writer reports unknown outcomes without replay; a replacement worker accepts new work and shutdown drains it', async () => {
  const writer = new InfrastructureClient('fault-writer', 64)
  const reader = new InfrastructureClient('fault-reader', 4)
  const lock = new Database(process.env.ZEROCADE_DB!)
  const input = { key: 'fault-room', creator: '', game: 'context', event: { type: 'comment' as const, user: { id: 'fault', nickname: 'Fault' }, text: 'uncertain' } }
  try {
    await writer.run('barrier', null)
    lock.exec('BEGIN IMMEDIATE')
    const writing = writer.run('event', input)
    const rejected = assert.rejects(writing, (error: unknown) => error instanceof Error && 'outcome' in error && error.outcome === 'unknown')
    // Inject native thread death while the real SQLite writer is waiting for a lock.
    // Access stays inside the test; production exposes no worker-kill command.
    const thread = (writer as unknown as { worker: Worker }).worker
    const terminating = thread.terminate()
    lock.exec('ROLLBACK')
    await terminating
    await rejected
    assert.equal(writer.metrics().unknownOutcomes, 1)
    await writer.run('barrier', null)
    const before = await reader.run('events', { key: 'fault-room', limit: 100 })
    assert.ok(before.length <= 1)
    const writes = Array.from({ length: 32 }, (_, i) => writer.run('event', { ...input, event: { ...input.event, text: `confirmed-${i}` } }))
    const closing = writer.close()
    await Promise.all(writes)
    await closing
    const after = await reader.run('events', { key: 'fault-room', limit: 100 })
    assert.equal(after.length, before.length + 32)
    assert.equal(after.filter((row) => JSON.parse(row.payload).text === 'uncertain').length, before.length, 'an uncertain write is never replayed')
    assert.equal(writer.metrics().bytes, 0)
  } finally {
    if (lock.inTransaction) lock.exec('ROLLBACK')
    lock.close()
    await writer.close()
    await reader.close()
  }
})
