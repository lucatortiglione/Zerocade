// Repeatable local comparison of the same real SQLite operation on the server
// thread and in its production worker. Uses fresh temporary databases only.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
if (mode === 'sync' || mode === 'worker') {
  const directory = mkdtempSync(join(tmpdir(), 'zerocade-bench-'))
  process.env.ZEROCADE_DB = join(directory, 'live.db')
  const { recordLiveEvent, listEvents, closeDb } = await import('../apps/server/src/db.ts')
  const { InfrastructureClient } = await import('../apps/server/src/infrastructureClient.ts')
  const writer = mode === 'worker' ? new InfrastructureClient('benchmark', 256) : null
  try {
    await writer?.run('barrier', null)
    const user = { id: 'bench', nickname: 'Benchmark' }
    let last = performance.now()
    const delays: number[] = []
    const timer = setInterval(() => { const now = performance.now(); delays.push(now - last); last = now }, 1)
    await new Promise((done) => setTimeout(done, 15))
    const started = performance.now()
    const count = 2000
    for (let batch = 0; batch < count; batch += 100) {
      const pending = []
      for (let i = batch; i < batch + 100; i++) {
        const event = { type: 'comment' as const, text: String(i), user }
        if (writer) pending.push(writer.run('event', { key: 'bench', creator: '', game: 'context', event }))
        else recordLiveEvent('bench', '', 'context', event)
      }
      if (writer) await Promise.all(pending)
    }
    const elapsedMs = performance.now() - started
    await new Promise((done) => setTimeout(done, 15))
    clearInterval(timer)
    delays.sort((a, b) => a - b)
    const q = (n: number) => delays[Math.min(delays.length - 1, Math.floor(n * delays.length))]
    if (listEvents('bench', 5000).length !== count) throw new Error('Workload lost rows')
    console.log(JSON.stringify({ mode, count, elapsedMs, eventsPerSecond: count * 1000 / elapsedMs,
      timerIntervalMs: { p50: q(.5), p95: q(.95), p99: q(.99), max: delays.at(-1) }, samples: delays.length,
      rssMiB: process.memoryUsage().rss / 1024 ** 2, worker: writer?.metrics() }))
  } finally { await writer?.close(); closeDb(); rmSync(directory, { recursive: true, force: true }) }
} else {
  const runs = []
  for (let trial = 0; trial < 3; trial++) for (const kind of ['sync', 'worker']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), kind], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) throw new Error(result.stderr)
    runs.push({ trial: trial + 1, ...JSON.parse(result.stdout) })
  }
  console.log(JSON.stringify({ runtime: process.version, platform: process.platform, arch: process.arch, runs }, null, 2))
}
