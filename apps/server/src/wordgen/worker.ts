import { parentPort } from 'node:worker_threads'
import { Generator } from './generator.js'

// The generator's own thread: the lexicon is loaded once, then one level per request. A big
// grid takes a second or two, which the server's thread must not spend while the live runs.
const gen = new Generator()

parentPort!.on('message', (n: number) => {
  try {
    const level = gen.level(n)
    parentPort!.postMessage(level ? { n, level } : { n, error: `no grid for level ${n}` })
  } catch (err) {
    parentPort!.postMessage({ n, error: err instanceof Error ? err.message : String(err) })
  }
})
