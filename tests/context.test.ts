import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bandColor, closerHint, lookup, maskedWord, parseContextData, position, rankAgainst, startHint } from '../apps/overlay/src/games/contextRanking.ts'
import { inlineContextComputer, settleContext } from './helpers/inlineContextComputer.ts'

// Four words in 2 dimensions: "mare" and "onda" point the same way, "sabbia" is near, "città" opposite.
const vocab = 'città\nmare\nonda\nsabbia\n'
const rows = [
  [-100, 0], // città
  [100, 0], // mare
  [95, 30], // onda
  [60, 80], // sabbia
]
const vectors = new Int8Array(rows.flat()).buffer
const data = parseContextData(vocab, vectors, 'mare\nsabbia\nsconosciuta\n')

test('secrets must be playable words; the rest of the bank is dropped', () => {
  assert.deepEqual(data.secrets.map((i) => data.words[i]), ['mare', 'sabbia'])
})

test('a guess is read in any case, with or without accents, one word only', () => {
  assert.equal(data.words[lookup(data, 'MARE!')], 'mare')
  assert.equal(data.words[lookup(data, 'citta')], 'città')
  assert.equal(data.words[lookup(data, 'Città')], 'città')
  assert.equal(lookup(data, 'x'), -1)
  assert.equal(lookup(data, 'parola inesistente'), -1)
})

test('an unaccented guess finds the secret even when both spellings have their own vectors', () => {
  const both = parseContextData('proprieta\nproprietà\nmare\n',
    new Int8Array([100, 0, 95, 30, 0, 100]).buffer, 'proprietà\n')
  const secret = both.index.get('proprietà')!
  const ranking = rankAgainst(both, secret)
  assert.equal(lookup(both, 'proprieta'), both.index.get('proprieta'))
  for (const guess of ['proprieta', 'PROPRIETA!', 'proprietà', 'proprieta\u0300']) {
    const found = lookup(both, guess, secret)
    assert.equal(found, secret)
    assert.equal(ranking.rankOf[found], 0)
    assert.equal(both.words[found], 'proprietà')
  }
  assert.equal(lookup(both, 'mare', secret), both.index.get('mare'))
  assert.equal(lookup(both, 'proprietario', secret), -1)
})

