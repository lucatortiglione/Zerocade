import { createHash } from 'node:crypto'
import { giochiDb, hasTable, openSchema } from './schema-db.js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  WORD_ASSOCIATION_MAX_WORDS,
  WORD_ASSOCIATION_MIN_WORDS,
  WORD_ASSOCIATION_WRONG_SENT,
  answerKey,
  drawAnswers,
  inflections,
  isWordAssociationPool,
  type WordAssociationPool,
  type WordAssociationRoundReport,
} from '@zerocade/shared'

// ZeroAssociazioni's content: the verified pools of gioco-zeroassociations, which prompt_database.py
// fills only with reviewed associations (import-reviewed). Read once at start, read-only: new
// pools only need a copy and a restart. The first of these with pools is used:
// - ZEROCADE_ASSOCIATIONS_DB (a .sqlite3/.db database or a .sql dump);
// - the games' database, schema associazioni (database/giochi.sqlite3, next to the server in the Windows
//   package): the verified pools alone, copied from the working database by `database/script/giochi.py aggiorna`;
// - the working database itself, database/parole_ita_raw.sqlite3 (gioco-zeroassociations/script/unified_db.py,
//   gigabytes, not in git), whose schemas are written `file#schema`: validi (the validated prompts), game
//   (the verified pools, views over raw), raw (the collection itself, with the lexical inventory).
// A prompt the collection marks DISCARDED or DEFERRED (inventory_term_decisions) never plays.
// When the copy in the games' database is behind the working database, the server says so.

const here = dirname(fileURLToPath(import.meta.url))
const dbDir = join(here, '..', '..', '..', 'database')
const workDb = join(dbDir, 'parole_ita_raw.sqlite3')
// Where the pools are made: what `giochi.py aggiorna associazioni` copies from, in the same order.
const workSources = [
  `${workDb}#validi`,
  `${workDb}#game`,
  `${workDb}#raw`,
]
const present = (p: string | undefined): p is string => p !== undefined && existsSync(p.split('#')[0])
export const wordAssociationSources = (): string[] =>
  [process.env.ZEROCADE_ASSOCIATIONS_DB, giochiDb && `${giochiDb}#associazioni`, ...workSources].filter(present)

// A schema of the one database opens as the old file it replaces (schema-db.ts).

export interface LoadedWordAssociation {
  // Identifies what was loaded in the telemetry: a hash of the pools' review ids.
  contentId: string
  pools: WordAssociationPool[]
}

// The pool's ref: stable for its sense (senses.id), 'c' + 24 hex digits.
export const poolRef = (senseId: string) => 'c' + createHash('sha256').update(senseId).digest('hex').slice(0, 24)

// A pool as a source gives it, before the checks; its review id goes into the contentId.
interface Candidate {
  prompt: string
  review_id: string
  pool: unknown
}

interface SenseRow {
  id: string
  prompt: string
  description: string
  pos: string
  category_id: string | null
  review_id: string
}

// The working database (and its schemas): every prompt in its familiar sense (prompts.familiar_sense) with a
// verified review, and that sense's answers, group limits and incompatible pairs, each row by the sense's id.
function fromWorkTables(db: Database.Database): Candidate[] {
  const decisions = hasTable(db, 'inventory_term_decisions')
  const senses = db
    .prepare(
      `SELECT s.id, s.prompt, s.description, s.pos, s.category_id, s.review_id
       FROM prompts p
       JOIN senses s ON s.prompt = p.lemma AND s.description = p.familiar_sense
       JOIN reviews r ON r.id = s.review_id
       WHERE r.decision = 'verified'${decisions ? `
         AND NOT EXISTS (SELECT 1 FROM inventory_term_decisions d
                         WHERE d.prompt = s.prompt AND d.decision IN ('DISCARDED', 'DEFERRED'))` : ''}
       ORDER BY s.prompt`,
    )
    .all() as SenseRow[]
  const answersOf = db.prepare('SELECT word, meaning_group AS "group", difficulty FROM associations WHERE sense_id = ? ORDER BY word')
  const limitsOf = db.prepare('SELECT meaning_group AS "group", maximum FROM group_limits WHERE sense_id = ?')
  const conflictsOf = db.prepare('SELECT word_a, word_b FROM conflicts WHERE sense_id = ?')
  return senses.map((s) => ({
    prompt: s.prompt,
    review_id: s.review_id,
    pool: {
      ref: poolRef(s.id),
      prompt: s.prompt,
      pos: s.pos,
      sense: s.description,
      category_id: s.category_id ?? null,
      answers: answersOf.all(s.id),
      group_limits: Object.fromEntries((limitsOf.all(s.id) as { group: string; maximum: number }[]).map((l) => [l.group, l.maximum])),
      conflicts: (conflictsOf.all(s.id) as { word_a: string; word_b: string }[]).map((c) => [c.word_a, c.word_b]),
    },
  }))
}

