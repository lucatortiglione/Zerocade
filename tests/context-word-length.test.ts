import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GAMES, defaultSettings, type GameSettings, type LiveEvent } from '@zerocade/shared'
import { sanitizeSettings } from '../apps/server/src/validate.ts'
import { createContext } from '../apps/overlay/src/games/context.ts'
import type { GameInstance } from '../apps/overlay/src/games/engine.ts'
import { parseContextData } from '../apps/overlay/src/games/contextRanking.ts'
import { inlineContextComputer, settleContext } from './helpers/inlineContextComputer.ts'

const base = { roundCheer: false, closestPoints: 'none' }
const gift: LiveEvent = { type: 'gift', giftId: 'rose', count: 1, user: { id: 'a', nickname: 'Anna' } }

function gameFor(secret = 'mare') {
  const data = parseContextData('mare\nonda\nsabbia\n', new Int8Array([100, 0, 95, 30, 60, 80]).buffer, `${secret}\n`)
  return createContext(() => inlineContextComputer(data), { follow: () => () => {}, report() {}, reveal() {} })
}

function screen(game: GameInstance) {
  const texts: string[] = []
  const tiles: number[][] = []
  const letters: string[] = []
  const canvas = new Proxy({
    canvas: { width: 1080, height: 1920 }, font: '',
    fillText: (text: string, _x: number, y: number) => {
      texts.push(text)
      if (y >= 140 && y < 220 && text.length === 1) letters.push(text)
    },
    roundRect: (x: number, y: number, width: number, height: number) => {
      if (y >= 140 && y < 220 && height > 40) tiles.push([x, y, width, height])
    },
    measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  return () => {
    texts.length = 0
    tiles.length = 0
    letters.length = 0
    game.draw(canvas, performance.now())
    return { texts: [...texts], tiles: [...tiles], letters: [...letters] }
  }
}

test('the dashboard toggle defaults to visible and the server accepts both boolean values', () => {
  const settings = defaultSettings(GAMES.find((g) => g.id === 'context')!.settings)
  assert.equal(settings.showWordLength, true)
  for (const showWordLength of [false, true]) {
    assert.equal(sanitizeSettings('context', { ...settings, showWordLength })?.showWordLength, showWordLength)
  }
  assert.equal(sanitizeSettings('context', { ...settings, showWordLength: 'false' }), null)
})

test('length changes immediately without resetting guesses, and ending the round reveals the solution', async (t) => {
  const game = gameFor()
  t.after(() => game.dispose?.())
  game.reset(base, 1080, 1920)
  await settleContext()
  const draw = screen(game)
  assert.equal(draw().tiles.length, 4)
  game.onAction('guess', { type: 'comment', text: 'onda', user: gift.user }, 0)
  game.setSettings!({ ...base, showWordLength: false })
  assert.equal(draw().tiles.length, 0)
  assert.ok(draw().texts.includes('PAROLA SEGRETA'))
  assert.ok(draw().texts.includes('onda'))
  assert.ok(draw().texts.includes('1 tentativi'))
  game.setSettings!({ ...base, showWordLength: true })
  assert.equal(draw().tiles.length, 4)
  assert.ok(draw().texts.includes('1 tentativi'))
  game.setSettings!({ ...base, showWordLength: false })
  game.onCommand!('next-round')
  assert.equal(draw().tiles.length, 4)
  assert.equal(draw().letters.join(''), 'MARE')
})

test('a winning guess reveals the complete word and scores even when its length was hidden', async (t) => {
  const game = gameFor()
  t.after(() => game.dispose?.())
  game.reset({ ...base, showWordLength: false }, 1080, 1920)
  await settleContext()
  const draw = screen(game)
  assert.equal(draw().tiles.length, 0)
  game.onAction('guess', { type: 'comment', text: 'mare', user: gift.user }, 0)
  const found = draw()
  assert.equal(found.letters.join(''), 'MARE')
  assert.equal(found.tiles.length, 4)
  assert.ok(found.texts.includes('100 pt'))
})

test('hidden length displays only known hint letters and the master switch hides those too', async (t) => {
  const game = gameFor()
  t.after(() => game.dispose?.())
  const settings: GameSettings = { ...base, showWordLength: false }
  game.reset(settings, 1080, 1920)
  await settleContext()
  const draw = screen(game)
  game.onAction('small_hint', gift, 0)
  assert.equal(draw().tiles.length, 1)
  assert.ok(draw().texts.includes('M'))
  assert.ok(draw().texts.includes('…'))
  game.setSettings!({ ...settings, showWordLength: true, disableAllHints: true })
  assert.equal(draw().tiles.length, 0)
  assert.ok(!draw().texts.includes('M'))
  game.setSettings!({ ...settings, showWordLength: true, disableAllHints: false })
  assert.equal(draw().tiles.length, 4)
})

test('hidden words of different lengths produce identical text and tile geometry', async (t) => {
  const pictures = []
  for (const secret of ['mare', 'sabbia']) {
    const game = gameFor(secret)
    t.after(() => game.dispose?.())
    game.reset({ ...base, showWordLength: false }, 1080, 1920)
    await settleContext()
    pictures.push(screen(game)())
  }
  assert.deepEqual(pictures[0], pictures[1])
})
