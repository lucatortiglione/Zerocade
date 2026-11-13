import assert from 'node:assert/strict'
import { test } from 'node:test'
import { feedback, keyStates, newInfo, parseWordleData, readGuess } from '../apps/overlay/src/games/wordleLogic.ts'

test('feedback marks greens first, then golds, and counts repeated letters once', () => {
  assert.deepEqual(feedback('pizza', 'pizza'), ['green', 'green', 'green', 'green', 'green'])
  // two Z in the guess, one in the word: only the one in place is green, the other grey
  assert.deepEqual(feedback('zuzza', 'pizza').slice(0, 3), ['grey', 'grey', 'green'])
  // a letter in the word once, guessed twice out of place: gold only the first time
  assert.deepEqual(feedback('ababa', 'zzzab'), ['gold', 'gold', 'grey', 'grey', 'grey'])
})

test('a guess is read without accents and only if it is one word of five letters', () => {
  assert.equal(readGuess('Città'), 'citta')
  assert.equal(readGuess('  CASSA '), 'cassa')
  assert.equal(readGuess('casa'), null)
  assert.equal(readGuess('due parole'), null)
  assert.equal(readGuess('ca$sa'), null)
  assert.equal(readGuess('Mangiare', 7), null)
  assert.equal(readGuess('Mangiare', 8), 'mangiare')
})

test('a key keeps the best thing its letter has shown', () => {
  const rows = [
    { word: 'sasso', tiles: feedback('sasso', 'rosso') },
    { word: 'rosso', tiles: feedback('rosso', 'rosso') },
  ]
  const keys = keyStates(rows)
  assert.equal(keys.get('s'), 'green')
  assert.equal(keys.get('a'), 'grey')
})

test('a guess earns only what is new', () => {
  const first = { word: 'sasso', tiles: feedback('sasso', 'rosso') }
  assert.deepEqual(newInfo([], first), { greens: 3, golds: 0 })
  const again = { word: 'passo', tiles: feedback('passo', 'rosso') }
  // S, S and O were already green in the same places, and P and A are grey
  assert.deepEqual(newInfo([first], again), { greens: 0, golds: 0 })
  const solved = { word: 'rosso', tiles: feedback('rosso', 'rosso') }
  assert.deepEqual(newInfo([first], solved), { greens: 2, golds: 0 })
})

test('the shipped word lists (the games\' database, schema wordle) are consistent for every length from 5 to 8', async () => {
  const { wordleFile } = await import('../apps/server/src/wordle.ts')
  const text = (name: string) => wordleFile(name)?.toString('utf-8') ?? ''
  for (const n of [5, 6, 7, 8]) {
    const data = parseWordleData(text(`solutions-${n}.txt`), text(`words-${n}.txt`))
    assert.ok(data.solutions.length > 1000, `${n}: ${data.solutions.length} solutions`)
    assert.ok(data.solutions.every((w) => w.length === n && /^[a-z]+$/.test(w) && data.words.has(w)))
    assert.ok([...data.words].every((w) => w.length === n))
  }
})
