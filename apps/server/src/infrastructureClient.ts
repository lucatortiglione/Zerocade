import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { payloadBytes } from '@zerocade/shared'
import { dbPath } from './db.js'
import type { InfrastructureJobs, JobName, JobResponse } from './infrastructureJobs.js'

const here = dirname(fileURLToPath(import.meta.url))
interface Pending { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout; bytes: number; at: number; kind: JobName }
const MUTATIONS = new Set<JobName>(['event', 'creator', 'padSave', 'padRemove', 'padVolume'])
export class WorkerJobError extends Error {
  constructor(message: string, readonly category: 'saturated' | 'closed' | 'timeout' | 'worker' | 'operation',
    readonly outcome: 'not-started' | 'failed' | 'unknown', readonly requestId?: number) { super(message) }
}
const deadline = (kind: JobName) => kind === 'export' || kind === 'site' ? 60_000 : kind === 'close' ? 5000 : 15_000

export class InfrastructureClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private serial = 0
  private closing = false
  private bytes = 0
  private completed = 0
  private failed = 0
  private rejected = 0
  private unknown = 0
  private latencies: number[] = []
  private lastFailure: string | null = null
  private closePromise: Promise<void> | null = null
  constructor(private name: string, private capacity = 256, private database = dbPath, private byteBudget = 64 * 1024 * 1024) {}

  run<K extends JobName>(kind: K, args: InfrastructureJobs[K]['args']): Promise<InfrastructureJobs[K]['result']> {
    if (this.closing) { this.rejected++; return Promise.reject(new WorkerJobError(`${this.name}: chiusura in corso`, 'closed', 'not-started')) }
    if (this.pending.size >= this.capacity) { this.rejected++; return Promise.reject(new WorkerJobError(`${this.name}: coda piena (${this.capacity})`, 'saturated', 'not-started')) }
    const bytes = 3 * payloadBytes(args, this.byteBudget)
    if (this.bytes + bytes > this.byteBudget) { this.rejected++; return Promise.reject(new WorkerJobError(`${this.name}: budget della coda superato`, 'saturated', 'not-started')) }
    // The only assertion is the typed internal RPC boundary; replies are produced
    // by the fixed job dispatcher, never by an external client.
    return this.request(kind, args, bytes) as Promise<InfrastructureJobs[K]['result']>
  }

  private request(kind: JobName, args: InfrastructureJobs[JobName]['args'], bytes = 16): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.serial
      const timer = setTimeout(() => this.fail(new Error(`${this.name}: timeout`), 'timeout'), deadline(kind))
      this.pending.set(id, { resolve, reject, timer, bytes, at: performance.now(), kind })
      this.bytes += bytes
      try { this.thread().postMessage({ id, kind, args }) }
      catch (error) {
        this.pending.delete(id)
        this.bytes -= bytes
        clearTimeout(timer)
        this.rejected++
        if (!this.worker) this.lastFailure = 'worker'
        reject(new WorkerJobError(error instanceof Error ? error.message : String(error), 'operation', 'not-started', id))
        // A new uncloneable command must not cancel unrelated writes in flight.
      }
    })
  }

  private thread(): Worker {
    if (this.worker) return this.worker
    const bundled = join(here, 'infrastructure-worker.mjs')
    const resourceLimits = { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 }
    const worker = existsSync(bundled)
      ? new Worker(bundled, { env: { ...process.env, ZEROCADE_DB: this.database }, resourceLimits })
      : new Worker(new URL('./infrastructure-bootstrap.mjs', import.meta.url), {
        env: { ...process.env, ZEROCADE_DB: this.database },
        workerData: { entry: new URL('./infrastructure-worker.ts', import.meta.url).href },
        resourceLimits,
      })
    this.worker = worker
    worker.on('message', (reply: JobResponse) => {
      if (this.worker !== worker) return
      const pending = this.pending.get(reply.id)
      if (!pending) return
      this.pending.delete(reply.id)
      this.bytes -= pending.bytes
      clearTimeout(pending.timer)
      this.latencies.push(performance.now() - pending.at)
      if (this.latencies.length > 256) this.latencies.shift()
      if (reply.ok) { this.completed++; this.lastFailure = null; pending.resolve(reply.result) }
      else {
        this.failed++
        this.lastFailure = 'operation'
        const outcome = MUTATIONS.has(pending.kind) ? 'unknown' : 'failed'
        if (outcome === 'unknown') this.unknown++
        pending.reject(new WorkerJobError(`${this.name}: ${reply.error}`, 'operation', outcome, reply.id))
      }
    })
    worker.on('error', (error: unknown) => { if (this.worker === worker) this.fail(error instanceof Error ? error : new Error(String(error))) })
    worker.on('exit', (code) => { if (this.worker === worker) this.fail(new Error(`${this.name}: thread terminato (${code})`)) })
    worker.unref()
    return worker
  }

  private fail(error: Error, category: 'worker' | 'timeout' = 'worker'): void {
    const worker = this.worker
    this.worker = null
    this.lastFailure = category
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      this.failed++
      const outcome = MUTATIONS.has(pending.kind) ? 'unknown' : 'failed'
      if (outcome === 'unknown') this.unknown++
      pending.reject(new WorkerJobError(error.message, category, outcome, id))
    }
    this.pending.clear()
    this.bytes = 0
    void worker?.terminate()
    // Writes with an uncertain outcome are never replayed automatically.
  }

  metrics() {
    const times = [...this.latencies].sort((a, b) => a - b)
    const quantile = (q: number) => times.length ? times[Math.min(times.length - 1, Math.floor(times.length * q))] : null
    return { state: this.closing ? 'closed' : this.worker ? 'ready' : this.lastFailure ? 'degraded' : 'idle',
      queued: this.pending.size, bytes: this.bytes, capacity: this.capacity, byteBudget: this.byteBudget,
      completed: this.completed, failed: this.failed, rejected: this.rejected, unknownOutcomes: this.unknown,
      samples: times.length, latencyMs: { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99) }, lastFailure: this.lastFailure }
  }

  close(): Promise<void> {
    this.closing = true
    this.closePromise ??= (async () => {
      if (!this.worker) return
      // Posted after all preceding jobs; concurrent callers share one drain.
      await this.request('close', null)
      const worker = this.worker
      this.worker = null
      await worker?.terminate()
    })()
    return this.closePromise
  }
}

export const persistence = new InfrastructureClient('persistenza', 2048)
export const reports = new InfrastructureClient('report', 32)