test('the game awards the finder points and ends the round for an unaccented winning guess', async () => {
  const { createContext } = await import('../apps/overlay/src/games/context.ts')
  const fixture = parseContextData('proprieta\nproprietà\nmare\n', new Int8Array([100, 0, 95, 30, 0, 100]).buffer, 'proprietà\n')
  const settings = { startHintOn: false, finderPoints: 100, showLeaderboard: true }
  const game = createContext(() => inlineContextComputer(fixture))
  game.reset(settings, 1080, 1920)
  await settleContext()
  const texts: string[] = []
  const canvas = new Proxy({
    font: '', fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  const draw = () => { texts.length = 0; game.draw(canvas, performance.now()); return texts.join('\n') }
  game.onAction('guess', { type: 'comment', text: 'proprieta', user: { id: 'a', nickname: 'Tester' } }, 0)
  assert.match(draw(), /Tester ha trovato: proprietà/)
  assert.match(draw(), /100 pt/)
  game.onAction('guess', { type: 'comment', text: 'proprietà', user: { id: 'b', nickname: 'Secondo' } }, 0)
  assert.doesNotMatch(draw(), /Secondo/)
  game.dispose?.()
})

test('ranks run from the secret (0) to the farthest word', () => {
  const r = rankAgainst(data, data.index.get('mare')!)
  const rank = (w: string) => r.rankOf[data.index.get(w)!]
  assert.equal(rank('mare'), 0)
  assert.equal(rank('onda'), 1)
  assert.equal(rank('sabbia'), 2)
  assert.equal(rank('città'), 3)
  assert.equal(data.words[r.order[1]], 'onda')
})

test('a word ZeroAssociazioni ties to the secret rises by the boost, for that secret only', () => {
  const idx = (w: string) => data.index.get(w)!
  // The dot products with "mare" are 10000 (itself), 9500 (onda), 6000 (sabbia), -10000 (città).
  const links = { boost: 4000, links: { [idx('mare')]: [idx('sabbia')] } }
  const linked = parseContextData(vocab, vectors, 'mare\nsabbia\n', links)
  const r = rankAgainst(linked, idx('mare'))
  assert.deepEqual([...r.order].map((i) => linked.words[i]), ['mare', 'sabbia', 'onda', 'città'])
  // Another secret has no links: its ranking is the vectors' alone.
  assert.equal(linked.words[rankAgainst(linked, idx('onda')).order[1]], 'mare')
  // A boost too small to pass a closer word changes nothing; links to words that do not exist are dropped.
  const weak = parseContextData(vocab, vectors, 'mare\n', { boost: 1000, links: { [idx('mare')]: [idx('sabbia'), 99, -1] } })
  assert.deepEqual(weak.links.get(idx('mare')), [idx('sabbia')])
  assert.equal(weak.words[rankAgainst(weak, idx('mare')).order[1]], 'onda')
  // No links at all (an older server): nothing rises.
  assert.equal(data.linkBoost, 0)
  assert.equal(data.links.size, 0)
})

test('on screen the secret is always position 1 and the closest word position 2', () => {
  const r = rankAgainst(data, data.index.get('mare')!)
  const shown = (w: string) => position(r.rankOf[data.index.get(w)!])
  assert.equal(shown('mare'), 1)
  assert.equal(shown('onda'), 2)
  assert.equal(shown('sabbia'), 3)
})

test('five colour bands include every boundary and the secret uses red with the closest words', () => {
  const examples = [[1, '#ef4444'], [10, '#ef4444'], [11, '#f97316'], [100, '#f97316'],
    [101, '#facc15'], [1000, '#facc15'], [1001, '#22d3ee'], [10000, '#22d3ee'],
    [10001, '#3b82f6'], [101304, '#3b82f6']] as const
  for (const [at, color] of examples) assert.equal(bandColor(at - 1), color, `position ${at}`)
  assert.equal(bandColor(19, 20, 200, 2000, 20000), '#ef4444')
  assert.equal(bandColor(20, 20, 200, 2000, 20000), '#f97316')
})

test('every round starts from a hint a little way from the closest word, never the secret', () => {
  const r = rankAgainst(data, data.index.get('mare')!)
  const word = (rank: number) => data.words[r.order[rank]]
  assert.equal(word(startHint(r, 3)), 'sabbia') // position 3, one past the closest ("onda")
  assert.equal(word(startHint(r, 30)), 'città') // farther than the list: the farthest word
  assert.equal(word(startHint(r, 2, 2)), 'sabbia') // never closer than the hints' floor
  assert.equal(startHint(r, 30, 10), -1, 'a small vocabulary cannot cross the configured hint floor')
  const alone = rankAgainst(parseContextData('mare\n', new Int8Array([100, 0]).buffer, 'mare\n'), 0)
  assert.equal(startHint(alone, 30), -1) // only the secret: no hint
})

test('a closer hint is never a word already on the board', () => {
  const r = rankAgainst(data, data.index.get('mare')!)
  assert.equal(data.words[r.order[closerHint(r, 3, new Set())]], 'onda')
  const taken = new Set([data.index.get('onda')!])
  assert.equal(data.words[r.order[closerHint(r, 3, taken)]], 'sabbia')
  assert.equal(closerHint(r, 1, new Set([data.index.get('onda')!])), -1)
})

test('the secret is shown with its first letters only', () => {
  assert.equal(maskedWord('spiaggia', 0), '_ _ _ _ _ _ _ _')
  assert.equal(maskedWord('spiaggia', 2), 's p _ _ _ _ _ _')
})

test('the shipped data is consistent: vectors match the vocabulary and neighbours make sense', async () => {
  const { contextFile } = await import('../apps/server/src/context.ts')
  const real = parseContextData(
    contextFile('vocab.txt')!.toString('utf-8'),
    new Uint8Array(contextFile('vectors.bin')!).buffer,
    contextFile('secrets.txt')!.toString('utf-8'),
    JSON.parse(contextFile('links.json')!.toString('utf-8')),
  )
  assert.ok(real.secrets.length > 5000)
  assert.ok(real.words.length > 100_000, `expanded vocabulary: ${real.words.length}`)
  for (const word of ['zuccheriera', 'videochiamare', 'mostriciattolo'])
    assert.notEqual(lookup(real, word), -1, `new playable word: ${word}`)
  // Most secrets have words tied to them, and every link names a secret and a playable word.
  assert.ok(real.linkBoost > 0 && real.links.size > 4000, `links for ${real.links.size} secrets`)
  const secret = new Set(real.secrets)
  assert.ok([...real.links.keys()].every((s) => secret.has(s)))
  assert.ok(real.links.get(real.index.get('spiaggia')!)!.includes(real.index.get('ombrellone')!))
  const r = rankAgainst(real, real.index.get('spiaggia')!)
  assert.equal(new Set(r.order).size, real.words.length)
  assert.equal(r.rankOf[r.order[real.words.length - 1]], real.words.length - 1)
  const top = [...r.order.slice(1, 30)].map((i) => real.words[i])
  assert.ok(top.includes('mare') && top.includes('sabbia'), `closest to spiaggia: ${top.join(', ')}`)
  assert.ok(r.rankOf[real.index.get('mare')!] < r.rankOf[real.index.get('automobile')!])
})

test('a hint never goes closer than the floor, and none is left when nothing farther qualifies', () => {
  const r = rankAgainst(data, data.index.get('mare')!)
  assert.equal(closerHint(r, 3, new Set(), 2) >= 2, true)
  assert.equal(closerHint(r, 2, new Set(), 2), -1)
})

test('only the flags the source sets survive on a viewer', async () => {
  const { sanitizeEvent } = await import('../apps/server/src/validate.ts')
  const user = { id: 'a', nickname: 'luna', follower: true, fan: 'yes', admin: true }
  const event = sanitizeEvent({ type: 'comment', user, text: 'mare' })
  assert.deepEqual(event && 'user' in event ? event.user : null, { id: 'a', nickname: 'luna', avatar: undefined, follower: true })
})

test("the bridge's follower and fan flags reach the viewer: true, false, or unknown when absent", async () => {
  const { bridgeEvent } = await import('../apps/server/src/zfb.ts')
  const viewer = (user: object) => {
    const e = bridgeEvent({ type: 'comment', platform: 'tiktok', id: '1', text: 'mare', user: { id: '1', name: 'luna', ...user } })
    return e && 'user' in e.event ? e.event.user : null
  }
  assert.equal(viewer({ follower: false })?.follower, false)
  assert.equal(viewer({ isFollower: true })?.follower, true)
  assert.equal(viewer({ isSubscriber: true })?.fan, true)
  assert.equal(viewer({})?.follower, undefined)
})
