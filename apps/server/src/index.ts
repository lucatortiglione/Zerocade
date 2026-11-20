import { contextProfile, isContextProfile } from '@zerocade/shared'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import Fastify, { LogController } from 'fastify'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { Server } from 'socket.io'
import {
  BACKGROUND_GAMES,
  GAMES,
  ROOM_SECRET,
  ROOM_SECRET_MAX,
  activeTriggers,
  allowedToPlay,
  backgroundPath,
  giftById,
  isValidKey,
  padFilePath,
  triggersFor,
  type BackgroundGame,
  type ClientToServerEvents,
  type EventOrigin,
  type GameControl,
  isGameCommand,
  type Feed,
  type FeedCreator,
  type FeedEvent,
  type ContextSemanticState,
  type HandshakeAuth,
  type LiveEvent,
  type LiveStats,
  type RoomInfo,
  type ServerToClientEvents,
} from '@zerocade/shared'
import { BivioRooms, bivioStats } from './bivio.js'
import { IncastroRooms } from './incastro.js'
import { QuizzlandRooms, quizzlandStats } from './quizzland.js'
import {
  closeDb,
  contextTournamentStore,
  tabooStore,
  wordHuntStore,
  contextSecretLast,
  contextSecretUses,
  recordContextSecretUse,
  dataDir,
  getPad,
  bridgeConfig,
  recordWordAssociationRound,
  roomKey,
  saveBridgeConfig,
  saveSource,
  savedSources,
} from './db.js'
import { getContent, wordAssociation } from './content.js'
import { contextFileBudget, contextResource, contextRevision, isContextFile, reloadContext } from './context.js'
import { giochiDb } from './schema-db.js'
import { registerContextEvaluationRoutes } from './context-evaluation.js'
import { isWordleFile, wordleFile } from './wordle.js'
import { chainKeys, chains } from './chains.js'
import { nasaPhotos } from './nasa.js'
import { createShutdown } from './shutdown.js'
import { levels } from './wordgen/levels.js'
import { startLeaderboardPublisher } from './leaderboard-publish.js'
import { leaderboardCss, leaderboardHtml, leaderboardIndexHtml, leaderboardJs } from './leaderboard-page.js'
import { PERIODS, isPeriod, recordScore, resetLeaderboard } from './scores.js'
import { sanitizeRoundReport } from './word-association.js'
import { HOSTS_LINE, LOCAL_DOMAIN, domainRegistered, ensureDomain } from './hosts.js'
import { PAD_FILE_MAX, padBoard, padFile } from './pads.js'
import { controlGame, refreshGame, getSession, selectGame, setScene, setSettings, setTriggers } from './sessions.js'
import { RoomSources, sourceUsername } from './sources.js'
import { ZfbBridge, singleWord } from './zfb.js'
import { isEndRoundCommand } from './mod-commands.js'
import { RecentFollows } from './follows.js'
import { ContextTournaments, sanitizeTournamentCommand } from './context-tournament.js'
import { TabooRooms } from './taboo.js'
import { loadDeck } from './taboo-deck.js'
import { WordHuntRooms } from './wordhunt.js'
import type { FixtureFile } from './wordhunt-domain.js'
import { ContextCorpora } from './context-corpora.js'
import { ContextSemanticGame } from './context-semantic.js'
import { persistence, reports, WorkerJobError } from './infrastructureClient.js'
import { sessionSince } from './sessions.js'
import { localAccess } from './localAccess.js'
import {
  sanitizeBivioCommand,
  sanitizeDj,
  sanitizeEvent,
  sanitizeIncastroCommand,
  sanitizeLevel,
  sanitizeMessage,
  sanitizeQuizzlandCommand,
  sanitizeTabooCommand,
  sanitizeWordHuntCommand,
  sanitizeScene,
  sanitizeSettings,
  sanitizeBridgeConfig,
  sanitizeSourceConfig,
  sanitizeTriggers,
} from './validate.js'

const PORT = Number(process.env.PORT ?? 3001)
const LOCAL_URL = `http://localhost:${PORT}/`
// The link for OBS and TikTok LIVE Studio, which take a domain name (see hosts.ts).
const OVERLAY_URL = `http://${LOCAL_DOMAIN}:${PORT}/overlay/`

// Built pages (npm start, or the Windows package) are hosted here too: the dashboard
// at / and the overlay at /overlay/. In dev the Vite servers serve them instead.
const here = dirname(fileURLToPath(import.meta.url))
const pagesDir = (name: string) =>
  [join(here, 'public', name), join(here, '..', '..', name, 'dist')].find((dir) => existsSync(join(dir, 'index.html')))
const dashboardDir = pagesDir('dashboard')
const overlayDir = pagesDir('overlay')

const app = Fastify({
  bodyLimit: 1024 * 1024, requestTimeout: 15_000, connectionTimeout: 30_000,
  logController: new LogController({ disableRequestLogging: true }),
  logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization', 'req.headers.cookie', '*.access_token', '*.client_secret', '*.password'] },
})
let draining = false
let httpActive = 0
let uploadsActive = 0
let errorLogWindow = performance.now()
let errorLogs = 0
let suppressedErrors = 0
let persistenceIssue: { component: 'persistence'; message: string; at: number } | null = null
app.server.maxConnections = 128
app.setErrorHandler((error, req, reply) => {
  if (performance.now() - errorLogWindow >= 1000) { errorLogWindow = performance.now(); errorLogs = 0 }
  if (errorLogs++ < 5) app.log.error({ err: error, requestId: req.id, route: req.routeOptions.url }, 'Richiesta non completata')
  else suppressedErrors++
  if (error instanceof WorkerJobError) return reply.code(503).send({
    error: error.outcome === 'not-started' ? 'Operazione non avviata: server occupato.' : 'Esito non confermato. Aggiorna i dati prima di riprovare.',
    outcome: error.outcome, requestId: req.id,
  })
  const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500
  return reply.code(status).send({ error: status >= 500 ? 'Operazione non riuscita.' : 'Richiesta non valida.', requestId: req.id })
})
// A stray rejected promise (a live feed failing, a socket closing) is logged: it must not
// take the server, and the stream with it, down.
process.on('unhandledRejection', (err) => app.log.error({ err }, 'unhandled rejection'))
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      // Viewer avatars, game pictures and DJ sounds come from other sites.
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'media-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      // Served over plain http on localhost: nothing to upgrade.
      'upgrade-insecure-requests': null,
    },
  },
})

