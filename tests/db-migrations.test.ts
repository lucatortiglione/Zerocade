import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'

// The server's database from before the widgets, goal and avatar columns. Opening it adds them and keeps the rows;
// a migration that fails for another reason stops the start with that reason. Each case opens db.ts in a process
// of its own, on a database of its own (never apps/server/data/zerocade.db).
const root = join(fileURLToPath(import.meta.url), '..', '..')
const dbModule = pathToFileURL(join(root, 'apps', 'server', 'src', 'db.ts')).href

const OLD = `
  CREATE TABLE sessions (key TEXT PRIMARY KEY, game_id TEXT NOT NULL, triggers TEXT NOT NULL, settings TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE gifters (key TEXT NOT NULL, user_id TEXT NOT NULL, nickname TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, user_id));
  CREATE TABLE gifts (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, creator TEXT NOT NULL, game_id TEXT NOT NULL,
    user_id TEXT NOT NULL, nickname TEXT NOT NULL, gift_id TEXT NOT NULL, count INTEGER NOT NULL, coins INTEGER NOT NULL,
    at INTEGER NOT NULL);
  INSERT INTO sessions (key, game_id, triggers, settings) VALUES ('k', 'quizzland', '[]', '{}');
  INSERT INTO gifters VALUES ('k', 'u1', 'luna', 50);
`

function oldDatabase(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'zerocade-migrazioni-')), 'zerocade.db')
  const db = new Database(file)
  db.exec(OLD)
  db.close()
  return file
}

// Opens db.ts on `file` in a new process: its exit code and what it wrote to stderr.
function openServerDatabase(file: string): { status: number | null; stderr: string } {
  const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `await import(${JSON.stringify(dbModule)}); process.exit(0)`], {
    cwd: root,
    env: { ...process.env, ZEROCADE_DB: file },
    encoding: 'utf-8',
    timeout: 60_000,
  })
  return { status: run.status, stderr: run.stderr }
}

const columns = (db: Database.Database, table: string) => db.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all().map((c) => c.name)

test('an old database gets the missing columns and keeps its rows; opening it again changes nothing', () => {
  const file = oldDatabase()
  for (let i = 0; i < 2; i++) assert.equal(openServerDatabase(file).status, 0)
  const db = new Database(file, { readonly: true })
  assert.ok(columns(db, 'sessions').includes('widgets') && columns(db, 'sessions').includes('goal'))
  assert.ok(columns(db, 'gifts').includes('avatar') && columns(db, 'gifters').includes('avatar'))
  assert.deepEqual(db.prepare('SELECT game_id, widgets, goal FROM sessions').get(), { game_id: 'quizzland', widgets: '{}', goal: 1000 })
  assert.deepEqual(db.prepare('SELECT nickname, coins, avatar FROM gifters').get(), { nickname: 'luna', coins: 50, avatar: null })
  db.close()
})

test('a migration that fails for a reason of its own stops the start with that reason, not later and elsewhere', () => {
  // Today's schema without the four columns, held by another program in an exclusive transaction: adding a column
  // fails with "database is locked". Before, that error was taken for "column already there", and the start went
  // on and stopped on a later, unrelated write, without saying which migration had failed.
  const file = join(mkdtempSync(join(tmpdir(), 'zerocade-migrazioni-')), 'zerocade.db')
  assert.equal(openServerDatabase(file).status, 0)
  const db = new Database(file)
  for (const [table, column] of [['sessions', 'widgets'], ['sessions', 'goal'], ['gifts', 'avatar'], ['gifters', 'avatar']]) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  }
  db.exec('BEGIN EXCLUSIVE')
  try {
    const { status, stderr } = openServerDatabase(file)
    assert.notEqual(status, 0)
    // The first missing column and the cause.
    assert.match(stderr, /cannot add the column sessions\.widgets/)
    assert.match(stderr, /locked/i)
  } finally {
    db.exec('ROLLBACK')
    db.close()
  }
})
