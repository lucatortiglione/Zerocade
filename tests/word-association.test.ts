// Synthetic fixtures exercise game mechanics and transport, never semantic QA.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isWordAssociationPuzzle, type LiveEvent, type WordAssociationPuzzle } from '../packages/shared/src/index.ts'
import { loadWordAssociationContent } from '../apps/server/src/word-association.ts'
import { loadContent } from '../apps/overlay/src/content.ts'
import { createWordAssociation } from '../apps/overlay/src/games/wordAssociation.ts'

const puzzle: WordAssociationPuzzle = {
  ref: 'c000000000000000000000000', prompt: 'caffè',
  words: ['aroma', 'tazza', 'chicco', 'moka', 'bar', 'tostatura', 'espresso'],
  category_id: '014', cluster_id: 'B', pos: 'NOUN', pos_hint_mode: 'visible',
}

test('transport rejects legacy themes and malformed canonical data', () => {
  assert.equal(isWordAssociationPuzzle(puzzle), true)
  for (const changes of [{ words: puzzle.words.slice(0, 6) }, { category_id: '14' }, { category_id: '173' },
    { prompt: 'caffè\n' }, { words: [...puzzle.words.slice(0, 6), 'caffè'] }, { pos_hint_mode: null }])
    assert.equal(isWordAssociationPuzzle({ ...puzzle, ...changes }), false)
  assert.equal(isWordAssociationPuzzle({ prompt: 'COLORI', words: ['ROSSO', 'BLU'] }), false)
})

test('server never loads candidate exports as released content', () => {
  const root = mkdtempSync(join(tmpdir(), 'zerocade-associations-'))
  const path = join(root, 'content.json')
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(loadWordAssociationContent(path), [])
    writeFileSync(path, JSON.stringify({ schema_version: 'word-association-content-3.5.5',
      taxonomy_version: '3.5.5', validation_result: 'PASS_TECHNICAL_ONLY', items: [puzzle] }))
    assert.deepEqual(loadWordAssociationContent(path), [])
    writeFileSync(path, JSON.stringify({ schema_version: 'word-association-content-3.5.5',
      taxonomy_version: '3.5.5', validation_result: 'PASS_RELEASE_CHECKS', items: [puzzle] }))
    assert.deepEqual(loadWordAssociationContent(path), []) // Below the 10,001 release minimum.
    writeFileSync(path, '{broken')
    assert.deepEqual(loadWordAssociationContent(path), [])
  } finally {
    console.warn = warn
    rmSync(root, { recursive: true, force: true })
  }
})

test('game hides target, progresses 3/5/7, accepts accented answers and awards once', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ 'word-association': [puzzle] }))
  try { await loadContent() } finally { globalThis.fetch = originalFetch }
  const texts: string[] = []
  const context = new Proxy({
    font: '', fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 10 }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  const game = createWordAssociation()
  const settings = { roundSeconds: 60, breakSeconds: 5, showSessionLeaderboard: false }
  const draw = () => { texts.length = 0; game.draw(context, 0); return [...texts] }
  game.reset(settings, 1080, 1920)
  let shown = draw()
  assert.ok(shown.includes('3 di 7 indizi'))
  assert.ok(shown.some((text) => text.endsWith('· nome')))
  assert.ok(!shown.includes('caffè') && !shown.includes('espresso'))
  game.update(20, 0, settings)
  assert.ok(draw().includes('5 di 7 indizi'))
  game.update(20, 0, settings)
  assert.ok(draw().includes('7 di 7 indizi'))
  const event = { type: 'comment', text: 'aroma', user: { id: 'a', nickname: 'Tester' } } as LiveEvent
  game.onAction('guess', event, 0)
  assert.ok(!draw().includes('caffè')) // A clue is not a valid answer.
  event.text = ' CAFFE '
  game.onAction('guess', event, 0)
  assert.ok(draw().includes('caffè'))
  game.onAction('guess', event, 0)
  assert.equal(draw().filter((text) => text.startsWith('Tester +')).length, 1)
  game.update(5, 0, settings)
  assert.ok(!draw().includes('caffè'))
  game.update(60, 0, settings)
  assert.ok(draw().includes('caffè')) // Timeout reveals the solution.
})
