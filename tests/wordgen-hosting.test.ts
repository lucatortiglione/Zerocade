import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, unlinkSync, rmdirSync, mkdirSync, writeFileSync, truncateSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test, type TestContext } from 'node:test'
import Database from 'better-sqlite3'

function fixture(t: TestContext, verified: boolean, words: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'zerocade-wordgen-host-'))
  const source = join(dir, 'games.sqlite3')
  const db = new Database(source)
  db.exec(`CREATE TABLE zerodb_meta(name TEXT,value TEXT);
    CREATE TABLE zerodb_objects(schema TEXT,name TEXT,type TEXT);
    INSERT INTO zerodb_meta VALUES ('verified','${verified ? '1' : '0'}');`)
  if (words) db.exec(`INSERT INTO zerodb_objects VALUES ('parole','words','table');
    CREATE TABLE parole__words(word TEXT,zipf REAL,tier TEXT);
    INSERT INTO parole__words VALUES ('CASA',4,'broken');`)
  db.close()
  t.after(() => {
    for (const file of [join(dir, 'lexicon', 'words.tsv'), join(dir, 'curve.json'), source]) if (existsSync(file)) unlinkSync(file)
    if (existsSync(join(dir, 'lexicon'))) rmdirSync(join(dir, 'lexicon'))
    rmdirSync(dir)
  })
  return { source, dir }
}

function read(source: string, script: string, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    env: { ...process.env, ZEROCADE_GIOCHI_FILE: source, ...env }, encoding: 'utf8', timeout: 5000,
  })
}
const files = pathToFileURL(join(process.cwd(), 'apps/server/src/wordgen/files.ts')).href
const schemas = pathToFileURL(join(process.cwd(), 'apps/server/src/schema-db.ts')).href

test('ZeroWords never silently replaces an unverified database with legacy files', (t) => {
  const { source } = fixture(t, false, true)
  const result = read(source, `const f=await import(${JSON.stringify(files)});try{f.readWords();console.log('WRONG')}catch(e){console.log(e.message)}`)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /not verified/)
})

test('ZeroWords rejects malformed lexical rows in a present schema', (t) => {
  const { source } = fixture(t, true, true)
  const result = read(source, `const f=await import(${JSON.stringify(files)});try{f.readWords();console.log('WRONG')}catch(e){console.log(e.message)}`)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /lessico ZeroWords non valida/)
})

test('an actually absent schema remains distinguishable from a corrupt one', (t) => {
  const { source } = fixture(t, true, false)
  const result = read(source, `const f=await import(${JSON.stringify(schemas)});console.log(f.openOptionalSchema(${JSON.stringify(source)},'parole'))`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'null')
})

test('a bounded legacy lexicon still works when the schema is absent', (t) => {
  const { source, dir } = fixture(t, true, false)
  mkdirSync(join(dir, 'lexicon'))
  writeFileSync(join(dir, 'curve.json'), '{}')
  writeFileSync(join(dir, 'lexicon', 'words.tsv'), 'word\tzipf\ttier\r\nCASA\t4\tmain\r\n\r\n')
  const result = read(source, `const f=await import(${JSON.stringify(files)});console.log(JSON.stringify(f.readWords()))`, { ZEROCADE_INCASTRO_DATA: dir })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), [{ word: 'CASA', zipf: 4, tier: 'main' }])
})

test('an oversized legacy lexicon is refused before it is read into the generator', (t) => {
  const { source, dir } = fixture(t, true, false)
  mkdirSync(join(dir, 'lexicon'))
  writeFileSync(join(dir, 'curve.json'), '{}')
  const words = join(dir, 'lexicon', 'words.tsv')
  writeFileSync(words, '')
  truncateSync(words, 16 * 1024 * 1024 + 1)
  const result = read(source, `const f=await import(${JSON.stringify(files)});try{f.readWords();console.log('WRONG')}catch(e){console.log(e.message)}`, { ZEROCADE_INCASTRO_DATA: dir })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /oltre il limite/)
})
