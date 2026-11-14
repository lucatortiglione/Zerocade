import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { Server } from 'socket.io'
import { LiveSocket } from '../packages/browser-runtime/src/index.ts'
import { browserThread } from './helpers/browserThread.ts'
import type { TransportWorker } from '../packages/browser-runtime/src/index.ts'

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10))
  assert.ok(ok(), 'timed out')
}

test('dashboard and overlay transports use real threads: auth, ordered events, off, acknowledgements and recovery', async () => {
  const http = createServer()
  const io = new Server(http, { serveClient: false })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const address = http.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const seen: string[] = []
  let retries = 0
  io.on('connection', (socket) => {
    seen.push(socket.handshake.auth.clientType)
    assert.equal(socket.handshake.auth.key, 'test-key')
    socket.on('bridge:retry', () => retries++)
    socket.on('leaderboard:reset', (_request, ack) => ack({ at: 123 }))
    for (let i = 0; i < 100; i++) socket.emit('live:event', { type: 'comment', text: String(i), user: { id: 'a', nickname: 'Tester' } })
  })
  const entry = new URL('../packages/browser-runtime/src/socket.worker.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
  const dashboardThread = await browserThread(decodeURIComponent(entry))
  const overlayThread = await browserThread(decodeURIComponent(entry))
  const dashboard = new LiveSocket(origin, { clientType: 'dashboard', key: 'test-key' }, () => dashboardThread as unknown as TransportWorker)
  const overlay = new LiveSocket(origin, { clientType: 'overlay', key: 'test-key' }, () => overlayThread as unknown as TransportWorker)
  const received: string[] = []
  const listener = (event: { type: string; text?: string }) => { if (event.text) received.push(event.text) }
  overlay.on('live:event', listener)
  try {
    await until(() => dashboard.connected && overlay.connected && received.length === 100)
    assert.equal(dashboardThread.error, null)
    assert.equal(overlayThread.error, null)
    assert.deepEqual(new Set(seen), new Set(['dashboard', 'overlay']))
    assert.deepEqual(received, Array.from({ length: 100 }, (_, i) => String(i)))
    dashboard.emit('bridge:retry')
    await until(() => retries === 1)
    const ack = new Promise<unknown>((resolve) => dashboard.emit('leaderboard:reset', { game: 'context', period: 'giorno' }, resolve))
    assert.deepEqual(await ack, { at: 123 })
    overlay.off('live:event', listener)
    io.emit('live:event', { type: 'comment', text: 'extra', user: { id: 'a', nickname: 'Tester' } })
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(received.length, 100)
    let reconnected = false
    dashboard.on('disconnect', () => { reconnected = true })
    for (const socket of io.sockets.sockets.values()) if (socket.handshake.auth.clientType === 'dashboard') socket.conn.close()
    await until(() => reconnected && dashboard.connected && seen.filter((kind) => kind === 'dashboard').length === 2)
    dashboard.emit('bridge:retry')
    await until(() => retries === 2)
  } finally {
    dashboard.close(); overlay.close()
    await Promise.all([dashboardThread.terminate(), overlayThread.terminate()])
    await new Promise<void>((resolve) => io.close(() => resolve()))
  }
})

test('a blocked UI cannot grow the worker delivery queue indefinitely; overflow stops the stream with an explicit warning', async () => {
  const http = createServer()
  const server = new Server(http, { serveClient: false })
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
  const address = http.address()
  assert.ok(address && typeof address !== 'string')
  server.on('connection', (socket) => {
    for (let i = 0; i < 1000; i++) socket.emit('live:event', { type: 'comment', text: String(i), user: { id: 'a', nickname: 'Tester' } })
  })
  const entry = new URL('../packages/browser-runtime/src/socket.worker.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
  const thread = await browserThread(decodeURIComponent(entry))
  let delivered = 0
  let warning = ''
  thread.addEventListener('message', (event) => {
    const data = (event as MessageEvent).data
    if (data.type === 'event' && data.event === 'live:event') delivered++
    if (data.type === 'fault') warning = data.message
    // Intentionally never acknowledge consumption: models a UI that stopped.
  })
  try {
    thread.postMessage({ type: 'open', origin: `http://127.0.0.1:${address.port}`, auth: { clientType: 'overlay', key: 'test-key' } })
    await until(() => warning.includes('sovraccarica'))
    assert.ok(delivered <= 256)
    assert.ok(warning.includes('eventi live non sono stati elaborati'))
  } finally {
    await thread.terminate()
    await new Promise<void>((done) => server.close(() => done()))
  }
})
