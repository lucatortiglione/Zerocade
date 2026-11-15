import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContext } from '../apps/overlay/src/games/context.ts'
import { Engine } from '../apps/overlay/src/games/engine.ts'
import { parseContextData, rankAgainst, type ContextData, type Ranking } from '../apps/overlay/src/games/contextRanking.ts'
import type { ContextComputer } from '../apps/overlay/src/games/contextProtocol.ts'
import { inlineContextComputer, settleContext } from './helpers/inlineContextComputer.ts'
import { ContextError } from '@zerocade/shared'

const cat = parseContextData('gatto\ngatti\nmare\n', new Int8Array([100, 0, 95, 30, 0, 100]).buffer, 'gatto\n')
const sea = parseContextData('mare\nonda\n', new Int8Array([100, 0, 95, 30]).buffer, 'mare\n')
const settings = { finderPoints: 100, startHintOn: false, showLeaderboard: true }
const guess = { type: 'comment' as const, text: 'gatti', user: { id: 'tester', nickname: 'Tester' } }

class ControlledComputer implements ContextComputer {
  closed = false
  loads = 0
  private ready!: (data: ContextData) => void
  private loading = new Promise<ContextData>((done) => { this.ready = done })
  ranks: { secret: number; finish(value: Ranking): void }[] = []
  load() { this.loads++; return this.loading }
  rank(secret: number) { return new Promise<Ranking>((finish) => this.ranks.push({ secret, finish })) }
  dispose() { this.closed = true }
  completeLoad(data = cat) { this.ready(data) }
  completeRank(data = cat, at = 0) { const request = this.ranks[at]; request.finish(rankAgainst(data, request.secret)) }
}

function screen(game: ReturnType<typeof createContext>) {
  const texts: string[] = []
  const canvas = new Proxy({ canvas: { width: 1080, height: 1920 }, font: '',
    fillText: (text: string) => texts.push(text), measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  return { canvas, draw: () => { texts.length = 0; game.draw(canvas, performance.now()); return texts.join('\n') } }
}

test('reset invalidates an executing old round; a queued winning plural applies once only to the new round', async () => {
  const clients: ControlledComputer[] = []
  const game = createContext(() => { const client = new ControlledComputer(); clients.push(client); return client })
  const view = screen(game)
  game.reset(settings, 1080, 1920)
  clients[0].completeLoad(sea)
  await settleContext()
  assert.equal(clients[0].ranks.length, 1)
  game.reset(settings, 1080, 1920)
  assert.ok(clients[0].closed)
  game.onAction('guess', guess, 0)
  clients[0].completeRank(sea)
  await settleContext()
  assert.doesNotMatch(view.draw(), /ha trovato|100 pt/)
  clients[1].completeLoad()
  await settleContext()
  clients[1].completeRank()
  await settleContext()
  assert.match(view.draw(), /Tester ha trovato: gatto/)
  assert.match(view.draw(), /100 pt/)
  assert.doesNotMatch(view.draw(), /200 pt/)
  game.dispose?.()
})

test('pause holds an asynchronous ranking and cancels pending actions; resuming cannot award old guesses', async () => {
  const client = new ControlledComputer()
  const game = createContext(() => client)
  const view = screen(game)
  game.reset(settings, 1080, 1920)
  client.completeLoad()
  await settleContext()
  game.onAction('guess', guess, 0)
  game.setPaused?.(true)
  client.completeRank()
  await settleContext()
  assert.match(view.draw(), /Preparo la classifica/)
  game.setPaused?.(false)
  game.update(0, performance.now(), settings)
  assert.match(view.draw(), /0 tentativi/)
  assert.doesNotMatch(view.draw(), /ha trovato|100 pt/)
  game.onAction('guess', guess, 0)
  assert.match(view.draw(), /Tester ha trovato: gatto/)
  game.dispose?.()
})

test('load attempts never fan out per frame; saturation fails visibly and restart owns a fresh worker', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const clients: ControlledComputer[] = []
  const game = createContext(() => { const client = new ControlledComputer(); clients.push(client); return client })
  const view = screen(game)
  game.reset(settings, 1080, 1920)
  for (let i = 0; i < 1000; i++) game.update(.01, performance.now(), settings)
  assert.equal(clients.length, 1)
  assert.equal(clients[0].loads, 1)
  for (let i = 0; i < 301; i++) game.onAction('guess', guess, 0)
  assert.match(view.draw(), /Troppi eventi in attesa/)
  assert.ok(clients[0].closed)
  clients[0].completeLoad()
  await settleContext()
  assert.equal(clients[0].ranks.length, 0)
  game.reset(settings, 1080, 1920)
  clients[1].completeLoad()
  await settleContext()
  clients[1].completeRank()
  await settleContext()
  game.onAction('guess', guess, 0)
  assert.match(view.draw(), /100 pt/)
  game.dispose?.()
})

test('creator finish received during computation precedes later guesses; disposal prevents late scoring', async () => {
  const client = new ControlledComputer()
  const game = createContext(() => client)
  const view = screen(game)
  game.reset(settings, 1080, 1920)
  client.completeLoad()
  await settleContext()
  game.onCommand?.('next-round')
  game.onAction('guess', guess, 0)
  client.completeRank()
  await settleContext()
  assert.match(view.draw(), /Round terminato: era gatto/)
  assert.doesNotMatch(view.draw(), /100 pt/)
  game.dispose?.()
  assert.ok(client.closed)
})

test('engine game switch and clear dispose ZeroContext; its engine queue never silently drops overflow', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const first = new ControlledComputer()
  const game = createContext(() => first)
  const view = screen(game)
  const engine = new Engine(view.canvas)
  engine.setGame(game, settings)
  for (let i = 0; i < 301; i++) engine.pushAction('guess', guess)
  assert.match(view.draw(), /Troppi eventi in attesa/)
  assert.ok(first.closed)
  const second = new ControlledComputer()
  const replacement = createContext(() => second)
  engine.setGame(replacement, settings)
  const third = new ControlledComputer()
  engine.setGame(createContext(() => third), settings)
  assert.ok(second.closed, 'a healthy replaced game is disposed before its successor starts')
  engine.clear()
  assert.ok(third.closed)
  const fourth = new ControlledComputer()
  engine.setGame(createContext(() => fourth), settings)
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.cancelAnimationFrame = () => {}
  try { engine.stop(); assert.ok(fourth.closed, 'unmount stops the owned worker') }
  finally { globalThis.cancelAnimationFrame = originalCancel }
  first.completeLoad()
  second.completeLoad()
  await settleContext()
  assert.equal(first.ranks.length, 0)
  assert.equal(second.ranks.length, 0)
})

