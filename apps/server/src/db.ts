import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  BRIDGE_DEFAULT_PORT,
  giftById,
  type BivioChoice,
  type BridgeConfig,
  type BivioTally,
  type FeedCreator,
  type FeedGift,
  type GiftEvent,
  type Gifter,
  type LiveEvent,
  type Pad,
  type SavedSources,
  type SourceKind,
} from '@zerocade/shared'

// Local persistence via better-sqlite3 (latest stable SQLite engine). The DB file
// lives in apps/server/data and is gitignored; set ZEROCADE_DB to override the path.

const here = dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.ZEROCADE_DB ?? join(here, '..', 'data', 'zerocade.db')
export const dataDir = dirname(dbPath)
mkdirSync(dataDir, { recursive: true })

const db = new Database(dbPath)
db.exec('PRAGMA journal_mode = WAL;')
// Another process opening the file (a tool, a second copy) waits up to 5 s for the lock instead of failing at once.
db.exec('PRAGMA busy_timeout = 5000;')

/** Folds the write-ahead log into the main file and closes the database. For the shutdown only. */
export function closeDb(): void {
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}
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
  CREATE TABLE IF NOT EXISTS bivio_flags (
    question_id TEXT PRIMARY KEY,
    lang TEXT NOT NULL,
    flagged_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS pad_boards (
    key TEXT PRIMARY KEY,
    volume REAL NOT NULL DEFAULT 0.8
  );
  CREATE TABLE IF NOT EXISTS pads (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('sound', 'gif')),
    slot INTEGER NOT NULL,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    sound_id TEXT,
    file TEXT,
    UNIQUE (key, kind, slot)
  );
  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    creator TEXT NOT NULL,
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    gift_id TEXT NOT NULL,
    count INTEGER NOT NULL,
    coins INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gifts_at ON gifts (at);
  CREATE TABLE IF NOT EXISTS creators (
    kind TEXT NOT NULL,
    username TEXT NOT NULL,
    game_id TEXT NOT NULL,
    viewers INTEGER,
    last_live INTEGER NOT NULL,
    PRIMARY KEY (kind, username)
  );
  CREATE TABLE IF NOT EXISTS source_accounts (
    key TEXT NOT NULL,
    kind TEXT NOT NULL,
    username TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (key, kind)
  );
  CREATE TABLE IF NOT EXISTS incastro_progress (
    key TEXT PRIMARY KEY,
    level INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS zerowords_plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    level INTEGER NOT NULL,
    variant TEXT NOT NULL,
    generator TEXT NOT NULL,
    archetype TEXT NOT NULL,
    seed TEXT NOT NULL,
    target REAL NOT NULL,
    dsim REAL NOT NULL,
    words INTEGER NOT NULL,
    hint_seconds INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    active_ms INTEGER,
    result TEXT,
    outcome TEXT,
    players INTEGER,
    attempts INTEGER,
    wrong INTEGER,
    hints_auto INTEGER,
    hints_streamer INTEGER,
    hints_trigger INTEGER,
    first_ms INTEGER,
    stall_ms INTEGER
  );
  CREATE TABLE IF NOT EXISTS zerowords_answers (
    play INTEGER NOT NULL,
    at_ms INTEGER NOT NULL,
    kind TEXT NOT NULL,
    word TEXT,
    how TEXT NOT NULL,
    shown TEXT
  );
  CREATE INDEX IF NOT EXISTS zerowords_answers_play ON zerowords_answers (play);
  CREATE TABLE IF NOT EXISTS quizzland_answers (
    round_id TEXT NOT NULL,
    key TEXT NOT NULL,
    question_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    choice INTEGER NOT NULL,
    correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
    ms INTEGER NOT NULL,
    answered_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (round_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_quizzland_answers_question ON quizzland_answers (question_id);
  CREATE TABLE IF NOT EXISTS quizzland_flags (
    question_id TEXT PRIMARY KEY,
    flagged_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE IF NOT EXISTS meta (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS word_association_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    content_id TEXT NOT NULL,
    ref TEXT NOT NULL,
    prompt TEXT NOT NULL,
    words TEXT NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    found INTEGER NOT NULL,
    total INTEGER NOT NULL,
    players INTEGER NOT NULL,
    guesses INTEGER NOT NULL,
    hints INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS word_association_guesses (
    round INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('found', 'missed', 'wrong')),
    word TEXT NOT NULL,
    at_ms INTEGER,
    hinted INTEGER NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS word_association_guesses_round ON word_association_guesses (round);
`)

// Migrate databases created before the widgets/goal columns existed.
try {
  db.exec("ALTER TABLE sessions ADD COLUMN widgets TEXT NOT NULL DEFAULT '{}'")
} catch {
  // column already present on fresh schema
}
try {
  db.exec('ALTER TABLE gifts ADD COLUMN avatar TEXT')
} catch {
  // column already present
}
try {
  db.exec('ALTER TABLE sessions ADD COLUMN goal INTEGER NOT NULL DEFAULT 1000')
} catch {
  // column already present on fresh schema
}
// The gifter's profile picture, for the Top donatori widget.
try {
  db.exec('ALTER TABLE gifters ADD COLUMN avatar TEXT')
} catch {
  // column already present
}

// Games that changed id: the saved sessions, gifts and creators follow them.
for (const [from, to] of [
  ['five-letters', 'zerowordle'],
  ['bivio', 'zerodubbi'],
]) {
  for (const table of ['sessions', 'gifts', 'creators']) db.prepare(`UPDATE ${table} SET game_id = ? WHERE game_id = ?`).run(to, from)
}

// Points viewers earn in the games, one row each, for the leaderboards of the session, the day, the week, the
// month and all time (scores.ts).
db.exec(`
  CREATE TABLE IF NOT EXISTS game_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT,
    points INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS game_scores_by_game ON game_scores (key, game_id, at);
`)
const scoreInsert = db.prepare('INSERT INTO game_scores (key, game_id, user_id, nickname, avatar, points, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
export const insertGameScore = (key: string, gameId: string, user: { id: string; nickname: string; avatar?: string }, points: number, at: number): void => {
  scoreInsert.run(key, gameId, user.id, user.nickname, user.avatar ?? null, points, at)
}
// Per viewer, the sum since `since`; the name and picture are the latest. Ties go to who got there first.
const boardSelect = db.prepare(
  `WITH tot AS (
     SELECT user_id, SUM(points) AS points, MIN(at) AS first, MAX(id) AS last_id
     FROM game_scores WHERE key = @key AND game_id = @game AND at >= @since
     GROUP BY user_id ORDER BY points DESC, first ASC LIMIT @limit
   )
   SELECT tot.user_id AS id, s.nickname AS nickname,
          COALESCE(s.avatar, (SELECT avatar FROM game_scores
                              WHERE key = @key AND game_id = @game AND user_id = tot.user_id AND avatar IS NOT NULL
                              ORDER BY id DESC LIMIT 1)) AS avatar,
          tot.points AS points
   FROM tot JOIN game_scores s ON s.id = tot.last_id
   ORDER BY tot.points DESC, tot.first ASC`,
)
export interface BoardRow {
  id: string
  nickname: string
  avatar: string | null
  points: number
}
export const gameBoard = (key: string, gameId: string, since: number, limit: number): BoardRow[] =>
  boardSelect.all({ key, game: gameId, since, limit }) as BoardRow[]

// When each leaderboard of a game (one period: sessione, giorno, …) was last reset from the dashboard: from then on
// that period counts only the points after it (scores.ts). The points stay in game_scores, so resetting one
// period leaves the others as they were.
db.exec(`
  CREATE TABLE IF NOT EXISTS leaderboard_resets (
    key TEXT NOT NULL,
    game_id TEXT NOT NULL,
    period TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (key, game_id, period)
  ) WITHOUT ROWID;
`)
const resetUpsert = db.prepare(
  `INSERT INTO leaderboard_resets (key, game_id, period, at) VALUES (?, ?, ?, ?)
   ON CONFLICT (key, game_id, period) DO UPDATE SET at = excluded.at`,
)
const resetSelect = db.prepare('SELECT period, at FROM leaderboard_resets WHERE key = ? AND game_id = ?')
export const setLeaderboardReset = (key: string, gameId: string, period: string, at: number): void => {
  resetUpsert.run(key, gameId, period, at)
}
// Period -> when it was last reset, for one game.
export const leaderboardResets = (key: string, gameId: string): Record<string, number> =>
  Object.fromEntries((resetSelect.all(key, gameId) as { period: string; at: number }[]).map((r) => [r.period, r.at]))

// --- Room ---
// This Zerocade's one room: the dashboard, the overlay link and every game use its key,
// whatever browser opens them. A database from before keys were kept here carries on with
// the room it was used with most (the key with the most events); a new one gets a fresh key.

function loadRoomKey(): string {
  const saved = db.prepare("SELECT value FROM meta WHERE name = 'room_key'").get() as { value: string } | undefined
  if (saved) return saved.value
  const busiest = db
    .prepare(
      'SELECT s.key FROM sessions s LEFT JOIN events e ON e.key = s.key GROUP BY s.key ORDER BY count(e.id) DESC, s.updated_at DESC LIMIT 1',
    )
    .get() as { key: string } | undefined
  const key = busiest?.key ?? randomUUID()
  db.prepare("INSERT INTO meta (name, value) VALUES ('room_key', ?)").run(key)
  return key
}

export const roomKey = loadRoomKey()

// --- ZeroFollowerBot's event bridge ---
// Whether Zerocade listens to ZeroFollowerBot, and on which port: one setting for this Zerocade.

const bridgeGet = db.prepare("SELECT value FROM meta WHERE name = 'zfb_bridge'")
const bridgeSet = db.prepare(`
  INSERT INTO meta (name, value) VALUES ('zfb_bridge', ?)
  ON CONFLICT(name) DO UPDATE SET value = excluded.value
`)

export function bridgeConfig(): BridgeConfig {
  const row = bridgeGet.get() as { value: string } | undefined
  try {
    const saved = row ? (JSON.parse(row.value) as Partial<BridgeConfig>) : {}
    return {
      enabled: saved.enabled === true,
      port: Number.isInteger(saved.port) ? (saved.port as number) : BRIDGE_DEFAULT_PORT,
    }
  } catch {
    return { enabled: false, port: BRIDGE_DEFAULT_PORT }
  }
}

export const saveBridgeConfig = (config: BridgeConfig): void => void bridgeSet.run(JSON.stringify(config))

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

// A saved session that can no longer be read is set aside here before the defaults overwrite it, so what the
// streamer had configured can still be recovered by hand.
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions_corrupt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    game_id TEXT NOT NULL,
    triggers TEXT NOT NULL,
    settings TEXT NOT NULL,
    widgets TEXT,
    goal INTEGER,
    set_aside_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)
const corruptInsert = db.prepare(
  'INSERT INTO sessions_corrupt (key, game_id, triggers, settings, widgets, goal) VALUES (?, ?, ?, ?, ?, ?)',
)
export const setAsideSession = (key: string, row: SessionRow): void => {
  corruptInsert.run(key, row.game_id, row.triggers, row.settings, row.widgets ?? null, row.goal ?? null)
}
export const asideSessions = (key: string): SessionRow[] =>
  db.prepare('SELECT game_id, triggers, settings, widgets, goal FROM sessions_corrupt WHERE key = ? ORDER BY id').all(key) as SessionRow[]

// --- Gifters ---

const gifterUpsert = db.prepare(`
  INSERT INTO gifters (key, user_id, nickname, avatar, coins) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(key, user_id) DO UPDATE SET
    nickname = excluded.nickname,
    avatar = coalesce(excluded.avatar, gifters.avatar),
    coins = gifters.coins + excluded.coins
`)
const gifterSelect = db.prepare(`
  SELECT user_id AS id, nickname, avatar, coins FROM gifters WHERE key = ? ORDER BY coins DESC, nickname ASC LIMIT 50
`)

// Gifters without a picture (Twitch, or saved before pictures were) leave the field out.
export const getRanking = (key: string): Gifter[] =>
  (gifterSelect.all(key) as unknown as (Omit<Gifter, 'avatar'> & { avatar: string | null })[]).map(({ avatar, ...g }) =>
    avatar ? { ...g, avatar } : g,
  )

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
    gifterUpsert.run(key, event.user.id, event.user.nickname, event.user.avatar ?? null, coins)
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

// --- Bivio questions marked as wrong from the dashboard ---
// For every overlay key; they stay out of the game until unmarked.

export interface BivioFlag {
  question_id: string
  lang: string
  flagged_at: string
}

const bivioFlagInsert = db.prepare(`INSERT OR IGNORE INTO bivio_flags (question_id, lang) VALUES (?, ?)`)
const bivioFlagDelete = db.prepare(`DELETE FROM bivio_flags WHERE question_id = ?`)
const bivioFlagAll = db.prepare(`SELECT question_id, lang, flagged_at FROM bivio_flags ORDER BY flagged_at, question_id`)

export const bivioFlags = (): BivioFlag[] => bivioFlagAll.all() as unknown as BivioFlag[]
export const flagBivio = (questionId: string, lang: string): void => void bivioFlagInsert.run(questionId, lang)
export const unflagBivio = (questionId: string): void => void bivioFlagDelete.run(questionId)

// --- Quizzland answers ---
// Each viewer's first answer to each question: `choice` is the option's position in
// the questions' database (opzioni.posizione, 0 = the first), whatever order the overlay showed; `ms` how long it took.

export interface QuizzlandAnswer {
  roundId: string
  key: string
  questionId: string
  userId: string
  nickname: string
  choice: number
  correct: boolean
  ms: number
}

export interface QuizzlandTotalsRow {
  id: string
  rounds: number
  answers: number
  correct: number
  // How many chose each position in the questions' database (c0 = the first answer).
  c0: number
  c1: number
  c2: number
  c3: number
  // Average time of the right answers.
  avgMs: number | null
}

const quizzlandAnswerInsert = db.prepare(`
  INSERT OR IGNORE INTO quizzland_answers (round_id, key, question_id, user_id, nickname, choice, correct, ms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const quizzlandAllTotals = db.prepare(`
  SELECT question_id AS id, COUNT(DISTINCT round_id) AS rounds, COUNT(*) AS answers, SUM(correct) AS correct,
    SUM(choice = 0) AS c0, SUM(choice = 1) AS c1, SUM(choice = 2) AS c2, SUM(choice = 3) AS c3,
    AVG(CASE WHEN correct = 1 THEN ms END) AS avgMs
  FROM quizzland_answers GROUP BY question_id
`)

export const recordQuizzlandAnswer = (a: QuizzlandAnswer): void => {
  quizzlandAnswerInsert.run(a.roundId, a.key, a.questionId, a.userId, a.nickname, a.choice, a.correct ? 1 : 0, Math.round(a.ms))
}

export const quizzlandTotalsByQuestion = (): QuizzlandTotalsRow[] => quizzlandAllTotals.all() as unknown as QuizzlandTotalsRow[]

// Questions marked as wrong from the dashboard, for every overlay key, until unmarked.

export interface QuizzlandFlag {
  question_id: string
  flagged_at: string
}

const quizzlandFlagInsert = db.prepare('INSERT OR IGNORE INTO quizzland_flags (question_id) VALUES (?)')
const quizzlandFlagDelete = db.prepare('DELETE FROM quizzland_flags WHERE question_id = ?')
const quizzlandFlagAll = db.prepare('SELECT question_id, flagged_at FROM quizzland_flags ORDER BY flagged_at, question_id')

export const quizzlandFlags = (): QuizzlandFlag[] => quizzlandFlagAll.all() as unknown as QuizzlandFlag[]
export const flagQuizzland = (questionId: string): void => void quizzlandFlagInsert.run(questionId)
export const unflagQuizzland = (questionId: string): void => void quizzlandFlagDelete.run(questionId)

// --- TikTok and Twitch accounts ---
// The name last entered for each source, per overlay key: the dashboard fills it in again
// at the next live.

const sourceAccountsGet = db.prepare('SELECT kind, username FROM source_accounts WHERE key = ?')
const sourceAccountSet = db.prepare(`
  INSERT INTO source_accounts (key, kind, username) VALUES (?, ?, ?)
  ON CONFLICT(key, kind) DO UPDATE SET username = excluded.username, updated_at = datetime('now')
`)

export const savedSources = (key: string): SavedSources =>
  Object.fromEntries((sourceAccountsGet.all(key) as { kind: SourceKind; username: string }[]).map((r) => [r.kind, r.username]))

export const saveSource = (key: string, kind: SourceKind, username: string): void => {
  sourceAccountSet.run(key, kind, username)
}

// --- Incastro progress ---
// The level each overlay key is on, so the next live starts where this one stopped.

const incastroLevelGet = db.prepare('SELECT level FROM incastro_progress WHERE key = ?')
const incastroLevelSet = db.prepare(`
  INSERT INTO incastro_progress (key, level) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET level = excluded.level, updated_at = datetime('now')
`)

export const incastroLevel = (key: string): number | undefined =>
  (incastroLevelGet.get(key) as { level: number } | undefined)?.level

export const saveIncastroLevel = (key: string, level: number): void => {
  incastroLevelSet.run(key, level)
}

// --- ZeroWords plays ---
// Every level played, with the chat's answers and the hints as they came (times in played
// milliseconds since the level began, pauses left out): the data to calibrate the
// generator's difficulty on (gioco-parole/ALGORITMO.md). Nothing about who answered.

export interface ZerowordsPlayStart {
  key: string
  level: number
  variant: string
  generator: string
  archetype: string
  // The wheel's full word.
  seed: string
  target: number
  dsim: number
  words: number
  hint_seconds: number
}

export interface ZerowordsPlayEnd {
  active_ms: number
  result: 'complete' | 'time-up' | 'left'
  outcome: string | null
  players: number
  attempts: number
  wrong: number
  hints_auto: number
  hints_streamer: number
  hints_trigger: number
  first_ms: number | null
  stall_ms: number
}

export interface ZerowordsAnswer {
  play: number
  at_ms: number
  // grid | extra | secret | hint
  kind: string
  word: string | null
  // chat | auto | streamer | trigger | missed
  how: string
  // A grid word: its letters on the board just before (V_G___).
  shown: string | null
}

const ZEROWORDS_DAYS_KEPT = 365
{
  const old = Date.now() - ZEROWORDS_DAYS_KEPT * 86_400_000
  db.prepare('DELETE FROM zerowords_answers WHERE play IN (SELECT id FROM zerowords_plays WHERE started_at < ?)').run(old)
  db.prepare('DELETE FROM zerowords_plays WHERE started_at < ?').run(old)
}

const zwPlayInsert = db.prepare(`
  INSERT INTO zerowords_plays (key, level, variant, generator, archetype, seed, target, dsim, words, hint_seconds, started_at)
  VALUES (@key, @level, @variant, @generator, @archetype, @seed, @target, @dsim, @words, @hint_seconds, @started_at)
`)
const zwPlayEnd = db.prepare(`
  UPDATE zerowords_plays SET ended_at = @ended_at, active_ms = @active_ms, result = @result, outcome = @outcome,
    players = @players, attempts = @attempts, wrong = @wrong, hints_auto = @hints_auto,
    hints_streamer = @hints_streamer, hints_trigger = @hints_trigger, first_ms = @first_ms, stall_ms = @stall_ms
  WHERE id = @id
`)
const zwAnswerInsert = db.prepare(`
  INSERT INTO zerowords_answers (play, at_ms, kind, word, how, shown) VALUES (@play, @at_ms, @kind, @word, @how, @shown)
`)
const zwPlaysAll = db.prepare('SELECT * FROM zerowords_plays ORDER BY id')
const zwAnswersAll = db.prepare(`
  SELECT a.play, p.level, p.variant, a.at_ms, a.kind, a.word, a.how, a.shown
  FROM zerowords_answers a JOIN zerowords_plays p ON p.id = a.play ORDER BY a.rowid
`)

export const startZerowordsPlay = (play: ZerowordsPlayStart): number =>
  Number(zwPlayInsert.run({ ...play, started_at: Date.now() }).lastInsertRowid)

export const endZerowordsPlay = (id: number, end: ZerowordsPlayEnd): void => {
  zwPlayEnd.run({ ...end, id, ended_at: Date.now() })
}

export const addZerowordsAnswer = (answer: ZerowordsAnswer): void => {
  zwAnswerInsert.run(answer)
}

// Column names and rows, for the CSV downloads.
const table = (stmt: Database.Statement) => ({
  columns: stmt.columns().map((c) => c.name),
  rows: stmt.raw().all() as (string | number | null)[][],
})

export const zerowordsPlays = () => table(zwPlaysAll)
export const zerowordsAnswers = () => table(zwAnswersAll)

// --- Word Association telemetry ---
// One row per round an overlay played to the end, and per hidden word (found or missed) and
// frequent wrong guess in it: what gioco-zeroassociations/analyze_telemetry.py reads to
// measure difficulty and find the associations the chat expects. No viewer is stored.

const WORD_ASSOCIATION_DAYS_KEPT = 365
{
  const old = Date.now() - WORD_ASSOCIATION_DAYS_KEPT * 86_400_000
  db.prepare('DELETE FROM word_association_guesses WHERE round IN (SELECT id FROM word_association_rounds WHERE ended_at < ?)').run(old)
  db.prepare('DELETE FROM word_association_rounds WHERE ended_at < ?').run(old)
}

export interface WordAssociationRoundRow {
  key: string
  content_id: string
  ref: string
  prompt: string
  words: string[]
  duration_ms: number
  players: number
  guesses: number
  hints: number
  found: { word: string; ms: number; hinted: boolean }[]
  wrong: { guess: string; count: number }[]
}

const waRoundInsert = db.prepare(`
  INSERT INTO word_association_rounds (key, content_id, ref, prompt, words, ended_at, duration_ms, found, total, players, guesses, hints)
  VALUES (@key, @content_id, @ref, @prompt, @words, @ended_at, @duration_ms, @found, @total, @players, @guesses, @hints)
`)
const waGuessInsert = db.prepare(`
  INSERT INTO word_association_guesses (round, kind, word, at_ms, hinted, count) VALUES (@round, @kind, @word, @at_ms, @hinted, @count)
`)
const waRoundsAll = db.prepare(`
  SELECT id AS round, content_id, ref, prompt, words, ended_at, duration_ms, found, total, players, guesses, hints
  FROM word_association_rounds ORDER BY id
`)
const waGuessesAll = db.prepare(`
  SELECT g.round, r.content_id, r.ref, r.prompt, g.kind, g.word, g.at_ms, g.hinted, g.count, r.duration_ms
  FROM word_association_guesses g JOIN word_association_rounds r ON r.id = g.round ORDER BY g.rowid
`)

export const recordWordAssociationRound = db.transaction((row: WordAssociationRoundRow): number => {
  const round = Number(
    waRoundInsert.run({
      key: row.key,
      content_id: row.content_id,
      ref: row.ref,
      prompt: row.prompt,
      words: row.words.join('|'),
      ended_at: Date.now(),
      duration_ms: row.duration_ms,
      found: row.found.length,
      total: row.words.length,
      players: row.players,
      guesses: row.guesses,
      hints: row.hints,
    }).lastInsertRowid,
  )
  for (const f of row.found) waGuessInsert.run({ round, kind: 'found', word: f.word, at_ms: f.ms, hinted: f.hinted ? 1 : 0, count: 1 })
  const found = new Set(row.found.map((f) => f.word))
  for (const word of row.words)
    if (!found.has(word)) waGuessInsert.run({ round, kind: 'missed', word, at_ms: null, hinted: 0, count: 1 })
  for (const w of row.wrong) waGuessInsert.run({ round, kind: 'wrong', word: w.guess, at_ms: null, hinted: 0, count: w.count })
  return round
})

export const wordAssociationRounds = () => table(waRoundsAll)
export const wordAssociationGuesses = () => table(waGuessesAll)

// --- Pads ---
// A key gets a pad_boards row the first time its board is read, so a board emptied on
// purpose is not filled with the defaults again.

const padBoardGet = db.prepare('SELECT volume FROM pad_boards WHERE key = ?')
const padBoardInsert = db.prepare('INSERT INTO pad_boards (key) VALUES (?)')
const padBoardVolume = db.prepare('UPDATE pad_boards SET volume = ? WHERE key = ?')
const PAD_COLUMNS = 'SELECT id, kind, slot, label, color, sound_id AS soundId, file FROM pads'
const padSelect = db.prepare(`${PAD_COLUMNS} WHERE key = ? ORDER BY kind, slot`)
const padGet = db.prepare(`${PAD_COLUMNS} WHERE key = ? AND id = ?`)
const padInSlot = db.prepare(`${PAD_COLUMNS} WHERE key = ? AND kind = ? AND slot = ?`)
const padUpsert = db.prepare(`
  INSERT INTO pads (id, key, kind, slot, label, color, sound_id, file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    slot = excluded.slot,
    label = excluded.label,
    color = excluded.color,
    sound_id = excluded.sound_id,
    file = excluded.file
`)
const padDelete = db.prepare('DELETE FROM pads WHERE key = ? AND id = ?')

type PadRow = Omit<Pad, 'soundId' | 'file'> & { soundId: string | null; file: string | null }

const toPad = ({ soundId, file, ...rest }: PadRow): Pad => ({
  ...rest,
  ...(soundId ? { soundId } : {}),
  ...(file ? { file } : {}),
})

export const padVolume = (key: string): number | undefined =>
  (padBoardGet.get(key) as { volume: number } | undefined)?.volume

export const setPadVolume = (key: string, volume: number): void => {
  padBoardVolume.run(volume, key)
}

export const listPads = (key: string): Pad[] => (padSelect.all(key) as unknown as PadRow[]).map(toPad)

export const getPad = (key: string, id: string): Pad | undefined => {
  const row = padGet.get(key, id) as PadRow | undefined
  return row && toPad(row)
}

export const padAt = (key: string, kind: Pad['kind'], slot: number): Pad | undefined => {
  const row = padInSlot.get(key, kind, slot) as PadRow | undefined
  return row && toPad(row)
}

export const savePad = (key: string, pad: Pad): void => {
  padUpsert.run(pad.id, key, pad.kind, pad.slot, pad.label, pad.color, pad.soundId ?? null, pad.file ?? null)
}

export const deletePad = (key: string, id: string): void => {
  padDelete.run(key, id)
}

export const createPadBoard = db.transaction((key: string, pads: Pad[]) => {
  padBoardInsert.run(key)
  for (const pad of pads) savePad(key, pad)
})

// --- Feed: gifts and creators across every key on this server ---

const GIFT_DAYS_KEPT = 30
db.prepare('DELETE FROM gifts WHERE at < ?').run(Date.now() - GIFT_DAYS_KEPT * 86_400_000)

const giftInsert = db.prepare(`
  INSERT INTO gifts (key, creator, game_id, user_id, nickname, avatar, gift_id, count, coins, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
const GIFT_COLUMNS = 'SELECT id, creator, game_id AS gameId, nickname, avatar, gift_id AS giftId, count, coins, at FROM gifts'
const giftsLatest = db.prepare(`${GIFT_COLUMNS} WHERE (@creator IS NULL OR creator = @creator) ORDER BY id DESC LIMIT @limit`)
const giftTop = db.prepare(
  `${GIFT_COLUMNS} WHERE (@creator IS NULL OR creator = @creator) AND at >= @since ORDER BY coins DESC, id DESC LIMIT 1`,
)
const giftCreators = db.prepare('SELECT DISTINCT creator FROM gifts')

export const recordGift = (key: string, creator: string, gameId: string, event: GiftEvent): void => {
  const coins = (giftById(event.giftId)?.coins ?? 0) * event.count
  giftInsert.run(key, creator, gameId, event.user.id, event.user.nickname, event.user.avatar ?? null, event.giftId, event.count, coins, Date.now())
}

// `creator` undefined means every creator; '' the simulator.
// A gift row without a picture leaves `avatar` out rather than null.
const giftRow = (row: unknown): FeedGift => {
  const { avatar, ...gift } = row as FeedGift & { avatar: string | null }
  return avatar ? { ...gift, avatar } : gift
}

export const latestGifts = (creator: string | undefined, limit: number): FeedGift[] =>
  giftsLatest.all({ creator: creator ?? null, limit }).map(giftRow)

export const topGiftSince = (creator: string | undefined, since: number): FeedGift | null => {
  const row = giftTop.get({ creator: creator ?? null, since })
  return row ? giftRow(row) : null
}

export const giftedCreators = (): string[] => (giftCreators.all() as { creator: string }[]).map((r) => r.creator)

const creatorUpsert = db.prepare(`
  INSERT INTO creators (kind, username, game_id, viewers, last_live) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(kind, username) DO UPDATE SET
    game_id = excluded.game_id,
    viewers = COALESCE(excluded.viewers, creators.viewers),
    last_live = excluded.last_live
`)
const creatorsRecent = db.prepare(
  'SELECT kind, username, game_id AS gameId, viewers, last_live AS at FROM creators ORDER BY last_live DESC LIMIT ?',
)

// Called while a creator is live, so last_live ends up close to when the live ended.
export const touchCreator = (kind: SourceKind, username: string, gameId: string, viewers?: number): void => {
  creatorUpsert.run(kind, username, gameId, viewers ?? null, Date.now())
}

export const recentCreators = (limit: number): FeedCreator[] =>
  (creatorsRecent.all(limit) as (Omit<FeedCreator, 'viewers'> & { viewers: number | null })[]).map(({ viewers, ...c }) =>
    viewers === null ? c : { ...c, viewers },
  )
