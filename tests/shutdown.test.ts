import assert from 'node:assert/strict'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Fastify from 'fastify'
import { Server } from 'socket.io'

process.env.ZEROCADE_DB = join(mkdtempSync(join(tmpdir(), 'zerocade-sd-')), 'test.db')
const { createShutdown } = await import('../apps/server/src/shutdown.ts')
const { closeDb } = await import('../apps/server/src/db.ts')

test('the steps run in order, once, and the process exits 0', async () => {
  const calls: string[] = []
  const codes: number[] = []
  const stop = createShutdown({
    steps: [
      { name: 'a', run: () => calls.push('a') },
      { name: 'b', run: async () => void (await Promise.resolve(calls.push('b'))) },
    ],
    exit: (c) => codes.push(c),
  })
  await Promise.all([stop('SIGINT'), stop('SIGTERM')])
  assert.deepEqual(calls, ['a', 'b'])
  assert.deepEqual(codes, [0])
})

test('a failing step is logged, the next ones still run, and the exit code is 1', async () => {
  const calls: string[] = []
  const logs: string[] = []
  const codes: number[] = []
  const stop = createShutdown({
    steps: [
      { name: 'broken', run: () => { throw new Error('boom') } },
      { name: 'after', run: () => calls.push('after') },
    ],
    exit: (c) => codes.push(c),
    log: (m) => logs.push(m),
  })
  await stop('SIGTERM')
  assert.deepEqual(calls, ['after'])
  assert.ok(logs.some((m) => m.includes('"broken" failed')))
  assert.deepEqual(codes, [1])
})

test('a step that never finishes is cut off by the timeout', async () => {
  const codes: number[] = []
  const stop = createShutdown({
    steps: [{ name: 'stuck', run: () => new Promise(() => {}) }],
    timeoutMs: 40,
    exit: (c) => codes.push(c),
  })
  await stop('SIGINT')
  assert.deepEqual(codes, [1])
})

test('closing the sockets and then the server, as the real shutdown does, ends cleanly and frees the port', async () => {
  const app = Fastify()
  const io = new Server(app.server)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as { port: number }).port
  const codes: number[] = []
  const logs: string[] = []
  const stop = createShutdown({
    steps: [
      { name: 'sockets', run: () => new Promise<void>((resolve) => void io.close(() => resolve())) },
      { name: 'server', run: () => app.close() },
    ],
    exit: (c) => codes.push(c),
    log: (m) => logs.push(m),
  })
  await stop('SIGINT')
  assert.deepEqual(codes, [0], logs.join(' | '))
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`), 'the port is no longer served')
})

test('a saved session that cannot be read is set aside before the defaults overwrite it', async () => {
  const { saveSession, asideSessions } = await import('../apps/server/src/db.ts')
  const { getSession } = await import('../apps/server/src/sessions.ts')
  const key = 'room-corrupt'
  saveSession(key, 'zerowordle', '{not json', '{}', '{}', 500)
  const quiet = console.error
  console.error = () => {}
  let state
  try {
    state = getSession(key)
  } finally {
    console.error = quiet
  }
  assert.ok(Array.isArray(state.triggers), 'the room gets a usable session')
  const kept = asideSessions(key)
  assert.equal(kept.length, 1)
  assert.equal(kept[0].triggers, '{not json')
  assert.equal(kept[0].goal, 500)
  // the repaired row is valid: reading again sets nothing more aside
  getSession(key)
  assert.equal(asideSessions(key).length, 1)
})

test('closing the database folds the log into the file and leaves no -wal behind', () => {
  closeDb()
  assert.ok(existsSync(process.env.ZEROCADE_DB as string))
  assert.ok(!existsSync(`${process.env.ZEROCADE_DB}-wal`), 'the -wal file is gone after the checkpoint and close')
})
