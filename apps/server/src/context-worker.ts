import { parentPort } from 'node:worker_threads'
import { contextProfile, type ContextProfile } from '@zerocade/shared'
import { rankAgainst } from '@zerocade/shared/contextRanking'
import { availableContextProfiles, reloadContext } from './context.js'
import { invalidateContextCorpus, serverCorpus } from './context-tournament-ranking.js'

// ZeroContext's ranking thread. It holds the corpora with their vectors (110-384 MB each) and does the heavy work, so that
// the thread serving overlays and dashboards never stops for it: loading and checking a corpus (0.5-1.8 s), ranking every
// word against a secret (120-270 ms), the list of the available associations (Pipeline B reads its export). The main
// thread keeps the vocabulary only (context-corpora.ts). The messages are the `ContextJob`s below, answered by id.

export type ContextJob =
  | { id: number; kind: 'load'; profile: ContextProfile }
  | { id: number; kind: 'rank'; profile: ContextProfile; hash: string; secret: number }
  | { id: number; kind: 'reload'; profile: ContextProfile; revision: string }
  | { id: number; kind: 'profiles' }

export interface LoadedVocabulary {
  hash: string
  words: string[]
  secrets: number[]
  semantic?: import('@zerocade/shared/contextRanking').ContextSemanticPools
}
export interface RankReply { secret: number; order: Uint32Array<ArrayBuffer>; rankOf: Uint32Array<ArrayBuffer>; similarities?: Float32Array<ArrayBuffer> }
export type ContextReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }

const port = parentPort
if (!port) throw new Error('context-worker: avviato fuori da un worker')

function handle(job: ContextJob): { result: unknown; transfer?: ArrayBuffer[] } {
  switch (job.kind) {
    case 'load': {
      const corpus = serverCorpus(contextProfile(job.profile))
      if (!corpus) return { result: null }
      const { words, secrets, semantic } = corpus.data
      return { result: { hash: corpus.hash, words, secrets, ...(semantic ? { semantic } : {}) } satisfies LoadedVocabulary }
    }
    case 'rank': {
      const corpus = serverCorpus(contextProfile(job.profile))
      // The main thread asked for the corpus it knows: a different one (reloaded in between) must not answer for it.
      if (!corpus || corpus.hash !== job.hash) throw new Error('Il corpus di ZeroContext è cambiato: classifica non calcolata')
      const ranking = rankAgainst(corpus.data, job.secret)
      const reply: RankReply = { secret: ranking.secret, order: ranking.order, rankOf: ranking.rankOf, ...(ranking.similarities ? { similarities: ranking.similarities } : {}) }
      return { result: reply, transfer: [ranking.order.buffer, ranking.rankOf.buffer, ...(ranking.similarities ? [ranking.similarities.buffer] : [])] }
    }
    case 'reload': {
      const loaded = reloadContext(job.revision, contextProfile(job.profile))
      invalidateContextCorpus()
      if (!serverCorpus(contextProfile(job.profile))) throw new Error('Il nuovo corpus non supera la validazione del ranking')
      return { result: loaded }
    }
    case 'profiles':
      return { result: availableContextProfiles() }
  }
}

port.on('message', (job: ContextJob) => {
  try {
    const { result, transfer } = handle(job)
    port.postMessage({ id: job.id, ok: true, result } satisfies ContextReply, transfer ?? [])
  } catch (error) {
    port.postMessage({ id: job.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ContextReply)
  }
})
