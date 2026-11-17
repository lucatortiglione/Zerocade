// The words a generated ZeroWordHunt board draws its targets from: the normalised words of the database (database/parole_ita_raw_2.0.sqlite3,
// table `normalizzata`: gender and number already chosen, one form per word), kept to the ones a chat can really guess. That bank is a raw
// collection (names, fragments, rare forms), so a word is a candidate only if it is also in the games' bank with the "main" tier and a
// frequency of at least MIN_ZIPF (database/giochi.sqlite3, schema parole). Only plain letters, 5 to 12 of them.
// The raw database is not in Git and not in the Windows package: without it the candidates are the games' bank alone, which is the
// same normalised vocabulary ZeroWords uses. Without either, the list is null and the room offers only the reference board.
// Read once, on the first generated round, and kept.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { WORDHUNT_RULES } from '@zerocade/shared'
import { giochiDb, openSchema } from './schema-db.js'

const here = dirname(fileURLToPath(import.meta.url))
export const MIN_ZIPF = 3.0

const rawNormalizedDb = [process.env.ZEROCADE_PAROLE_RAW_FILE, join(here, 'parole_ita_raw_2.0.sqlite3'), join(here, '..', '..', '..', 'database', 'parole_ita_raw_2.0.sqlite3')].find(
  (p): p is string => p !== undefined && existsSync(p),
)

export interface DictionaryInfo { words: number; source: 'normalizzata' | 'giochi' }
let cached: readonly string[] | null | undefined
let info: DictionaryInfo | null = null

export const wordHuntDictionaryInfo = (): DictionaryInfo | null => info

// The candidates of the games' bank: common words made of plain letters, in lower case.
function commonWords(): string[] {
  if (!giochiDb) return []
  const db = openSchema(giochiDb, 'parole')
  try {
    const rows = db
      .prepare('SELECT word FROM words WHERE tier = ? AND zipf >= ? AND length(word) BETWEEN ? AND ?')
      .pluck()
      .all('main', MIN_ZIPF, WORDHUNT_RULES.minWordLength, WORDHUNT_RULES.maxWordLength) as string[]
    return rows.map((w) => w.toLowerCase()).filter((w) => /^[a-z]+$/.test(w))
  } finally {
    db.close()
  }
}

// Of those, the ones the normalised table of the raw database holds as single words.
function inNormalized(candidates: string[]): string[] {
  if (!rawNormalizedDb) return candidates
  const db = new Database(rawNormalizedDb, { readonly: true, fileMustExist: true })
  try {
    db.pragma('busy_timeout = 5000')
    const has = db.prepare('SELECT 1 FROM normalizzata WHERE parola = ? AND is_single_word = 1').pluck()
    return candidates.filter((w) => has.get(w) === 1)
  } finally {
    db.close()
  }
}

export function loadWordHuntDictionary(): readonly string[] | null {
  if (cached !== undefined) return cached
  cached = null
  try {
    const candidates = commonWords()
    const words = inNormalized(candidates)
    if (words.length > 0) {
      cached = Object.freeze(words.map((w) => w.toUpperCase()).sort())
      info = { words: words.length, source: rawNormalizedDb ? 'normalizzata' : 'giochi' }
    }
  } catch {
    cached = null
  }
  return cached
}
