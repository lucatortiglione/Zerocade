import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chainSecret } from '@zerocade/shared'
import { createFiveLetters } from '../apps/overlay/src/games/fiveLetters.ts'
import { createChainReaction } from '../apps/overlay/src/games/chainReaction.ts'
import { loadWordleBank, parseChainBank } from '../apps/overlay/src/games/gameBanks.ts'
import { parseWordleData } from '../apps/overlay/src/games/wordleLogic.ts'
import type { RoomSecret } from '../apps/overlay/src/games/roomSecret.ts'

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function delayed<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }
function room() {
  const reports: string[] = []
  let adopt = (_word: string) => {}
  let detached = 0
  const secret: RoomSecret = { follow(listener) { adopt = listener.adopt; return () => { detached++ } }, report(word) { reports.push(word) } }
  return { secret, reports, adopt: (word: string) => adopt(word), detached: () => detached }
}

test('ZeroWordle disposal aborts its request and ignores a late result from a non-cooperating transport', async () => {
  const bank = delayed<ReturnType<typeof parseWordleData>>()
  const r = room()
  let signal!: AbortSignal
  const game = createFiveLetters(r.secret, async (_length, owned) => { signal = owned; return bank.promise })
  game.reset({}, 1080, 1920)
  game.dispose?.()
  assert.equal(signal.aborted, true)
  assert.equal(r.detached(), 1)
  bank.resolve(parseWordleData('gatto', 'gatto'))
  await settle()
  assert.deepEqual(r.reports, [])
})

test('ZeroWordle pauses a completed download; a newer room solution invalidates an older download', async () => {
  const r = room()
  const requests: { length: number; signal: AbortSignal; bank: ReturnType<typeof delayed<ReturnType<typeof parseWordleData>>> }[] = []
  const game = createFiveLetters(r.secret, (length, signal) => {
    const bank = delayed<ReturnType<typeof parseWordleData>>(); requests.push({ length, signal, bank }); return bank.promise
  })
  game.reset({}, 1080, 1920)
  r.adopt('mentre')
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(requests[1].length, 6)
  requests[0].bank.resolve(parseWordleData('gatto', 'gatto'))
  requests[1].bank.resolve(parseWordleData('mentre', 'mentre'))
  await settle()
  assert.deepEqual(r.reports, [], 'neither a stale local secret nor an adopted secret is published')
  game.reset({}, 1080, 1920)
  game.setPaused?.(true)
  requests[2].bank.resolve(parseWordleData('gatto', 'gatto'))
  await settle()
  assert.deepEqual(r.reports, [])
  game.setPaused?.(false)
  assert.deepEqual(r.reports, ['gatto'])
  game.dispose?.()
})

test('Catene owns its request and accepts a forced round while an older bank is still loading', async () => {
  const bank = delayed<string[][]>()
  const r = room()
  let signal!: AbortSignal
  const game = createChainReaction(r.secret, async (_kind, owned) => { signal = owned; return bank.promise })
  game.reset({ chainMode: 'catena' }, 1080, 1920)
  r.adopt(chainSecret({ mode: 'catena', round: 4, words: ['mare', 'onda', 'spiaggia'] }))
  assert.equal(signal.aborted, true)
  bank.resolve([['gatto', 'cane', 'animale', 'coda', 'pelo']])
  await settle()
  assert.deepEqual(r.reports, [])
  game.dispose?.()
  assert.equal(r.detached(), 1)
})

test('a pending room secret cannot award points for the previous ZeroWordle solution', async () => {
  const r = room()
  const next = delayed<ReturnType<typeof parseWordleData>>()
  const game = createFiveLetters(r.secret, async (length) => length === 5 ? parseWordleData('gatto', 'gatto') : next.promise)
  game.reset({}, 1080, 1920)
  await settle()
  r.adopt('mentre')
  game.onAction('guess', { type: 'comment', user: { id: 'stale', nickname: 'Obsoleto' }, text: 'gatto' }, 0)
  next.resolve(parseWordleData('mentre', 'mentre'))
  await settle()
  const texts: string[] = []
  const canvas = new Proxy({ fillText(text: string) { texts.push(text) }, measureText(text: string) { return { width: text.length * 10 } },
    createLinearGradient() { return { addColorStop() {} } } }, { get(target, key) { return key in target ? Reflect.get(target, key) : () => {} } }) as unknown as CanvasRenderingContext2D
  game.draw(canvas, 0)
  assert.doesNotMatch(texts.join(' '), /Obsoleto/)
  game.dispose?.()
})

test('Catene falls back to a chain when the keyword bank is valid but empty', async () => {
  const r = room()
  const calls: string[] = []
  const game = createChainReaction(r.secret, async (kind) => { calls.push(kind); return kind === 'keys' ? [] : [['mare', 'onda', 'spiaggia', 'sabbia', 'sole', 'estate']] })
  game.reset({ chainMode: 'chiave' }, 1080, 1920)
  await settle()
  assert.deepEqual(calls, ['keys', 'walks'])
  assert.equal(r.reports.length, 1)
  game.dispose?.()
})

test('Catene and ZeroWordle have a finite retry budget, with no download per animation frame', async (t) => {
  t.mock.method(console, 'warn', () => {})
  let now = 0
  t.mock.method(performance, 'now', () => now)
  for (const make of [createFiveLetters, createChainReaction]) {
    let calls = 0
    const r = room()
    const game = make(r.secret, async () => { calls++; throw new Error('offline') })
    game.reset({}, 1080, 1920)
    await settle()
    for (let i = 0; i < 5; i++) {
      for (let frame = 0; frame < 30; frame++) game.update(0, now, {})
      await settle()
      now += 11_000
      game.update(0, now, {})
      await settle()
    }
    assert.equal(calls, 3)
    game.dispose?.()
  }
})

test('banks reject malformed shapes, invalid word lengths and oversized responses before use', async (t) => {
  assert.throws(() => parseChainBank({ words: [] }), /non valida/)
  assert.throws(() => parseChainBank([['mare', 1, 'onda']]), /non valida/)
  assert.throws(() => parseChainBank([['mare', 'mare', 'onda']]), /duplicate/)
  assert.deepEqual(parseChainBank([['mare', 'onda', 'spiaggia']]), [['mare', 'onda', 'spiaggia']])
  t.mock.method(globalThis, 'fetch', async () => new Response('casa\n'))
  await assert.rejects(loadWordleBank(5, new AbortController().signal), /non valida/)
  t.mock.method(globalThis, 'fetch', async () => new Response('small', { headers: { 'content-length': '99999999' } }))
  await assert.rejects(loadWordleBank(5, new AbortController().signal), /limite/)
})
