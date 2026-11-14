import { existsSync, readFileSync, statSync } from 'node:fs'
import { CONTEXT_LIMITS } from '@zerocade/shared'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { giochiDb, openSchema } from './schema-db.js'

// ZeroContext's data: the playable words (vocab.txt), their vectors (vectors.bin, int8, one row per word, in the
// words' order) and the words that can be secret (secrets.txt). The words live in the games' database, schema
// context (database/giochi.sqlite3), with the words ZeroAssociazioni ties to each secret (links.json); the vectors,
// 36 MB, in a file of their own. gioco-zerocontext/script/build_context_data.py
// writes both; the overlay downloads them once and ranks every guess by closeness to the secret.
// The vectors' folder (and, without the schema, the old text files): ZEROCADE_CONTEXT_DATA, zerocontext/ next to
// the server (the Windows package's copy), then gioco-zerocontext/data of the repository.

const here = dirname(fileURLToPath(import.meta.url))
const FILES = ['vocab.txt', 'vectors.bin', 'secrets.txt', 'meta.json', 'links.json'] as const
export type ContextFile = (typeof FILES)[number]
const budgets: Record<ContextFile, number> = { 'vocab.txt': CONTEXT_LIMITS.vocab, 'vectors.bin': CONTEXT_LIMITS.vectors,
  'secrets.txt': CONTEXT_LIMITS.secrets, 'links.json': CONTEXT_LIMITS.links, 'meta.json': 64 * 1024 }
export const contextFileBudget = (name: ContextFile) => budgets[name]
let unavailable = false

// The words ZeroAssociazioni ties to each secret (table links, indices into the vocabulary) and how much they rise
// in that secret's ranking (meta.link_boost, in the vectors' own scale): { boost, links: { secretIdx: [wordIdx…] } }.
// A database built before the table existed has none: no word rises.
function linksOf(db: ReturnType<typeof openSchema>, boost: number, wordCount: number): { boost: number; links: Record<string, number[]> } {
  const links: Record<string, number[]> = {}
  if (!db.prepare("SELECT 1 FROM sqlite_temp_master WHERE name = 'links'").get()) return { boost: 0, links: {} }
  let count = 0
  for (const { secret_idx: secret, word_idx: word } of db.prepare<[], { secret_idx: number; word_idx: number }>('SELECT secret_idx, word_idx FROM links ORDER BY 1, 2').iterate()) {
    if (++count > CONTEXT_LIMITS.linkCount || !Number.isInteger(secret) || !Number.isInteger(word) || secret < 0 || word < 0 || secret >= wordCount || word >= wordCount) throw new Error('invalid links')
    const list = links[secret] ??= []
    if (list.length >= CONTEXT_LIMITS.linksPerSecret) throw new Error('too many links for one secret')
    list.push(word)
  }
  return { boost, links }
}

function fromDatabase(): Map<string, Buffer> | null {
  if (!giochiDb) return null
  try {
    const db = openSchema(giochiDb, 'context')
    try {
      return db.transaction(() => {
        const vocab: string[] = []
        let vocabBytes = 0
        for (const { idx, word } of db.prepare<[], { idx: number; word: string }>('SELECT idx, word FROM vocab ORDER BY idx').iterate()) {
          if (vocab.length >= CONTEXT_LIMITS.words || idx !== vocab.length || typeof word !== 'string' || !/^[a-zàèéìòù]{2,20}$/.test(word)) throw new Error('invalid vocabulary')
          if ((vocabBytes += Buffer.byteLength(word) + 1) > budgets['vocab.txt']) throw new Error('vocabulary too large')
          vocab.push(word)
        }
        const secrets: string[] = []
        let secretBytes = 0
        for (const { word } of db.prepare<[], { word: string }>('SELECT word FROM secrets ORDER BY word').iterate()) {
          if (secrets.length >= CONTEXT_LIMITS.words || typeof word !== 'string' || !/^[a-zàèéìòù]{2,20}$/.test(word)) throw new Error('invalid secrets')
          if ((secretBytes += Buffer.byteLength(word) + 1) > budgets['secrets.txt']) throw new Error('secrets too large')
          secrets.push(word)
        }
        const metadata = new Map<string, unknown>()
        let metaBytes = 0
        for (const { name, value } of db.prepare<[], { name: string; value: string }>('SELECT name, value FROM meta').iterate()) {
          if (metadata.size >= 32 || (metaBytes += 2 * (name.length + value.length)) > budgets['meta.json']) throw new Error('metadata too large')
          metadata.set(name, JSON.parse(value))
        }
        const meta = Object.fromEntries(metadata)
        if (meta.words !== vocab.length || typeof meta.dim !== 'number' || !Number.isInteger(meta.dim) || meta.dim < 1 || meta.dim > CONTEXT_LIMITS.dimensions) throw new Error('metadata does not match vocabulary')
        const boost = meta.link_boost ?? 0 // absent in legacy builds without links
        if (typeof boost !== 'number' || !Number.isFinite(boost) || boost < 0 || boost > CONTEXT_LIMITS.maxBoost) throw new Error('invalid link boost')
        const files = new Map<ContextFile, Buffer>([
          ['vocab.txt', Buffer.from(vocab.join('\n') + '\n', 'utf-8')],
          ['secrets.txt', Buffer.from(secrets.join('\n') + '\n', 'utf-8')],
          ['meta.json', Buffer.from(JSON.stringify(meta, null, 2) + '\n', 'utf-8')],
          ['links.json', Buffer.from(JSON.stringify(linksOf(db, boost, vocab.length)), 'utf-8')],
        ])
        for (const [name, buffer] of files) if (buffer.byteLength > budgets[name]) throw new Error(`${name} too large`)
        return files
      })()
    } finally {
      db.close()
    }
  } catch (error) {
    // Legacy files are supported only when the schema is absent. A corrupt or
    // unverified present schema must never silently switch to different words.
    if (error instanceof Error && error.message.endsWith('has no schema context')) return null
    unavailable = true
    console.error('[context] Dati non disponibili; fallback disabilitato:', error instanceof Error ? error.message : String(error))
    return null
  }
}

const words = fromDatabase()
const dir = [process.env.ZEROCADE_CONTEXT_DATA, join(here, 'zerocontext'), join(here, '..', '..', '..', 'gioco-zerocontext', 'data')].find(
  (d): d is string => d !== undefined && existsSync(join(d, 'vectors.bin')),
)

if (!words || !dir) console.warn('[context] words (database/giochi.sqlite3, schema context) or vectors.bin missing: run gioco-zerocontext/script/build_context_data.py')

export const isContextFile = (name: string): name is ContextFile => (FILES as readonly string[]).includes(name)

// Hosting only: the HTTP adapter streams large files with backpressure. The
// game's word/vector format and the synchronous reader used by tools stay intact.
export function contextResource(name: ContextFile): Buffer | string | null {
  if (unavailable) return null
  if (words && name !== 'vectors.bin') return words.get(name) ?? null
  return dir ? join(dir, name) : null
}

export function contextFile(name: ContextFile): Buffer | null {
  if (unavailable) return null
  if (words && name !== 'vectors.bin') return words.get(name) ?? null
  if (!dir) return null
  const path = join(dir, name)
  return existsSync(path) && statSync(path).size <= budgets[name] ? readFileSync(path) : null
}
