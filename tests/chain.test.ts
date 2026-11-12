import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chainId, maskWord, nextHint, parseChainId, pickChain, readWord, wordValue } from '../apps/overlay/src/games/chainLogic.ts'
import { buildChains } from '../apps/server/src/chains.ts'

test('a chain travels as one string and a window keeps neighbouring words in order', () => {
  assert.deepEqual(parseChainId(chainId(['mare', 'sabbia', 'sole'])), ['mare', 'sabbia', 'sole'])
  const walk = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7']
  const rand = () => 0.99
  assert.deepEqual(pickChain([walk], 4, rand), ['d4', 'e5', 'f6', 'g7'])
  assert.equal(pickChain([walk], 8), null)
})

test('a guess is one word, read without accents', () => {
  assert.equal(readWord(' Città '), 'citta')
  assert.equal(readWord('due parole'), null)
  assert.equal(readWord('a'), null)
})

test('a word is worth less for each letter already shown, never below one', () => {
  assert.equal(maskWord('telefono', 3), 't e l _ _ _ _ _')
  assert.equal(wordValue(20, 1, 2), 20)
  assert.equal(wordValue(20, 4, 2), 14)
  assert.equal(wordValue(20, 30, 2), 1)
  assert.equal(wordValue(0, 5, 2), 0)
})

test('the next hint goes to the hidden word with the fewest letters, and keeps one letter hidden', () => {
  const words = ['rumore', 'trapano', 'cavo', 'voce']
  assert.equal(nextHint(words, [6, 1, 1, 4], [false, true, true, false]), 1)
  assert.equal(nextHint(words, [6, 2, 1, 4], [false, true, true, false]), 2)
  assert.equal(nextHint(words, [6, 6, 3, 4], [false, true, true, false]), -1)
})

test('chains are walks over verified pools: each next word is an answer of the previous, no repeats', () => {
  const pool = (prompt: string, words: string[]) =>
    ({ ref: prompt, prompt, pos: 'NOUN', sense: '', category_id: null, answers: words.map((word) => ({ word, group: word, difficulty: 'medium' })), group_limits: {}, conflicts: [] }) as never
  const pools = [
    pool('mare', ['sabbia', 'onda']),
    pool('sabbia', ['castello', 'deserto']),
    pool('castello', ['torre', 'mare']),
    pool('torre', ['campana']),
    pool('campana', ['suono']),
    pool('deserto', ['cammello']),
    pool('onda', ['surf']),
  ]
  const chains = buildChains(pools, 20)
  assert.ok(chains.length > 0)
  const answers = new Map(pools.map((p: never) => [(p as { prompt: string }).prompt, new Set((p as { answers: { word: string }[] }).answers.map((a) => a.word))]))
  for (const chain of chains) {
    assert.equal(new Set(chain).size, chain.length)
    for (let i = 0; i < chain.length - 1; i++) assert.ok(answers.get(chain[i])?.has(chain[i + 1]), chain.join('-'))
  }
})
