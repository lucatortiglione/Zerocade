import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BodyLimitError, readBoundedBytes, payloadBytes } from '../packages/shared/src/index.ts'
import { apiFetch, UnconfirmedRequestError } from '../packages/browser-runtime/src/http.ts'
import { frameNotifications } from '../packages/browser-runtime/src/frameNotifications.ts'
import { localAccess } from '../apps/server/src/localAccess.ts'
import { parseFeed } from '../apps/server/src/nasa.ts'
import { toCsv } from '../apps/server/src/csv.ts'
import { sanitizeBridgeConfig, sanitizeEvent, sanitizeScene, sanitizeSourceConfig } from '../apps/server/src/validate.ts'

test('body limits apply cumulatively without Content-Length and release streams on overflow', async () => {
  let cancelled = false
  let sent = 0
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { sent++; controller.enqueue(new Uint8Array([0x61])); },
    cancel() { cancelled = true },
  }))
  await assert.rejects(readBoundedBytes(response, 4096), BodyLimitError)
  assert.equal(cancelled, true)
  assert.ok(sent < 4100)
  const utf8 = new TextEncoder().encode('è🙂'.repeat(1000))
  const exact = await readBoundedBytes(new Response(utf8), utf8.byteLength)
  assert.deepEqual(exact, utf8)
  assert.equal(exact.buffer.byteLength, exact.byteLength, 'returned buffer must not retain spare capacity')
  await assert.rejects(readBoundedBytes(new Response('a', { headers: { 'content-length': '10000' } }), 16), BodyLimitError)
})

test('HTTP writes are never replayed after loss of confirmation; cancelled reads cannot return stale results', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('lost after send') })
  await assert.rejects(apiFetch('/api/pads/room', { method: 'POST' }), (error) => error instanceof UnconfirmedRequestError && error.outcome === 'unknown')
  assert.equal(calls, 1)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(apiFetch('/api/pads/room', { method: 'POST', signal: controller.signal }),
    (error) => error instanceof UnconfirmedRequestError && error.outcome === 'not-started')
  assert.equal(calls, 1)
})

test('an obsolete HTTP reply is rejected even when a test transport ignores abort', async (t) => {
  let answer!: (response: Response) => void
  t.mock.method(globalThis, 'fetch', async () => new Promise<Response>((resolve) => { answer = resolve }))
  const controller = new AbortController()
  const fetching = apiFetch('/api/feed', { signal: controller.signal })
  const rejected = assert.rejects(fetching)
  controller.abort()
  answer(new Response('{}'))
  await rejected
})

test('render notifications coalesce but state keeps all 1000 incoming updates; cancellation clears the frame', () => {
  const scheduled: FrameRequestCallback[] = []
  let value = 0
  const rendered: number[] = []
  const notifications = frameNotifications(() => rendered.push(value), (callback) => { scheduled.push(callback); return scheduled.length }, () => {})
  for (let i = 0; i < 1000; i++) { value++; notifications.notify() }
  assert.equal(scheduled.length, 1)
  scheduled[0](0)
  assert.deepEqual(rendered, [1000])
  notifications.notify()
  notifications.cancel()
  notifications.notify()
  assert.equal(scheduled.length, 3)
})

test('local endpoints accept configured browsers and reject cross-site origins and rebinding names', () => {
  assert.ok(localAccess('localhost:3001', 'http://localhost:5173', 3001))
  assert.ok(localAccess('zerocade.test:3001', 'http://zerocade.test:3001', 3001))
  assert.ok(localAccess('127.0.0.1:3001', undefined, 3001))
  for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example:3001', 'http://localhost:3001/path', 'file:///', 'javascript:alert(1)'])
    assert.equal(localAccess('localhost:3001', origin, 3001), false, origin)
  assert.equal(localAccess('evil.example', undefined, 3001), false)
})

test('JSON boundaries reject malformed widgets; arbitrary JSON inputs do not throw or escape limits', () => {
  assert.equal(sanitizeScene(JSON.parse('{"widgets":{"__proto__":true}}')), null)
  assert.equal(sanitizeScene({ widgets: { unknown: true } }), null)
  let seed = 7
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  for (let i = 0; i < 2000; i++) {
    const values = [null, [], random(), String(random()), { widgets: { alerts: Boolean(random() % 2) } },
      { type: 'comment', user: { id: 'a', nickname: 'è'.repeat(random() % 100) }, text: 'x'.repeat(random() % 400) }]
    const value = values[random() % values.length]
    for (const sanitize of [sanitizeEvent, sanitizeScene, sanitizeSourceConfig, sanitizeBridgeConfig]) assert.doesNotThrow(() => sanitize(value))
    const event = sanitizeEvent(value)
    if (event?.type === 'comment') assert.ok(event.text.length <= 140 && event.user.nickname.length <= 32)
  }
  const cyclic: { self?: unknown } = {}; cyclic.self = cyclic
  assert.ok(payloadBytes(cyclic) < 1000)
  assert.ok(payloadBytes('è'.repeat(1000)) >= 2000)
})

test('queue budgets count binary backing stores, maps and sets before cloning', () => {
  const buffer = new ArrayBuffer(32_768)
  assert.ok(payloadBytes(buffer, 1024) > 1024)
  const weight = payloadBytes({ a: new Uint8Array(buffer, 0, 1), b: new DataView(buffer) })
  assert.ok(weight >= buffer.byteLength)
  assert.ok(weight < buffer.byteLength + 512, 'shared backing stores count once')
  assert.ok(payloadBytes(new Map([['key', 'x'.repeat(2000)]]), 512) > 512)
  assert.ok(payloadBytes(new Set(['x'.repeat(2000)]), 512) > 512)
  let reads = 0
  const wide = {}
  for (let i = 0; i < 1000; i++) Object.defineProperty(wide, String(i), { enumerable: true, get() { reads++; return 'value' } })
  assert.ok(payloadBytes(wide, 512) > 512)
  assert.ok(reads < 20, 'stop before visiting every property of a wide object')
})

test('external image metadata is bounded and malformed code points cannot crash parsing; CSV cannot start a formula', () => {
  const item = '<item><enclosure url="https://www.nasa.gov/a.jpg" type="image/jpeg"/><title>&#99999999999999999;</title><link>javascript:alert(1)</link></item>'
  const parsed = parseFeed(item.repeat(1000))
  assert.equal(parsed.length, 100)
  assert.equal(parsed[0].link, 'https://www.nasa.gov/image-of-the-day/')
  const csv = toCsv([['=1+1', ' @SUM(1)', -5, 'normal']])
  assert.ok(csv.includes("'=1+1"))
  assert.ok(csv.includes("' @SUM(1)"))
  assert.ok(csv.includes(',-5,normal'))
  assert.throws(() => toCsv(Array.from({ length: 50_001 }, () => ['small'])), /50.000/)
  assert.throws(() => toCsv([['x'.repeat(9 * 1024 * 1024)]]), /16 MiB/)
})
