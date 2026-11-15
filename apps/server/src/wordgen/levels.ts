import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { GeneratedLevel } from './generator.js'

// ZeroWords' levels, made on demand by the generator's worker thread and kept for a while:
// ready() answers at once for a level already made, prefetch() starts the next one while the
// current one is played, so a level rarely has to be waited for.

const here = dirname(fileURLToPath(import.meta.url))
// The Windows package bundles the worker next to the server; in the repository it runs from
// source (tsx hands its loader on to the thread).
const KEEP = 24

export type LevelReply = { n: number; level: GeneratedLevel } | { n: number; error: string }
export interface LevelWorker {
  postMessage(n: number): void
  on(type: 'message', listener: (reply: LevelReply) => void): void
  on(type: 'error', listener: (error: Error) => void): void
  on(type: 'exit', listener: (code: number) => void): void
  terminate(): Promise<number>
  unref(): void
}

function spawnWorker(): LevelWorker {
  const bundled = join(here, 'wordgen-worker.mjs')
  const resourceLimits = { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 }
  return existsSync(bundled) ? new Worker(bundled, { resourceLimits }) : new Worker(new URL('../infrastructure-bootstrap.mjs', import.meta.url), {
    workerData: { entry: new URL('./worker.ts', import.meta.url).href }, resourceLimits,
  })
}

export class LevelSource {
  private worker: LevelWorker | null = null
  private made = new Map<number, GeneratedLevel>()
  private asked = new Map<number, { promise: Promise<GeneratedLevel>; settle: (r: LevelReply) => void; timer: ReturnType<typeof setTimeout> }>()
  private closed = false
  private closing: Promise<void> | null = null

  constructor(private spawn = spawnWorker, private capacity = 8, private timeoutMs = 30_000) {}

  ready(n: number): GeneratedLevel | undefined {
    return this.made.get(n)
  }

  get(n: number): Promise<GeneratedLevel> {
    if (this.closed) return Promise.reject(new Error('Generatore di livelli chiuso'))
    if (!Number.isSafeInteger(n) || n < 1) return Promise.reject(new RangeError('Numero di livello non valido'))
    const made = this.made.get(n)
    if (made) return Promise.resolve(made)
    const asked = this.asked.get(n)
    if (asked) return asked.promise
    if (this.asked.size >= this.capacity) return Promise.reject(new Error('Generatore occupato: coda dei livelli piena'))
    let settle!: (r: LevelReply) => void
    const promise = new Promise<GeneratedLevel>((resolve, reject) => {
      settle = (r) => ('level' in r ? resolve(r.level) : reject(new Error(r.error)))
    })
    const timer = setTimeout(() => this.fail('Tempo massimo di generazione superato'), this.timeoutMs)
    this.asked.set(n, { promise, settle, timer })
    try {
      this.thread().postMessage(n)
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err))
    }
    return promise
  }

  prefetch(n: number): void {
    // A failed generation is reported by fail() above and again by the get() that needs the level: nothing to add.
    this.get(n).catch(() => undefined)
  }

  private thread(): LevelWorker {
    if (this.worker) return this.worker
    const worker = this.spawn()
    this.worker = worker
    worker.on('message', (reply: LevelReply) => {
      if (this.worker !== worker) return
      const request = this.asked.get(reply.n)
      if (!request) return
      if ('level' in reply) {
        this.made.set(reply.n, reply.level)
        if (this.made.size > KEEP) this.made.delete(this.made.keys().next().value!)
      }
      clearTimeout(request.timer)
      request.settle(reply)
      this.asked.delete(reply.n)
    })
    worker.on('error', (err: Error) => { if (this.worker === worker) this.fail(err.message) })
    worker.on('exit', (code) => {
      if (this.worker === worker) this.fail(`the level generator stopped (${code})`)
    })
    // The server keeps the process alive; the idle generator should not.
    worker.unref()
    return worker
  }

  // Everything still asked for fails; the next request starts a new thread.
  private fail(error: string): void {
    console.warn(`[zerowords] ${error}`)
    for (const [n, { settle, timer }] of this.asked) { clearTimeout(timer); settle({ n, error }) }
    this.asked.clear()
    const worker = this.worker
    this.worker = null
    void worker?.terminate().catch((err: unknown) => console.warn('[zerowords] Chiusura worker fallita', err))
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    for (const [n, { settle, timer }] of this.asked) {
      clearTimeout(timer)
      settle({ n, error: 'Generatore di livelli chiuso' })
    }
    this.asked.clear()
    this.made.clear()
    const worker = this.worker
    this.worker = null
    this.closing = worker ? worker.terminate().then(() => undefined) : Promise.resolve()
    return this.closing
  }
}

export const levels = new LevelSource()
