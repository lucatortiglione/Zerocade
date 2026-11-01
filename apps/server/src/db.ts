import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { giftById, type BivioChoice, type BivioTally, type Gifter, type LiveEvent } from '@zerocade/shared'

// Local persistence via better-sqlite3 (latest stable SQLite engine). The DB file
// lives in apps/server/data and is gitignored; set ZEROCADE_DB to override the path.

const here = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.ZEROCADE_DB ?? join(here, '..', 'data', 'zerocade.db')
export const dataDir = dirname(dbPath)
mkdirSync(dataDir, { recursive: true })

const db = new Database(dbPath)
db.exec('PRAGMA journal_mode = WAL;')
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    key TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    triggers TEXT NOT NULL,
    settings TEXT NOT NULL,
    widgets TEXT NOT NULL DEFAULT '{}',
    goal INTEGER NOT NULL DEFAULT 1000,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gifters (
    key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, user_id)
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_key ON events (key, id);
  CREATE TABLE IF NOT EXISTS bivio_votes (
    round_id TEXT NOT NULL,
    key TEXT NOT NULL,
    question_id TEXT NOT NULL,
    lang TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    choice TEXT NOT NULL CHECK (choice IN ('a', 'b')),
    voted_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (round_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_bivio_votes_question ON bivio_votes (question_id);
`)

// Migrate databases created before the widgets/goal columns existed.
try {
  db.exec("ALTER TABLE sessions ADD COLUMN widgets TEXT NOT NULL DEFAULT '{}'")
} catch {
  // column already present on fresh schema
}
try {
  db.exec('ALTER TABLE sessions ADD COLUMN goal INTEGER NOT NULL DEFAULT 1000')
} catch {
  // column already present on fresh schema
}

// --- Sessions ---

const sessionGet = db.prepare('SELECT game_id, triggers, settings, widgets, goal FROM sessions WHERE key = ?')
const sessionUpsert = db.prepare(`
  INSERT INTO sessions (key, game_id, triggers, settings, widgets, goal) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    game_id = excluded.game_id,
    triggers = excluded.triggers,
    settings = excluded.settings,
    widgets = excluded.widgets,
    goal = excluded.goal
`)

export interface SessionRow {
  game_id: string
  triggers: string
  settings: string
  widgets: string
  goal: number
}

export const loadSession = (key: string): SessionRow | undefined =>
  sessionGet.get(key) as SessionRow | undefined

export const saveSession = (
  key: string,
  gameId: string,
  triggers: string,
  settings: string,
  widgets: string,
  goal: number,
): void => {
  sessionUpsert.run(key, gameId, triggers, settings, widgets, goal)
}

// --- Gifters ---

const gifterUpsert = db.prepare(`
  INSERT INTO gifters (key, user_id, nickname, coins) VALUES (?, ?, ?, ?)
  ON CONFLICT(key, user_id) DO UPDATE SET
    nickname = excluded.nickname,
    coins = gifters.coins + excluded.coins
`)
const gifterSelect = db.prepare(`
  SELECT user_id AS id, nickname, coins FROM gifters WHERE key = ? ORDER BY coins DESC, nickname ASC LIMIT 50
`)

export const getRanking = (key: string): Gifter[] => gifterSelect.all(key) as unknown as Gifter[]

// --- Events ---

const eventInsert = db.prepare('INSERT INTO events (key, type, payload) VALUES (?, ?, ?)')
const eventSelect = db.prepare('SELECT id, type, payload, created_at FROM events WHERE key = ? ORDER BY id DESC LIMIT ?')
const eventPrune = db.prepare(`
  DELETE FROM events WHERE key = ? AND id NOT IN (
    SELECT id FROM events WHERE key = ? ORDER BY id DESC LIMIT 2000
  )
`)

export interface EventRow {
  id: number
  type: string
  payload: string
  created_at: string
}

export const listEvents = (key: string, limit: number): EventRow[] =>
  eventSelect.all(key, limit) as unknown as EventRow[]

export const recordEvent = (key: string, event: LiveEvent): void => {
  eventInsert.run(key, event.type, JSON.stringify(event))
  eventPrune.run(key, key)
  if (event.type === 'gift') {
    const coins = (giftById(event.giftId)?.coins ?? 0) * event.count
    gifterUpsert.run(key, event.user.id, event.user.nickname, coins)
  }
}
// --- Bivio votes ---
// One row per viewer per round; a changed vote overwrites the previous one.

const bivioVoteUpsert = db.prepare(`
  INSERT INTO bivio_votes (round_id, key, question_id, lang, user_id, nickname, choice) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(round_id, user_id) DO UPDATE SET
    nickname = excluded.nickname,
    choice = excluded.choice,
    voted_at = datetime('now')
`)
const bivioQuestionTotals = db.prepare(`
  SELECT COALESCE(SUM(choice = 'a'), 0) AS a, COALESCE(SUM(choice = 'b'), 0) AS b FROM bivio_votes WHERE question_id = ?
`)
const bivioAllTotals = db.prepare(`
  SELECT question_id AS id, SUM(choice = 'a') AS a, SUM(choice = 'b') AS b, COUNT(DISTINCT round_id) AS rounds
  FROM bivio_votes GROUP BY question_id
`)

export interface BivioVote {
  roundId: string
  key: string
  questionId: string
  lang: string
  userId: string
  nickname: string
  choice: BivioChoice
}

export interface BivioTotalsRow extends BivioTally {
  id: string
  rounds: number
}

export const recordBivioVote = (v: BivioVote): void => {
  bivioVoteUpsert.run(v.roundId, v.key, v.questionId, v.lang, v.userId, v.nickname, v.choice)
}

export const bivioTotals = (questionId: string): BivioTally => bivioQuestionTotals.get(questionId) as BivioTally

export const bivioTotalsByQuestion = (): BivioTotalsRow[] => bivioAllTotals.all() as unknown as BivioTotalsRow[]