interface PromptRow {
  id: number
  prompt: string
  pos: string
  sense: string
  category_id: string | null
  ref: string
  review_id: string
}

// The games' database, schema associazioni (database/script/giochi.py): the prompts, each word once and the links between
// them (prompt_words), with the pool's ref already stored. A meaning group is named by a word: the link and the
// group's limit carry that word's number.
function fromGameTables(db: Database.Database): Candidate[] {
  const prompts = db.prepare('SELECT id, prompt, pos, sense, category_id, ref, review_id FROM prompts ORDER BY prompt').all() as PromptRow[]
  const answersOf = db.prepare(
    `SELECT w.word, n.word AS "group", d.name AS difficulty FROM prompt_words pw
     JOIN words w ON w.id = pw.word_id JOIN words n ON n.id = pw.group_name_id JOIN difficulties d ON d.id = pw.difficulty
     WHERE pw.prompt_id = ? ORDER BY w.word`,
  )
  const limitsOf = db.prepare(
    `SELECT n.word AS "group", g.maximum FROM meaning_groups g JOIN words n ON n.id = g.name_id
     WHERE g.prompt_id = ? AND g.maximum IS NOT NULL`,
  )
  const conflictsOf = db.prepare(
    `SELECT a.word AS word_a, b.word AS word_b FROM conflicts c
     JOIN words a ON a.id = c.word_a JOIN words b ON b.id = c.word_b WHERE c.prompt_id = ?`,
  )
  return prompts.map((p) => ({
    prompt: p.prompt,
    review_id: p.review_id,
    pool: {
      ref: p.ref,
      prompt: p.prompt,
      pos: p.pos,
      sense: p.sense,
      category_id: p.category_id ?? null,
      answers: answersOf.all(p.id),
      group_limits: Object.fromEntries((limitsOf.all(p.id) as { group: string; maximum: number }[]).map((l) => [l.group, l.maximum])),
      conflicts: (conflictsOf.all(p.id) as { word_a: string; word_b: string }[]).map((c) => [c.word_a, c.word_b]),
    },
  }))
}

