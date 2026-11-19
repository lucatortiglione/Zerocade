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
const candidate = process.argv.find((a) => a.startsWith('--context-candidate='))?.slice('--context-candidate='.length)
const gameFile = candidate ? join(resolve(candidate), 'giochi.sqlite3') : join(root, 'database/giochi.sqlite3')
let child, socket, profilePeer
let logs = ''
try {
  if (bundled) await build({
    entryPoints: { server: join(root, 'apps/server/src/index.ts'), 'infrastructure-worker': join(root, 'apps/server/src/infrastructure-worker.ts'), 'context-worker': join(root, 'apps/server/src/context-worker.ts'), 'wordgen-worker': join(root, 'apps/server/src/wordgen/worker.ts') },
    outdir: scratch, outExtension: { '.js': '.mjs' }, bundle: true,
    platform: 'node', format: 'esm', target: 'node26', external: ['better-sqlite3'],
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    logLevel: 'warning',
  })
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(ZEROCADE_|TWITCH_|NASA_)/i.test(key)) delete env[key]
  Object.assign(env, { PORT: String(port), LOG_LEVEL: 'warn', ZEROCADE_SKIP_HOSTS: '1', ZEROCADE_OPEN: '0',
    ZEROCADE_TEST_SHUTDOWN: '1', ZEROCADE_DB: join(scratch, 'live.db'), ZEROCADE_CONTENT_DB: join(scratch, 'content.db'),
    ZEROCADE_GIOCHI_FILE: gameFile,
    ZEROCADE_CONTEXT_DATA: candidate ? resolve(candidate) : join(root, 'gioco-zerocontext/data') })
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
  const contextMetaResponse = await get('/api/context/meta.json')
  if (contextMetaResponse.ok) {
    const contextMeta = await contextMetaResponse.json()
    if (typeof contextMeta.corpus_revision === 'string') {
      const reloaded = await get('/api/context/reload', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: contextMeta.corpus_revision, database: gameFile }) })
      assert.equal(reloaded.status, 200, await reloaded.clone().text())
      assert.equal((await reloaded.json()).revision, contextMeta.corpus_revision)
    }
  }
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
  if (contextMetaResponse.ok && (await (await get('/api/context/meta.json')).json()).pipeline === 'context-semantic-1') {
    const waitState = (predicate) => new Promise((done, reject) => {
      const timer = setTimeout(() => { socket.off('context:semantic', listener); reject(new Error('Semantic state timeout')) }, 10000)
      const listener = (state) => { if (state && predicate(state)) { clearTimeout(timer); socket.off('context:semantic', listener); done(state) } }
      socket.on('context:semantic', listener)
    })
    let solution
    socket.on('secret:word', ({ word }) => { solution = word })
    let waiting = waitState((s) => s.round === 1)
    socket.emit('game:select', 'context')
    const first = await waiting
    assert.equal(first.mode, 'ordinary'); assert.equal(first.remainingMs, null); assert.equal(first.solution, null)
    const settings = new Promise((done) => {
      const listener = (s) => { if (s.gameId === 'context' && s.settings.breakSeconds === 3) { socket.off('session:state', listener); done() } }
      socket.on('session:state', listener)
    })
    socket.emit('settings:set', { breakSeconds: 3, closestPoints: 'none', disableAllHints: true })
    await Promise.race([settings, new Promise((_, reject) => setTimeout(() => reject(new Error('Settings timeout')), 5000).unref())])
    for (let round = 2; round <= 9; round++) {
      waiting = waitState((s) => s.round === round && s.phase === 'playing')
      socket.emit('game:command', 'next-round')
      const state = await waiting
      assert.equal(state.mode, 'ordinary')
      assert.equal(state.remainingMs, null)
    }
    waiting = waitState((s) => s.round === 9 && s.typed.length > 0)
    socket.emit('sim:event', { type: 'comment', text: 'due parole', user: { id: 'semantic-user', nickname: 'Semantic' } })
    assert.equal((await waiting).attempts, 0)
    assert.ok(solution)
    waiting = waitState((s) => s.round === 9 && s.reason === 'found')
    socket.emit('sim:event', { type: 'comment', text: solution, user: { id: 'semantic-user', nickname: 'Semantic' } })
    const found = await waiting
    assert.equal(found.attempts, 1); assert.equal(found.solution, solution)
    assert.equal(found.leaders[0].pts, 100)
    console.log('Semantic smoke: corpus, server authority, ninth round remains ordinary, invalid word and finder points passed.')
    const profiles = await (await get('/api/context/profiles')).json()
    if (profiles.length === 2 && profiles.every((p) => p.available)) {
      assert.deepEqual(profiles.map((p) => p.id), ['original', 'abtt'])
      const processId = child.pid
      profilePeer = io(base, { auth: { clientType: 'dashboard', key: key + '-profiles' }, transports: ['websocket'], reconnection: false })
      let peerSession
      let peerSecret
      profilePeer.on('session:state', (s) => { peerSession = s })
      profilePeer.on('secret:word', (s) => { peerSecret = s.word })
      await once(profilePeer, 'connect')
      const peerReady = new Promise((done, reject) => {
        const timer = setTimeout(() => reject(new Error('Peer room timeout')), 10000)
        profilePeer.on('context:semantic', (s) => { if (s?.round === 1) { clearTimeout(timer); done() } })
      })
      profilePeer.emit('game:select', 'context')
      await peerReady
      const peerRun = peerSession.run
      const originalPeerSecret = peerSecret
      let scoresBefore
      for (let i = 0; i < 30; i++) {
        scoresBefore = (await (await get('/api/leaderboard/context')).json()).boards
        if (JSON.stringify(scoresBefore).includes('Semantic')) break
        await new Promise((done) => setTimeout(done, 50))
      }
      assert.equal(scoresBefore.sessione[0].name, 'Semantic')
      assert.equal(scoresBefore.sessione[0].points, 100)
      const revisions = new Set()
      for (const profile of profiles) {
        const response = await get(`/api/context/meta.json?profile=${profile.id}`)
        assert.equal(response.headers.get('x-zerocontext-profile'), profile.id)
        revisions.add(response.headers.get('x-zerocontext-revision'))
        const meta = await response.json()
        assert.equal(meta.dim, profile.id === 'original' ? 300 : 1024)
        assert.equal(meta.secrets, 9513)
      }
      assert.equal(revisions.size, 2, 'each profile has its own corpus revision')
      for (const profile of ['abtt', 'original', 'abtt', 'original', 'abtt']) {
        const changed = new Promise((done, reject) => {
          const timer = setTimeout(() => reject(new Error('Association settings timeout')), 10000)
          const listener = (s) => { if (s.settings.associationSource === profile) { clearTimeout(timer); socket.off('session:state', listener); done(s) } }
          socket.on('session:state', listener)
        })
        waiting = waitState((s) => s.round === 1 && s.phase === 'playing' && s.attempts === 0)
        socket.emit('settings:set', { associationSource: profile })
        await changed
        await waiting
        assert.equal(child.pid, processId)
        assert.equal(child.exitCode, null)
        assert.equal(peerSession.settings.associationSource, 'original')
        assert.equal(peerSession.run, peerRun)
        assert.equal(peerSecret, originalPeerSecret)
      }
      assert.deepEqual((await (await get('/api/leaderboard/context')).json()).boards, scoresBefore, 'profile changes preserve every leaderboard period')
      profilePeer.close()
      socket.close()
      socket = io(base, { auth: { clientType: 'dashboard', key }, transports: ['websocket'], reconnection: false, autoConnect: false })
      const restored = new Promise((done, reject) => {
        const timer = setTimeout(() => reject(new Error('Restored profile timeout')), 5000)
        socket.once('session:state', (s) => { clearTimeout(timer); done(s) })
      })
      socket.connect()
      assert.equal((await restored).settings.associationSource, 'abtt')
      for (const retired of ['turbox', 'harrier']) assert.equal((await get(`/api/context/meta.json?profile=${retired}`)).status, 400)
      assert.equal((await get('/api/context/meta.json?profile=unknown')).status, 400)
      console.log('Association smoke: original/ABTT, five live switches, retired profiles rejected, room isolation, preserved scores, reconnect persistence and the same server process passed.')
    }
  }
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
  assert.doesNotMatch(logs, /FSTDEP023/, 'the server must use the supported request logging API')
  console.log(`Runtime smoke (${bundled ? 'bundled' : 'source'}): readiness, HTTP isolation, upload saturation/cancellation, Socket.IO, committed gift, atomic pad and graceful drain passed.`)
} catch (error) {
  console.error(logs)
  throw error
} finally {
  socket?.close()
  profilePeer?.close()
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}) }
  if (dirname(resolve(scratch)) !== resolve(cache)) throw new Error('Unsafe smoke scratch directory')
  await rm(scratch, { recursive: true, force: true })
}
