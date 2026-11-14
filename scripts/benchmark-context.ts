// Same shipped vectors/ranker, with and without the production worker. Separate
// processes per trial; content database read-only, no operational/live database.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { parseContextData, rankAgainst, type ContextData, type Ranking } from '../apps/overlay/src/games/contextRanking.ts'
import { ContextWorkerClient } from '../apps/overlay/src/games/contextWorkerClient.ts'
import type { ContextRequest, ContextResponse } from '../apps/overlay/src/games/contextProtocol.ts'
import { browserThread } from '../tests/helpers/browserThread.ts'

const mode = process.argv[2]
if (mode === 'sync' || mode === 'worker') {
  const { contextFile, contextResource } = await import('../apps/server/src/context.ts')
  let source: ContextData | null = null
  let client: ContextWorkerClient | null = null
  let thread: Awaited<ReturnType<typeof browserThread<ContextRequest, ContextResponse>>> | null = null
  const server = createServer((req, res) => {
    const name = (req.url ?? '').split('/').at(-1)
    const resource = name === 'vocab.txt' || name === 'vectors.bin' || name === 'secrets.txt' || name === 'links.json' ? contextResource(name) : null
    if (!resource) { res.writeHead(404); res.end(); return }
    if (typeof resource === 'string') createReadStream(resource).pipe(res)
    else res.end(resource)
  })
  try {
    const setup = performance.now()
    let vocabulary
    if (mode === 'sync') {
      source = parseContextData(contextFile('vocab.txt')!.toString('utf8'), new Uint8Array(contextFile('vectors.bin')!).buffer,
        contextFile('secrets.txt')!.toString('utf8'), JSON.parse(contextFile('links.json')!.toString('utf8')))
      vocabulary = source
    } else {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing port')
      thread = await browserThread<ContextRequest, ContextResponse>(fileURLToPath(new URL('../apps/overlay/src/games/context.worker.ts', import.meta.url)))
      client = new ContextWorkerClient(`http://127.0.0.1:${address.port}`, () => thread!)
      vocabulary = await client.load()
    }
    const setupMs = performance.now() - setup
    const words = ['spiaggia', 'mare', 'automobile']
    const run = async (secret: number): Promise<Ranking> => client ? client.rank(secret) : rankAgainst(source!, secret)
    await run(vocabulary.index.get(words[0])!) // same warm-up in each process
    const delays: number[] = []
    let last = performance.now()
    const timer = setInterval(() => { const now = performance.now(); delays.push(now - last); last = now }, 1)
    const results = []
    for (const word of words) {
      await new Promise((done) => setTimeout(done, 20))
      const started = performance.now()
      const ranking = await run(vocabulary.index.get(word)!)
      const durationMs = performance.now() - started
      const sha256 = createHash('sha256').update(new Uint8Array(ranking.order.buffer)).update(new Uint8Array(ranking.rankOf.buffer)).digest('hex')
      results.push({ word, durationMs, sha256 })
    }
    await new Promise((done) => setTimeout(done, 20))
    clearInterval(timer)
    delays.sort((a, b) => a - b)
    const q = (n: number) => delays[Math.min(delays.length - 1, Math.floor(n * delays.length))]
    console.log(JSON.stringify({ mode, words: vocabulary.words.length, setupMs, samples: delays.length,
      timerMs: { p50: q(.5), p95: q(.95), p99: q(.99), max: delays.at(-1) }, rssMiB: process.memoryUsage().rss / 1024 ** 2, results }))
  } finally {
    client?.dispose()
    await thread?.terminate()
    if (server.listening) { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())) }
  }
} else {
  const results = []
  for (let trial = 0; trial < 3; trial++) for (const kind of ['sync', 'worker']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), kind], { encoding: 'utf8', windowsHide: true, timeout: 60000 })
    if (result.status !== 0) throw new Error(result.stderr)
    results.push({ trial: trial + 1, ...JSON.parse(result.stdout) })
  }
  const reference = results[0].results.map(({ word, sha256 }: { word: string; sha256: string }) => ({ word, sha256 }))
  for (const result of results) {
    const actual = result.results.map(({ word, sha256 }: { word: string; sha256: string }) => ({ word, sha256 }))
    if (JSON.stringify(actual) !== JSON.stringify(reference)) throw new Error('Ranking changed')
  }
  console.log(JSON.stringify({ runtime: process.version, platform: process.platform, results }, null, 2))
}
