import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

// The associations of Pipeline B as ZeroContext's third source (profile `pipeline_b`). The export
// (database/ZeroContext_Associazioni_PipelineB.sqlite3, written by gioco-zerocontext/pipeline_b/build.py) holds, for each secret of
// ZeroContext_Segrete, its top-N associated words with their position (`rank`, 1 = the closest). The game plays the secrets of the
// export and puts those words first in each secret's ranking; the rest of the vocabulary stays ordered by the vectors
// (packages/shared/src/contextRanking.ts, `pinned`). Only the words of the game's vocabulary can be played: the others are skipped.

const here = dirname(fileURLToPath(import.meta.url))

export const pipelineBFile = [process.env.ZEROCADE_ASSOCIATIONS_B_FILE, join(here, 'ZeroContext_Associazioni_PipelineB.sqlite3'),
  join(here, '..', '..', '..', 'database', 'ZeroContext_Associazioni_PipelineB.sqlite3')].find((p): p is string => p !== undefined && existsSync(p))

// A secret with fewer associated words in the vocabulary than this is not played: its ranking would be the vectors' again.
export const PIPELINE_MIN_PINNED = 100

export interface PipelineAssociations {
  version: string
  // secret's index in the vocabulary -> the indices of its associated words, in the order of the export (position 2, 3...)
  pinned: Map<number, number[]>
  fingerprint: string
  skipped: { notInVocabulary: number; tooFew: number }
}

export function loadPipelineAssociations(file: string, vocab: readonly string[], minPinned = PIPELINE_MIN_PINNED): PipelineAssociations {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    db.pragma('busy_timeout = 5000')
    const columns = db.prepare<[], { name: string }>("SELECT name FROM pragma_table_info('semantic_pair_scores')").all().map((c) => c.name)
    if (!columns.includes('rank')) throw new Error("l'export non ha la colonna rank: rilancia il task «ZeroContext : Associazione Parole PipelineB»")
    const version = db.prepare<[], { value: string }>("SELECT value FROM pipeline_meta WHERE name = 'model_version'").get()?.value
    if (!version) throw new Error("l'export non ha model_version")
    const index = new Map(vocab.map((w, i) => [w, i]))
    // lexeme id -> index in the game's vocabulary (the lexemes outside it cannot be guessed).
    const inVocabulary = new Map<number, number>()
    for (const { lexeme_id: id, lemma } of db.prepare<[], { lexeme_id: number; lemma: string }>('SELECT lexeme_id, lemma FROM lexemes').iterate()) {
      const i = index.get(lemma)
      if (i !== undefined) inVocabulary.set(id, i)
    }
    const ofSecret = db.prepare<[number, string], { target_lexeme_id: number }>(
      'SELECT target_lexeme_id FROM semantic_pair_scores WHERE source_lexeme_id = ? AND model_version = ? ORDER BY rank')
    const pinned = new Map<number, number[]>()
    const skipped = { notInVocabulary: 0, tooFew: 0 }
    for (const [id, secret] of inVocabulary) {
      const list: number[] = []
      const seen = new Set<number>([secret])
      let rows = 0
      for (const { target_lexeme_id: target } of ofSecret.iterate(id, version)) {
        rows++
        const i = inVocabulary.get(target)
        if (i !== undefined && !seen.has(i)) { seen.add(i); list.push(i) }
      }
      if (!rows) continue // not a secret of the export
      if (list.length < minPinned) { skipped.tooFew++; continue }
      pinned.set(secret, list)
    }
    // The secrets of the export that are not words of the vocabulary.
    const sources = db.prepare<[], { value: string }>("SELECT value FROM pipeline_meta WHERE name = 'queries'").get()?.value
    if (sources && Number.isFinite(Number(sources))) skipped.notInVocabulary = Math.max(0, Number(sources) - pinned.size - skipped.tooFew)
    let total = 0
    for (const list of pinned.values()) total += list.length
    const fingerprint = createHash('sha256').update(`${version}|${statSync(file).size}|${pinned.size}|${total}|${vocab.length}`).digest('hex')
    return { version, pinned, fingerprint, skipped }
  } finally {
    db.close()
  }
}