// Only pages that reach this PC by its own name, or by zerocade.test (which no real site can
// own), get an answer. A website that points one of its names at 127.0.0.1 (DNS rebinding)
// would otherwise be same-origin with Zerocade and could read the room key.
const PUBLIC_URL = /^https?:\/\//.test(process.env.ZEROCADE_PUBLIC_URL ?? '')
  ? process.env.ZEROCADE_PUBLIC_URL!.replace(/\/*$/, '/')
  : undefined
app.addHook('onRequest', async (req, reply) => {
  if (!localAccess(req.headers.host, req.headers.origin, PORT)) return reply.code(403).send({ error: 'forbidden' })
  if (req.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ error: 'forbidden' })
  if (draining && !req.url.startsWith('/api/health') && !req.url.startsWith('/api/live')) return reply.code(503).send({ error: 'Arresto in corso.' })
  const upload = req.method === 'POST' && (/^\/api\/pads\//.test(req.url) || /\/background\//.test(req.url))
  if (httpActive >= 32 || (upload && uploadsActive >= 4)) return reply.code(503).send({ error: 'Server occupato: operazione non avviata.', outcome: 'not-started' })
  httpActive++
  if (upload) uploadsActive++
  let released = false
  const release = () => {
    if (released) return
    released = true
    httpActive--
    if (upload) uploadsActive--
    reply.raw.off('finish', release)
    reply.raw.off('close', release)
  }
  reply.raw.once('finish', release)
  reply.raw.once('close', release)
})

// How long the server's main thread was blocked, to tell a slow live that comes from the server from one that does not.
// Every 10 s the worst stall is kept, and a stall over 250 ms is logged: all sockets (overlay, dashboard) wait for it.
const loopDelay = monitorEventLoopDelay({ resolution: 20 })
loopDelay.enable()
const SLOW_LOOP_MS = 250
const loopStalls: { at: number; ms: number }[] = []
setInterval(() => {
  // The histogram's resolution is 20 ms: what it measures is the delay beyond that.
  const worst = Math.round(loopDelay.max / 1e6)
  if (worst >= SLOW_LOOP_MS) {
    loopStalls.push({ at: Date.now(), ms: worst })
    if (loopStalls.length > 20) loopStalls.shift()
    app.log.warn({ stallMs: worst, p99Ms: Math.round(loopDelay.percentile(99) / 1e6), rssMb: Math.round(process.memoryUsage().rss / 1048576) },
      'Il server è rimasto bloccato: overlay e regia hanno aspettato')
  }
  loopDelay.reset()
}, 10_000).unref()

app.get('/api/live', async () => ({ ok: true }))
app.get('/api/health', async (_req, reply) => {
  const workers = { persistence: persistence.metrics(), reports: reports.metrics() }
  const ok = !draining && Object.values(workers).every((worker) => worker.state === 'ready' && worker.queued < worker.capacity)
  const eventLoop = { p50Ms: Math.round(loopDelay.percentile(50) / 1e6), p99Ms: Math.round(loopDelay.percentile(99) / 1e6),
    maxMs: Math.round(loopDelay.max / 1e6), stalls: loopStalls }
  return reply.code(ok ? 200 : 503).send({ ok, draining, workers, eventLoop, http: { active: httpActive, uploads: uploadsActive, capacity: 32, uploadCapacity: 4, suppressedErrors }, memory: process.memoryUsage(), uptimeSeconds: process.uptime() })
})
app.get('/api/room', async (): Promise<RoomInfo> => ({
  key: roomKey,
  overlayUrl: OVERLAY_URL,
  hostsLine: domainRegistered() ? undefined : HOSTS_LINE,
  // Where the leaderboards are published (nginx on the Linux VM): ZEROCADE_PUBLIC_URL, e.g. http://192.168.1.50/classifica/
  publicUrl: PUBLIC_URL,
}))
app.get('/api/games', async () => GAMES)
app.get('/api/content', async () => getContent())
// ZeroContext's words and vectors: static files, cached by the browser until the next build.
// Asked of the ranking thread: checking Pipeline B reads its export, which must not stop this thread.
app.get('/api/context/profiles', async (request) => {
  // The first inspection of a full Pipeline B export can outlast the ordinary 30 s connection timeout.
  request.raw.setTimeout(contextCorpora.profilesTimeoutMs + 5_000)
  return contextCorpora.profiles()
})
// «Qualità posizioni»: legge i risultati di gioco-zerocontext/script/evaluate_context_ranking.py; `live` dice se c'è una diretta collegata.
registerContextEvaluationRoutes(app, { giochi: giochiDb, live: () => [...sources.values()].some((room) => room.live().length > 0) })
app.get('/api/context/:file', async (req, reply) => {
  const name = (req.params as { file: string }).file
  const requested = (req.query as { profile?: unknown }).profile
  if (requested !== undefined && !isContextProfile(requested)) return reply.code(400).send({ error: 'Associazioni non valide.' })
  const profile = contextProfile(requested)
  const resource = isContextFile(name) ? contextResource(name, profile) : null
  if (!resource) return reply.code(404).send({ error: 'not found' })
  if (typeof resource === 'string') {
    try {
      const details = await stat(resource)
      if (isContextFile(name) && details.size > contextFileBudget(name)) return reply.code(413).send({ error: 'Risorsa ZeroContext oltre il limite consentito.' })
    }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return reply.code(404).send({ error: 'not found' }); throw error }
  }
  const body = typeof resource === 'string' ? createReadStream(resource) : resource
  const type = name.endsWith('.bin') ? 'application/octet-stream' : name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8'
  return reply.header('content-type', type).header('cache-control', 'no-cache').header('x-zerocontext-revision', contextRevision(profile)).header('x-zerocontext-profile', profile).send(body)
})
// The leaderboards (session, day, week, month, all time) of each game, and the page that shows them: a link to
// share or a browser source for the stream (leaderboard-page.ts).
app.get('/api/leaderboard/:game', async (req, reply) => {
  const game = GAMES.find((g) => g.id === (req.params as { game: string }).game)
  if (!game) return reply.code(404).send({ error: 'not found' })
  const limit = Math.min(50, Math.max(1, Math.floor(Number((req.query as { limit?: string }).limit)) || 10))
  const computed = await reports.run('boards', { key: roomKey, game: game.id, limit, at: Date.now(), start: sessionSince(roomKey, game.id) })
  return reply.header('cache-control', 'no-store').send({
    game: { id: game.id, name: game.name, emoji: game.emoji },
    periods: PERIODS,
    boards: computed.boards,
    // When each period was last reset from the dashboard (period -> time).
    resets: computed.resets,
  })
})
app.get('/classifica', async (_req, reply) => reply.type('text/html; charset=utf-8').send(leaderboardIndexHtml()))
app.get('/classifica/classifica.css', async (_req, reply) => reply.type('text/css; charset=utf-8').send(leaderboardCss))
app.get('/classifica/classifica.js', async (_req, reply) => reply.type('text/javascript; charset=utf-8').send(leaderboardJs))
app.get('/classifica/:game', async (req, reply) => {
  const game = GAMES.find((g) => g.id === (req.params as { game: string }).game)
  if (!game) return reply.code(404).send({ error: 'not found' })
  return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(leaderboardHtml(game))
})
// ZeroReazioniACatena's chains (walks through ZeroAssociazioni's verified pools).
// NASA's Image of the Day behind the games: the overlay picks the one in view from this list and the clock.
app.get('/api/nasa', async () => nasaPhotos())
app.get('/api/chains', async () => chains())
// Its "Parola chiave" puzzles: [hidden word, ...clues].
app.get('/api/chains/keys', async () => chainKeys())
// ZeroWordle's word lists.
app.get('/api/wordle/:file', async (req, reply) => {
  const name = (req.params as { file: string }).file
  const body = isWordleFile(name) ? wordleFile(name) : null
  if (!body) return reply.code(404).send({ error: 'not found' })
  const type = name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8'
  return reply.header('content-type', type).header('cache-control', 'no-cache').send(body)
})
app.get('/api/events', async (req) => {
  const q = (req.query ?? {}) as { key?: string; limit?: number }
  const key = q.key ?? ''
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500)
  await persistence.run('barrier', null)
  return { events: await reports.run('events', { key, limit }) }
})
app.get('/api/bivio/stats', async (req) => {
  const { lang } = (req.query ?? {}) as { lang?: string }
  return bivioStats(lang === 'en' ? 'en' : 'it')
})
app.get('/api/bivio/export.csv', async (_req, reply) => {
  const day = new Date().toISOString().slice(0, 10)
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="bivio-risultati-${day}.csv"`)
    .send(await reports.run('export', { kind: 'bivio' }))
})
// The questions marked as wrong (also saved as data/bivio-domande-sbagliate.csv).
app.get('/api/bivio/flagged.csv', async (_req, reply) =>
  reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', 'attachment; filename="bivio-domande-sbagliate.csv"')
    .send(await reports.run('export', { kind: 'bivio-flags' })),
)
app.get('/api/quizzland/stats', async () => quizzlandStats())
// ZeroTaboo's telemetry for the calibration of the cards (§9): computed by the reports worker, for local use like the other exports.
for (const [path, kind, name] of [['exposures', 'taboo-exposures', 'esposizioni'], ['calibration', 'taboo-calibration', 'calibrazione']] as const) {
  app.get(`/api/taboo/${path}.csv`, async (_req, reply) =>
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="zerotaboo-${name}-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(await reports.run('export', { kind })),
  )
}
app.get('/api/quizzland/export.csv', async (_req, reply) => {
  const day = new Date().toISOString().slice(0, 10)
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="zeroquizz-risposte-${day}.csv"`)
    .send(await reports.run('export', { kind: 'quizzland' }))
})
// ZeroWords' plays (one row per level) and the answers and hints within them: the data to
// calibrate the level generator on.
for (const which of ['plays', 'answers'] as const) {
  app.get(`/api/zerowords/${which}.csv`, async (_req, reply) =>
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="zerowords-${which === 'plays' ? 'partite' : 'risposte'}.csv"`)
      .send(await reports.run('export', { kind: which === 'plays' ? 'zw-plays' : 'zw-answers' })),
  )
}

// Word Association's rounds and, within them, the hidden words found or missed and the chat's
// frequent wrong guesses: what gioco-zeroassociations/script/analyze_telemetry.py reads.
for (const which of ['rounds', 'guesses'] as const) {
  app.get(`/api/word-association/${which}.csv`, async (_req, reply) => {
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="word-association-${which === 'rounds' ? 'round' : 'tentativi'}.csv"`)
      .send(await reports.run('export', { kind: which === 'rounds' ? 'wa-rounds' : 'wa-guesses' }))
  })
}

// Background images (Bivio, Incastro, Quizzland): one per game and overlay key, stored in the data
// folder next to the databases. No SVG, which could carry scripts.
const BACKGROUND_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const backgroundsDir = join(dataDir, 'backgrounds')
// Bivio's files keep the name they had before other games could have one.
const backgroundFile = (game: BackgroundGame, key: string, ext: string) =>
  join(backgroundsDir, game === 'zerodubbi' ? `${key}.${ext}` : `${game}-${key}.${ext}`)
const backgroundGame = (raw: string) => BACKGROUND_GAMES.find((g) => g === raw)
const backgroundWrites = new Map<string, Promise<void>>()
app.addContentTypeParser(Object.keys(BACKGROUND_TYPES), { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) =>
  done(null, body),
)
app.post('/api/:game/background/:key', async (req, reply) => {
  const params = req.params as { game: string; key: string }
  const { key } = params
  const game = backgroundGame(params.game)
  const mime = String(req.headers['content-type']).split(';')[0].trim()
  const ext = Object.hasOwn(BACKGROUND_TYPES, mime) ? BACKGROUND_TYPES[mime] : undefined
  if (!game || !isValidKey(key) || !ext || !Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'bad request' })
  const resource = `${game}:${key}`
  const previous = backgroundWrites.get(resource)
  const body = req.body
  const writing = (async () => {
    if (previous) await previous.catch(() => undefined) // A failed upload does not block a later replacement.
    await mkdir(backgroundsDir, { recursive: true })
    const destination = backgroundFile(game, key, ext)
    const temporary = `${destination}.upload`
    try {
      await writeFile(temporary, body, { flush: true })
      await rename(temporary, destination)
      for (const old of Object.values(BACKGROUND_TYPES)) if (old !== ext) await rm(backgroundFile(game, key, old), { force: true })
    } finally { await rm(temporary, { force: true }) }
  })()
  backgroundWrites.set(resource, writing)
  try { await writing } finally { if (backgroundWrites.get(resource) === writing) backgroundWrites.delete(resource) }
  // The version busts the overlay's cached copy when the image is replaced.
  return { url: `${backgroundPath(game, key)}?v=${Date.now()}` }
})
app.get('/api/:game/background/:key', async (req, reply) => {
  const params = req.params as { game: string; key: string }
  const { key } = params
  const game = backgroundGame(params.game)
  if (!game || !isValidKey(key)) return reply.code(404).send({ error: 'not found' })
  for (const [type, ext] of Object.entries(BACKGROUND_TYPES)) {
    const file = backgroundFile(game, key, ext)
    try { await stat(file) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
    return reply.header('content-type', type).send(createReadStream(file))
  }
  return reply.code(404).send({ error: 'not found' })
})

// Pads: a new or edited pad arrives as JSON, with any uploaded file inside as base64.
app.post('/api/pads/:key', { bodyLimit: Math.ceil((PAD_FILE_MAX * 4) / 3) + 64 * 1024 }, async (req, reply) => {
  const { key } = req.params as { key: string }
  if (!isValidKey(key)) return reply.code(400).send({ error: 'Chiave non valida.' })
  const { error, board } = await persistence.run('padSave', { key, input: req.body })
  if (error) return reply.code(400).send({ error })
  io.to(key).emit('pads:state', board)
  return board
})
app.get('/api/pads/file/:name', async (req, reply) => {
  const file = await padFile((req.params as { name: string }).name)
  if (!file) return reply.code(404).send({ error: 'not found' })
  return reply.header('content-type', file.type).header('cache-control', 'public, max-age=31536000, immutable').send(file.body)
})
app.delete('/api/pads/:key/:id', async (req, reply) => {
  const { key, id } = req.params as { key: string; id: string }
  if (!isValidKey(key) || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return reply.code(400).send({ error: 'Identificativo non valido.' })
  const board = await persistence.run('padRemove', { key, id })
  io.to(key).emit('pads:state', board)
  return board
})

// Creators live on this Zerocade (every overlay key) and the gifts they received.
// ?creator= narrows the gifts: 'tiktok:<username>', or 'sim' for the simulator.
app.get('/api/feed', async (req): Promise<Feed> => {
  const { creator: q } = (req.query ?? {}) as { creator?: string }
  const creator = q === 'sim' ? '' : q && q !== 'all' ? q.slice(0, 80) : undefined
  const live = liveCreators()
  const isLive = new Set(live.map((c) => `${c.kind}:${c.username}`))
  const midnight = new Date().setHours(0, 0, 0, 0)
  await persistence.run('barrier', null)
  const snapshot = await reports.run('feed', { creator, since: midnight })
  return {
    live,
    ...snapshot,
    recent: snapshot.recent.filter((c) => !isLive.has(`${c.kind}:${c.username}`)),
  }
})

if (overlayDir) {
  await app.register(fastifyStatic, { root: overlayDir, prefix: '/overlay/' })
  // A link pasted without the trailing slash would otherwise load the dashboard.
  app.get('/overlay', (req, reply) => reply.redirect(`/overlay/${req.url.slice('/overlay'.length)}`))
}
if (dashboardDir) {
  await app.register(fastifyStatic, { root: dashboardDir, decorateReply: !overlayDir })
  // Client-side routes (/sources, /dj, …) all load the dashboard.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html', dashboardDir)
    return reply.code(404).send({ error: 'not found' })
  })
}

// The client bundle comes from Vite, so Socket.IO does not need to serve its own.
// The same local-only rule as the HTTP routes, checked before the socket's handshake.
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  path: '/socket.io',
  serveClient: false,
  maxHttpBufferSize: 256 * 1024,
  allowRequest: (req, callback) => callback(null, localAccess(req.headers.host, req.headers.origin, PORT)),
})

const gameIssue = (key: string, message: string) => io.to(dashboardRoom(key)).emit('runtime:issue', { component: 'game', message, at: Date.now() })
const bivio = new BivioRooms((key, state) => io.to(key).emit('bivio:state', state), gameIssue)

// Incastro's solution goes to the dashboards only, which also join `<key>#dashboard`.
const dashboardRoom = (key: string) => `${key}#dashboard`
const incastro = new IncastroRooms(
  (key, state) => io.to(key).emit('incastro:state', state),
  (key, solution) => io.to(dashboardRoom(key)).emit('incastro:solution', solution),
  // The right answers of the level in this Zerocade's room go to ZeroFollowerBot's voice (see zfb.ts): of the
  // comments made of a single word it reads only a right answer, the first time.
  (key, answers, fresh) => {
    if (key === roomKey) zfb.setWords(answers, fresh)
  },
  gameIssue,
)

// Quizzland's right answer, like Incastro's solution, goes to the dashboards only.
const quizzland = new QuizzlandRooms(
  (key, state) => io.to(key).emit('quizzland:state', state),
  (key, solution) => io.to(dashboardRoom(key)).emit('quizzland:solution', solution),
  gameIssue,
)

// The latest live events of each key, for the dashboard's chat box when it opens.
const FEED_KEPT = 100
const feeds = new Map<string, FeedEvent[]>()
let feedSeq = 0

// The live's counters of each key since this Zerocade started, for the dashboard's right column.
// The viewers are read from the connected lives each time they are sent: the direct feeds and, for this Zerocade's
// room, the accounts ZeroFollowerBot's bridge reads (one read both ways counts once).
type Counters = Omit<LiveStats, 'viewers'>
const counters = new Map<string, Counters>()
const NO_COUNTS: Counters = { comments: 0, likes: 0, gifts: 0, coins: 0, follows: 0 }
const STATS_EVERY_MS = 500
const statsTimers = new Map<string, NodeJS.Timeout>()

function liveStats(key: string): LiveStats {
  const direct = sources.get(key)?.live() ?? []
  const bridged = key === roomKey ? zfb.accounts().filter((a) => !direct.some((s) => s.kind === a.kind && s.username === a.username)) : []
  const watching = [...direct, ...bridged].flatMap((s) => (s.viewers === undefined ? [] : [s.viewers]))
  return {
    ...(counters.get(key) ?? NO_COUNTS),
    viewers: watching.length ? watching.reduce((a, b) => a + b, 0) : null,
  }
}

// At most one update every STATS_EVERY_MS per key, however busy the chat.
function pushStats(key: string) {
  if (statsTimers.has(key)) return
  statsTimers.set(key, setTimeout(() => {
    statsTimers.delete(key)
    io.to(dashboardRoom(key)).emit('stats:update', liveStats(key))
  }, STATS_EVERY_MS))
}

function countEvent(key: string, event: LiveEvent, origin: EventOrigin) {
  const c = { ...(counters.get(key) ?? NO_COUNTS) }
  if (event.type === 'comment') c.comments++
  else if (event.type === 'like' && origin !== 'twitch') c.likes += event.count
  else if (event.type === 'gift') {
    c.gifts += event.count
    c.coins += (giftById(event.giftId)?.coins ?? 0) * event.count
  } else if (event.type === 'follow') c.follows++
  counters.set(key, c)
  pushStats(key)
}

// The viewer count changes without any event: refresh it every few seconds for lives connected.
setInterval(() => {
  for (const [key, room] of sources) if (room.live().length) pushStats(key)
}, 5000).unref()

// Persist + relay every live event (simulated or real), and keep the gifters ranking.
// Bivio, Incastro and Quizzland run on the server, so their triggers are applied here rather than in
// the overlay. `origin` is the feed the event came from, `creator` that feed's account
// ('tiktok:<username>'), '' when simulated.
// Who followed during the live counts as a follower at once, for "Chi può giocare" (see follows.ts).
const follows = new RecentFollows()

// Ends the round in play, whatever the game: the server's own games take the command, ZeroContext too, the others get it as the
// overlay's "next-round" (the games that know it carry it out). Used by the dashboard's "Termina round" and by a moderator's "!next".
function endRound(key: string, gameId: string): void {
  switch (gameId) {
    case 'zerodubbi': return bivio.get(key)?.control('next')
    case 'incastro': return incastro.get(key)?.control('next')
    case 'quizzland': return quizzland.get(key)?.control('next')
    case 'zerowordhunt': {
      const room = wordhunt.get(key)
      if (room?.state().phase === 'active') room.control({ type: 'finish', expectedVersion: room.state().version })
      return
    }
    default: {
      const semantic = gameId === 'context' ? ensureSemantic(key) : null
      if (semantic) semantic.next()
      else io.to(key).emit('game:command', 'next-round')
    }
  }
}

function broadcastEvent(key: string, received: LiveEvent, origin: EventOrigin = 'sim', creator = '') {
  const at = Date.now()
  const event = follows.apply(key, received)
  const session = getSession(key)
  void persistence.run('event', { key, creator, game: session.gameId, event, at }).then((ranking) => {
    if (ranking) io.to(key).emit('ranking:update', ranking)
  }).catch((error: unknown) => {
    if (!persistenceIssue) {
      app.log.error({ err: error, eventSeq: item.seq }, 'Evento live non salvato o non confermato')
      persistenceIssue = { component: 'persistence', message: 'Alcuni eventi non sono stati salvati o non hanno ricevuto conferma. Controlla il registro prima di riprovare.', at: Date.now() }
      io.to(dashboardRoom(key)).emit('runtime:issue', persistenceIssue)
    }
  })
  // A comment of someone the game's "Chi può giocare" leaves out stays in the dashboard's chat, but the game never sees it.
  const plays = event.type !== 'comment' || allowedToPlay(session.settings, event.user)
  if (plays) io.to(key).emit('live:event', event)
  const item: FeedEvent = { seq: ++feedSeq, at, origin, event }
  feeds.set(key, [...(feeds.get(key) ?? []).slice(1 - FEED_KEPT), item])
  io.to(dashboardRoom(key)).emit('feed:events', [item])
  countEvent(key, event, origin)
  if (event.type === 'like' && origin !== 'twitch' && session.gameId === 'zerowordhunt' && !session.paused && !session.ended)
    wordhunt.get(key)?.tap(event.count)
  // A moderator's "!next" ends the round (not in a ZeroContext tournament, whose controls are its own); it is never read as an answer.
  if (isEndRoundCommand(event)) {
    if (plays && !session.paused && !session.ended && !tournaments.isOpen(key)) endRound(key, session.gameId)
    return
  }
  const room = bivio.get(key) ?? incastro.get(key) ?? quizzland.get(key)
  // "Aiuti dal pubblico" switched off: those triggers give no help (activeTriggers).
  if (room && plays && !session.ended) for (const t of triggersFor(activeTriggers(session), event)) room.action(t.action, event)
  // ZeroWordHunt takes the chat's comments from every source: the first one that arrives here wins the word (the room orders them).
  if (event.type === 'comment' && plays && !session.ended && !session.paused && session.gameId === 'zerowordhunt')
    wordhunt.get(key)?.offer({ user: event.user, text: event.text, messageId: '', platform: origin === 'sim' ? 'local' : origin })
  if (session.gameId === 'context' && plays && !session.paused && !session.ended) {
    const semantic = ensureSemantic(key)
    if (semantic) for (const t of triggersFor(activeTriggers(session), event)) semantic.action(t.action, event)
  }
}

// One RoomSources per overlay key: real TikTok/Twitch feeds are relayed as live events.
const sources = new Map<string, RoomSources>()
const roomSources = (key: string) => {
  let room = sources.get(key)
  if (!room) {
    room = new RoomSources(
      (event, kind) => {
        const live = sources.get(key)?.live().find((s) => s.kind === kind)
        broadcastEvent(key, event, kind, live ? `${kind}:${live.username}` : '')
      },
      (status) => {
        io.to(key).emit('source:status', status)
        if (status.state === 'connected') saveCreator(status.kind, status.username, getSession(key).gameId)
      },
    )
    sources.set(key, room)
  }
  return room
}

// ZeroContext: how many times each secret word has come out, kept here too (a new round looks up thousands of words).
// A new round, classic or tournament, counts once and goes to every client of the room.
const secretUseCounts = new Map<string, number>(Object.entries(contextSecretUses()))
const secretLastAt = new Map<string, number>(Object.entries(contextSecretLast()))
const noteSecretUse = (key: string, word: string, privateWord = false) => {
  const at = Date.now()
  const uses = recordContextSecretUse(word, at)
  secretUseCounts.set(word, uses)
  secretLastAt.set(word, at)
  io.to(privateWord ? dashboardRoom(key) : key).emit('context:secret-used', { word, uses, at })
}

// ZeroContext's words: the vocabulary here, the vectors and the rankings in a thread of their own (context-corpora.ts,
// context-worker.ts), so that loading a corpus (up to 2 s) or ranking a secret (up to 0.3 s) never stops overlays and dashboards.
const contextCorpora = new ContextCorpora()
const roomProfile = (key: string) => contextProfile(getSession(key).settings.associationSource)
// The room's corpus when it is ready (null while it loads: its loading starts).
const roomCorpus = (key: string) => contextCorpora.get(roomProfile(key))
// The room plays (or will play, once loaded) the semantic ZeroContext of the server, not the old one of the overlay.
const semanticRoom = (key: string) => {
  const corpus = roomCorpus(key)
  return corpus ? Boolean(corpus.data.semantic) : contextCorpora.status(roomProfile(key)) === 'loading'
}

// ZeroContext's tournament, run by the server (context-tournament.ts): its public state to every client of the room,
// the secret and the full standings to dashboards only. It needs ZeroFollowerBot's bridge, which serves roomKey.
const tournaments = new ContextTournaments({
  store: contextTournamentStore,
  corpus: (key) => roomCorpus(key),
  rank: (corpus, secret) => contextCorpora.rank(corpus, secret),
  corpusLoading: (key) => contextCorpora.status(roomProfile(key)) === 'loading',
  emitPublic: (key, state) => io.to(key).emit('context:tournament', state),
  emitAdmin: (key, admin) => io.to(dashboardRoom(key)).emit('context:tournament-admin', admin),
  bridgeReady: (key) => {
    const status = zfb.status()
    return key === roomKey && status.state === 'connected' && Boolean(status.tiktok || status.twitch)
  },
  secretUses: (word) => secretUseCounts.get(word) ?? 0,
  secretLastAt: (word) => secretLastAt.get(word) ?? 0,
  recordSecretUse: noteSecretUse,
  typedWords: (key) => getSession(key).settings.tournamentTypedWords === true,
  showWordLength: (key) => { const s = getSession(key).settings; return s.disableAllHints !== true && s.showWordLength !== false },
})

// ZeroTaboo (taboo.ts): the match is the server's own. Its answers come from ZeroFollowerBot's bridge only (the simulator
// only in practice mode); the public state goes to every client of the room, the card in play to the dashboards.
const taboo = new TabooRooms({
  store: tabooStore,
  deck: () => loadDeck(),
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  random: Math.random,
  newId: randomUUID,
  emitPublic: (key, state) => io.to(key).emit('taboo:state', state),
  emitAdmin: (key, admin) => io.to(dashboardRoom(key)).emit('taboo:admin', admin),
  bridgeReady: (key) => {
    const status = zfb.status()
    return key === roomKey && status.state === 'connected' && Boolean(status.tiktok || status.twitch)
  },
  allowed: (key, user) => allowedToPlay(getSession(key).settings, user),
  settings: (key) => getSession(key).settings,
  issue: gameIssue,
  log: (level, message, fields) => app.log[level](fields ?? {}, message),
})

// ZeroWordHunt (wordhunt.ts): the round is the server's own. Its answers are the chat's comments, from the bridge, the direct
// feeds and the simulator alike: the first one that arrives here takes the word. The public state goes to every client of the
// room; the targets and their paths to the dashboards only.
// The dictionary of the generated boards is read in the report worker (about a second of reading two databases), not here: reading it on
// this thread stalled the server and with it every overlay and dashboard. `undefined` until read, then the words or null.
let wordHuntWords: readonly string[] | null | undefined
let wordHuntLoading = false
function loadWordHuntWords(): void {
  if (wordHuntLoading || wordHuntWords !== undefined) return
  wordHuntLoading = true
  reports.run('wordhuntWords', null)
    .then((words) => { wordHuntWords = words })
    .catch((error: unknown) => {
      app.log.warn({ err: error }, 'ZeroWordHunt: dizionario non letto')
      wordHuntWords = null
    })
    .finally(() => { wordHuntLoading = false; wordhunt.dictionaryLoaded() })
}
const wordhuntFixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'wordhunt-fixture.json'), 'utf-8')) as FixtureFile
const wordhunt = new WordHuntRooms({
  store: wordHuntStore,
  dictionary: () => {
    if (wordHuntWords === undefined) loadWordHuntWords()
    return wordHuntWords
  },
  fixture: () => wordhuntFixture,
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  newId: randomUUID,
  newSeed: () => randomUUID().slice(0, 8),
  emitPublic: (key, state) => io.to(key).emit('wordhunt:state', state),
  emitSound: (key, sound) => io.to(key).emit('wordhunt:sound', sound),
  emitAdmin: (key, admin) => io.to(dashboardRoom(key)).emit('wordhunt:admin', admin),
  allowed: (key, user) => allowedToPlay(getSession(key).settings, user),
  settings: (key) => getSession(key).settings,
  autoplay: (key) => {
    const session = getSession(key)
    return session.gameId === 'zerowordhunt' && session.settings.wordhuntAuto !== false && !session.paused && !session.ended
  },
  issue: gameIssue,
  log: (level, message, fields) => app.log[level](fields ?? {}, message),
})

// ZeroFollowerBot's event bridge, for this Zerocade's room: its events go where the direct feeds' go.
const zfb = new ZfbBridge(
  (received, kind, account, id, at) => {
    // A viewer who followed during the live is a follower for the voice too (see follows.ts).
    const event = follows.apply(roomKey, received)
    // A ZeroWords guess that only repeats words the level already has: ZeroFollowerBot's voice need not read it.
    // Asked before the game plays the comment, so the one that finds a word is still read.
    const repeat =
      id !== '' &&
      event.type === 'comment' &&
      triggersFor(getSession(roomKey).triggers, event).some((t) => t.action === 'guess') &&
      incastro.get(roomKey)?.alreadyGuessed(event.text) === true
    // ZeroFollowerBot's voice does not read the comments the game ignores ("Chi può giocare"), nor, with "Voce solo
    // ai follower", the ones of viewers the bridge says do not follow (a viewer it says nothing about is read), and
    // (with "Voce: non leggere le risposte") the game's answers: ZeroWordle's guesses, ZeroContext's single words from the word shown to the next round (not in a
    // tournament: its rounds do not go through the overlay's classic engine, so the last classic round would stay "over").
    const session = getSession(roomKey)
    // "Voce: non leggere le risposte" (a setting of every game): what counts as an answer is the game's own (see the setting's hint).
    const skipsAnswers = session.settings.voiceSkipAnswers === true
    const isAnswer = (): boolean => {
      switch (session.gameId) {
        case 'zerowordle': return true
        case 'context': return !tournaments.has(roomKey) && roundOver(roomKey) && singleWord(event.type === 'comment' ? event.text : '')
        case 'zerotaboo': return taboo.get(roomKey)?.listening() === true
        case 'zerowordhunt': return wordhunt.get(roomKey)?.listening() === true
        default: return triggersFor(activeTriggers(session), event).some((t) => t.action === 'guess' || t.action === 'answer')
      }
    }
    const silent =
      id !== '' &&
      event.type === 'comment' &&
      ((skipsAnswers && isAnswer()) ||
        !allowedToPlay(session.settings, event.user) ||
        (session.settings.voiceFollowersOnly === true && event.user.follower === false && event.user.fan !== true))
    broadcastEvent(roomKey, event, kind, account ? `${kind}:${account}` : '')
    if (repeat || silent) zfb.skip(id)
    // ZeroContext's tournament takes its words from ZeroFollowerBot's bridge only (context-tournament.ts).
    if (isEndRoundCommand(event)) return // the command is not a word of the games
    if (event.type === 'comment' && session.gameId === 'context') tournaments.offer(roomKey, event.user, event.text, id, kind, at)
    // ZeroTaboo takes its answers here and nowhere else: this is the only place that knows the message's id (D2, D7).
    if (event.type === 'comment' && session.gameId === 'zerotaboo') taboo.get(roomKey)?.offer({ source: 'bridge', user: event.user, text: event.text, messageId: id, platform: kind })
  },
  (status) => {
    io.to(dashboardRoom(roomKey)).emit('bridge:status', status)
    tournaments.bridgeChanged()
    taboo.bridgeChanged()
    for (const a of zfb.accounts()) saveCreator(a.kind, a.username, getSession(roomKey).gameId)
    // Another account, or none: the viewers it counted are gone.
    pushStats(roomKey)
  },
  // The viewers of a live read by the bridge changed.
  () => pushStats(roomKey),
)
zfb.configure(bridgeConfig())
// A tournament open when the server stopped comes back; one in the middle of a round waits suspended for its organiser.
tournaments.restore()
// ZeroTaboo: a match left open when the server stopped is closed as cancelled; the data older than 90 days is purged (D16), now,
// at the start, never during a live.
try {
  tabooStore.abandonOpenMatches(Date.now())
  tabooStore.purgeExpired(Date.now())
} catch (error) {
  app.log.warn({ err: error }, 'ZeroTaboo: pulizia all\'avvio non riuscita')
}
// ZeroWordHunt: a round left open when the server stopped is closed as abandoned; the data older than 90 days is purged, now.
try {
  wordHuntStore.abandonOpenRounds(Date.now())
  wordHuntStore.purgeExpired(Date.now())
} catch (error) {
  app.log.warn({ err: error }, 'ZeroWordHunt: pulizia all\'avvio non riuscita')
}
// ZeroWordHunt's dictionary is requested now, from the worker, whatever the game: it is ready before anybody chooses ZeroWordHunt.
setTimeout(loadWordHuntWords, 3000).unref()
// The tournament's corpus (68 MB read, hashed and parsed in one go, a few hundred ms with the server stopped) is
// prepared now, with nobody playing, rather than at the first «Crea torneo» of a live.
setTimeout(() => { if (getSession(roomKey).gameId === 'context') void contextCorpora.load(roomProfile(roomKey)) }, 1000).unref()

const liveCreators = (): FeedCreator[] => {
  const seen = new Map<string, FeedCreator>()
  for (const [key, room] of sources) {
    for (const s of room.live()) {
      const creator: FeedCreator = { kind: s.kind, username: s.username, gameId: getSession(key).gameId, at: s.since }
      if (s.viewers !== undefined) creator.viewers = s.viewers
      seen.set(`${s.kind}:${s.username}`, creator)
    }
  }
  for (const a of zfb.accounts()) {
    const id = `${a.kind}:${a.username}`
    if (seen.has(id)) continue
    const creator: FeedCreator = { kind: a.kind, username: a.username, gameId: getSession(roomKey).gameId, at: a.since }
    if (a.viewers !== undefined) creator.viewers = a.viewers
    seen.set(id, creator)
  }
  return [...seen.values()].sort((a, b) => (b.viewers ?? -1) - (a.viewers ?? -1) || a.at - b.at)
}

// Keeps each live creator's game, viewers and last time seen for the Recent list.
setInterval(() => {
  for (const c of liveCreators()) saveCreator(c.kind, c.username, c.gameId, c.viewers)
}, 30_000).unref()

function saveCreator(kind: 'tiktok' | 'twitch', username: string, game: string, viewers?: number) {
  void persistence.run('creator', { kind, username, game, viewers }).catch((error: unknown) => app.log.error({ err: error }, 'Account live non salvato'))
}

io.use((socket, next) => {
  const { clientType, key } = socket.handshake.auth as Partial<HandshakeAuth>
  if ((clientType !== 'dashboard' && clientType !== 'overlay') || !isValidKey(key)) {
    return next(new Error('unauthorized'))
  }
  next()
})

// ZeroContext's secret word of each room.
// The games that play one secret per room (ZeroContext's and ZeroWordle's word, ZeroReazioniACatena's chain).
const SECRET_GAMES = ['context', 'zerowordle', 'zeroreazioniacatena']
const roomSecrets = new Map<string, string>()
// ZeroContext: the word an overlay of each room has shown at the end of its round (found, or "Termina round"). While it
// is still the room's word the round is over and the next has not started: the chat's single words are no guesses,
// and ZeroFollowerBot's voice need not read them.
const revealedSecrets = new Map<string, string>()
const roundOver = (key: string) => {
  const revealed = revealedSecrets.get(key)
  return revealed !== undefined && revealed === roomSecrets.get(key)
}

const semanticGames = new Map<string, ContextSemanticGame>()
function ensureSemantic(key: string): ContextSemanticGame | null {
  const session = getSession(key)
  if (session.gameId !== 'context' || session.ended || tournaments.has(key)) return null
  const existing = semanticGames.get(key)
  if (existing) return existing
  const corpus = roomCorpus(key)
  if (!corpus?.data.semantic) return null
  const game = new ContextSemanticGame({ corpus, settings: session.settings,
    rank: (secret) => contextCorpora.rank(corpus, secret),
    failed: (error) => app.log.warn({ err: error.message }, 'ZeroContext: classifica del round non calcolata, riprovo'),
    emit: (state) => {
      if (state.solution) revealedSecrets.set(key, state.solution)
      io.to(key).emit('context:semantic', state)
    },
    award: (user, points) => recordScore(key, 'context', user, points),
    secret: (word) => {
      roomSecrets.set(key, word); revealedSecrets.delete(key)
      io.to(dashboardRoom(key)).emit('secret:word', { word })
      noteSecretUse(key, word, true)
    },
    uses: (word) => secretUseCounts.get(word) ?? 0,
    lastAt: (word) => secretLastAt.get(word) ?? 0,
  })
  semanticGames.set(key, game)
  game.pause(Boolean(session.paused))
  return game
}
function clearSemantic(key: string) {
  semanticGames.get(key)?.dispose()
  semanticGames.delete(key)
  io.to(key).emit('context:semantic', null)
}
// What the overlays draw: the game, or "preparing" while the room's corpus loads (not the overlay's old engine meanwhile).
function semanticState(key: string): ContextSemanticState | null {
  const game = ensureSemantic(key)
  if (game) return game.snapshot()
  const session = getSession(key)
  return session.gameId === 'context' && !session.ended && !tournaments.has(key) && semanticRoom(key) ? PREPARING_STATE : null
}
const PREPARING_STATE: ContextSemanticState = { round: 0, mode: 'ordinary', phase: 'intermission', paused: false, preparing: true,
  remainingMs: null, attempts: 0, total: 0, solution: null, prefix: '', wordLength: null, solvedBy: null, reason: null, best: null,
  closest: [], last: null, typed: [], notes: [], leaders: [] }
const contextRooms = () => new Set([roomKey, ...semanticGames.keys(), ...[...io.sockets.sockets.values()].map((s) => (s.handshake.auth as HandshakeAuth).key)])
// A corpus is ready (or found unavailable): the rooms waiting for it start, a restored tournament gets its round's ranking.
contextCorpora.onLoaded((profile) => {
  tournaments.corpusReady()
  for (const key of contextRooms()) {
    if (getSession(key).gameId !== 'context' || roomProfile(key) !== profile || semanticGames.has(key)) continue
    const state = semanticState(key)
    if (!semanticGames.has(key)) io.to(key).emit('context:semantic', state)
  }
})
const semanticClock = setInterval(() => {
  for (const [key, game] of semanticGames) {
    const session = getSession(key)
    if (session.gameId !== 'context' || session.ended || tournaments.has(key)) { clearSemantic(key); continue }
    game.pause(Boolean(session.paused))
    game.tick()
  }
}, 250)
semanticClock.unref()

// Local publisher: reload only ZeroContext and let its existing clients start on the new corpus.
app.post('/api/context/reload', async (req, reply) => {
  const body = req.body as { revision?: unknown; database?: unknown } | null
  if (!body || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision) ||
      typeof body.database !== 'string' || !giochiDb || resolve(body.database) !== resolve(giochiDb))
    return reply.code(409).send({ error: 'Database o revisione di ZeroContext non corrispondenti a questo server.' })
  try {
    const previous = contextRevision()
    const loaded = reloadContext(body.revision)
    // The ranking thread reloads and checks it too; the vocabulary here is read again from it.
    await contextCorpora.reload(body.revision)
    if (!await contextCorpora.load('original')) throw new Error('Il nuovo corpus non supera la validazione del ranking')
    if (previous !== loaded.revision) {
      tournaments.corpusChanged()
      const keys = new Set([...contextRooms(), ...roomSecrets.keys()])
      for (const key of keys) {
        if (getSession(key).gameId !== 'context' || tournaments.isOpen(key)) continue
        roomSecrets.delete(key)
        revealedSecrets.delete(key)
        clearSemantic(key)
        io.to(key).emit('session:state', controlGame(key, 'restart'))
        io.to(key).emit('context:semantic', semanticState(key))
      }
    }
    return reply.send({ ok: true, ...loaded })
  } catch (error) {
    return reply.code(503).send({ error: error instanceof Error ? error.message : 'Ricaricamento ZeroContext non riuscito.' })
  }
})

// Each overlay key is a room: the dashboard and every overlay opened with that key share it.
io.on('connection', (socket) => {
  const { clientType, key } = socket.handshake.auth as HandshakeAuth
  void socket.join(key)
  if (clientType === 'dashboard') void socket.join(dashboardRoom(key))
  const session = getSession(key)
  socket.emit('session:state', session)
  const secret = roomSecrets.get(key)
  if (SECRET_GAMES.includes(session.gameId) && secret && (clientType === 'dashboard' || session.gameId !== 'context' || !semanticRoom(key))) socket.emit('secret:word', { word: secret })
  const semanticSnapshot = semanticState(key)
  const semantic = semanticSnapshot !== null
  socket.emit('context:semantic', semanticSnapshot)
  if (session.gameId === 'zerodubbi') socket.emit('bivio:state', bivio.open(key, session.settings))
  if (session.gameId === 'incastro') socket.emit('incastro:state', incastro.open(key, session.settings))
  if (session.gameId === 'quizzland') socket.emit('quizzland:state', quizzland.open(key, session.settings))
  if (session.gameId === 'zerotaboo') socket.emit('taboo:state', taboo.open(key).state())
  if (session.gameId === 'zerowordhunt') socket.emit('wordhunt:state', wordhunt.open(key).state())
  const tournament = tournaments.state(key)
  if (tournament) socket.emit('context:tournament', tournament)
  if (clientType === 'dashboard' || !semantic) {
    socket.emit('context:secret-uses', Object.fromEntries(secretUseCounts))
    socket.emit('context:secret-last', Object.fromEntries(secretLastAt))
  }
  // While a ZeroContext tournament is open, the generic controls cannot replace or restart it (specifica §3.2).
  const tournamentLocks = (what: string) => {
    if (!tournaments.isOpen(key)) return false
    socket.emit('context:tournament-error', { message: `${what} non è possibile durante il torneo ZeroContext: concludilo o annullalo prima.` })
    return true
  }

  socket.on('disconnect', () => {
    if (io.sockets.adapter.rooms.get(key)?.size) return
    bivio.get(key)?.suspend()
    incastro.get(key)?.suspend()
    quizzland.get(key)?.suspend()
  })

  // ZeroContext and ZeroWordle: the first overlay to start a round sets the room's secret; one that starts it
  // from another word than the current one (two overlays racing) is told the current one.
  // Pause, restart or end the game in play (the dashboard's buttons). A restart draws a new secret.
  socket.on('game:control', (command: unknown) => {
    if (clientType !== 'dashboard' || typeof command !== 'string' || !['pause', 'resume', 'restart', 'end', 'start'].includes(command)) return
    if (tournamentLocks('Questo comando del gioco')) return
    if (command === 'restart' || command === 'start') {
      roomSecrets.delete(key)
      revealedSecrets.delete(key)
      clearSemantic(key)
    }
    io.to(key).emit('session:state', controlGame(key, command as GameControl))
    if (getSession(key).gameId === 'zerotaboo') {
      if (command === 'pause' || command === 'resume') taboo.get(key)?.pause(command === 'pause')
      else if (command === 'end' || command === 'restart') {
        taboo.close(key)
        if (command === 'restart') {
          const room = taboo.open(key)
          io.to(key).emit('taboo:state', room.state())
          io.to(dashboardRoom(key)).emit('taboo:admin', room.admin())
        }
      }
    }
    if (getSession(key).gameId === 'zerowordhunt') {
      if (command === 'pause' || command === 'resume') wordhunt.get(key)?.pause(command === 'pause')
      else if (command === 'end' || command === 'restart') {
        wordhunt.close(key)
        if (command === 'restart') {
          const room = wordhunt.open(key)
          io.to(key).emit('wordhunt:state', room.state())
          io.to(dashboardRoom(key)).emit('wordhunt:admin', room.admin())
        }
      }
    }
    if (command === 'end') { clearSemantic(key); wordhunt.endSession(key) }
    else ensureSemantic(key)?.pause(command === 'pause')
  })

  // A command of the creator to the game in play (the dashboard's "Termina round"): the overlays of the room carry it
  // out. Not while the game is paused or ended, as for the chat's actions.
  socket.on('game:command', (command: unknown) => {
    const session = getSession(key)
    if (clientType !== 'dashboard' || !isGameCommand(command) || session.paused || session.ended) return
    if (tournamentLocks('«Termina round»')) return
    endRound(key, session.gameId)
  })

  // Points a viewer has just earned, from the overlay of the game in play (never the dashboard's preview).
  socket.on('score:add', (raw: unknown) => {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const u = r?.user && typeof r.user === 'object' ? (r.user as Record<string, unknown>) : null
    const session = getSession(key)
    if (!r || !u || r.game !== session.gameId || session.paused || session.ended) return
    // The tournament's points are the server's own, never an overlay's (and never in the ordinary leaderboards).
    if (session.gameId === 'context' && (tournaments.has(key) || ensureSemantic(key) || semanticRoom(key))) return
    if (session.gameId === 'zerotaboo') return // its standings are the server's own (D17)
    if (session.gameId === 'zerowordhunt') return // its claims are the server's own
    if (typeof u.id !== 'string' || typeof u.nickname !== 'string' || typeof r.points !== 'number') return
    const avatar = typeof u.avatar === 'string' && /^https?:\/\//.test(u.avatar) ? u.avatar.slice(0, 512) : undefined
    recordScore(key, session.gameId, { id: u.id, nickname: u.nickname, avatar }, r.points)
  })

  // Reset one leaderboard (a game and a period) from the dashboard: from now on that period counts only the new
  // points, the other periods stay as they were. The reply carries the moment of the reset.
  socket.on('leaderboard:reset', (raw: unknown, ack?: unknown) => {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    if (clientType !== 'dashboard' || !r || !isPeriod(r.period)) return
    const game = GAMES.find((g) => g.id === r.game)
    if (!game) return
    const at = resetLeaderboard(key, game.id, r.period)
    if (typeof ack === 'function') ack({ at })
  })

  socket.on('secret:round', (raw: unknown) => {
    if (!SECRET_GAMES.includes(getSession(key).gameId) || !raw || typeof raw !== 'object') return
    if (getSession(key).gameId === 'context' && (tournaments.has(key) || ensureSemantic(key) || semanticRoom(key))) return
    const { word, prev } = raw as { word?: unknown; prev?: unknown }
    // One word, or a chain of them joined by "-" (ZeroReazioniACatena's led by its mode and round).
    if (typeof word !== 'string' || word.length > ROOM_SECRET_MAX || !ROOM_SECRET.test(word)) return
    const current = roomSecrets.get(key)
    if (current === undefined || current === (typeof prev === 'string' ? prev : null)) {
      roomSecrets.set(key, word)
      revealedSecrets.delete(key)
      if (getSession(key).gameId === 'context') noteSecretUse(key, word)
      io.to(key).emit('secret:word', { word })
    } else socket.emit('secret:word', { word: current })
  })

  // ZeroContext: an overlay shows the round's word (see revealedSecrets); only the room's word counts.
  socket.on('secret:revealed', (raw: unknown) => {
    if (getSession(key).gameId !== 'context' || !raw || typeof raw !== 'object') return
    if (ensureSemantic(key) || semanticRoom(key)) return
    const { word } = raw as { word?: unknown }
    if (typeof word === 'string' && word === roomSecrets.get(key)) revealedSecrets.set(key, word)
  })

  // A click on ZeroWords' wheel shuffles it: in the dashboard's preview, the overlay page in a
  // browser, or OBS's Interact window.
  socket.on('incastro:shuffle', () => incastro.get(key)?.control('shuffle'))

  // The end of a ZeroAssociazioni round, from an overlay (never the dashboard's preview): kept
  // only while the game is selected and when it matches the content this server loaded.
  socket.on('wordassoc:round', (raw: unknown) => {
    if (getSession(key).gameId !== 'word-association') return
    const report = sanitizeRoundReport(raw, wordAssociation)
    if (!report) return
    recordWordAssociationRound({
      key,
      content_id: report.content_id,
      ref: report.ref,
      prompt: report.prompt,
      words: report.words,
      duration_ms: report.durationMs,
      players: report.players,
      guesses: report.guesses,
      hints: report.hints,
      found: report.found,
      wrong: report.wrong,
    })
  })

  // Otherwise overlays only listen; everything that changes state comes from the dashboard.
  if (clientType !== 'dashboard') return

  const words = incastro.get(key)
  if (words) socket.emit('incastro:solution', words.solution())
  const quiz = quizzland.get(key)?.solution()
  if (quiz) socket.emit('quizzland:solution', quiz)
  // The card in play and the director's tools: to a dashboard only, never to an overlay.
  if (session.gameId === 'zerotaboo') socket.emit('taboo:admin', taboo.open(key).admin())
  if (session.gameId === 'zerowordhunt') socket.emit('wordhunt:admin', wordhunt.open(key).admin())
  void persistence.run('ranking', { key }).then((ranking) => { if (socket.connected) socket.emit('ranking:update', ranking) })
    .catch((error: unknown) => app.log.error({ err: error }, 'Classifica donatori non disponibile'))
  void persistence.run('padBoard', { key }).then((board) => { if (socket.connected) socket.emit('pads:state', board) })
    .catch((error: unknown) => app.log.error({ err: error }, 'Pulsanti non disponibili'))
  for (const status of roomSources(key).statuses()) socket.emit('source:status', status)
  socket.emit('source:saved', savedSources(key))
  socket.emit('feed:events', feeds.get(key) ?? [])
  socket.emit('bridge:status', zfb.status())
  if (persistenceIssue) socket.emit('runtime:issue', persistenceIssue)
  socket.emit('stats:update', liveStats(key))

  const admin = tournaments.admin(key)
  if (admin) socket.emit('context:tournament-admin', admin)
  socket.on('context:tournament', (raw: unknown, ack?: unknown) => {
    const command = sanitizeTournamentCommand(raw)
    const session = getSession(key)
    const reply = command
      ? tournaments.command(key, command, { gameId: session.gameId, audience: session.settings.audience })
      : { ok: false as const, error: 'Comando del torneo non valido.' }
    if (typeof ack === 'function') ack(reply)
  })
  socket.on('context:tournament-history', (ack?: unknown) => {
    if (typeof ack === 'function') ack(contextTournamentStore.history(key))
  })
  // "Elimina storico": finished tournaments of this room, one or all; the one on screen is kept.
  socket.on('context:tournament-history-delete', (id: unknown, ack?: unknown) => {
    const deleted = contextTournamentStore.deleteFinished(key, typeof id === 'string' ? id : null, tournaments.state(key)?.tournamentId ?? null)
    if (typeof ack === 'function') ack(deleted)
  })
  // The copies of the standings kept after every round (a separate SQLite file), and the restore from one of them.
  socket.on('context:tournament-backups', (ack?: unknown) => {
    const id = tournaments.state(key)?.tournamentId
    if (typeof ack === 'function') ack(id ? contextTournamentStore.backups(id) : [])
  })
  socket.on('context:tournament-restore', (snapshotId: unknown, ack?: unknown) => {
    const reply = tournaments.restoreFromBackup(key, typeof snapshotId === 'number' && Number.isInteger(snapshotId) ? snapshotId : null)
    if (typeof ack === 'function') ack(reply)
  })
  // A tournament's full standings, only for one of this room.
  socket.on('context:tournament-standings', (id: unknown, ack?: unknown) => {
    if (typeof ack !== 'function') return
    const own = typeof id === 'string' && contextTournamentStore.tournament(id)?.roomKey === key
    ack(own ? tournaments.standingsOf(id as string) : null)
  })

  socket.on('bridge:set', (raw: unknown) => {
    const config = sanitizeBridgeConfig(raw)
    if (!config) return
    saveBridgeConfig(config)
    zfb.configure(config)
  })
  socket.on('bridge:retry', () => zfb.reconnect())

  // The name entered is saved for the next lives, whether this connection works or not.
  socket.on('source:connect', (raw: unknown) => {
    const config = sanitizeSourceConfig(raw)
    if (!config) return
    const username = sourceUsername(config.kind, config.username)
    if (username) {
      saveSource(key, config.kind, username)
      io.to(dashboardRoom(key)).emit('source:saved', savedSources(key))
    }
    roomSources(key).connect(config)
  })

  socket.on('source:disconnect', (kind: unknown) => {
    if (kind === 'tiktok' || kind === 'twitch') roomSources(key).disconnect(kind)
  })

  socket.on('sim:event', (raw: unknown) => {
    const event = sanitizeEvent(raw)
    if (!event) return
    broadcastEvent(key, event)
    // The simulator plays a ZeroTaboo practice match only (outside the standings and the calibration, D7): the room refuses it otherwise.
    if (event.type === 'comment' && getSession(key).gameId === 'zerotaboo')
      taboo.get(key)?.offer({ source: 'simulator', user: event.user, text: event.text, messageId: '', platform: getSession(key).settings.tabooPlatform === 'twitch' ? 'twitch' : 'tiktok' })
  })

  socket.on('game:select', (gameId: unknown) => {
    if (tournamentLocks('Cambiare gioco')) return
    const state = selectGame(key, gameId)
    if (!state) return
    roomSecrets.delete(key)
    clearSemantic(key)
    io.to(key).emit('session:state', state)
    // Selecting Bivio or Quizzland again starts a fresh round (and Quizzland a fresh
    // leaderboard); Incastro picks up its saved level with a fresh leaderboard.
    bivio.close(key)
    incastro.close(key)
    quizzland.close(key)
    taboo.close(key)
    wordhunt.close(key)
    if (state.gameId === 'zerodubbi') bivio.open(key, state.settings)
    if (state.gameId === 'incastro') incastro.open(key, state.settings)
    if (state.gameId === 'quizzland') quizzland.open(key, state.settings)
    if (state.gameId === 'zerotaboo') {
      const room = taboo.open(key)
      io.to(key).emit('taboo:state', room.state())
      io.to(dashboardRoom(key)).emit('taboo:admin', room.admin())
    }
    if (state.gameId === 'zerowordhunt') {
      const room = wordhunt.open(key)
      io.to(key).emit('wordhunt:state', room.state())
      io.to(dashboardRoom(key)).emit('wordhunt:admin', room.admin())
    }
    // The game, or "preparing" while its words load in the ranking thread.
    if (state.gameId === 'context') io.to(key).emit('context:semantic', semanticState(key))
  })

  socket.on('triggers:set', (raw: unknown) => {
    const triggers = sanitizeTriggers(getSession(key).gameId, raw)
    if (triggers) io.to(key).emit('session:state', setTriggers(key, triggers))
  })

  const setSettingsFrom = (raw: unknown) => {
    // Partial updates are merged onto the current settings, so two quick changes to
    // different fields cannot overwrite each other.
    const current = getSession(key)
    const settings = sanitizeSettings(current.gameId, raw && typeof raw === 'object' ? { ...current.settings, ...raw } : raw)
    if (!settings || clientType !== 'dashboard') return
    const changingProfile = current.gameId === 'context' && contextProfile(settings.associationSource) !== contextProfile(current.settings.associationSource)
    if (changingProfile) {
      if (tournamentLocks('Cambiare associazioni')) return
      const profile = contextProfile(settings.associationSource)
      if (!contextCorpora.get(profile)) {
        // Loaded in the ranking thread (up to 2 s), then the change is applied to the settings of that moment.
        void contextCorpora.load(profile).then((corpus) => {
          if (corpus) setSettingsFrom(raw)
          else socket.emit('context:tournament-error', { message: 'Queste associazioni non sono disponibili. La scelta precedente resta attiva.' })
        })
        return
      }
      roomSecrets.delete(key)
      revealedSecrets.delete(key)
      clearSemantic(key)
    }
    setSettings(key, settings)
    tournaments.settingsChanged(key)
    io.to(key).emit('session:state', changingProfile ? refreshGame(key) : getSession(key))
    if (changingProfile) { io.to(key).emit('context:semantic', semanticState(key)); return }
    bivio.get(key)?.applySettings(settings)
    incastro.get(key)?.applySettings(settings)
    quizzland.get(key)?.applySettings(settings)
    wordhunt.get(key)?.settingsChanged()
    semanticGames.get(key)?.settingsChanged(settings)
  }
  socket.on('settings:set', setSettingsFrom)

  socket.on('bivio:control', (raw: unknown) => {
    const command = sanitizeBivioCommand(raw)
    if (command) bivio.get(key)?.control(command)
  })

  socket.on('incastro:control', (raw: unknown) => {
    const command = sanitizeIncastroCommand(raw)
    if (command) incastro.get(key)?.control(command)
  })

  socket.on('quizzland:control', (raw: unknown) => {
    const command = sanitizeQuizzlandCommand(raw)
    if (command) quizzland.get(key)?.control(command)
  })

  // ZeroTaboo: every command is checked here, carries the version the director saw, and is answered with a typed reply.
  socket.on('taboo:control', (raw: unknown, ack?: unknown) => {
    const command = sanitizeTabooCommand(raw)
    const reply = !command
      ? ({ ok: false, error: 'bad-input', message: 'Comando non valido.' } as const)
      : getSession(key).gameId !== 'zerotaboo'
        ? ({ ok: false, error: 'wrong-phase', message: 'ZeroTaboo non è il gioco selezionato.' } as const)
        : taboo.open(key).control(command)
    if (typeof ack === 'function') ack(reply)
  })

  // ZeroWordHunt: every command is checked here, carries the version the director saw, and is answered with a typed reply.
  socket.on('wordhunt:control', (raw: unknown, ack?: unknown) => {
    const command = clientType === 'dashboard' ? sanitizeWordHuntCommand(raw) : null
    const reply = !command
      ? ({ ok: false, error: 'bad-input', message: 'Comando non valido.' } as const)
      : getSession(key).gameId !== 'zerowordhunt'
        ? ({ ok: false, error: 'wrong-phase', message: 'ZeroWordHunt non è il gioco selezionato.' } as const)
        : wordhunt.open(key).control(command)
    if (typeof ack === 'function') ack(reply)
  })

  socket.on('incastro:goto', (raw: unknown) => {
    const level = sanitizeLevel(raw)
    if (level) incastro.get(key)?.goto(level)
  })

  socket.on('message:send', (raw: unknown) => {
    const text = sanitizeMessage(raw)
    if (text) io.to(key).emit('overlay:message', text)
  })

  socket.on('scene:set', (raw: unknown) => {
    const scene = sanitizeScene(raw)
    if (scene) io.to(key).emit('session:state', setScene(key, scene))
  })

  socket.on('dj:play', (raw: unknown) => {
    const play = sanitizeDj(raw)
    if (play) io.to(key).emit('dj:play', { ...play, volume: padBoard(key).volume })
  })

  socket.on('pad:play', (id: unknown) => {
    const pad = typeof id === 'string' ? getPad(key, id) : undefined
    if (!pad) return
    if (pad.kind === 'gif' && pad.file) io.to(key).emit('gif:show', { url: padFilePath(pad.file), label: pad.label })
    if (pad.kind === 'sound') {
      const volume = padBoard(key).volume
      io.to(key).emit('dj:play', pad.file ? { url: padFilePath(pad.file), volume } : { soundId: pad.soundId, volume })
    }
  })

  socket.on('pad:stop', () => io.to(key).emit('dj:stop'))

  socket.on('pad:volume', async (raw: unknown) => {
    const volume = Number(raw)
    if (!Number.isFinite(volume)) return
    try {
      const board = await persistence.run('padVolume', { key, volume: Math.min(1, Math.max(0, Math.round(volume * 100) / 100)) })
      io.to(key).emit('pads:state', board)
    } catch (error) { app.log.error({ err: error }, 'Volume non salvato') }
  })

  socket.on('pad:remove', async (id: unknown) => {
    if (typeof id !== 'string') return
    try { io.to(key).emit('pads:state', await persistence.run('padRemove', { key, id })) }
    catch (error) { app.log.error({ err: error }, 'Pulsante non eliminato') }
  })
})

// The Windows launcher sets ZEROCADE_OPEN=1 to open the dashboard in the default browser.
const openDashboard = () => {
  if (process.env.ZEROCADE_OPEN !== '1' || process.platform !== 'win32') return
  spawn('cmd', ['/c', 'start', '', LOCAL_URL], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

await Promise.all([persistence.run('barrier', null), reports.run('barrier', null)])
try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
  console.error(`La porta ${PORT} è già in uso: Zerocade è probabilmente già aperto (${LOCAL_URL}).`)
  openDashboard()
  process.exit(1)
}

// Before the dashboard opens, so the link it shows already works.
if (process.env.ZEROCADE_SKIP_HOSTS !== '1') await ensureDomain(OVERLAY_URL)

// The leaderboards as static files on the Linux VM behind nginx (leaderboard-publish.ts); off unless configured.
const leaderboardPublisher = await startLeaderboardPublisher(roomKey)

// Ctrl+C or a kill: stop the live feeds and the servers, then fold the database log into its file.
const shutdown = createShutdown({
  timeoutMs: 20_000,
  steps: [
    { name: 'stop accepting work', run: () => { draining = true } },
    { name: 'ZeroContext tournament', run: () => tournaments.shutdown() },
    { name: 'ZeroContext semantic clock', run: () => { clearInterval(semanticClock); semanticGames.clear() } },
    { name: 'ZeroContext ranking thread', run: () => contextCorpora.close() },
    { name: 'live sources', run: () => { zfb.close(); sources.forEach((room) => room.disconnectAll()) } },
    { name: 'ZeroDubbi rooms', run: () => bivio.closeAll() },
    { name: 'ZeroWords rooms', run: () => incastro.closeAll() },
    { name: 'ZeroQuizz rooms', run: () => quizzland.closeAll() },
    { name: 'ZeroTaboo rooms', run: () => taboo.closeAll() },
    { name: 'ZeroWordHunt rooms', run: () => wordhunt.closeAll() },
    { name: 'level generator', run: () => levels.close() },
    { name: 'sockets', run: () => new Promise<void>((resolve) => void io.close(() => resolve())) },
    { name: 'leaderboard publisher', run: () => leaderboardPublisher?.close() },
    { name: 'persistence worker', run: () => persistence.close() },
    { name: 'server', run: () => app.close() },
    { name: 'report worker', run: () => reports.close() },
    { name: 'database', run: closeDb },
  ],
  exit: (code) => process.exit(code),
  log: (message, err) => (err ? app.log.error({ err }, message) : app.log.info(message)),
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown(signal))
// The isolated smoke runner owns this IPC channel; no shutdown route is exposed.
if (process.env.ZEROCADE_TEST_SHUTDOWN === '1' && process.send) {
  process.on('message', (message) => { if (message === 'test:shutdown') void shutdown('isolated smoke') })
}

if (dashboardDir) {
  console.log(`\nZerocade è avviato: apri ${LOCAL_URL} (chiudi questa finestra per fermarlo)\n`)
  openDashboard()
}
