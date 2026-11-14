import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import Database from 'better-sqlite3'

test('a present but unreadable context schema never silently falls back to legacy words', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zerocade-context-host-'))
  const source = join(dir, 'unverified.sqlite3')
  const db = new Database(source)
  db.exec("CREATE TABLE zerodb_meta(name TEXT, value TEXT); INSERT INTO zerodb_meta VALUES ('verified','0')")
  db.close()
  writeFileSync(join(dir, 'vocab.txt'), 'mare\nonda\n')
  writeFileSync(join(dir, 'secrets.txt'), 'mare\n')
  writeFileSync(join(dir, 'vectors.bin'), new Uint8Array([100, 0, 95, 30]))
  const moduleUrl = pathToFileURL(join(process.cwd(), 'apps/server/src/context.ts')).href
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const context = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify({words: context.contextFile('vocab.txt'), vectors: context.contextResource('vectors.bin')}))`], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, ZEROCADE_GIOCHI_FILE: source, ZEROCADE_CONTEXT_DATA: dir, ZEROCADE_DB: join(dir, 'never-used.db') },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { words: null, vectors: null })
  assert.match(result.stderr, /fallback disabilitato/)
})
