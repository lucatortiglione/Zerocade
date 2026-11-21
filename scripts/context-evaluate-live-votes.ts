import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { rankAgainst } from '@zerocade/shared/contextRanking'
import { loadPipelineAssociations, riordinoFile, RIORDINO_MIN_PINNED } from '../apps/server/src/context-pipeline.js'

const { values } = parseArgs({ options: { db: { type: 'string' } } })
const file = resolve(values.db ?? process.env.ZEROCADE_DB ?? 'apps/server/data/zerocade.db')
type Vote = { secret: string; word_a: string; word_b: string; verdict: 'a' | 'b' | 'tie' }

function readVotes(): Vote[] {
  if (!existsSync(file)) return []
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='context_live_pairs'").get()) return []
    return db.prepare<[], Vote>(`SELECT secret, word_a, word_b, verdict FROM context_live_pairs
      WHERE verdict IS NOT NULL ORDER BY secret, id`).all()
  } finally {
    db.close()
  }
}

const votes = readVotes()
const ties = votes.filter(vote => vote.verdict === 'tie').length
const result = { voti: votes.length, pari_merito: ties, confronti_comuni: 0, esclusi: 0,
  preferenze_rispettate: { riordino_precedente: 0, riordino_specifico: 0 }, migliorati: 0, peggiorati: 0 }
if (votes.length > ties) {
  const { serverCorpus } = await import('../apps/server/src/context-tournament-ranking.js')
  const current = serverCorpus('riordino')
  if (!current || !riordinoFile) throw new Error('Riordino non disponibile: controlla il corpus e il database delle associazioni.')
  const { data } = current
  const previous = { ...data, pinned: loadPipelineAssociations(riordinoFile, data.words, RIORDINO_MIN_PINNED).pinned }
  // Rows are sorted by secret, so only the current pair of full rankings is kept in memory.
  let last: { secret: number; before: Uint32Array; after: Uint32Array } | undefined
  for (const vote of votes) {
    if (vote.verdict === 'tie') continue
    const secret = data.index.get(vote.secret)
    const a = data.index.get(vote.word_a)
    const b = data.index.get(vote.word_b)
    if (secret === undefined || !previous.pinned.has(secret) || !data.pinned?.has(secret) ||
        a === undefined || b === undefined || a === b || a === secret || b === secret) {
      result.esclusi++
      continue
    }
    if (secret !== last?.secret) {
      last = { secret, before: rankAgainst(previous, secret).rankOf, after: rankAgainst(data, secret).rankOf }
    }
    const [winner, other] = vote.verdict === 'a' ? [a, b] : [b, a]
    const before = last.before[winner] < last.before[other]
    const after = last.after[winner] < last.after[other]
    result.confronti_comuni++
    if (before) result.preferenze_rispettate.riordino_precedente++
    if (after) result.preferenze_rispettate.riordino_specifico++
    if (after && !before) result.migliorati++
    if (before && !after) result.peggiorati++
  }
}
console.log(JSON.stringify({ database: file, ...result }, null, 2))
if (!result.confronti_comuni) console.log('Nessuna preferenza confrontabile. I voti si raccolgono in Qualità al termine di una sessione ZeroContext.')
