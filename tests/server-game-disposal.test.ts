import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const scratch = mkdtempSync(join(tmpdir(), 'zerocade-game-dispose-'))
process.env.ZEROCADE_DB = join(scratch, 'live.db')
process.env.ZEROCADE_CONTENT_DB = join(scratch, 'content.db')
const { IncastroRooms } = await import('../apps/server/src/incastro.ts')
const { levels } = await import('../apps/server/src/wordgen/levels.ts')
const { closeDb } = await import('../apps/server/src/db.ts')

test('a failing ZeroWords dispose callback cannot revive its late level or retain the closed room', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('external network forbidden in this test') })
  let broken = false
  let emitted = 0
  const rooms = new IncastroRooms(() => { emitted++ }, () => {}, () => { if (broken) throw new Error('callback failure') })
  t.after(async () => {
    await levels.close()
    closeDb()
    assert.ok(resolve(scratch).startsWith(join(resolve(tmpdir()), 'zerocade-game-dispose-')))
    rmSync(scratch, { recursive: true, force: true })
  })
  rooms.open('dispose-test', {})
  const generating = levels.get(1)
  broken = true
  assert.throws(() => rooms.close('dispose-test'), /callback failure/)
  assert.equal(rooms.get('dispose-test'), undefined)
  const afterClose = emitted
  await generating
  await new Promise((done) => setTimeout(done, 5))
  assert.equal(emitted, afterClose, 'a resolved old load must not begin another level or timer')
})
