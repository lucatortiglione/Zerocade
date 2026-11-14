import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { ZfbBridge } from '../apps/server/src/zfb.ts'

interface BotSocket {
  send(data: string): void
  terminate(): void
  on(event: 'message', listener: (data: { toString(): string }) => void): void
}
const { WebSocketServer } = createRequire(import.meta.url)('ws') as {
  WebSocketServer: new (options: { port: number }) => {
    on(event: 'connection', listener: (socket: BotSocket) => void): void
    once(event: 'listening', listener: () => void): void
    address(): { port: number }
    close(callback: () => void): void
  }
}
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(ok(), 'timed out')
}

test('manual retry replaces a stalled handshake and a connected socket, preserving port and game words', async () => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const clients: BotSocket[] = []
  const requests: unknown[] = []
  server.on('connection', (socket) => {
    clients.push(socket)
    socket.on('message', (data) => requests.push(JSON.parse(data.toString())))
    if (clients.length === 1) return // The old connection never sends hello.
    socket.send(JSON.stringify({ type: 'hello', protocol: 1, requests: ['words'] }))
    socket.send(JSON.stringify({ type: 'status', tiktok: 'tester', twitch: '' }))
    socket.send(JSON.stringify({ type: 'comment', platform: 'tiktok', text: 'mare', user: { id: 'a' }, id: String(clients.length) }))
  })
  const received: string[] = []
  const bridge = new ZfbBridge((_event, _kind, _account, id) => received.push(id), () => undefined)
  const config = { enabled: true, port: server.address().port }
  try {
    bridge.setWords(['mare', 'sole'])
    bridge.configure(config)
    await until(() => clients.length === 1)
    assert.equal(bridge.status().state, 'connecting')
    bridge.reconnect()
    await until(() => received.length === 1 && requests.length === 1)
    assert.equal(bridge.status().state, 'connected')
    assert.equal(bridge.status().port, config.port)
    assert.equal(bridge.status().tiktok, 'tester')
    assert.deepEqual(requests, [{ type: 'words', words: ['mare', 'sole'] }])
    bridge.reconnect()
    assert.equal(bridge.status().state, 'connecting')
    assert.equal(bridge.status().tiktok, '')
    await until(() => received.length === 2 && requests.length === 2)
    assert.equal(clients.length, 3)
    assert.deepEqual(received, ['2', '3'])
    assert.deepEqual(requests[1], requests[0])
  } finally {
    bridge.close()
    for (const client of clients) client.terminate()
    await new Promise<void>((resolve) => server.close(resolve))
  }
})

test('retry cancels the backoff, ignores old socket events, and cannot enable a disabled bridge', (t) => {
  const original = globalThis.WebSocket
  class SocketDouble extends EventTarget {
    static readonly OPEN = 1
    static sockets: SocketDouble[] = []
    readyState = 1
    constructor(readonly url: string) { super(); SocketDouble.sockets.push(this) }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
    send() {}
    message(data: object) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })) }
  }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.WebSocket = SocketDouble as unknown as typeof WebSocket
  const bridge = new ZfbBridge(() => assert.fail('stale event forwarded'), () => undefined)
  try {
    bridge.configure({ enabled: true, port: 8780 })
    const first = SocketDouble.sockets[0]
    first.close() // Schedules the automatic retry after one second.
    bridge.reconnect()
    assert.equal(SocketDouble.sockets.length, 2, 'manual retry starts immediately')
    assert.equal(bridge.status().message, undefined, 'old error is cleared')
    const second = SocketDouble.sockets[1]
    t.mock.timers.tick(5000)
    assert.equal(SocketDouble.sockets.length, 2, 'old backoff must not open another socket')
    first.message({ type: 'hello', protocol: 1 })
    first.message({ type: 'status', tiktok: 'stale' })
    assert.equal(bridge.status().state, 'connecting')
    assert.equal(bridge.status().tiktok, '')
    second.message({ type: 'hello', protocol: 1 })
    assert.equal(bridge.status().state, 'connected')
    bridge.configure({ enabled: false, port: 8780 })
    bridge.reconnect()
    t.mock.timers.tick(5000)
    assert.equal(bridge.status().state, 'off')
    assert.equal(SocketDouble.sockets.length, 2)
  } finally {
    bridge.close()
    globalThis.WebSocket = original
    t.mock.timers.reset()
  }
})
