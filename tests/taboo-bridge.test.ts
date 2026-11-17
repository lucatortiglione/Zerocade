// A real server with a fake ZeroFollowerBot bridge: the standard match takes its answers from the bridge only; the first message
// that arrives wins (D2); a repeated message id counts once; the voice is told to skip the comments of an active card (D22); a
// lost bridge freezes the round (D15). Port and database are the test's own, never the live ones (DIRETTIVE §12).
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { io, type Socket } from 'socket.io-client'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { WebSocketServer } = createRequire(import.meta.url)('ws') as {
  WebSocketServer: new (o: { port: number }) => {
    on(e: 'connection', f: (s: BotSocket) => void): void
    once(e: 'listening', f: () => void): void
    address(): { port: number }
    close(): void
  }
}
interface BotSocket { send(d: string): void; close(): void; on(e: 'message', f: (d: Buffer) => void): void }

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = (probe.address() as { port: number }).port
  await new Promise((done) => probe.close(done))
  return port
}

test('real server and a fake bridge: ordering, duplicates, voice skips and a lost bridge', { timeout: 90_000 }, async (t) => {
  await mkdir(join(root, 'node_modules', '.cache'), { recursive: true })
  const scratch = await mkdtemp(join(root, 'node_modules', '.cache', 'zerocade-taboo-bridge-'))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  let child: ChildProcess | undefined
  let dashboard: Socket | undefined
  let logs = ''
  const bridge = new WebSocketServer({ port: 0 })
  await new Promise<void>((r) => bridge.once('listening', r))
  let bot: BotSocket | null = null
  const skipped: string[] = []
  bridge.on('connection', (s) => {
    bot = s
    s.send(JSON.stringify({ type: 'hello', protocol: 1, requests: ['skip', 'words'] }))
    s.send(JSON.stringify({ type: 'status', tiktok: 'anna', twitch: '' }))
    s.on('message', (d) => { try { const m = JSON.parse(d.toString()) as { type: string; id?: string }; if (m.type === 'skip' && m.id) skipped.push(m.id) } catch { /* ignore */ } })
  })
  t.after(async () => {
    dashboard?.disconnect()
    bridge.close()
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
  dashboard = io(base, { transports: ['websocket'], auth: { key, clientType: 'dashboard' }, reconnection: false, timeout: 4000 })
  await once(dashboard, 'connect')
  let latest: { version: number; phase: string; team: number; notice: string | null; remainingMs: number } | null = null
  let admin: { card: { exposure: number; target: string } | null; metrics: { ignored: Record<string, number> } } | null = null
  dashboard.on('taboo:state', (s) => { latest = s })
  dashboard.on('taboo:admin', (a) => { admin = a })
  const wait = (predicate: () => boolean, what: string) => new Promise<void>((done, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); done() } else if (Date.now() - started > 15_000) { clearInterval(timer); reject(new Error(`Timeout: ${what}. ${logs}`)) }
    }, 50)
  })
  const control = (command: Record<string, unknown>) => new Promise<{ ok: boolean; error?: string }>((done) => dashboard!.emit('taboo:control', command, done))
  const say = (id: string, text: string, messageId: string, at: number) =>
    bot!.send(JSON.stringify({ type: 'comment', platform: 'tiktok', user: { id, name: id, nickname: id }, id: messageId, text, at }))

  dashboard.emit('game:select', 'zerotaboo')
  await wait(() => latest !== null && admin !== null, 'first states')
  assert.equal((await control({ type: 'start-match', expectedVersion: latest!.version })).error, 'bridge-missing') // no bridge yet

  dashboard.emit('bridge:set', { enabled: true, port: bridge.address().port })
  await wait(() => bot !== null, 'the bridge connects')
  await new Promise((done) => setTimeout(done, 300)) // the status message: the account is read
  assert.deepEqual(await control({ type: 'start-match', expectedVersion: latest!.version }), { ok: true })
  assert.deepEqual(await control({ type: 'start-round', expectedVersion: latest!.version }), { ok: true })
  await wait(() => admin?.card != null, 'the card')
  const target = admin!.card!.target

  // D22: comments on an active card are not read aloud: the server tells the bot to skip each of them
  say('u1', 'una risposta sbagliata', 'dup', 1000)
  say('u1', 'una risposta sbagliata', 'dup', 1000) // the same message id again
  await wait(() => (admin?.metrics.ignored.duplicate ?? 0) >= 1, 'the duplicate is counted')
  assert.ok(skipped.includes('dup'))
  // D2: the first that ARRIVES wins, whatever the time written: the second message says it was written earlier
  say('first', target, 'a1', 5000)
  say('second', target, 'a2', 1)
  await wait(() => (latest?.team ?? 0) > 0, 'the points')
  const team = latest!.team
  await new Promise((done) => setTimeout(done, 400))
  assert.equal(latest!.team, team) // the second answer did not add points to the first card

  // D15: the bridge falls in the middle of the round: the round freezes
  bot!.close()
  await wait(() => latest?.phase === 'suspended', 'the suspension')
  assert.match(latest!.notice ?? '', /ponte/)
  assert.ok(latest!.remainingMs > 0)
  assert.equal((await control({ type: 'resume', expectedVersion: latest!.version })).error, 'bridge-missing')
})
