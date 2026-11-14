import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RETRY_MS, retryDue } from '../apps/overlay/src/games/retry.ts'

// ZeroContext and ZeroReazioniACatena ask for their data every frame while they have none: retryDue decides when a
// new download may start. Before, one failure (the server restarting) left them without data until a reload.
test('a failed download is asked for again, at most every RETRY_MS', () => {
  assert.equal(retryDue(null, 0), true) // none failed yet: download
  assert.equal(retryDue(1000, 1000), false) // it just failed: wait
  assert.equal(retryDue(1000, 1000 + RETRY_MS - 1), false)
  assert.equal(retryDue(1000, 1000 + RETRY_MS), true) // the pause is over: again
  assert.equal(retryDue(1000, 1000 + 5 * RETRY_MS), true) // and it keeps trying, for as long as the game asks
})
