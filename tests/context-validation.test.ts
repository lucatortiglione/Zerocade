import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTEXT_LIMITS, ContextError } from '@zerocade/shared'
import { loadContextData } from '../apps/overlay/src/games/contextLoader.ts'
import { lookup, parseContextData, rankAgainst } from '../apps/overlay/src/games/contextRanking.ts'

const binary = new Int8Array([100, 0, 0, 100]).buffer
const data = parseContextData('mare\nonda\n', binary, 'mare\n')
test('malformed, oversized or ambiguous data is rejected before a ranking can be used', () => {
  for (const vocab of ['', 'mare\nmare\n', 'mare\nma re\n', 'mare\n<script>\n']) assert.throws(() => parseContextData(vocab, binary, 'mare'), ContextError)
  assert.throws(() => parseContextData('mare\nonda', new ArrayBuffer(3), 'mare'), /does not match/)
  assert.throws(() => parseContextData('mare\nonda', binary, 'nonpresente'), /Nessuna soluzione/)
  for (const links of [[], true, { boost: Infinity, links: {} }, { boost: 1, links: [] }, { boost: 1, links: { '0': new Array(4097).fill(1) } }])
    assert.throws(() => parseContextData('mare\nonda', binary, 'mare', links), ContextError)
  for (const secret of [-1, 2, NaN, .5]) assert.throws(() => rankAgainst(data, secret), ContextError)
  assert.throws(() => parseContextData('mare\n'.repeat(200001), binary, 'mare'), /Troppe parole/)
})

test('only a single word is a guess; punctuation around it and accents still work', () => {
  for (const guess of ['ma re', 'm.a.r.e', 'mare onda', 'ma💙re', 'ämare', '1mare', 'mare2', 'x'.repeat(1_000_000)]) assert.equal(lookup(data, guess, 0), -1)
  for (const guess of ['MARE!', ' mare ', '🌊 mare!!']) assert.equal(lookup(data, guess, 0), 0)
})

test('loader bounds a cumulative response without Content-Length, cancels it and distinguishes missing links from failure', async () => {
  let cancelled = false
  let chunks = 0
  const overflow: typeof fetch = async () => new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(8192)) },
    cancel() { cancelled = true },
  }))
  await assert.rejects(loadContextData('http://localhost:3001', new AbortController().signal, overflow), (error) => error instanceof ContextError && error.kind === 'data')
  assert.ok(cancelled)
  assert.ok(chunks <= CONTEXT_LIMITS.vocab / 8192 + 2)
  const responses: typeof fetch = async (input) => {
    const file = String(input).split('/').at(-1)
    if (file === 'vocab.txt') return new Response('mare\nonda\n')
    if (file === 'secrets.txt') return new Response('mare\n')
    if (file === 'vectors.bin') return new Response(binary)
    return new Response(null, { status: 404 })
  }
  const loaded = await loadContextData('http://localhost:3001', new AbortController().signal, responses)
  assert.equal(loaded.words.length, 2)
  assert.equal(loaded.linkBoost, 0)
  const failed: typeof fetch = async (input, init) => String(input).endsWith('links.json') ? new Response(null, { status: 503 }) : responses(input, init)
  await assert.rejects(loadContextData('http://localhost:3001', new AbortController().signal, failed), (error) => error instanceof ContextError && error.kind === 'network')
  const invalid: typeof fetch = async () => new Response(new Uint8Array([0xff, 0xfe]))
  await assert.rejects(loadContextData('http://localhost:3001', new AbortController().signal, invalid), (error) => error instanceof ContextError && error.kind === 'data')
})

test('a transport that ignores cancellation cannot revive an obsolete load', async () => {
  const controller = new AbortController()
  let resolve!: (response: Response) => void
  const fetchFn: typeof fetch = async () => new Promise<Response>((done) => { resolve = done })
  const loading = loadContextData('http://localhost:3001', controller.signal, fetchFn)
  controller.abort()
  resolve(new Response('mare\nonda\n'))
  await assert.rejects(loading, (error) => error instanceof ContextError && error.kind === 'closed')
})

test('a corpus changed between HTTP files is rejected instead of mixing generations', async () => {
  const responses: typeof fetch = async (input) => {
    const first = String(input).endsWith('vocab.txt')
    return new Response(first ? 'mare\nonda\n' : 'mare\n', {
      headers: { 'x-zerocontext-revision': first ? 'old' : 'new' },
    })
  }
  await assert.rejects(loadContextData('http://localhost:3001', new AbortController().signal, responses),
    (error) => error instanceof ContextError && error.kind === 'network' && /cambiato/.test(error.message))
})
