import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { CONTEXT_COLOR_MAX, normalizeContextColors } from '../packages/shared/src/context.ts'

process.env.ZEROCADE_DB = join(mkdtempSync(join(tmpdir(), 'zerocade-context-colors-')), 'test.db')
const { getSession, selectGame, setSettings } = await import('../apps/server/src/sessions.ts')
const { closeDb, saveSession } = await import('../apps/server/src/db.ts')
after(() => closeDb())

test('color limits are finite, increasing and shared by saved sessions and the game', () => {
  assert.deepEqual(normalizeContextColors({}), { redUntil: 10, orangeUntil: 100, yellowUntil: 1000, cyanUntil: 10000 })
  for (const value of [NaN, Infinity, -100, 0, .5, 1, 900, 1e10, '900']) {
    const result = normalizeContextColors({ redUntil: value, orangeUntil: value, yellowUntil: value, cyanUntil: value })
    assert.ok(result.redUntil >= 1 && result.redUntil < result.orangeUntil && result.orangeUntil < result.yellowUntil && result.yellowUntil < result.cyanUntil)
    assert.ok(result.redUntil <= CONTEXT_COLOR_MAX.red && result.orangeUntil <= CONTEXT_COLOR_MAX.orange && result.yellowUntil <= CONTEXT_COLOR_MAX.yellow && result.cyanUntil <= CONTEXT_COLOR_MAX.cyan)
  }
  const initial = selectGame('color-room', 'context')!
  const result = setSettings('color-room', { ...initial.settings, redUntil: 1000, orangeUntil: 2, yellowUntil: 3, cyanUntil: 4 })
  assert.equal(result.settings.redUntil, 1000)
  assert.equal(result.settings.orangeUntil, 1001)
  assert.equal(result.settings.yellowUntil, 1002)
  assert.equal(result.settings.cyanUntil, 1003)
  assert.deepEqual(getSession('color-room').settings, result.settings, 'the dashboard sees the same normalized limits as the renderer')
  saveSession('legacy-color-room', 'context', '[]', JSON.stringify({ greenRank: 100, orangeRank: 1000 }), '{}', 1000)
  const legacy = getSession('legacy-color-room').settings
  assert.deepEqual(normalizeContextColors(legacy), normalizeContextColors({}), 'legacy thresholds are not silently reinterpreted as a different color')
})
