import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { ContextError } from '../packages/shared/src/context.ts'
import { ContextWorkerClient } from '../apps/overlay/src/games/contextWorkerClient.ts'
import { parseContextData, rankAgainst } from '../apps/overlay/src/games/contextRanking.ts'
import type { ContextRequest, ContextResponse, ContextWorkerPort } from '../apps/overlay/src/games/contextProtocol.ts'
import { browserThread } from './helpers/browserThread.ts'

const data = parseContextData('mare\nonda\nsabbia\ncittà\n', new Int8Array([100, 0, 95, 30, 60, 80, -100, 0]).buffer, 'mare\nsabbia\n')
const vocabulary = { words: data.words, secrets: data.secrets, index: data.index, folded: data.folded }

class ControlledPort implements ContextWorkerPort {
  sent: ContextRequest[] = []
  terminated = false
  private messages = new Set<(event: MessageEvent<ContextResponse>) => void>()
  private errors = new Set<() => void>()
  addEventListener(type: 'message', listener: (event: MessageEvent<ContextResponse>) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  addEventListener(type: string, listener: ((event: MessageEvent<ContextResponse>) => void) | (() => void)) {
    if (type === 'message') this.messages.add(listener)
    else this.errors.add(() => Reflect.apply(listener, undefined, []))
  }
  postMessage(request: ContextRequest) { this.sent.push(request) }
  terminate() { this.terminated = true }
  reply(reply: ContextResponse) { for (const listener of this.messages) listener(new MessageEvent('message', { data: reply })) }
  fail() { for (const listener of this.errors) listener() }
}

test('real ZeroContext worker loads once, keeps vectors out of the UI and returns exactly the pure ranking', async () => {
  let reads = 0
  const files = new Map<string, string | Uint8Array>([
    ['/api/context/vocab.txt', data.words.join('\n')], ['/api/context/secrets.txt', 'mare\nsabbia\n'],
    ['/api/context/vectors.bin', new Uint8Array(data.vectors.buffer)],
  ])
  const server = createServer((req, res) => {
    reads++
    const file = files.get(req.url ?? '')
    if (file === undefined) { res.writeHead(404); res.end(); return }
    // Split the response without Content-Length: exercises the production reader.
    const body = typeof file === 'string' ? Buffer.from(file) : Buffer.from(file)
    res.write(body.subarray(0, 2)); res.end(body.subarray(2))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const thread = await browserThread<ContextRequest, ContextResponse>(fileURLToPath(new URL('../apps/overlay/src/games/context.worker.ts', import.meta.url)))
  let spawns = 0
  const client = new ContextWorkerClient(`http://127.0.0.1:${address.port}`, () => { spawns++; return thread })
  try {
    const first = client.load()
    assert.equal(client.load(), first)
    const words = await first
    assert.equal(spawns, 1)
    assert.equal(reads, 4)
    assert.ok(!('vectors' in words) && !('dim' in words))
    for (const secret of data.secrets) {
      const ranking = await client.rank(secret)
      assert.deepEqual(ranking, rankAgainst(data, secret))
      assert.equal(ranking.order.buffer.byteLength, data.words.length * 4)
      assert.equal(ranking.order.byteOffset, 0)
    }
    assert.equal(client.metrics().completed, 2)
    assert.equal(client.metrics().queued, 0)
  } finally {
    client.dispose()
    await thread.terminate()
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})

test('rank admission keeps one active and only the latest pending request; unrelated in-flight work is not cancelled', async () => {
  const port = new ControlledPort()
  const client = new ContextWorkerClient('http://localhost:3001', () => port)
  const loaded = client.load()
  port.reply({ type: 'ready', id: port.sent[0].id, vocabulary })
  await loaded
  const first = client.rank(0)
  const replaced = assert.rejects(client.rank(1), (error) => error instanceof ContextError && error.kind === 'superseded')
  const last = client.rank(2)
  assert.equal(port.sent.length, 2, 'only load and executing rank crossed the port')
  assert.equal(client.metrics().queued, 1)
  port.reply({ type: 'ranked', id: port.sent[1].id, ranking: rankAgainst(data, 0), durationMs: 2 })
  assert.equal((await first).secret, 0)
  assert.equal(port.sent.length, 3)
  port.reply({ type: 'ranked', id: port.sent[2].id, ranking: rankAgainst(data, 2), durationMs: 3 })
  assert.equal((await last).secret, 2)
  await replaced
  assert.equal(client.metrics().superseded, 1)
  client.dispose()
})

test('worker timeout rejects every waiter, terminates owned work and ignores late replies', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const port = new ControlledPort()
  const client = new ContextWorkerClient('http://localhost:3001', () => port, { loadMs: 30, rankMs: 15 })
  const load = client.load()
  port.reply({ type: 'ready', id: port.sent[0].id, vocabulary })
  await load
  const first = assert.rejects(client.rank(0), (error) => error instanceof ContextError && error.kind === 'timeout')
  const pending = assert.rejects(client.rank(2), (error) => error instanceof ContextError && error.kind === 'timeout')
  t.mock.timers.tick(15)
  await Promise.all([first, pending])
  assert.ok(port.terminated)
  port.reply({ type: 'ranked', id: port.sent[1].id, ranking: rankAgainst(data, 0), durationMs: 1 })
  assert.equal(client.metrics().completed, 0)
  assert.equal(client.metrics().queued, 0)
  client.dispose()
  await assert.rejects(client.load(), (error) => error instanceof ContextError && error.kind === 'closed')
})

test('dispose cancels a load; an explicit subsequent load can recover from a prior worker fault', async () => {
  const ports: ControlledPort[] = []
  const client = new ContextWorkerClient('http://localhost:3001', () => { const port = new ControlledPort(); ports.push(port); return port })
  const first = assert.rejects(client.load(), (error) => error instanceof ContextError && error.kind === 'worker')
  ports[0].fail()
  await first
  const next = client.load()
  assert.equal(ports.length, 2)
  ports[1].reply({ type: 'ready', id: ports[1].sent[0].id, vocabulary })
  await next
  client.dispose()
  assert.ok(ports.every((port) => port.terminated))
  const late = new ContextWorkerClient('http://localhost:3001', () => new ControlledPort())
  const cancelled = assert.rejects(late.load(), (error) => error instanceof ContextError && error.kind === 'closed')
  late.dispose()
  await cancelled
})
