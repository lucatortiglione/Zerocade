import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { Engine, ENGINE_LIMITS, type GameInstance } from '../apps/overlay/src/games/engine.ts'

function harness(t: TestContext) {
  let next = 0
  const frames = new Map<number, FrameRequestCallback>()
  const messages: string[] = []
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => { frames.set(++next, callback); return next }
  globalThis.cancelAnimationFrame = (id: number) => { frames.delete(id) }
  t.mock.method(console, 'warn', () => {})
  const canvas = { canvas: { width: 1080, height: 1920 }, clearRect() {}, fillText(text: string) { messages.push(text) } } as unknown as CanvasRenderingContext2D
  let received = 0, disposed = 0
  const instance: GameInstance = { reset() {}, update() {}, draw() {}, onAction() { received++ }, dispose() { disposed++ } }
  const engine = new Engine(canvas)
  engine.setGame(instance, {})
  engine.start()
  const tick = () => {
    const entry = frames.entries().next().value
    assert.ok(entry)
    frames.delete(entry[0]); entry[1](performance.now())
  }
  t.after(() => { engine.stop(); globalThis.requestAnimationFrame = originalRequest; globalThis.cancelAnimationFrame = originalCancel })
  return { engine, instance, frames, messages, tick, received: () => received, disposed: () => disposed }
}

const comment = (id = 'user', text = 'casa') => ({ type: 'comment' as const, user: { id, nickname: id }, text })

test('all canvas games stop explicitly at queue saturation instead of losing older actions', (t) => {
  const h = harness(t)
  for (let i = 0; i <= ENGINE_LIMITS.actions; i++) h.engine.pushAction('guess', comment())
  h.tick()
  assert.equal(h.received(), 0)
  assert.equal(h.disposed(), 1)
  assert.match(h.messages.join(' '), /Troppi eventi/)
})

test('byte budget and command capacity apply before an event is retained', (t) => {
  const h = harness(t)
  h.engine.pushAction('guess', comment('user', 'x'.repeat(ENGINE_LIMITS.bytes)))
  h.tick()
  assert.match(h.messages.join(' '), /Troppi eventi/)
  h.engine.setGame(h.instance, {})
  for (let i = 0; i <= ENGINE_LIMITS.commands; i++) h.engine.pushCommand('next-round')
  h.tick()
  assert.equal(h.received(), 0)
  assert.equal(h.disposed(), 2)
})

test('a failing game is disposed once; a replacement and the animation loop still work', (t) => {
  const h = harness(t)
  h.instance.onAction = () => { throw new Error('game failure') }
  h.engine.pushAction('guess', comment())
  h.tick(); h.tick()
  assert.equal(h.disposed(), 1)
  assert.match(h.messages.join(' '), /interrotto/)
  let received = 0
  h.engine.setGame({ reset() {}, update() {}, draw() {}, onAction() { received++ } }, {})
  h.engine.start()
  assert.equal(h.frames.size, 1, 'start is idempotent')
  h.engine.pushAction('guess', comment()); h.tick()
  assert.equal(received, 1)
  h.engine.stop()
  assert.equal(h.frames.size, 0)
})

test('changing games within a callback cannot deliver the previous frame to its successor', (t) => {
  const h = harness(t)
  let successorActions = 0
  h.instance.onAction = () => h.engine.setGame({ reset() {}, update() {}, draw() {}, onAction() { successorActions++ } }, {})
  h.engine.pushAction('guess', comment()); h.engine.pushAction('guess', comment())
  h.tick()
  assert.equal(successorActions, 0)
})

test('participant storage is bounded even when no round ends and the queue is drained each frame', (t) => {
  const h = harness(t)
  for (let i = 0; i <= ENGINE_LIMITS.players; i++) { h.engine.pushAction('guess', comment(String(i))); h.tick() }
  assert.equal(h.received(), ENGINE_LIMITS.players)
  assert.equal(h.disposed(), 1)
  assert.match(h.messages.join(' '), /limite dei partecipanti/)
})
