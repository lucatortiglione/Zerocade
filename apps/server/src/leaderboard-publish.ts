import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GAMES } from '@zerocade/shared'
import { leaderboardCss, leaderboardHtml, leaderboardIndexHtml, leaderboardJs } from './leaderboard-page.js'
import { PERIODS, leaderboards, scoreEvents } from './scores.js'
import { sessionSince } from './sessions.js'
import { reports } from './infrastructureClient.js'

// The leaderboards are published as static files on the Linux VM, where nginx serves them (deploy/nginx/zerocade.conf):
// the pages and their CSS/JS once, then one JSON per game whenever its boards change. Nothing on this PC listens for
// them. ZEROCADE_PUBLISH_TARGET is `user@host:/remote/dir` (the dir nginx's root points at); ZEROCADE_PUBLISH_KEY is
// the private key to log in with (no password is ever stored or asked: BatchMode). Unset, nothing is published.

const TARGET = process.env.ZEROCADE_PUBLISH_TARGET ?? ''
const KEY = process.env.ZEROCADE_PUBLISH_KEY ?? ''
// Where nginx's live channels are (Nchan, deploy/nginx/zerocade.conf): the PC POSTs each game's boards to /pub/<game>.
const HTTP_BASE = process.env.ZEROCADE_PUBLISH_HTTP ?? ''
const EVERY_MS = Math.max(2_000, Number(process.env.ZEROCADE_PUBLISH_EVERY_MS) || 5_000)
const TOP = 50

// Every file of the site, by its path under the remote directory.
export function leaderboardSite(roomKey: string, now = new Date()): Map<string, string> {
  const files = new Map<string, string>()
  files.set('classifica/index.html', leaderboardIndexHtml())
  files.set('classifica/classifica.css', leaderboardCss)
  files.set('classifica/classifica.js', leaderboardJs)
  for (const game of GAMES) {
    files.set(`classifica/${game.id}.html`, leaderboardHtml(game))
    // The same body as the server's /api/leaderboard/<game>, without the dashboard-only resets; the page cuts it to ?top.
    files.set(
      `api/leaderboard/${game.id}`,
      JSON.stringify({ game: { id: game.id, name: game.name, emoji: game.emoji }, periods: PERIODS, boards: leaderboards(roomKey, game.id, TOP, now) }),
    )
  }
  return files
}

const run = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 30_000, windowsHide: true }, (err, _out, stderr) =>
      err ? reject(new Error(String(stderr).trim() || err.message)) : resolve(),
    )
  })

export interface Publisher {
  close(): Promise<void>
}

