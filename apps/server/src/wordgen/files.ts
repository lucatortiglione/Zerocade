import { existsSync, openSync, fstatSync, readSync, closeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { giochiDb, openOptionalSchema } from '../schema-db.js'

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

function readLegacyText(file: string, maxBytes: number): string {
  const descriptor = openSync(file, 'r')
  try {
    const size = fstatSync(descriptor).size
    if (size > maxBytes) throw new Error(`File ZeroWords oltre il limite di ${maxBytes} byte`)
    const buffer = Buffer.allocUnsafe(size + 1)
    let length = 0
    while (length < buffer.length) {
      const n = readSync(descriptor, buffer, length, buffer.length - length, null)
      if (!n) break
      length += n
    }
    if (length !== size) throw new Error('File ZeroWords modificato durante la lettura')
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))
  } finally { closeSync(descriptor) }
}

function* lines(text: string): Generator<string> {
  let start = 0
  for (;;) {
    const end = text.indexOf('\n', start)
    if (end < 0) { yield text.slice(start); return }
    yield text.slice(start, end).replace(/\r$/, '')
    start = end + 1
  }
}

const files = shipped
  ? {
      chapters: join(shipped, 'chapters.json'),
      curve: join(shipped, 'curve.json'),
      words: join(shipped, 'lexicon', 'words.tsv'),
      blocklist: join(shipped, 'lexicon', 'blocklist.txt'),
    }
  : {
      chapters: join(repo, 'data', 'chapters.json'),
      curve: join(repo, 'script', 'curve.json'),
      words: join(repo, 'lexicon', 'it', 'words.tsv'),
      blocklist: join(repo, 'lexicon', 'blocklist_it.txt'),
    }

// A read of the schema parole, or null without it.
function fromDatabase<T>(read: (db: Database.Database) => T): T | null {
  if (!giochiDb) return null
  const db = openOptionalSchema(giochiDb, 'parole')
  if (!db) return null
  try { return read(db) }
  finally { db.close() }
}

const meta = (name: string): string | null => fromDatabase((db) => {
  const value = db.prepare('SELECT CASE WHEN length(CAST(value AS BLOB))<=? THEN value END FROM meta WHERE name = ?').pluck().get(1024 * 1024, name)
  if (typeof value !== 'string' || value.length > 1024 * 1024) throw new Error(`Metadato ZeroWords non valido: ${name}`)
  return value
})

export interface WordRow {
  word: string
  zipf: number
  tier: string
}

export function readWords(): WordRow[] {
  const validate = (value: unknown): WordRow => {
    if (!value || typeof value !== 'object' || !('word' in value) || !('zipf' in value) || !('tier' in value)
      || typeof value.word !== 'string' || !/^[A-Z]{4,10}$/.test(value.word)
      || typeof value.zipf !== 'number' || !Number.isFinite(value.zipf) || value.zipf < 0 || value.zipf > 9
      || (value.tier !== 'main' && value.tier !== 'extra')) throw new Error('Voce del lessico ZeroWords non valida')
    return { word: value.word, zipf: value.zipf, tier: value.tier }
  }
  const stored = fromDatabase((db) => {
      const rows: WordRow[] = []
      for (const row of db.prepare('SELECT word, zipf, tier FROM words').iterate()) {
        if (rows.length >= 500_000) throw new Error('Lessico ZeroWords oltre il limite di 500.000 voci')
        rows.push(validate(row))
      }
      return rows
    })
  if (stored !== null) return stored
  const rows: WordRow[] = []
  let header = true
  for (const line of lines(readLegacyText(files.words, 16 * 1024 * 1024))) {
    if (header) { header = false; continue }
    if (!line.trim()) continue
    if (rows.length >= 500_000) throw new Error('Lessico ZeroWords oltre il limite di 500.000 voci')
    const [word, zipf, tier] = line.split('\t')
    rows.push(validate({ word, zipf: Number(zipf), tier }))
  }
  return rows
}

// The blocklist's lines: a word, or a prefix ending in `*`; `#` starts a comment.
export function readBlocklist(): string[] {
  const collect = (values: Iterable<unknown>) => {
    const entries: string[] = []
    for (const entry of values) {
      if (typeof entry !== 'string') throw new Error('Voce della blocklist ZeroWords non valida')
      const line = entry.trim()
      if (!line || line.startsWith('#')) continue
      if (entries.length >= 10_000 || line.length > 128) throw new Error('Blocklist ZeroWords non valida o oltre il limite')
      entries.push(line)
    }
    return entries
  }
  return fromDatabase((db) => collect(db.prepare('SELECT entry FROM blocklist').pluck().iterate()))
    ?? collect(lines(readLegacyText(files.blocklist, 1024 * 1024)))
}

export function readChapters<T>(): T | null {
  const text = meta('chapters') ?? (existsSync(files.chapters) ? readLegacyText(files.chapters, 1024 * 1024) : null)
  return text ? (JSON.parse(text) as T) : null
}

export function readCurve<T>(): T {
  return JSON.parse(meta('curve') ?? readLegacyText(files.curve, 1024 * 1024)) as T
}

// Level packs written by the CLI, for script/validate_levels.py.
export const packsDir = join(repo, 'data', 'levels', 'it')
