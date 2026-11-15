import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freshSecret, noteSecretUse, secretUses, setSecretUses } from '../apps/overlay/src/games/secretUses.ts'
import { planRound, type Corpus } from '../apps/server/src/context-tournament-ranking.ts'
import { parseContextData } from '../packages/shared/src/contextRanking.ts'

const words = ['casa', 'gatto', 'mare', 'sole', 'luna']
const counts: Record<string, number> = { casa: 3, gatto: 1, mare: 0, sole: 2, luna: 0 }
const usesOf = (w: string) => counts[w] ?? 0

test('a classic round picks a word that never came out, at random among them', () => {
  const picked = new Set([0, 0.5, 0.99].map((r) => words[freshSecret([0, 1, 2, 3, 4], words, null, () => r, usesOf)]))
  assert.deepEqual([...picked].sort(), ['luna', 'mare'])
})

test('never the word just played; when every word came out, the least used ones', () => {
  assert.equal(words[freshSecret([0, 1, 2, 4], words, 'mare', () => 0, usesOf)], 'luna')
  assert.equal(words[freshSecret([0, 1, 3], words, null, () => 0, usesOf)], 'gatto')
  assert.equal(words[freshSecret([0], words, 'casa', () => 0, usesOf)], 'casa') // the only word left
})

test('the counts follow the server; a word picked here counts at once', () => {
  setSecretUses({ casa: 2, gatto: 0 })
  assert.equal(secretUses('casa'), 2)
  assert.equal(secretUses('gatto'), 0)
  noteSecretUse('mare')
  assert.equal(secretUses('mare'), 1)
  noteSecretUse('mare', 1) // the server's count of the same round
  assert.equal(secretUses('mare'), 1)
  noteSecretUse('casa', 5)
  assert.equal(secretUses('casa'), 5)
})

test('a tournament round picks a word never played, among those not yet in the tournament', () => {
  const vectors = new Int8Array(words.length * 2).map((_, i) => (i % 2 === 0 ? 100 : 0))
  const corpus: Corpus = { data: parseContextData(words.join('\n'), vectors.buffer, words.join('\n')), hash: 'h' }
  const index = (w: string) => corpus.data.index.get(w)!
  for (const r of [0, 0.5, 0.99]) {
    const plan = planRound(corpus, new Set([index('mare')]), () => r, usesOf)!
    assert.equal(corpus.data.words[plan.secret], 'luna', String(r))
  }
})
