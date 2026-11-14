import { CONTEXT_LIMITS, ContextError } from '@zerocade/shared'
import type { ContextVocabulary, Ranking } from './contextRanking'
import type { ContextComputer, ContextResponse, ContextWorkerPort } from './contextProtocol'

interface RankJob { id: number; secret: number; resolve(value: Ranking): void; reject(error: ContextError): void; timer?: ReturnType<typeof setTimeout> }
interface LoadJob { id: number; resolve(value: ContextVocabulary): void; reject(error: ContextError): void; timer: ReturnType<typeof setTimeout> }

// Exactly one executing rank and one replaceable pending rank. Computations are
// pure: replacing an obsolete request cannot repeat score or network effects.
// dispose() terminates the owned thread, including an unresponsive fetch/sort.
export class ContextWorkerClient implements ContextComputer {
  private worker: ContextWorkerPort | null = null
  private loadPromise: Promise<ContextVocabulary> | null = null
  private loading: LoadJob | null = null
  private active: RankJob | null = null
  private queued: RankJob | null = null
  private serial = 0
  private ready = false
  private disposed = false
  private completed = 0
  private superseded = 0
  private failures = 0
  private lastComputeMs: number | null = null

  constructor(private origin: string,
    private spawn: () => ContextWorkerPort = () => new Worker(new URL('./context.worker.ts', import.meta.url), { type: 'module' }),
    private deadlines: { loadMs: number; rankMs: number } = CONTEXT_LIMITS) {}

  load(): Promise<ContextVocabulary> {
    if (this.disposed) return Promise.reject(new ContextError('closed', 'ZeroContext è stato chiuso.'))
    if (this.loadPromise) return this.loadPromise
    const promise = new Promise<ContextVocabulary>((resolve, reject) => {
      const id = ++this.serial
      const timer = setTimeout(() => this.fail(new ContextError('timeout', 'Caricamento ZeroContext scaduto.')), this.deadlines.loadMs)
      this.loading = { id, resolve, reject, timer }
      try {
        const worker = this.spawn()
        this.worker = worker
        worker.addEventListener('message', ({ data }) => { if (this.worker === worker) this.receive(data) })
        const failed = () => { if (this.worker === worker) this.fail(new ContextError('worker', 'Il worker di ZeroContext si è interrotto.')) }
        worker.addEventListener('error', failed)
        worker.addEventListener('messageerror', failed)
        worker.postMessage({ type: 'load', id, origin: this.origin })
      } catch { this.fail(new ContextError('worker', 'Impossibile avviare il worker di ZeroContext.')) }
    })
    this.loadPromise = promise
    void promise.catch(() => { if (this.loadPromise === promise) this.loadPromise = null })
    return promise
  }

  rank(secret: number): Promise<Ranking> {
    if (this.disposed) return Promise.reject(new ContextError('closed', 'ZeroContext è stato chiuso.'))
    if (!this.ready) return Promise.reject(new ContextError('data', 'Le parole di ZeroContext non sono pronte.'))
    return new Promise((resolve, reject) => {
      const job: RankJob = { id: ++this.serial, secret, resolve, reject }
      if (this.active) {
        if (this.queued) { this.superseded++; this.queued.reject(new ContextError('superseded', 'Classifica sostituita da una richiesta più recente.')) }
        this.queued = job
      } else this.start(job)
    })
  }

  private start(job: RankJob) {
    this.active = job
    job.timer = setTimeout(() => this.fail(new ContextError('timeout', 'Calcolo di ZeroContext scaduto.')), this.deadlines.rankMs)
    try {
      if (!this.worker) throw new Error('Worker assente')
      this.worker.postMessage({ type: 'rank', id: job.id, secret: job.secret })
    }
    catch { this.fail(new ContextError('worker', 'Invio del calcolo ZeroContext non riuscito.')) }
  }

  private receive(reply: ContextResponse) {
    if (reply.type === 'error') {
      if (reply.id === this.loading?.id || reply.id === this.active?.id) this.fail(new ContextError(reply.kind, reply.message))
      return
    }
    if (reply.type === 'ready' && reply.id === this.loading?.id) {
      const job = this.loading
      this.loading = null
      this.ready = true
      clearTimeout(job.timer)
      job.resolve(reply.vocabulary)
    } else if (reply.type === 'ranked' && reply.id === this.active?.id) {
      const job = this.active
      this.active = null
      clearTimeout(job.timer)
      this.completed++
      this.lastComputeMs = reply.durationMs
      job.resolve(reply.ranking)
      const next = this.queued
      this.queued = null
      if (next) this.start(next)
    }
  }

  private fail(error: ContextError) {
    if (error.kind !== 'closed') this.failures++
    const worker = this.worker
    this.worker = null
    this.ready = false
    this.loadPromise = null
    if (this.loading) { clearTimeout(this.loading.timer); this.loading.reject(error); this.loading = null }
    if (this.active) { clearTimeout(this.active.timer); this.active.reject(error); this.active = null }
    this.queued?.reject(error)
    this.queued = null
    worker?.terminate()
  }

  metrics() {
    return { state: this.disposed ? 'closed' : this.ready ? 'ready' : this.loading ? 'loading' : 'idle',
      active: this.active ? 1 : 0, queued: this.queued ? 1 : 0, completed: this.completed,
      superseded: this.superseded, failures: this.failures, lastComputeMs: this.lastComputeMs }
  }

  dispose() { if (!this.disposed) { this.disposed = true; this.fail(new ContextError('closed', 'ZeroContext è stato chiuso.')) } }
}
