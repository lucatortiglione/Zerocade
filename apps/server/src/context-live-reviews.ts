import { randomInt, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ContextLivePair } from '@zerocade/shared'

const LIMIT = 5

// Shuffle without reference to the ranking. Keep a few pairs per round without enumerating
// thousands of combinations in the live game. SQLite samples the final five across rounds.
function roundPairs(secret: string, guesses: string[]): [string, string][] {
  const words = [...new Set(guesses)].filter(word => word !== secret)
  for (let i = words.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const selected = words[j]
    words[j] = words[i]
    words[i] = selected
  }
  const pairs: [string, string][] = []
  for (let gap = 1; gap < words.length; gap++) {
    for (let i = 0; i + gap < words.length; i++) {
      pairs.push([words[i], words[i + gap]])
      if (pairs.length === LIMIT) return pairs
    }
  }
  return pairs
}

export class ContextLiveReviews {
  constructor(private readonly db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_live_batches (
        id TEXT PRIMARY KEY, room TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
        UNIQUE(room, started_at)
      );
      CREATE TABLE IF NOT EXISTS context_live_pairs (
        id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES context_live_batches(id) ON DELETE CASCADE,
        secret TEXT NOT NULL, word_a TEXT NOT NULL, word_b TEXT NOT NULL,
        verdict TEXT CHECK(verdict IN ('a','b','tie')), voted_at INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS context_live_pair_unique ON context_live_pairs
        (batch_id, secret, min(word_a, word_b), max(word_a, word_b));
    `)
  }

  private batch(room: string, started: number) {
    const row = this.db.prepare('SELECT id, ended_at FROM context_live_batches WHERE room = ? AND started_at = ?')
      .get(room, started) as { id: string; ended_at: number | null } | undefined
    if (row) return row
    const id = randomUUID()
    // Abandoned games are never a source for the next live.
    this.db.prepare('DELETE FROM context_live_batches WHERE room = ? AND ended_at IS NULL').run(room)
    this.db.prepare('INSERT INTO context_live_batches(id, room, started_at) VALUES (?, ?, ?)').run(id, room, started)
    return { id, ended_at: null }
  }

  recordRound(room: string, started: number, secret: string, guesses: string[]) {
    const pairs = roundPairs(secret, guesses)
    if (!pairs.length) return
    this.db.transaction(() => {
      const batch = this.batch(room, started)
      if (batch.ended_at !== null) return
      const add = this.db.prepare('INSERT OR IGNORE INTO context_live_pairs(id, batch_id, secret, word_a, word_b) VALUES (?, ?, ?, ?, ?)')
      for (const [a, b] of pairs) add.run(randomUUID(), batch.id, secret, a, b)
    }).immediate()
  }

  end(room: string, started: number) {
    this.db.transaction(() => {
      const batch = this.batch(room, started)
      if (batch.ended_at !== null) return
      this.db.prepare(`DELETE FROM context_live_pairs WHERE batch_id = ? AND id NOT IN
        (SELECT id FROM context_live_pairs WHERE batch_id = ? ORDER BY random() LIMIT ?)`).run(batch.id, batch.id, LIMIT)
      this.db.prepare('UPDATE context_live_batches SET ended_at = ? WHERE id = ?').run(Date.now(), batch.id)
    }).immediate()
  }

  latest(room: string): ContextLivePair[] {
    return this.db.prepare(`SELECT id, secret, word_a AS a, word_b AS b, verdict FROM context_live_pairs
      WHERE batch_id = (SELECT id FROM context_live_batches WHERE room = ? AND ended_at IS NOT NULL
        ORDER BY ended_at DESC, rowid DESC LIMIT 1) ORDER BY id`).all(room) as ContextLivePair[]
  }

  vote(room: string, id: unknown, verdict: unknown) {
    if (typeof id !== 'string' || id.length !== 36 || (verdict !== 'a' && verdict !== 'b' && verdict !== 'tie')) return false
    return this.db.transaction(() => {
      const pair = this.latest(room).find(pair => pair.id === id)
      if (!pair) return false
      if (pair.verdict !== null) return pair.verdict === verdict
      this.db.prepare('UPDATE context_live_pairs SET verdict = ?, voted_at = ? WHERE id = ?')
        .run(verdict, Date.now(), id)
      return true
    }).immediate()
  }
}
