import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { sqliteRuntime } from '../scripts/sqlite-runtime.mjs'

const requireFrom = createRequire(import.meta.url)
const source = sqliteRuntime(requireFrom)
const helper = new URL('../scripts/sqlite-runtime.mjs', import.meta.url).href

test('SQLite runtime identifies the loaded binding and rejects an unavailable target', () => {
  assert.match(source.version, /^3\.\d+\.\d+$/)
  assert.ok(source.binary.endsWith('.node'))
  assert.throws(() => sqliteRuntime(requireFrom, 'unavailable-platform'), /prebuild missing/)
})

test('packaging uses a local SQLite build when it takes precedence over the prebuild', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'zerocade-sqlite-package-'))
  const directory = join(scratch, 'node_modules', 'better-sqlite3')
  const target = `${process.platform}-${process.arch}`
  const prebuilt = join(directory, 'prebuilds', `${target}.node`)
  const compiled = join(directory, 'build', 'Release', 'better_sqlite3.node')
  try {
    cpSync(join(source.directory, 'lib'), join(directory, 'lib'), { recursive: true })
    copyFileSync(join(source.directory, 'package.json'), join(directory, 'package.json'))
    for (const file of [prebuilt, compiled]) {
      mkdirSync(dirname(file), { recursive: true })
      copyFileSync(source.binary, file)
    }
    // Load native libraries in a child so Windows releases the DLL before cleanup.
    const probe = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { sqliteRuntime } from ${JSON.stringify(helper)};
      const result = sqliteRuntime(createRequire(process.argv[1]));
      assert.equal(result.binary, process.argv[2]);
      assert.equal(result.version, process.argv[3]);
    `
    const args = ['--input-type=module', '--eval', probe, join(scratch, 'probe.mjs')]
    execFileSync(process.execPath, [...args, compiled, source.version], { windowsHide: true })
    // This is the layout emitted by package-win: only the selected native file
    // is shipped as the platform prebuild, together with lib and package.json.
    copyFileSync(compiled, prebuilt)
    rmSync(join(directory, 'build'), { recursive: true })
    execFileSync(process.execPath, [...args, prebuilt, source.version], { windowsHide: true })
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
