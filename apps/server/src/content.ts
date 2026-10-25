import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

// Game content (word banks, questions, statements, brands, locations, …) lives in
// its own SQLite database, separate from the sessions/events DB. The overlay loads
// it over `GET /api/content` instead of keeping it hardcoded in the source.
//
// On first boot the database is seeded from `content.seed.json` (a one-time data
// migration); afterwards the SQLite file in apps/server/data/content.db is the
// single source of truth. Set ZEROCADE_CONTENT_DB to override the path.

const here = dirname(fileURLToPath(import.meta.url))
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

// Seed on first boot, and re-seed only game_ids that have no rows yet so that
// adding new games to the seed file works even against an existing database.
const seed = JSON.parse(readFileSync(join(here, 'content.seed.json'), 'utf-8')) as Record<string, unknown[]>
const insert = db.prepare('INSERT INTO content_items (game_id, item) VALUES (?, ?)')
const existingGames = new Set((selectAll.all() as { game_id: string }[]).map((r) => r.game_id))
const seedAll = db.transaction(() => {
  for (const [gameId, items] of Object.entries(seed)) {
    if (existingGames.has(gameId)) continue
    for (const item of items) insert.run(gameId, JSON.stringify(item))
  }
})
seedAll()

export function getContent(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const row of selectAll.all() as { game_id: string; item: string }[]) {
    const items = (out[row.game_id] ??= [])
    try {
      items.push(JSON.parse(row.item))
    } catch {
      // ignore malformed rows
    }
  }
  return out
}

export function getContentFor(gameId: string): unknown[] {
  return getContent()[gameId] ?? []
}
