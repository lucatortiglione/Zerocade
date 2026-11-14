import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { giochiDb, openSchema } from '../schema-db.js'

// ZeroWords' data: the lexicon (word, Zipf frequency, tier), the blocklist, the chapters and the
// difficulty curve. They live in the games' database, schema parole (database/giochi.sqlite3, copied
// from gioco-parole by `python database/script/giochi.py aggiorna parole`). Without that schema, the files:
// ZEROCADE_INCASTRO_DATA or app/incastro laid out as chapters.json, curve.json, lexicon/words.tsv and
// lexicon/blocklist.txt, then gioco-parole/ of the repository, where the tools write them.
const here = dirname(fileURLToPath(import.meta.url))
const shipped = [process.env.ZEROCADE_INCASTRO_DATA, join(here, 'incastro')].find(
  (p): p is string => p !== undefined && existsSync(join(p, 'curve.json')),
)
const repo = join(here, '..', '..', '..', '..', 'gioco-parole')

const files = shipped
  ? {
      chapters: join(shipped, 'chapters.json'),
      curve: join(shipped, 'curve.json'),
      words: join(shipped, 'lexicon', 'words.tsv'),
      blocklist: join(shipped, 'lexicon', 'blocklist.txt'),
    }
  : {
      chapters: join(repo, 'data', 'chapters.json'),
      curve: join(repo, 'tools', 'curve.json'),
      words: join(repo, 'lexicon', 'it', 'words.tsv'),
      blocklist: join(repo, 'lexicon', 'blocklist_it.txt'),
    }

// A read of the schema parole, or null without it.
function fromDatabase<T>(read: (db: Database.Database) => T): T | null {
  if (!giochiDb) return null
  try {
    const db = openSchema(giochiDb, 'parole')
    try {
      return read(db)
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

const meta = (name: string): string | null =>
  fromDatabase((db) => db.prepare('SELECT value FROM meta WHERE name = ?').pluck().get(name) as string | undefined) ?? null

export interface WordRow {
  word: string
  zipf: number
  tier: string
}

export function readWords(): WordRow[] {
  return (
    fromDatabase((db) => db.prepare('SELECT word, zipf, tier FROM words').all() as WordRow[]) ??
    readFileSync(files.words, 'utf-8')
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const [word, zipf, tier] = line.split('\t')
        return { word, zipf: Number(zipf), tier }
      })
  )
}

// The blocklist's lines: a word, or a prefix ending in `*`; `#` starts a comment.
export function readBlocklist(): string[] {
  return (
    fromDatabase((db) => db.prepare('SELECT entry FROM blocklist').pluck().all() as string[]) ??
    readFileSync(files.blocklist, 'utf-8').split(/\r?\n/)
  )
}

export function readChapters<T>(): T | null {
  const text = meta('chapters') ?? (existsSync(files.chapters) ? readFileSync(files.chapters, 'utf-8') : null)
  return text ? (JSON.parse(text) as T) : null
}

export function readCurve<T>(): T {
  return JSON.parse(meta('curve') ?? readFileSync(files.curve, 'utf-8')) as T
}

// Level packs written by the CLI, for script/validate_levels.py.
export const packsDir = join(repo, 'data', 'levels', 'it')
