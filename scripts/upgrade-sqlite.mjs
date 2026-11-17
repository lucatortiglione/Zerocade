#!/usr/bin/env node
// Rebuild better-sqlite3 against the latest stable SQLite amalgamation.
// Usage:  node scripts/upgrade-sqlite.mjs [version] [year]
// Prereqs (Windows): "Desktop development with C++" (Visual Studio Build Tools) + Python 3.

import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { sqliteRuntime } from './sqlite-runtime.mjs'

const VERSION = process.argv[2] ?? '3.54.1'
const YEAR = process.argv[3] ?? '2026'
if (!/^3\.\d{1,2}\.\d{1,2}$/.test(VERSION) || !/^20\d{2}$/.test(YEAR)) {
  throw new Error('Expected SQLite version 3.minor.patch and a four-digit year')
}
const [major, minor, patch] = VERSION.split('.')
const TAG = `${major}${minor.padStart(2, '0')}${patch.padStart(2, '0')}00`

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function findBetterSqlite3(base) {
  const candidates = [
    join(base, 'node_modules', 'better-sqlite3'),
    join(base, 'apps', 'server', 'node_modules', 'better-sqlite3'),
    join(base, 'apps', 'dashboard', 'node_modules', 'better-sqlite3'),
    join(base, 'apps', 'overlay', 'node_modules', 'better-sqlite3'),
  ]
  return candidates.find((p) => existsSync(join(p, 'package.json'))) ?? null
}

const bsDir = findBetterSqlite3(root)
if (!bsDir) {
  console.error('✗ better-sqlite3 not found. Run `npm install` first.')
  process.exit(1)
}

const depsDir = join(bsDir, 'deps')
const zipPath = join(depsDir, `sqlite-amalgamation-${TAG}.zip`)
const extractDir = join(depsDir, `sqlite-amalgamation-${TAG}`)
const url = `https://www.sqlite.org/${YEAR}/sqlite-amalgamation-${TAG}.zip`

console.log(`→ Downloading ${url}`)
// A connection that stalls must not hold the upgrade forever: 10 minutes for the amalgamation (a few MB).
const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
if (!res.ok) {
  console.error(`✗ Download failed (${res.status}). Check version/year.`)
  process.exit(1)
}
writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()))

rmSync(extractDir, { recursive: true, force: true })
console.log('→ Extracting')
try {
  execFileSync('tar', ['-xf', zipPath, '-C', depsDir], { stdio: 'inherit' })
} catch {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${depsDir}' -Force`],
    { stdio: 'inherit' },
  )
}

const cPath = join(extractDir, 'sqlite3.c')
const hPath = join(extractDir, 'sqlite3.h')
if (!existsSync(cPath) || !existsSync(hPath)) {
  console.error('✗ sqlite3.c/.h not found after extraction.')
  process.exit(1)
}
console.log('→ Rebuilding better-sqlite3 (needs a C++ toolchain)')
// npm rebuild is a no-op for releases with gypfile:false and a prebuild.
// Use npm's node-gyp directly, forcing compilation with the custom amalgamation.
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const nodeGyp = join(dirname(npmCli), '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
if (!existsSync(nodeGyp)) throw new Error('node-gyp not found in npm; run this command through npm run sqlite:upgrade')
execFileSync(process.execPath, [nodeGyp, 'rebuild', '--release', '--force_build=1', `--sqlite3=${extractDir}`], {
  cwd: bsDir, stdio: 'inherit', windowsHide: true,
})

const req = createRequire(join(bsDir, '_noop.js'))
const engine = sqliteRuntime(req)
if (engine.version !== VERSION) throw new Error(`Expected SQLite ${VERSION}, loaded ${engine.version} from ${engine.binary}`)
console.log(`✓ Done. SQLite engine: ${engine.version} (${engine.binary})`)
