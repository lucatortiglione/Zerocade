import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { giochiDb, openSchema } from './schema-db.js'

// ZeroWordle's words, for each length from 5 to 8 letters: the ones that can be the solution (solutions-N.txt)
// and every word accepted as a guess (words-N.txt). They live in the games' database, schema wordle
// (database/giochi.sqlite3, written by gioco-zerowordle/build_wordle_bank.py); the overlay downloads them once,
// as text. Without that schema, the old text files: ZEROCADE_WORDLE_DATA, zerowordle/ next to the server, then
// gioco-zerowordle/data.

const here = dirname(fileURLToPath(import.meta.url))
const FILE = /^(?:solutions|words)-([5-8])\.txt$|^meta\.json$/

function fromDatabase(): Map<string, Buffer> | null {
  if (!giochiDb) return null
  try {
    const db = openSchema(giochiDb, 'wordle')
    try {
      const out = new Map<string, Buffer>()
      for (let n = 5; n <= 8; n++) {
        for (const kind of ['solutions', 'words'] as const) {
          const words = db.prepare(`SELECT word FROM ${kind} WHERE length = ? ORDER BY word`).pluck().all(n) as string[]
          out.set(`${kind}-${n}.txt`, Buffer.from(words.join('\n') + '\n', 'utf-8'))
        }
      }
      const meta = Object.fromEntries((db.prepare('SELECT name, value FROM meta').all() as { name: string; value: string }[]).map((r) => [r.name, JSON.parse(r.value)]))
      out.set('meta.json', Buffer.from(JSON.stringify(meta, null, 2) + '\n', 'utf-8'))
      return out
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

const lists = fromDatabase()
const dir = lists
  ? undefined
  : [process.env.ZEROCADE_WORDLE_DATA, join(here, 'zerowordle'), join(here, '..', '..', '..', 'gioco-zerowordle', 'data')].find(
      (d): d is string => d !== undefined && existsSync(join(d, 'solutions-5.txt')),
    )

if (!lists && !dir) console.warn('[wordle] no words (database/giochi.sqlite3, schema wordle): run gioco-zerowordle/build_wordle_bank.py')

export const isWordleFile = (name: string) => FILE.test(name)

export function wordleFile(name: string): Buffer | null {
  if (lists) return lists.get(name) ?? null
  if (!dir) return null
  const path = join(dir, name)
  return existsSync(path) ? readFileSync(path) : null
}
