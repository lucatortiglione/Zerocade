import assert from 'node:assert/strict'
import { test } from 'node:test'
import { singleWord } from '../apps/server/src/zfb.ts'

// The comments ZeroContext keeps from ZeroFollowerBot's voice between the word shown and the next round: one word, as
// ZeroFollowerBot counts them (core/src/gamewords.rs). The longer ones are still read.
test('one word, as ZeroFollowerBot counts them', () => {
  for (const one of ['casa', 'Casa!', '  CASA 😀 ', 'perché?', 'càsa', '42', 'A']) assert.equal(singleWord(one), true, one)
  for (const other of ['è casa', "l'albero", 'casa casa', 'ciao a tutti', '', '😀 !!', '?']) {
    assert.equal(singleWord(other), false, other)
  }
})
