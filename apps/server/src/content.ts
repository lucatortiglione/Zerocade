import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { giochiDb, openSchema } from './schema-db.js'
import { loadWordAssociation } from './word-association.js'

// Game content (word banks, questions, statements, brands, locations, …) of the overlay's
// smaller games, loaded over `GET /api/content` instead of being hardcoded in the source.
//
// It lives in the games' database, schema contenuti (database/giochi.sqlite3: one JSON item per
// row), copied from `content.seed.json` by `python database/giochi.py aggiorna contenuti`; read once
// at start. Without that schema, the old way: a database of its own (apps/server/data/content.db,
// ZEROCADE_CONTENT_DB), seeded from `content.seed.json` for each game_id that has no rows yet.

const here = dirname(fileURLToPath(import.meta.url))

type Row = { game_id: string; item: string }

function fromGiochi(): Row[] | null {
  if (!giochiDb) return null
  try {
    const db = openSchema(giochiDb, 'contenuti')
    try {
      return db.prepare('SELECT game_id, item FROM items ORDER BY game_id, pos').all() as Row[]
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

function fromContentDb(): () => Row[] {
  const dbPath = process.env.ZEROCADE_CONTENT_DB ?? join(here, '..', 'data', 'content.db')
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      game_id TEXT NOT NULL,
      item TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_items_game ON content_items(game_id);
  `)
  const selectAll = db.prepare('SELECT game_id, item FROM content_items ORDER BY rowid')
  const seed = JSON.parse(readFileSync(join(here, 'content.seed.json'), 'utf-8')) as Record<string, unknown[]>
  const insert = db.prepare('INSERT INTO content_items (game_id, item) VALUES (?, ?)')
  const existingGames = new Set((selectAll.all() as Row[]).map((r) => r.game_id))
  db.transaction(() => {
    for (const [gameId, items] of Object.entries(seed)) {
      if (existingGames.has(gameId)) continue
      if (gameId === 'association-themes' && existingGames.has('word-association')) continue
      for (const item of items) insert.run(gameId, JSON.stringify(item))
    }
  })()
  return () => selectAll.all() as Row[]
}

const bank = fromGiochi()
const rows: () => Row[] = bank ? () => bank : fromContentDb()
if (!bank) console.warn('[content] no schema contenuti in database/giochi.sqlite3: using apps/server/data/content.db')

// ZeroAssociazioni reads its verified pools (word-association.ts).
export const wordAssociation = loadWordAssociation()

export function getContent(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const row of rows()) {
    const items = (out[row.game_id] ??= [])
    try {
      items.push(JSON.parse(row.item))
    } catch {
      // ignore malformed rows
    }
  }
  // The two other games still use the historical theme bank. An old content.db keeps
  // it under its old key; ZeroAssociazioni only uses its verified pools.
  out['association-themes'] ??= out['word-association'] ?? []
  out['word-association'] = wordAssociation.pools
  return out
}

export function getContentFor(gameId: string): unknown[] {
  return getContent()[gameId] ?? []
}
