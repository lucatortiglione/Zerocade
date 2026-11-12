import { createHash } from 'node:crypto'
import { hasTable, openSchema } from './schema-db.js'
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
// pools only need an import and a restart. The first of these with pools is used:
// - ZEROCADE_ASSOCIATIONS_DB (a .sqlite3/.db database or a .sql dump);
// - zeroassociations.db next to the server: the Windows package's copy;
// - zeroassociazioni.sqlite3, the one database of gioco-zeroassociations (unified_db.py), whose schemas
//   are written `file#schema`: validi (the validated prompts), game (the verified pools alone), raw (the
//   collection itself, with the lexical inventory);
// - the old files of the same names, while they are kept: prompt_validi.sqlite3, prompt.sqlite3,
//   prompt_raw.sqlite3 (the last one is not in git: with the inventory it weighs gigabytes).
// A prompt the collection marks DISCARDED or DEFERRED (inventory_term_decisions) never plays.
// When prompt.sqlite3 is behind the collection (an import or a decision not exported yet), the
// server says so: `prompt_database.py dump` brings it up to date.

const here = dirname(fileURLToPath(import.meta.url))
const gameData = join(here, '..', '..', '..', 'gioco-zeroassociations')
const unifiedDb = join(gameData, 'zeroassociazioni.sqlite3')
export const wordAssociationSources = (): string[] =>
  [
    process.env.ZEROCADE_ASSOCIATIONS_DB,
    join(here, 'zeroassociations.db'),
    `${unifiedDb}#validi`,
    `${unifiedDb}#game`,
    `${unifiedDb}#raw`,
    join(gameData, 'prompt_validi.sqlite3'),
    join(gameData, 'prompt.sqlite3'),
    join(gameData, 'prompt_raw.sqlite3'),
  ].filter((p): p is string => p !== undefined && existsSync(p.split('#')[0]))

// A schema of the one database opens as the old file it replaces (schema-db.ts).

export interface LoadedWordAssociation {
  // Identifies what was loaded in the telemetry: a hash of the pools' review ids.
  contentId: string
  pools: WordAssociationPool[]
}

// The pool's ref: stable for its sense (senses.id), 'c' + 24 hex digits.
export const poolRef = (senseId: string) => 'c' + createHash('sha256').update(senseId).digest('hex').slice(0, 24)

interface SenseRow {
  id: string
  prompt: string
  description: string
  pos: string
  category_id: string | null
  review_id: string
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
        const raw = existsSync(unifiedDb) && source.startsWith(unifiedDb) ? `${unifiedDb}#raw` : join(gameData, 'prompt_raw.sqlite3')
        const isGame = source === join(gameData, 'prompt.sqlite3') || source === `${unifiedDb}#game`
        if (isGame && existsSync(raw.split('#')[0]) && loadWordAssociation(raw).contentId !== loaded.contentId)
          console.warn('[word-association] the game pools (prompt.sqlite3) are behind the collection: run `prompt_database.py dump` to update them')
        return loaded
      }
    }
    console.warn('[word-association] no verified pools found (prompt.sqlite3): the game has no prompts')
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
    const pools: WordAssociationPool[] = []
    const left: string[] = []
    for (const s of senses) {
      const pool = {
        ref: poolRef(s.id),
        prompt: s.prompt,
        pos: s.pos,
        sense: s.description,
        category_id: s.category_id ?? null,
        answers: answersOf.all(s.id),
        group_limits: Object.fromEntries(
          (limitsOf.all(s.id) as { group: string; maximum: number }[]).map((l) => [l.group, l.maximum]),
        ),
        conflicts: (conflictsOf.all(s.id) as { word_a: string; word_b: string }[]).map((c) => [c.word_a, c.word_b]),
      }
      if (isWordAssociationPool(pool) && drawAnswers(pool, WORD_ASSOCIATION_MIN_WORDS, () => 0)) pools.push(pool)
      else left.push(s.prompt)
    }
    if (left.length) console.warn(`[word-association] ${left.length} prompts left out (malformed or under 7 answers): ${left.join(', ')}`)
    const contentId = createHash('sha256')
      .update(senses.filter((s) => !left.includes(s.prompt)).map((s) => s.review_id).sort().join('\n'))
      .digest('hex')
      .slice(0, 16)
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
