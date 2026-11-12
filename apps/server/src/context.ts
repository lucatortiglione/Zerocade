import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { giochiDb, openSchema } from './schema-db.js'

// ZeroContext's data: the playable words (vocab.txt), their vectors (vectors.bin, int8, one row per word, in the
// words' order) and the words that can be secret (secrets.txt). The words live in the games' database, schema
// context (database/giochi.sqlite3); the vectors, 18 MB, in a file of their own. gioco-zerocontext/build_context_data.py
// writes both; the overlay downloads them once and ranks every guess by closeness to the secret.
// The vectors' folder (and, without the schema, the old text files): ZEROCADE_CONTEXT_DATA, zerocontext/ next to
// the server (the Windows package's copy), then gioco-zerocontext/data of the repository.

const here = dirname(fileURLToPath(import.meta.url))
const FILES = ['vocab.txt', 'vectors.bin', 'secrets.txt', 'meta.json'] as const
export type ContextFile = (typeof FILES)[number]

function fromDatabase(): Map<string, Buffer> | null {
  if (!giochiDb) return null
  try {
    const db = openSchema(giochiDb, 'context')
    try {
      const vocab = db.prepare('SELECT word FROM vocab ORDER BY idx').pluck().all() as string[]
      const secrets = db.prepare('SELECT word FROM secrets ORDER BY word').pluck().all() as string[]
      const meta = Object.fromEntries((db.prepare('SELECT name, value FROM meta').all() as { name: string; value: string }[]).map((r) => [r.name, JSON.parse(r.value)]))
      return new Map([
        ['vocab.txt', Buffer.from(vocab.join('\n') + '\n', 'utf-8')],
        ['secrets.txt', Buffer.from(secrets.join('\n') + '\n', 'utf-8')],
        ['meta.json', Buffer.from(JSON.stringify(meta, null, 2) + '\n', 'utf-8')],
      ])
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

const words = fromDatabase()
const dir = [process.env.ZEROCADE_CONTEXT_DATA, join(here, 'zerocontext'), join(here, '..', '..', '..', 'gioco-zerocontext', 'data')].find(
  (d): d is string => d !== undefined && existsSync(join(d, 'vectors.bin')),
)

if (!words || !dir) console.warn('[context] words (database/giochi.sqlite3, schema context) or vectors.bin missing: run gioco-zerocontext/build_context_data.py')

export const isContextFile = (name: string): name is ContextFile => (FILES as readonly string[]).includes(name)

export function contextFile(name: ContextFile): Buffer | null {
  if (words && name !== 'vectors.bin') return words.get(name) ?? null
  if (!dir) return null
  const path = join(dir, name)
  return existsSync(path) ? readFileSync(path) : null
}