test('starter words cannot reveal the secret or duplicate hints in a tiny vocabulary', async () => {
  const alone = parseContextData('mare\n', new Int8Array([100, 0]).buffer, 'mare\n')
  const game = createContext(() => inlineContextComputer(alone))
  game.reset({ ...settings, starterWords: true, startHintOn: true }, 1080, 1920)
  await settleContext()
  assert.match(screen(game).draw(), /0 tentativi/)
  assert.doesNotMatch(screen(game).draw(), /✨ aiuto/)
  game.dispose?.()
})

test('a newer room word replaces an executing round; the old ranking cannot publish a word or process guesses', async () => {
  const both = parseContextData(cat.words.join('\n'), cat.vectors.buffer, 'gatto\nmare\n')
  const client = new ControlledComputer()
  let adopt!: (word: string) => void
  let detached = false
  const reports: string[] = []
  const game = createContext(() => client, {
    follow(listener) { adopt = listener.adopt; return () => { detached = true } },
    report(word) { reports.push(word) },
  })
  game.reset(settings, 1080, 1920)
  adopt('gatto')
  client.completeLoad(both)
  await settleContext()
  adopt('mare')
  adopt('mare')
  assert.equal(client.ranks.length, 2, 'the same pending secret does not create another job')
  game.onAction('guess', { ...guess, text: 'mare' }, 0)
  client.completeRank(both, 0)
  await settleContext()
  assert.match(screen(game).draw(), /Preparo la classifica/)
  assert.deepEqual(reports, [])
  client.completeRank(both, 1)
  await settleContext()
  assert.match(screen(game).draw(), /Tester ha trovato: mare/)
  assert.match(screen(game).draw(), /100 pt/)
  assert.deepEqual(reports, [], 'adopting the existing room word never republishes it')
  game.dispose?.()
  assert.ok(detached)
})

test('a locally selected solution is published only after its ranking is ready', async () => {
  const client = new ControlledComputer()
  const reports: { word: string; prev: string | null }[] = []
  const game = createContext(() => client, {
    follow() { return () => {} }, report(word, prev) { reports.push({ word, prev }) },
  })
  game.reset(settings, 1080, 1920)
  client.completeLoad()
  await settleContext()
  assert.deepEqual(reports, [])
  client.completeRank()
  await settleContext()
  assert.deepEqual(reports, [{ word: 'gatto', prev: null }])
  game.dispose?.()
})

test('the end of a round reveals its word once, found or ended by the creator', async (t) => {
  for (const end of ['found', 'next-round'] as const) {
    await t.test(end, async () => {
      const client = new ControlledComputer()
      const revealed: string[] = []
      const game = createContext(() => client, {
        follow() { return () => {} }, report() {}, reveal(word) { revealed.push(word) },
      })
      game.reset(settings, 1080, 1920)
      client.completeLoad()
      await settleContext()
      client.completeRank()
      await settleContext()
      game.onAction('guess', { ...guess, text: 'mare' }, 0)
      assert.deepEqual(revealed, [], 'a guess that is not the word does not end the round')
      if (end === 'found') game.onAction('guess', guess, 0)
      else game.onCommand?.('next-round')
      assert.deepEqual(revealed, ['gatto'])
      // During the pause the round is over: nothing ends it again.
      game.onAction('guess', { ...guess, text: 'gatto' }, 0)
      game.onCommand?.('next-round')
      assert.deepEqual(revealed, ['gatto'])
      game.dispose?.()
    })
  }
})

test('network load failures have a finite retry budget; invalid data does not enter a retry loop', async (t) => {
  t.mock.method(console, 'warn', () => {})
  let clock = 0
  t.mock.method(performance, 'now', () => clock)
  let attempts = 0
  const game = createContext(() => ({
    async load() { attempts++; throw new ContextError('network', 'offline') },
    async rank() { throw new Error('must not rank') }, dispose() {},
  }))
  game.reset(settings, 1080, 1920)
  for (let i = 0; i < 8; i++) {
    await settleContext()
    clock += 11000
    game.update(.01, clock, settings)
  }
  assert.equal(attempts, 3)
  assert.match(screen(game).draw(), /Riavvia dopo averli verificati/)
  game.dispose?.()
  let invalidAttempts = 0
  const invalid = createContext(() => ({
    async load() { invalidAttempts++; throw new ContextError('data', 'bad data') },
    async rank() { throw new Error('must not rank') }, dispose() {},
  }))
  invalid.reset(settings, 1080, 1920)
  await settleContext()
  for (let i = 0; i < 100; i++) { clock += 11000; invalid.update(.01, clock, settings) }
  assert.equal(invalidAttempts, 1)
  invalid.dispose?.()
})
