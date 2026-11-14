#!/usr/bin/env node
// Exercises source and bundled infrastructure without opening browsers, changing
// hosts, using live credentials or touching an installed release or its database.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { request } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { io } from 'socket.io-client'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'node_modules', '.cache')
await mkdir(cache, { recursive: true })
const scratch = await mkdtemp(join(cache, 'zerocade-smoke-'))
const portProbe = createServer().listen(0, '127.0.0.1')
await once(portProbe, 'listening')
const port = portProbe.address().port
await new Promise((done) => portProbe.close(done))
const base = `http://127.0.0.1:${port}`
const bundled = process.argv.includes('--bundle')
let child, socket
let logs = ''
try {
  if (bundled) await build({
    entryPoints: { server: join(root, 'apps/server/src/index.ts'), 'infrastructure-worker': join(root, 'apps/server/src/infrastructure-worker.ts'), 'wordgen-worker': join(root, 'apps/server/src/wordgen/worker.ts') },
    outdir: scratch, outExtension: { '.js': '.mjs' }, bundle: true,
    platform: 'node', format: 'esm', target: 'node26', external: ['better-sqlite3'],
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    logLevel: 'warning',
  })
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(ZEROCADE_|TWITCH_|NASA_)/i.test(key)) delete env[key]
  Object.assign(env, { PORT: String(port), LOG_LEVEL: 'warn', ZEROCADE_SKIP_HOSTS: '1', ZEROCADE_OPEN: '0',
    ZEROCADE_TEST_SHUTDOWN: '1', ZEROCADE_DB: join(scratch, 'live.db'), ZEROCADE_CONTENT_DB: join(scratch, 'content.db'),
    ZEROCADE_GIOCHI_FILE: join(root, 'database/giochi.sqlite3') })
  child = spawn(process.execPath, bundled ? [join(scratch, 'server.mjs')] : ['--import', 'tsx', 'apps/server/src/index.ts'], {
    cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { logs = (logs + chunk.toString()).slice(-12000) })
  const closed = once(child, 'exit')
  const get = (path, init = {}) => fetch(base + path, { ...init, signal: AbortSignal.timeout(3000) })
  const until = Date.now() + 30000
  while (true) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}`)
    try { if ((await get('/api/health')).ok) break } catch { /* startup */ }
    if (Date.now() > until) throw new Error('Server readiness timeout')
    await new Promise((done) => setTimeout(done, 100))
  }
  const health = await (await get('/api/health')).json()
  assert.equal(health.workers.persistence.state, 'ready')
  assert.equal(health.workers.reports.state, 'ready')
  assert.equal((await get('/api/live')).status, 200)
  assert.equal((await get('/api/room', { headers: { origin: 'https://evil.example' } })).status, 403)
  const reboundStatus = await new Promise((done, reject) => {
    const req = request(base + '/api/room', { headers: { host: 'rebind.example' }, timeout: 3000 }, (res) => { res.resume(); done(res.statusCode) })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('Rebinding probe timeout')))
    req.end()
  })
  assert.equal(reboundStatus, 403)
  assert.equal((await get('/api/room', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  const { key } = await (await get('/api/room')).json()
  const held = Array.from({ length: 4 }, () => {
    const req = request(base + `/api/zerodubbi/background/${key}`, { method: 'POST', headers: { 'content-type': 'image/gif', 'content-length': 6 } }, (res) => res.resume())
    req.on('error', () => {}) // deliberately cancelled below
    req.flushHeaders()
    req.write('G')
    return req
  })
  try {
    for (let i = 0; i < 50; i++) {
      if ((await (await get('/api/health')).json()).http.uploads === 4) break
      await new Promise((done) => setTimeout(done, 10))
    }
    assert.equal((await (await get('/api/health')).json()).http.uploads, 4)
    const refused = await get(`/api/zerodubbi/background/${key}`, { method: 'POST', headers: { 'content-type': 'image/gif' }, body: 'GIF89a' })
    assert.equal(refused.status, 503)
    assert.equal((await refused.json()).outcome, 'not-started')
  } finally { for (const req of held) req.destroy() }
  for (let i = 0; i < 50; i++) {
    if ((await (await get('/api/health')).json()).http.uploads === 0) break
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.equal((await (await get('/api/health')).json()).http.uploads, 0)
  socket = io(base, { transports: ['websocket'], auth: { key, clientType: 'dashboard' }, reconnection: false, timeout: 3000 })
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => { throw error }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Socket connect timeout')), 4000).unref())])
  const ranking = new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Gift commit timeout')), 5000)
    const listener = (rows) => { if (rows.some((row) => row.id === 'smoke-user')) { clearTimeout(timer); socket.off('ranking:update', listener); done(rows) } }
    socket.on('ranking:update', listener)
  })
  socket.emit('sim:event', { type: 'gift', giftId: 'rose', count: 2, user: { id: 'smoke-user', nickname: 'Smoke' } })
  await ranking
  const feed = await (await get('/api/feed')).json()
  assert.ok(feed.gifts.some((gift) => gift.count === 2))
  const save = await get(`/api/pads/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'gif', slot: 0, label: 'Smoke', color: '#7c5cff', upload: { type: 'image/gif', data: Buffer.from('GIF89a').toString('base64') } }) })
  assert.equal(save.status, 200, await save.clone().text())
  const board = await save.json()
  const pad = board.pads.find((item) => item.label === 'Smoke')
  assert.ok(pad?.file)
  assert.equal(await (await get(`/api/pads/file/${pad.file}`)).text(), 'GIF89a')
  const removed = await get(`/api/pads/${key}/${pad.id}`, { method: 'DELETE' })
  assert.equal(removed.status, 200)
  assert.ok(!(await removed.json()).pads.some((item) => item.id === pad.id))
  assert.equal((await get(`/api/pads/file/${pad.file}`)).status, 404)
  socket.close()
  child.send('test:shutdown')
  const [code] = await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 22000).unref())])
  assert.equal(code, 0)
  console.log(`Runtime smoke (${bundled ? 'bundled' : 'source'}): readiness, HTTP isolation, upload saturation/cancellation, Socket.IO, committed gift, atomic pad and graceful drain passed.`)
} catch (error) {
  console.error(logs)
  throw error
} finally {
  socket?.close()
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}) }
  await rm(scratch, { recursive: true, force: true })
}