// Every prompt in its familiar sense (prompts.familiar_sense) with a verified review, and that
// sense's answers, group limits and incompatible pairs. A pool that cannot give 7 answers, or is
// malformed, stays out with a warning. Without a path, the first source with pools; `null` reads
// nothing.
export function loadWordAssociation(path?: string | null): LoadedWordAssociation {
  const none = { contentId: '', pools: [] }
  if (path === undefined) {
    for (const source of wordAssociationSources()) {
      const loaded = loadWordAssociation(source)
      if (loaded.pools.length) {
        console.log(`[word-association] ${loaded.pools.length} prompts from ${source}`)
        // The copy is compared with the first working source that has pools, the one it is made from.
        if (giochiDb && source === `${giochiDb}#associazioni`) {
          for (const work of workSources.filter(present)) {
            const origin = loadWordAssociation(work)
            if (!origin.pools.length) continue
            if (origin.contentId !== loaded.contentId)
              console.warn('[word-association] the pools in database/giochi.sqlite3 are behind the working database: run `python database/script/giochi.py aggiorna associazioni`')
            break
          }
        }
        return loaded
      }
    }
    console.warn('[word-association] no verified pools found (database/giochi.sqlite3, schema associazioni): the game has no prompts')
    return none
  }
  if (path === null) return none
  let db: Database.Database | undefined
  try {
    if (path.endsWith('.sql')) {
      db = new Database(':memory:')
      db.exec(readFileSync(path, 'utf-8'))
    } else if (path.includes('#')) {
      const [file, schema] = path.split('#')
      db = openSchema(file, schema)
    } else {
      db = new Database(path, { readonly: true, fileMustExist: true })
      db.pragma('busy_timeout = 5000')
    }
    // The games' database has the links (prompt_words); the working database, the sense's rows.
    const candidates = hasTable(db, 'prompt_words') ? fromGameTables(db) : fromWorkTables(db)
    const pools: WordAssociationPool[] = []
    const reviews: string[] = []
    const left: string[] = []
    for (const c of candidates) {
      if (isWordAssociationPool(c.pool) && drawAnswers(c.pool, WORD_ASSOCIATION_MIN_WORDS, () => 0)) {
        pools.push(c.pool)
        reviews.push(c.review_id)
      } else left.push(c.prompt)
    }
    if (left.length) console.warn(`[word-association] ${left.length} prompts left out (malformed or under 7 answers): ${left.join(', ')}`)
    const contentId = createHash('sha256').update(reviews.sort().join('\n')).digest('hex').slice(0, 16)
    return { contentId, pools }
  } catch (err) {
    console.warn(`[word-association] ${path}: ${err instanceof Error ? err.message : String(err)}`)
    return none
  } finally {
    db?.close()
  }
}

const MAX_ROUND_MS = 3_600_000
const int = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max

// A round report from an overlay, checked against the pool it names: words not in the pool,
// a wrong guess that is one of the round's answers, or numbers out of range drop the report.
export function sanitizeRoundReport(
  raw: unknown,
  content: LoadedWordAssociation,
): (WordAssociationRoundReport & { prompt: string; content_id: string }) | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const pool = content.pools.find((p) => p.ref === r.ref)
  if (!pool) return null
  const inPool = new Set(pool.answers.map((a) => a.word))
  const words = r.words
  if (!Array.isArray(words) || words.length < WORD_ASSOCIATION_MIN_WORDS || words.length > WORD_ASSOCIATION_MAX_WORDS
    || new Set(words).size !== words.length || !words.every((w) => typeof w === 'string' && inPool.has(w))) return null
  if (!int(r.durationMs, MAX_ROUND_MS) || !int(r.hints, 1000) || !int(r.players, 100_000) || !int(r.guesses, 1_000_000))
    return null
  if (!Array.isArray(r.found) || !Array.isArray(r.wrong) || r.wrong.length > WORD_ASSOCIATION_WRONG_SENT) return null
  const found: WordAssociationRoundReport['found'] = []
  for (const f of r.found as unknown[]) {
    const item = f as Record<string, unknown> | null
    if (!item || typeof item.word !== 'string' || !words.includes(item.word)
      || found.some((x) => x.word === item.word) || !int(item.ms, r.durationMs) || typeof item.hinted !== 'boolean')
      return null
    found.push({ word: item.word, ms: item.ms, hinted: item.hinted })
  }
  const answers = new Set(
    [pool.prompt, ...(words as string[]).flatMap((w) => [w, ...inflections(w, pool.pos)])].map(answerKey),
  )
  const wrong: WordAssociationRoundReport['wrong'] = []
  for (const w of r.wrong as unknown[]) {
    const item = w as Record<string, unknown> | null
    if (!item || typeof item.guess !== 'string' || !/^[a-z]{2,30}$/.test(item.guess) || answers.has(item.guess)
      || wrong.some((x) => x.guess === item.guess) || !int(item.count, 1_000_000) || item.count < 1) return null
    wrong.push({ guess: item.guess, count: item.count })
  }
  return {
    ref: pool.ref,
    prompt: pool.prompt,
    content_id: content.contentId,
    words: [...(words as string[])],
    found,
    wrong,
    durationMs: r.durationMs,
    hints: r.hints,
    players: r.players,
    guesses: r.guesses,
  }
}
