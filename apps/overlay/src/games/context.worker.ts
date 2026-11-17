import { ContextError } from '@zerocade/shared'
import { loadContextData } from './contextLoader'
import { rankAgainst, type ContextRankSource } from './contextRanking'
import type { ContextRequest, ContextResponse } from './contextProtocol'

let source: ContextRankSource | null = null
let loading = false
const send = (response: ContextResponse, transfer: Transferable[] = []) => globalThis.postMessage(response, { transfer })

globalThis.addEventListener('message', (event: MessageEvent<ContextRequest>) => {
  const request = event.data
  if (request.type === 'load') {
    if (loading || source) { send({ type: 'error', id: request.id, kind: 'saturated', message: 'Dati già caricati o in caricamento.' }); return }
    loading = true
    void loadContextData(request.origin, new AbortController().signal).then((data) => {
      source = { wordCount: data.words.length, vectors: data.vectors, dim: data.dim, links: data.links, linkBoost: data.linkBoost, hubs: data.hubs, norms: data.norms }
      send({ type: 'ready', id: request.id, vocabulary: { words: data.words, secrets: data.secrets, index: data.index, folded: data.folded, semantic: data.semantic } })
      // After this callback, word maps belong only to the UI. This thread keeps
      // its dense vectors and links; no second copy of vectors crosses the port.
    }).catch((error: unknown) => {
      const failure = error instanceof ContextError ? error : new ContextError('worker', 'Caricamento nel worker non riuscito.')
      send({ type: 'error', id: request.id, kind: failure.kind, message: failure.message })
    }).finally(() => { loading = false })
    return
  }
  try {
    if (!source) throw new ContextError('data', 'Vocabolario non ancora disponibile.')
    const started = performance.now()
    const ranking = rankAgainst(source, request.secret)
    send({ type: 'ranked', id: request.id, ranking, durationMs: performance.now() - started }, [ranking.order.buffer, ranking.rankOf.buffer,
      ...(ranking.similarities ? [ranking.similarities.buffer] : [])])
  } catch (error) {
    const failure = error instanceof ContextError ? error : new ContextError('worker', 'Calcolo ZeroContext non riuscito.')
    send({ type: 'error', id: request.id, kind: failure.kind, message: failure.message })
  }
})
