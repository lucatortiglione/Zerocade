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
const workerFile = [join(here, 'wordgen-worker.mjs'), join(here, 'worker.ts')].find((f) => existsSync(f))
const KEEP = 24

type Reply = { n: number; level: GeneratedLevel } | { n: number; error: string }

class LevelSource {
  private worker: Worker | null = null
  private made = new Map<number, GeneratedLevel>()
  private asked = new Map<number, { promise: Promise<GeneratedLevel>; settle: (r: Reply) => void }>()

  ready(n: number): GeneratedLevel | undefined {
    return this.made.get(n)
  }

  get(n: number): Promise<GeneratedLevel> {
    const made = this.made.get(n)
    if (made) return Promise.resolve(made)
    const asked = this.asked.get(n)
    if (asked) return asked.promise
    let settle!: (r: Reply) => void
    const promise = new Promise<GeneratedLevel>((resolve, reject) => {
      settle = (r) => ('level' in r ? resolve(r.level) : reject(new Error(r.error)))
    })
    this.asked.set(n, { promise, settle })
    try {
      this.thread().postMessage(n)
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err))
    }
    return promise
  }

  prefetch(n: number): void {
    this.get(n).catch(() => {})
  }

  private thread(): Worker {
    if (this.worker) return this.worker
    if (!workerFile) throw new Error('the level generator is missing')
    const worker = new Worker(workerFile)
    worker.on('message', (reply: Reply) => {
      if ('level' in reply) {
        this.made.set(reply.n, reply.level)
        if (this.made.size > KEEP) this.made.delete(this.made.keys().next().value!)
      }
      this.asked.get(reply.n)?.settle(reply)
      this.asked.delete(reply.n)
    })
    worker.on('error', (err: Error) => this.fail(err.message))
    worker.on('exit', (code) => {
      this.worker = null
      if (code !== 0) this.fail(`the level generator stopped (${code})`)
    })
    // The server keeps the process alive; the idle generator should not.
    worker.unref()
    this.worker = worker
    return worker
  }

  // Everything still asked for fails; the next request starts a new thread.
  private fail(error: string): void {
    console.warn(`[zerowords] ${error}`)
    for (const [n, { settle }] of this.asked) settle({ n, error })
    this.asked.clear()
    void this.worker?.terminate()
    this.worker = null
  }
}

export const levels = new LevelSource()
