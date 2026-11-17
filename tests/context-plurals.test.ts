import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lookup, parseContextData, rankAgainst } from '../apps/overlay/src/games/contextRanking.ts'
import { inlineContextComputer, settleContext } from './helpers/inlineContextComputer.ts'

test('regular and irregular plurals find a singular secret, even without their own vector', () => {
  const pairs = [
    ['gatto', 'gatti'], ['casa', 'case'], ['cane', 'cani'], ['spiaggia', 'spiagge'],
    ['amico', 'amici'], ['fuoco', 'fuochi'], ['camicia', 'camicie'], ['problema', 'problemi'],
    ['uomo', 'uomini'], ['uovo', 'uova'], ['braccio', 'braccia'], ['mano', 'mani'], ['dio', 'dei'],
  ]
  for (const [singular, plural] of pairs) {
    const data = parseContextData(`${singular}\nmare\n`, new Int8Array([100, 0, 0, 100]).buffer, `${singular}\n`)
    const secret = data.index.get(singular)!
    for (const guess of [plural, `${plural.toUpperCase()}!`]) {
      assert.equal(lookup(data, guess, secret), secret, `${guess} must find ${singular}`)
      assert.equal(rankAgainst(data, secret).rankOf[lookup(data, guess, secret)], 0)
    }
    assert.equal(lookup(data, plural), -1, 'without a secret, an unknown word stays unknown')
    assert.equal(lookup(data, 'mare', secret), data.index.get('mare'))
  }
})

test('a winning plural takes precedence over its own vector; unrelated endings do not win', () => {
  const words = ['casa', 'case', 'caso', 'casi', 'casette', 'mare']
  const data = parseContextData(words.join('\n'), new Int8Array(words.flatMap((_, i) => [100 - i, i])).buffer, 'casa\ncase\n')
  const secret = data.index.get('casa')!
  assert.equal(lookup(data, 'case'), data.index.get('case'))
  assert.equal(lookup(data, 'case', secret), secret)
  for (const guess of ['caso', 'casi', 'casette', 'mare'])
    assert.notEqual(lookup(data, guess, secret), secret, `${guess} is not a plural of casa`)
  assert.equal(lookup(data, 'casi', data.index.get('case')), data.index.get('casi'), 'case is not a singular of casi')
  assert.equal(lookup(data, 'casa', data.index.get('case')), secret, 'no reverse singular-to-plural matching')
})

test('a plural winning guess ends the round, awards finder points and keeps the singular solution', async () => {
  const { createContext } = await import('../apps/overlay/src/games/context.ts')
  const fixture = parseContextData('gatto\ngatti\nmare\n', new Int8Array([100, 0, 0, 100, 90, 10]).buffer, 'gatto\n')
  const game = createContext(() => inlineContextComputer(fixture))
  game.reset({ startHintOn: false, finderPoints: 100, showLeaderboard: true }, 1080, 1920)
  await settleContext()
  const texts: string[] = []
  const canvas = new Proxy({
    font: '', fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  const draw = () => { texts.length = 0; game.draw(canvas, performance.now()); return texts.join('\n') }
  game.onAction('guess', { type: 'comment', text: 'GATTI!', user: { id: 'a', nickname: 'Tester' } }, 0)
  assert.match(draw(), /Tester ha trovato la parola/)
  assert.match(draw().replace(/\s/g, ''), /GATTO/)
  assert.match(draw(), /100 pt/)
  game.onAction('guess', { type: 'comment', text: 'gatto', user: { id: 'b', nickname: 'Secondo' } }, 0)
  assert.doesNotMatch(draw(), /Secondo/)
  game.dispose?.()
})
