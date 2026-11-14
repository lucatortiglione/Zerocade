import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'

test('backup includes committed WAL data, verifies integrity and never overwrites an existing destination', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zerocade-backup-'))
  const source = join(dir, 'source.db')
  const target = join(dir, 'backup.db')
  const live = new Database(source)
  try {
    live.pragma('journal_mode = WAL')
    live.exec("CREATE TABLE proof (value TEXT); INSERT INTO proof VALUES ('committed')")
    const run = () => spawnSync(process.execPath, ['scripts/backup-live.mjs', source, target], { encoding: 'utf8', windowsHide: true })
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    const restored = new Database(target, { readonly: true })
    try { assert.deepEqual(restored.prepare('SELECT * FROM proof').all(), [{ value: 'committed' }]) }
    finally { restored.close() }
    const before = readFileSync(target)
    assert.notEqual(run().status, 0)
    assert.deepEqual(readFileSync(target), before)
    assert.equal(readdirSync(dir).filter((name) => name.endsWith('.incomplete')).length, 0)
  } finally { live.close() }
})
