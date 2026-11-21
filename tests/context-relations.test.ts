import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rerankRiordino, riordinoRelationClues } from '../apps/server/src/context-relations.ts'

test('Riordino promotes specific lexical evidence while preserving the export order for remaining words', () => {
  const vocab = ['accendino', 'accetta', 'serbatoio', 'chiodo', 'capocchia', 'cappuccio']
  const pinned = new Map([[0, [1, 3, 5]], [1, [4, 2]], [3, [1, 4, 5]]])
  const fingerprint = rerankRiordino(vocab, pinned)
  assert.deepEqual(pinned.get(0), [2, 1, 3])
  assert.deepEqual(pinned.get(1), [4, 2])
  assert.deepEqual(pinned.get(3), [4, 1, 5])
  assert.equal(pinned.size, 3)
  assert.match(fingerprint, /^[a-f0-9]{64}$/)
  assert.notEqual(rerankRiordino(vocab, new Map([[0, [3, 1, 5]]])), fingerprint)
})

test('the presenter has reviewed hints independent of the lexical ranking dataset', () => {
  assert.ok(riordinoRelationClues('accendino').some(c => c.word === 'rotella' && c.kind === 'parte'))
  assert.deepEqual(riordinoRelationClues('constructor'), [])
})
