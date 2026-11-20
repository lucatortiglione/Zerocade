import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { ContextProfile } from '@zerocade/shared'
import { contextVocabulary, type Ranking } from '@zerocade/shared/contextRanking'
import type { Corpus } from './context-tournament-ranking.js'
import type { ContextJob, ContextReply, LoadedVocabulary, RankReply } from './context-worker.js'

// ZeroContext on the main thread: the vocabulary of each set of associations (to read guesses and pick secrets) and the
// rankings, asked of the ranking thread (context-worker.ts), which alone loads the vectors. Nothing here blocks: a corpus is
// `loading` until the thread has read and checked it, then `ready` (or `unavailable`); a ranking is a promise. If the thread
// dies, the requests in flight fail and the next one starts a new thread, which reloads what it needs by itself.

const here = dirname(fileURLToPath(import.meta.url))

export type CorpusStatus = 'loading' | 'ready' | 'unavailable'
export interface ProfileRow { id: ContextProfile; label: string; available: boolean; words: number; secrets: number; dim: number; revision: string; problem?: string }

interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }
interface Entry { status: CorpusStatus; corpus: Corpus | null; promise: Promise<Corpus | null> | null }

const TIMEOUT_MS: Record<ContextJob['kind'], number> = { load: 180_000, rank: 60_000, reload: 180_000, profiles: 180_000 }

function spawnWorker(): Worker {
  const bundled = join(here, 'context-worker.mjs')
  return existsSync(bundled)
    ? new Worker(bundled)
    : new Worker(new URL('./infrastructure-bootstrap.mjs', import.meta.url), { workerData: { entry: new URL('./context-worker.ts', import.meta.url).href } })
}

type JobInput = ContextJob extends infer J ? J extends { id: number } ? Omit<J, 'id'> : never : never

export class ContextCorpora {
  readonly profilesTimeoutMs = TIMEOUT_MS.profiles
  private worker: Worker | null = null
  private serial = 0
  private readonly pending = new Map<number, Pending>()
  private readonly entries = new Map<ContextProfile, Entry>()
  private readonly profileOf = new Map<string, ContextProfile>() // corpus hash -> profile
  private readonly listeners: ((profile: ContextProfile, corpus: Corpus | null) => void)[] = []
  private closed = false

  constructor(private readonly spawn: () => Worker = spawnWorker) {}

  status(profile: ContextProfile): CorpusStatus | null {
    return this.entries.get(profile)?.status ?? null
  }

  // The corpus if it is ready; otherwise null, and its loading starts (a profile found unavailable is not asked again here).
  get(profile: ContextProfile): Corpus | null {
    const entry = this.entries.get(profile)
    if (!entry) void this.load(profile)
    return entry?.corpus ?? null
  }

  // Ready, or loaded now. An unavailable profile is asked again (its files may have appeared); one loading is shared.
  load(profile: ContextProfile): Promise<Corpus | null> {
    const entry = this.entries.get(profile)
    if (entry?.status === 'ready') return Promise.resolve(entry.corpus)
    if (entry?.promise) return entry.promise
    const next: Entry = { status: 'loading', corpus: null, promise: null }
    this.entries.set(profile, next)
    next.promise = this.request<LoadedVocabulary | null>({ kind: 'load', profile }).then((loaded) => {
      if (this.entries.get(profile) !== next) return this.entries.get(profile)?.corpus ?? null
      next.promise = null
      next.status = loaded ? 'ready' : 'unavailable'
      next.corpus = loaded ? { hash: loaded.hash, data: contextVocabulary(loaded.words, loaded.secrets, loaded.semantic) } : null
      if (loaded) this.profileOf.set(loaded.hash, profile)
      for (const listener of this.listeners) listener(profile, next.corpus)
      return next.corpus
    }, (error: Error) => {
      // Not "unavailable": the thread failed (or timed out). The next request tries again.
      if (this.entries.get(profile) === next) this.entries.delete(profile)
      console.error(`[context] caricamento di «${profile}» non riuscito:`, error.message)
      return null
    })
    return next.promise
  }

  // Called when a corpus has been loaded (ready or unavailable).
  onLoaded(listener: (profile: ContextProfile, corpus: Corpus | null) => void) {
    this.listeners.push(listener)
  }

  rank(corpus: Corpus, secret: number): Promise<Ranking> {
    const profile = this.profileOf.get(corpus.hash)
    if (!profile) return Promise.reject(new Error('Corpus di ZeroContext sconosciuto al thread di calcolo'))
    return this.request<RankReply>({ kind: 'rank', profile, hash: corpus.hash, secret })
  }

  // The publisher wrote a new revision: the ranking thread reloads it, and every corpus that was ready is read again before
  // this resolves, so that the tournaments compare their corpus with a loaded one (an unchanged one keeps its hash and is
  // not suspended). The hashes already known stay mapped: a hash names one corpus, and the thread refuses one it no longer has.
  async reload(revision: string, profile: ContextProfile = 'original') {
    const loaded = await this.request<{ revision: string; words: number; dim: number }>({ kind: 'reload', profile, revision })
    const ready = [...this.entries].filter(([, e]) => e.status === 'ready').map(([p]) => p)
    this.entries.clear()
    await Promise.all([...new Set([profile, ...ready])].map((p) => this.load(p)))
    return loaded
  }

  profiles(): Promise<ProfileRow[]> {
    return this.request<ProfileRow[]>({ kind: 'profiles' })
  }

  close() {
    this.closed = true
    const worker = this.worker
    this.worker = null
    this.failAll(new Error('Zerocade si sta chiudendo'))
    void worker?.terminate()
  }

  private request<T>(job: JobInput): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Zerocade si sta chiudendo'))
    return new Promise<T>((resolve, reject) => {
      const id = ++this.serial
      const timer = setTimeout(() => {
        // A thread that does not answer is replaced: what it was doing is lost, the next request starts a new one.
        this.pending.delete(id)
        reject(new Error(`ZeroContext: il thread di calcolo non ha risposto (${job.kind})`))
        this.restart(new Error('thread di calcolo bloccato'))
      }, TIMEOUT_MS[job.kind])
      timer.unref()
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      try { this.thread().postMessage({ ...job, id }) }
      catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private thread(): Worker {
    if (this.worker) return this.worker
    const worker = this.spawn()
    worker.unref() // it never keeps the process alive by itself
    this.worker = worker
    worker.on('message', (reply: ContextReply) => {
      const pending = this.pending.get(reply.id)
      if (!pending) return
      this.pending.delete(reply.id)
      clearTimeout(pending.timer)
      if (reply.ok) pending.resolve(reply.result)
      else pending.reject(new Error(reply.error))
    })
    worker.on('error', (error: unknown) => { if (this.worker === worker) this.restart(error instanceof Error ? error : new Error(String(error))) })
    worker.on('exit', (code) => { if (this.worker === worker) this.restart(new Error(`thread di calcolo terminato (codice ${code})`)) })
    return worker
  }

  private restart(error: Error) {
    const worker = this.worker
    this.worker = null
    console.error('[context] thread di calcolo:', error.message)
    this.failAll(error)
    void worker?.terminate()
  }

  private failAll(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(error)
    }
  }
}
