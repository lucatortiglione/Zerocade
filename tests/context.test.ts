import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closerHint, lookup, maskedWord, parseContextData, rankAgainst } from '../apps/overlay/src/games/contextRanking.ts'

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

test('ranks run from the secret (0) to the farthest word', () => {
  const r = rankAgainst(data, data.index.get('mare')!)
  const rank = (w: string) => r.rankOf[data.index.get(w)!]
  assert.equal(rank('mare'), 0)
  assert.equal(rank('onda'), 1)
  assert.equal(rank('sabbia'), 2)
  assert.equal(rank('città'), 3)
  assert.equal(data.words[r.order[1]], 'onda')
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
  )
  assert.ok(real.secrets.length > 5000)
  const r = rankAgainst(real, real.index.get('spiaggia')!)
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