export async function startLeaderboardPublisher(roomKey: string, transfer: (args: string[]) => Promise<void> = (args) => run('sftp', args)): Promise<Publisher | null> {
  const match = /^([^@:\s]+@[^:\s]+):(\/\S+)$/.exec(TARGET)
  if (!match) {
    if (TARGET) console.warn('[classifiche] ZEROCADE_PUBLISH_TARGET deve essere utente@host:/cartella: le classifiche non vengono pubblicate.')
    return null
  }
  const [, login, remoteDir] = match as unknown as [string, string, string]
  const prepareSite = () => reports.run('site', { key: roomKey, at: Date.now(), starts: Object.fromEntries(GAMES.map((g) => [g.id, sessionSince(roomKey, g.id)])) })
  const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', ...(KEY ? ['-i', KEY, '-o', 'IdentitiesOnly=yes'] : [])]
  const scratch = join(tmpdir(), `zerocade-classifiche-${process.pid}`)

  const base = (HTTP_BASE || `http://${login.split('@')[1]}`).replace(/\/+$/, '')
  const sent = new Map<string, string>() // path -> hash of what the VM has
  const live = new Map<string, string>() // game -> hash of what the live channel last got
  let liveFailing = false
  let stopped = false
  const stopping = new AbortController()
  const posts = new Map<string, Promise<void>>()
  const latest = new Map<string, string>()
  const changes = new Set<Promise<unknown>>()

  // One game's boards to the live channel. Quiet when they have not changed since the last post.
  async function sendLive(gameId: string, body: string): Promise<void> {
    const hash = createHash('sha1').update(body).digest('hex')
    if (live.get(gameId) === hash) return
    try {
      const res = await fetch(`${base}/pub/${encodeURIComponent(gameId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.any([stopping.signal, AbortSignal.timeout(4_000)]),
      })
      await res.body?.cancel()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      live.set(gameId, hash)
      if (liveFailing) console.log('[classifiche] aggiornamenti in tempo reale ripresi.')
      liveFailing = false
    } catch (err) {
      if (stopped) return
      if (!liveFailing) console.warn(`[classifiche] aggiornamento del canale HTTP non riuscito: ${err instanceof Error ? err.message : String(err)}`)
      liveFailing = true
    }
  }

  // At most one request and one replacement body per game. Newer snapshots
  // cannot be overtaken by an older request finishing later.
  function post(gameId: string, body: string): Promise<void> {
    if (stopped) return Promise.resolve()
    latest.set(gameId, body)
    const active = posts.get(gameId)
    if (active) return active
    const task = (async () => {
      while (!stopped && latest.has(gameId)) {
        const next = latest.get(gameId)!
        latest.delete(gameId)
        await sendLive(gameId, next)
      }
    })().finally(() => { posts.delete(gameId); latest.delete(gameId) })
    posts.set(gameId, task)
    return task
  }

  // A score or a reset: that game's boards go out within a moment (several points close together make one post).
  const pending = new Map<string, NodeJS.Timeout>()
  const onChange = (gameId: string) => {
    if (stopped || pending.has(gameId) || !GAMES.some((game) => game.id === gameId)) return
    pending.set(
      gameId,
      setTimeout(() => {
        const task = prepareSite().then((files) => {
          if (stopped) return
          const body = files.get(`api/leaderboard/${gameId}`)
          if (body) return post(gameId, body)
        }).catch((error: unknown) => console.warn('[classifiche] preparazione non riuscita', error))
        changes.add(task)
        void task.finally(() => { changes.delete(task); pending.delete(gameId) })
      }, 300),
    )
  }
  scoreEvents.on('change', onChange)
  let busy = false
  let failing = false
  let publication: Promise<void> | null = null

  async function publish(): Promise<void> {
    if (busy || stopped) return
    busy = true
    try {
      const changed: string[] = []
      const hashes = new Map<string, string>()
      const files = await prepareSite()
      if (stopped) return
      for (const [path, body] of files) {
        if (stopped) return
        // The live channel also gets what no score announced (a new session or day starts a board over).
        if (path.startsWith('api/leaderboard/')) void post(path.slice('api/leaderboard/'.length), body)
        const hash = createHash('sha1').update(body).digest('hex')
        hashes.set(path, hash)
        if (sent.get(path) === hash) continue
        const local = join(scratch, path)
        await mkdir(join(local, '..'), { recursive: true })
        await writeFile(local, body)
        changed.push(path)
      }
      if (changed.length && !stopped) {
        // `-mkdir` and the dirs it names are allowed to exist already; every put overwrites in place.
        const batch = [
          '-mkdir classifica',
          '-mkdir api',
          '-mkdir api/leaderboard',
          ...changed.map((p) => `put "${join(scratch, p).replaceAll('\\', '/')}" "${p}"`),
        ].join('\n')
        const batchFile = join(scratch, 'batch.txt')
        await writeFile(batchFile, batch + '\n')
        await transfer([...sshArgs, '-b', batchFile, `${login}:${remoteDir}`])
        for (const p of changed) sent.set(p, hashes.get(p)!)
        if (failing) console.log('[classifiche] pubblicazione ripresa.')
      }
      failing = false
    } catch (err) {
      // Once per outage, not every few seconds; the next tick tries again.
      if (!failing) console.warn(`[classifiche] pubblicazione su ${login}:${remoteDir} non riuscita: ${err instanceof Error ? err.message : String(err)}`)
      failing = true
      sent.clear()
    } finally {
      busy = false
    }
  }

  await mkdir(scratch, { recursive: true })
  const start = () => { if (!busy && !stopped) publication = publish() }
  start()
  const timer = setInterval(start, EVERY_MS)
  timer.unref()
  console.log(`[classifiche] pubblicazione configurata su ${login}:${remoteDir} ogni ${EVERY_MS / 1000} s quando cambiano.`)
  return {
    close: async () => {
      stopped = true
      stopping.abort()
      clearInterval(timer)
      scoreEvents.off('change', onChange)
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
      await Promise.allSettled([publication, ...changes, ...posts.values()])
      latest.clear()
      await rm(scratch, { recursive: true, force: true })
    },
  }
}
