// The real server, started as a child process on a free port with its own temporary database (never the live one: DIRETTIVE §12),
// and real Socket.IO clients. This is where a wiring mistake in index.ts shows: an emission to io.to(key) instead of
// dashboardRoom(key), a card sent to a connection that is not a dashboard.
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { io, type Socket } from 'socket.io-client'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = (probe.address() as { port: number }).port
  await new Promise((done) => probe.close(done))
  return port
}

const connect = async (base: string, key: string, clientType: 'dashboard' | 'overlay'): Promise<Socket> => {
  const socket = io(base, { transports: ['websocket'], auth: { key, clientType }, reconnection: false, timeout: 4000 })
  await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([e]) => { throw e }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Socket connect timeout')), 6000).unref())])
  return socket
}

test('real server: an overlay gets the public state only, a dashboard gets the card; a practice match is played from the simulator', { timeout: 90_000 }, async (t) => {
  await mkdir(join(root, 'node_modules', '.cache'), { recursive: true })
  const scratch = await mkdtemp(join(root, 'node_modules', '.cache', 'zerocade-taboo-'))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  let child: ChildProcess | undefined
  const sockets: Socket[] = []
  let logs = ''
  t.after(async () => {
    for (const s of sockets) s.disconnect()
    if (child && child.exitCode === null) { child.kill(); await Promise.race([once(child, 'exit'), new Promise((done) => setTimeout(done, 5000))]) }
    await rm(scratch, { recursive: true, force: true })
  })
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const k of Object.keys(env)) if (/^(ZEROCADE_|TWITCH_|NASA_)/i.test(k)) delete env[k]
  Object.assign(env, { PORT: String(port), LOG_LEVEL: 'warn', ZEROCADE_SKIP_HOSTS: '1', ZEROCADE_OPEN: '0', ZEROCADE_TEST_SHUTDOWN: '1',
    ZEROCADE_DB: join(scratch, 'live.db'), ZEROCADE_CONTENT_DB: join(scratch, 'content.db'), ZEROCADE_GIOCHI_FILE: join(root, 'database/giochi.sqlite3'),
    ZEROCADE_CONTEXT_DATA: join(root, 'gioco-zerocontext/data') })
  child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', (c: Buffer) => { logs = (logs + c.toString()).slice(-8000) })
  const until = Date.now() + 45_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}: ${logs}`)
    try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })).ok) break } catch { /* starting */ }
    if (Date.now() > until) throw new Error(`Server not ready: ${logs}`)
    await new Promise((done) => setTimeout(done, 150))
  }
  const { key } = (await (await fetch(`${base}/api/room`)).json()) as { key: string }

  const dashboard = await connect(base, key, 'dashboard'); sockets.push(dashboard)
  const overlay = await connect(base, key, 'overlay'); sockets.push(overlay)
  const publicSeen: Record<string, unknown>[] = []
  const adminSeenByOverlay: unknown[] = []
  const adminSeenByDashboard: { card: { exposure: number; target: string; taboo: string[] } | null; state: { version: number; phase: string } }[] = []
  overlay.on('taboo:state', (s: Record<string, unknown>) => publicSeen.push(s))
  overlay.on('taboo:admin', (a: unknown) => adminSeenByOverlay.push(a))
  dashboard.on('taboo:admin', (a) => adminSeenByDashboard.push(a))
  let latest: { version: number; phase: string; round: number; team: number } | null = null
  dashboard.on('taboo:state', (s) => { latest = s })
  const until2 = (predicate: () => boolean, what: string) => new Promise<void>((done, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); done() }
      else if (Date.now() - started > 15_000) { clearInterval(timer); reject(new Error(`Timeout: ${what}. ${logs}`)) }
    }, 50)
  })
  const control = (command: Record<string, unknown>) => new Promise<{ ok: boolean; error?: string }>((done) => dashboard.emit('taboo:control', command, done))

  // select the game: both clients get the public state; only the dashboard gets the admin one
  dashboard.emit('game:select', 'zerotaboo')
  await until2(() => latest !== null && publicSeen.length > 0 && adminSeenByDashboard.length > 0, 'first states')
  assert.equal(adminSeenByOverlay.length, 0, 'an overlay received the director\'s state')

  // a command with a bad shape is refused with a typed reply; an old version too
  assert.equal((await control({ type: 'nonsense', expectedVersion: 0 })).error, 'bad-input')
  assert.equal((await control({ type: 'start-match', expectedVersion: 12345, mode: 'practice' })).error, 'stale-version')
  // a real match needs the bridge, which this server does not have
  assert.equal((await control({ type: 'start-match', expectedVersion: latest!.version })).error, 'bridge-missing')
  // practice: the simulator plays
  assert.deepEqual(await control({ type: 'start-match', expectedVersion: latest!.version, mode: 'practice' }), { ok: true })
  assert.deepEqual(await control({ type: 'start-round', expectedVersion: latest!.version }), { ok: true })
  await until2(() => adminSeenByDashboard.some((a) => a.card !== null), 'the card')
  const card = adminSeenByDashboard.filter((a) => a.card).at(-1)!.card!
  assert.equal(card.taboo.length, 5)
  dashboard.emit('sim:event', { type: 'comment', text: card.target, user: { id: 'tiktok:smoke', nickname: 'Smoke' } })
  await until2(() => (latest?.team ?? 0) > 0, 'the points')

  // across everything an overlay received: no director's state, and never the target while its card was open
  assert.equal(adminSeenByOverlay.length, 0)
  const open = adminSeenByDashboard.filter((a) => a.card).map((a) => a.card!)
  const beforeSolved = publicSeen.filter((s) => (s.revealed as unknown) === null)
  for (const s of beforeSolved) {
    const text = JSON.stringify({ ...s, forbidden: null })
    for (const c of open.filter((o) => o.exposure === card.exposure)) assert.ok(!text.toLowerCase().includes(c.target.toLowerCase()), 'the target of an open card reached an overlay')
  }
  assert.ok(publicSeen.some((s) => (s.forbidden as string[]).length === 5), 'the Taboo words of the open card are shown (D26)')
  // an overlay cannot command the match
  const overlayReply = await new Promise<unknown>((done) => { overlay.emit('taboo:control', { type: 'cancel', expectedVersion: latest!.version }, done); setTimeout(() => done('no reply'), 1500) })
  assert.equal(overlayReply, 'no reply')
  assert.notEqual(latest!.phase, 'cancelled')
})
