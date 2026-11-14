import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContext } from '../apps/overlay/src/games/context.ts'
import { Engine, type GameInstance } from '../apps/overlay/src/games/engine.ts'
import type { GameSettings, LiveEvent } from '../packages/shared/src/index.ts'
import { parseContextData } from '../apps/overlay/src/games/contextRanking.ts'
import { inlineContextComputer, settleContext } from './helpers/inlineContextComputer.ts'

const gift: LiveEvent = { type: 'gift', giftId: 'rose', count: 1, user: { id: 'a', nickname: 'Anna' } }
const settings: GameSettings = {
  autoHints: true, autoHintSeconds: 1, startHintOn: true, startHint: 3,
  starterWords: true, hintClosest: 2, showLeaderboard: true, roundCheer: false,
}

const fixture = parseContextData('proprieta\nproprietà\nmare\nonda\nsabbia\ncittà\nbarca\npesce\ncolombo\nspiaggia\n',
  new Int8Array([
      95, 30, 100, 0, 50, 80, 80, 50, 30, 90, -100, 0, 10, 90, 70, 60, 60, 70, 20, 80,
  ]).buffer, 'proprietà\n')
const context = () => createContext(() => inlineContextComputer(fixture))

function screen(game: GameInstance) {
  const texts: string[] = []
  const canvas = new Proxy({
    canvas: { width: 1080, height: 1920 }, font: '',
    fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  return { canvas, draw: () => { texts.length = 0; game.draw(canvas, performance.now()); return texts } }
}

test('master off for help: no initial words, automatic hints, rose hints or revealed letters; guesses still score', async () => {
  const game = context()
  const blocked = { ...settings, disableAllHints: true }
  game.reset(blocked, 1080, 1920)
  await settleContext()
  const view = screen(game)
  assert.ok(view.draw().includes('0 tentativi'))
  game.onAction('reveal_closer', gift, 0)
  game.onAction('small_hint', gift, 0)
  game.update(5, performance.now(), blocked)
  const empty = view.draw()
  assert.ok(empty.includes('0 tentativi'))
  assert.ok(!empty.includes('✨ aiuto'))
  assert.ok(!empty.includes('P'))
  game.onAction('guess', { type: 'comment', text: 'proprieta', user: gift.user }, 0)
  assert.match(view.draw().join('\n'), /Anna ha trovato: proprietà/)
  assert.match(view.draw().join('\n'), /100 pt/)
  game.dispose?.()
})

test('enabling the block during a round hides old hints and letters but preserves player guesses', async () => {
  const game = context()
  game.reset(settings, 1080, 1920)
  await settleContext()
  const view = screen(game)
  assert.ok(view.draw().includes('✨ aiuto'))
  game.onAction('small_hint', gift, 0)
  assert.ok(view.draw().includes('P'))
  game.onAction('guess', { type: 'comment', text: 'mare', user: gift.user }, 0)
  game.setSettings!({ ...settings, disableAllHints: true })
  const blocked = view.draw()
  assert.ok(!blocked.includes('✨ aiuto'))
  assert.ok(!blocked.includes('P'))
  assert.ok(blocked.includes('mare'))
  assert.ok(blocked.includes('Anna'))
  assert.ok(blocked.includes('1 tentativi'))
  game.setSettings!({ ...settings, disableAllHints: false })
  game.onAction('small_hint', gift, 0)
  assert.ok(view.draw().includes('P'))
  game.dispose?.()
})

test('a queued rose cannot reveal a word in the frame after the creator disables help', async () => {
  const game = context()
  const view = screen(game)
  const engine = new Engine(view.canvas)
  engine.setGame(game, { ...settings, starterWords: false, startHintOn: false })
  await settleContext()
  engine.pushAction('reveal_closer', gift)
  engine.setSettings({ ...settings, disableAllHints: true })
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let frame: FrameRequestCallback | undefined
  globalThis.requestAnimationFrame = (callback) => { frame = callback; return 1 }
  globalThis.cancelAnimationFrame = () => {}
  try {
    engine.start()
    frame!(performance.now())
    assert.ok(view.draw().includes('0 tentativi'))
    assert.ok(!view.draw().includes('✨ aiuto'))
  } finally {
    engine.stop()
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancel
  }
})
