// The words a generated ZeroWordHunt board draws its targets from: only the view `zerowordhunt` of database/giochi_v2.sqlite3 (table
// `zerowordhunt_parole`), made by the task "ZeroWordHunt : Genera Parole" (gioco-zerowordhunt/script/genera_parole.py) from `normalizzata`:
// every word of at least 4 letters with an IWFS (Italian Word Familiarity Score) of at least 50. The board takes the plain-letter ones
// (a-z) whose length is within the rules (5 to 12). There is no other source: without that database, or without the table filled, the
// list is null and the room offers only the reference board. Read once, on the first generated round, and kept.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { WORDHUNT_RULES } from '@zerocade/shared'

const here = dirname(fileURLToPath(import.meta.url))

const gamesDb = [process.env.ZEROCADE_GIOCHI_V2_FILE, join(here, 'giochi_v2.sqlite3'), join(here, '..', '..', '..', 'database', 'giochi_v2.sqlite3')].find(
  (p): p is string => p !== undefined && existsSync(p),
)

export interface DictionaryInfo { words: number; source: 'zerowordhunt' }
let cached: readonly string[] | null | undefined
let info: DictionaryInfo | null = null

export const wordHuntDictionaryInfo = (): DictionaryInfo | null => info

function normalizedWords(): string[] {
  if (!gamesDb) return []
  const db = new Database(gamesDb, { readonly: true, fileMustExist: true })
  try {
    db.pragma('busy_timeout = 5000')
    const rows = db
      .prepare('SELECT parola FROM zerowordhunt WHERE lettere_semplici = 1 AND lunghezza BETWEEN ? AND ?')
      .pluck()
      .all(WORDHUNT_RULES.minWordLength, WORDHUNT_RULES.maxWordLength) as string[]
    return rows.map((w) => w.toLowerCase()).filter((w) => /^[a-z]+$/.test(w))
  } finally {
    db.close()
  }
}

export function loadWordHuntDictionary(): readonly string[] | null {
  if (cached !== undefined) return cached
  cached = null
  try {
    const words = normalizedWords()
    if (words.length > 0) {
      cached = Object.freeze([...new Set(words.map((w) => w.toUpperCase()))].sort())
      info = { words: cached.length, source: 'zerowordhunt' }
    }
  } catch {
    cached = null
  }
  return cached
}
