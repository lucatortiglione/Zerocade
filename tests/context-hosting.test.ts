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

test('reloading selects immutable vectors and a failed reload keeps the previous coherent corpus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zerocade-context-reload-'))
  const source = join(dir, 'games.sqlite3')
  const db = new Database(source)
  db.exec(`CREATE TABLE zerodb_meta(name TEXT,value TEXT); INSERT INTO zerodb_meta VALUES('verified','1');
    CREATE TABLE zerodb_objects(schema TEXT,name TEXT,type TEXT);
    INSERT INTO zerodb_objects VALUES('context','vocab','table'),('context','secrets','table'),('context','meta','table');
    CREATE TABLE context__vocab(idx INTEGER,word TEXT); INSERT INTO context__vocab VALUES(0,'mare'),(1,'onda');
    CREATE TABLE context__secrets(word TEXT); INSERT INTO context__secrets VALUES('mare');
    CREATE TABLE context__meta(name TEXT PRIMARY KEY,value TEXT); INSERT INTO context__meta VALUES('words','2'),('dim','2');`)
  db.close()
  writeFileSync(join(dir, 'vectors.bin'), new Uint8Array([100, 0, 95, 30]))
  const name = `vectors.${'b'.repeat(64)}.bin`
  writeFileSync(join(dir, name), new Uint8Array([100, 0, 0, 95, 30, 0]))
  const moduleUrl = pathToFileURL(join(process.cwd(), 'apps/server/src/context.ts')).href
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import Database from 'better-sqlite3';
    const context=await import(${JSON.stringify(moduleUrl)});
    assert.equal(context.contextFile('vectors.bin').length,4);
    const db=new Database(${JSON.stringify(source)});
    const set=db.prepare('INSERT OR REPLACE INTO context__meta VALUES(?,?)');
    set.run('dim','3'); set.run('vectors_file',JSON.stringify(${JSON.stringify(name)}));
    set.run('corpus_revision',JSON.stringify('a'.repeat(64))); db.close();
    assert.equal(context.contextFile('vectors.bin').length,4);
    assert.equal(context.reloadContext('a'.repeat(64)).dim,3);
    assert.equal(context.contextFile('vectors.bin').length,6);
    assert.throws(()=>context.reloadContext('c'.repeat(64)),/revisione/);
    assert.equal(context.contextFile('vectors.bin').length,6);
    console.log(context.contextRevision());
  `], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ZEROCADE_GIOCHI_FILE: source, ZEROCADE_CONTEXT_DATA: dir } })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'a'.repeat(64))
})
