import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import Database from 'better-sqlite3'

const directory = mkdtempSync(join(tmpdir(), 'zerocade-pads-'))
process.env.ZEROCADE_DB = join(directory, 'test.db')
const { padBoard, padFile, savePadInput } = await import('../apps/server/src/pads.ts')
const { closeDb } = await import('../apps/server/src/db.ts')
after(() => closeDb())
const upload = (body: string) => ({ type: 'image/png', data: Buffer.from(body).toString('base64') })

test('pad swaps roll back together; a failed replacement preserves the old file and removes its uncommitted upload', async () => {
  padBoard('room')
  assert.equal(savePadInput('room', { kind: 'gif', slot: 0, label: 'first', upload: upload('first bytes') }), null)
  assert.equal(savePadInput('room', { kind: 'gif', slot: 1, label: 'second', upload: upload('second bytes') }), null)
  const before = padBoard('room').pads.filter((pad) => pad.kind === 'gif')
  const db = new Database(process.env.ZEROCADE_DB)
  try {
    db.exec("CREATE TRIGGER fail_pad BEFORE UPDATE ON pads WHEN NEW.label = 'explode' BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
    assert.throws(() => savePadInput('room', { id: before[0].id, kind: 'gif', slot: 1, label: 'explode', upload: upload('uncommitted') }), /injected failure/)
    assert.deepEqual(padBoard('room').pads.filter((pad) => pad.kind === 'gif'), before)
    assert.equal(readFileSync(join(directory, 'pads', before[0].file!), 'utf8'), 'first bytes')
    assert.equal(readdirSync(join(directory, 'pads')).length, 2, 'no temporary or orphan replacement file')
    db.exec('DROP TRIGGER fail_pad')
    assert.equal(savePadInput('room', { id: before[0].id, kind: 'gif', slot: 1, label: 'moved' }), null)
    const after = padBoard('room').pads.filter((pad) => pad.kind === 'gif')
    assert.equal(after.find((pad) => pad.id === before[0].id)?.slot, 1)
    assert.equal(after.find((pad) => pad.id === before[1].id)?.slot, 0)
    assert.equal(await padFile('../../.env'), null)
  } finally { db.close() }
})

test('upload types must be own whitelist entries and invalid base64 never creates a file', () => {
  const files = readdirSync(join(directory, 'pads'))
  for (const type of ['__proto__', 'constructor', 'toString', 'image/svg+xml']) {
    assert.equal(typeof savePadInput('room', { kind: 'gif', slot: 2, label: 'bad', upload: { type, data: 'YQ==' } }), 'string')
  }
  for (const data of ['YQ=!', 'YQ=', 'Y===']) {
    assert.equal(typeof savePadInput('room', { kind: 'gif', slot: 2, label: 'bad', upload: { type: 'image/png', data } }), 'string')
  }
  assert.deepEqual(readdirSync(join(directory, 'pads')), files)
})
