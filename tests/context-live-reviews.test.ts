import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { ContextLiveReviews } from '../apps/server/src/context-live-reviews.ts'

test('a completed session provides at most five stable blind pairs from its own rounds', () => {
  const db = new Database(':memory:')
  const store = new ContextLiveReviews(db)
  const words = ['lampada', 'stoppino', 'cera', 'luce', 'fiamma']
  store.recordRound('regia', 10, 'candela', [...words, 'candela', 'cera'])
  store.recordRound('regia', 10, 'candela', words)
  store.recordRound('regia', 10, 'mare', ['acqua'])
  store.recordRound('altra', 10, 'neve', ['gelo', 'bianco'])
  assert.deepEqual(store.latest('regia'), [])
  store.end('regia', 10)
  const pairs = store.latest('regia')
  assert.equal(pairs.length, 5)
  for (const pair of pairs) {
    assert.deepEqual(Object.keys(pair).sort(), ['a', 'b', 'id', 'secret', 'verdict'])
    assert.equal(pair.secret, 'candela')
    assert.ok(words.includes(pair.a) && words.includes(pair.b) && pair.a !== pair.b)
  }
  assert.equal(new Set(pairs.map(p => [p.a, p.b].sort().join('/'))).size, 5)
  store.end('regia', 10)
  assert.deepEqual(store.latest('regia'), pairs)
  assert.deepEqual(store.latest('altra'), [])
  store.end('altra', 10)
  assert.equal(store.latest('altra').length, 1)
  store.end('regia', 20)
  assert.deepEqual(store.latest('regia'), [])
  db.close()
})

test('votes are room-scoped, validated and idempotent after reopening the database, including ties', t => {
  const dir = mkdtempSync(join(tmpdir(), 'context-live-reviews-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'live.db')
  const db = new Database(file)
  const store = new ContextLiveReviews(db)
  store.recordRound('regia', 1, 'candela', ['stoppino', 'luce'])
  store.end('regia', 1)
  const [pair] = store.latest('regia')
  assert.equal(store.vote('altra', pair.id, 'b'), false)
  assert.equal(store.vote('regia', pair.id, 'invalid'), false)
  assert.equal(store.vote('regia', pair.id, 'tie'), true)
  assert.equal(store.vote('regia', pair.id, 'tie'), true)
  assert.equal(store.vote('regia', pair.id, 'a'), false)
  db.close()
  const reopened = new Database(file)
  try {
    const restored = new ContextLiveReviews(reopened)
    assert.equal(restored.latest('regia')[0].verdict, 'tie')
    assert.equal(restored.vote('regia', pair.id, 'tie'), true)
  } finally { reopened.close() }
})
