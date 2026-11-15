import assert from 'node:assert/strict'
import { test } from 'node:test'

// content.ts keeps its state in the module, so each case loads a fresh copy.
const fresh = () => import(`../apps/overlay/src/content.ts?case=${Math.random()}`)

const realFetch = globalThis.fetch
const withFetch = async (impl: typeof fetch, run: () => Promise<void>) => {
  globalThis.fetch = impl
  try {
    await run()
  } finally {
    globalThis.fetch = realFetch
  }
}

test('content is loaded once and readable', async () => {
  let calls = 0
  await withFetch((async () => (++calls, new Response(JSON.stringify({ quiz: ['a', 'b'] })))) as unknown as typeof fetch, async () => {
    const c = await fresh()
    assert.equal(c.isContentReady(), false)
    await Promise.all([c.loadContent(1), c.loadContent(1)])
    assert.equal(c.isContentReady(), true)
    assert.deepEqual(c.wordsFor('quiz'), ['a', 'b'])
    assert.equal(calls, 1)
  })
})

test('a server that fails at first is asked again and the content arrives', async () => {
  let calls = 0
  await withFetch((async () => {
    if (++calls < 3) return new Response('down', { status: 503 })
    return new Response(JSON.stringify({ quiz: ['x'] }))
  }) as unknown as typeof fetch, async () => {
    const c = await fresh()
    await c.loadContent(1)
    assert.equal(calls, 3)
    assert.deepEqual(c.wordsFor('quiz'), ['x'])
  })
})

test('after the attempts the games start with no content instead of waiting forever', async () => {
  let calls = 0
  await withFetch((async () => {
    ++calls
    throw new Error('network down')
  }) as unknown as typeof fetch, async () => {
    const c = await fresh()
    await c.loadContent(1)
    assert.equal(calls, 3)
    assert.equal(c.isContentReady(), true)
    assert.deepEqual(c.wordsFor('quiz'), [])
  })
})

test('oversized and malformed banks never enter game state', async () => {
  for (const answer of [() => new Response('small', { headers: { 'content-length': '99999999' } }), () => new Response('{"quiz":{}}')]) {
    let calls = 0
    await withFetch(async () => { calls++; return answer() }, async () => {
      const c = await fresh()
      await c.loadContent(1)
      assert.equal(calls, 3)
      assert.deepEqual(c.wordsFor('quiz'), [])
    })
  }
})

test('one failing subscriber cannot turn a successful bank load into a failed request for all games', async (t) => {
  t.mock.method(console, 'warn', () => {})
  await withFetch(async () => new Response('{"quiz":["x"]}'), async () => {
    const c = await fresh()
    let notified = false
    c.subscribeContent(() => { throw new Error('render failure') })
    c.subscribeContent(() => { notified = true })
    await c.loadContent(1)
    assert.equal(notified, true)
    assert.deepEqual(c.wordsFor('quiz'), ['x'])
  })
})
