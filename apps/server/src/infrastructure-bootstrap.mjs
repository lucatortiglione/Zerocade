// tsx's programmatic loader resolves the source worker's .js imports to .ts.
// Packaged builds use infrastructure-worker.mjs directly and need no loader.
import { workerData } from 'node:worker_threads'
import { tsImport } from 'tsx/esm/api'
await tsImport(workerData.entry, import.meta.url)
