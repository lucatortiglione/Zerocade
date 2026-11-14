import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { Server } from 'socket.io'
import {
  BACKGROUND_GAMES,
  GAMES,
  ROOM_SECRET,
  ROOM_SECRET_MAX,
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
  type Feed,
  type FeedCreator,
  type FeedEvent,
  type HandshakeAuth,
  type LiveEvent,
  type LiveStats,
  type RoomInfo,
  type ServerToClientEvents,
} from '@zerocade/shared'
import { BivioRooms, bivioCsv, bivioFlagsCsv, bivioStats } from './bivio.js'
import { IncastroRooms, zerowordsCsv } from './incastro.js'
import { QuizzlandRooms, quizzlandCsv, quizzlandStats } from './quizzland.js'
import {
  closeDb,
  dataDir,
  getPad,
  getRanking,
  giftedCreators,
  bridgeConfig,
  latestGifts,
  listEvents,
  recentCreators,
  recordEvent,
  recordGift,
  recordWordAssociationRound,
  roomKey,
  saveBridgeConfig,
  saveSource,
  savedSources,
  setPadVolume,
  topGiftSince,
  touchCreator,
  wordAssociationGuesses,
  wordAssociationRounds,
} from './db.js'
import { getContent, wordAssociation } from './content.js'
import { contextFile, isContextFile } from './context.js'
import { isWordleFile, wordleFile } from './wordle.js'
import { chainKeys, chains } from './chains.js'
import { nasaPhotos } from './nasa.js'
import { publicBaseUrl, startPublicServer } from './public-server.js'
import { createShutdown } from './shutdown.js'
import { leaderboardCss, leaderboardHtml, leaderboardIndexHtml, leaderboardJs } from './leaderboard-page.js'
import { PERIODS, isPeriod, leaderboardResetTimes, leaderboards, recordScore, resetLeaderboard } from './scores.js'
import { toCsv } from './csv.js'
import { sanitizeRoundReport } from './word-association.js'
import { HOSTS_LINE, LOCAL_DOMAIN, domainRegistered, ensureDomain } from './hosts.js'
import { PAD_FILE_MAX, padBoard, padFile, removePad, savePadInput } from './pads.js'
import { controlGame, getSession, selectGame, setScene, setSettings, setTriggers } from './sessions.js'
import { RoomSources, sourceUsername } from './sources.js'
import { ZfbBridge } from './zfb.js'
import {
  sanitizeBivioCommand,
  sanitizeDj,
  sanitizeEvent,
  sanitizeIncastroCommand,
  sanitizeLevel,
  sanitizeMessage,
  sanitizeQuizzlandCommand,
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

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })
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
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|zerocade\.test)(:\d+)?$/
app.addHook('onRequest', async (req, reply) => {
  if (!LOCAL_HOST.test(req.headers.host ?? '')) return reply.code(403).send({ error: 'forbidden' })
})

app.get('/api/health', async () => ({ ok: true }))
app.get('/api/room', async (): Promise<RoomInfo> => ({
  key: roomKey,
  overlayUrl: OVERLAY_URL,
  hostsLine: domainRegistered() ? undefined : HOSTS_LINE,
  publicUrl: publicBaseUrl() ?? undefined,
}))
app.get('/api/games', async () => GAMES)
app.get('/api/content', async () => getContent())
// ZeroContext's words and vectors: static files, cached by the browser until the next build.
app.get('/api/context/:file', async (req, reply) => {
  const name = (req.params as { file: string }).file
  const body = isContextFile(name) ? contextFile(name) : null
  if (!body) return reply.code(404).send({ error: 'not found' })
  const type = name.endsWith('.bin') ? 'application/octet-stream' : name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8'
  return reply.header('content-type', type).header('cache-control', 'no-cache').send(body)
})
// The leaderboards (session, day, week, month, all time) of each game, and the page that shows them: a link to
// share or a browser source for the stream (leaderboard-page.ts).
app.get('/api/leaderboard/:game', async (req, reply) => {
  const game = GAMES.find((g) => g.id === (req.params as { game: string }).game)
  if (!game) return reply.code(404).send({ error: 'not found' })
  const limit = Math.min(50, Math.max(1, Math.floor(Number((req.query as { limit?: string }).limit)) || 10))
  return reply.header('cache-control', 'no-store').send({
    game: { id: game.id, name: game.name, emoji: game.emoji },
    periods: PERIODS,
    boards: leaderboards(roomKey, game.id, limit),
    // When each period was last reset from the dashboard (period -> time).
    resets: leaderboardResetTimes(roomKey, game.id),
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
  return { events: listEvents(key, limit) }
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
    .send(bivioCsv())
})
// The questions marked as wrong (also saved as data/bivio-domande-sbagliate.csv).
app.get('/api/bivio/flagged.csv', async (_req, reply) =>
  reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', 'attachment; filename="bivio-domande-sbagliate.csv"')
    .send(bivioFlagsCsv()),
)
app.get('/api/quizzland/stats', async () => quizzlandStats())
app.get('/api/quizzland/export.csv', async (_req, reply) => {
  const day = new Date().toISOString().slice(0, 10)
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="zeroquizz-risposte-${day}.csv"`)
    .send(quizzlandCsv())
})
// ZeroWords' plays (one row per level) and the answers and hints within them: the data to
// calibrate the level generator on.
for (const which of ['plays', 'answers'] as const) {
  app.get(`/api/zerowords/${which}.csv`, async (_req, reply) =>
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="zerowords-${which === 'plays' ? 'partite' : 'risposte'}.csv"`)
      .send(zerowordsCsv(which)),
  )
}

// Word Association's rounds and, within them, the hidden words found or missed and the chat's
// frequent wrong guesses: what gioco-zeroassociations/analyze_telemetry.py reads.
for (const which of ['rounds', 'guesses'] as const) {
  app.get(`/api/word-association/${which}.csv`, async (_req, reply) => {
    const { columns, rows } = which === 'rounds' ? wordAssociationRounds() : wordAssociationGuesses()
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="word-association-${which === 'rounds' ? 'round' : 'tentativi'}.csv"`)
      .send(toCsv([columns, ...rows]))
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
app.addContentTypeParser(Object.keys(BACKGROUND_TYPES), { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) =>
  done(null, body),
)
app.post('/api/:game/background/:key', async (req, reply) => {
  const params = req.params as { game: string; key: string }
  const { key } = params
  const game = backgroundGame(params.game)
  const ext = BACKGROUND_TYPES[String(req.headers['content-type']).split(';')[0].trim()]
  if (!game || !isValidKey(key) || !ext || !Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'bad request' })
  mkdirSync(backgroundsDir, { recursive: true })
  for (const old of Object.values(BACKGROUND_TYPES)) rmSync(backgroundFile(game, key, old), { force: true })
  writeFileSync(backgroundFile(game, key, ext), req.body)
  // The version busts the overlay's cached copy when the image is replaced.
  return { url: `${backgroundPath(game, key)}?v=${Date.now()}` }
})
app.get('/api/:game/background/:key', async (req, reply) => {
  const params = req.params as { game: string; key: string }
  const { key } = params
  const game = backgroundGame(params.game)
  const found =
    game && isValidKey(key)
      ? Object.entries(BACKGROUND_TYPES).find(([, ext]) => existsSync(backgroundFile(game, key, ext)))
      : undefined
  if (!game || !found) return reply.code(404).send({ error: 'not found' })
  return reply.header('content-type', found[0]).send(readFileSync(backgroundFile(game, key, found[1])))
})

// Pads: a new or edited pad arrives as JSON, with any uploaded file inside as base64.
app.post('/api/pads/:key', { bodyLimit: Math.ceil((PAD_FILE_MAX * 4) / 3) + 64 * 1024 }, async (req, reply) => {
  const { key } = req.params as { key: string }
  if (!isValidKey(key)) return reply.code(400).send({ error: 'Chiave non valida.' })
  const error = savePadInput(key, req.body)
  if (error) return reply.code(400).send({ error })
  const board = padBoard(key)
  io.to(key).emit('pads:state', board)
  return board
})
app.get('/api/pads/file/:name', async (req, reply) => {
  const file = padFile((req.params as { name: string }).name)
  if (!file) return reply.code(404).send({ error: 'not found' })
  return reply.header('content-type', file.type).header('cache-control', 'public, max-age=31536000, immutable').send(file.body)
})

// Creators live on this Zerocade (every overlay key) and the gifts they received.
// ?creator= narrows the gifts: 'tiktok:<username>', or 'sim' for the simulator.
app.get('/api/feed', async (req): Promise<Feed> => {
  const { creator: q } = (req.query ?? {}) as { creator?: string }
  const creator = q === 'sim' ? '' : q && q !== 'all' ? q.slice(0, 80) : undefined
  const live = liveCreators()
  const isLive = new Set(live.map((c) => `${c.kind}:${c.username}`))
  const midnight = new Date().setHours(0, 0, 0, 0)
  return {
    live,
    recent: recentCreators(20).filter((c) => !isLive.has(`${c.kind}:${c.username}`)),
    creators: giftedCreators(),
    top: topGiftSince(creator, midnight),
    gifts: latestGifts(creator, 40),
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
  allowRequest: (req, callback) => callback(null, LOCAL_HOST.test(req.headers.host ?? '')),
})

const bivio = new BivioRooms((key, state) => io.to(key).emit('bivio:state', state))

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
)

// Quizzland's right answer, like Incastro's solution, goes to the dashboards only.
const quizzland = new QuizzlandRooms(
  (key, state) => io.to(key).emit('quizzland:state', state),
  (key, solution) => io.to(dashboardRoom(key)).emit('quizzland:solution', solution),
)

// The latest live events of each key, for the dashboard's chat box when it opens.
const FEED_KEPT = 100
const feeds = new Map<string, FeedEvent[]>()
let feedSeq = 0

// The live's counters of each key since this Zerocade started, for the dashboard's right column.
// The viewers are read from the connected lives each time they are sent.
type Counters = Omit<LiveStats, 'viewers'>
const counters = new Map<string, Counters>()
const NO_COUNTS: Counters = { comments: 0, likes: 0, gifts: 0, coins: 0, follows: 0 }
const STATS_EVERY_MS = 500
const statsTimers = new Map<string, NodeJS.Timeout>()

function liveStats(key: string): LiveStats {
  const watching = (sources.get(key)?.live() ?? []).flatMap((s) => (s.viewers === undefined ? [] : [s.viewers]))
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
function broadcastEvent(key: string, event: LiveEvent, origin: EventOrigin = 'sim', creator = '') {
  recordEvent(key, event)
  const session = getSession(key)
  if (event.type === 'gift') recordGift(key, creator, session.gameId, event)
  // A comment of someone the game's "Chi può giocare" leaves out stays in the dashboard's chat, but the game never sees it.
  const plays = event.type !== 'comment' || allowedToPlay(session.settings, event.user)
  if (plays) io.to(key).emit('live:event', event)
  const item: FeedEvent = { seq: ++feedSeq, at: Date.now(), origin, event }
  feeds.set(key, [...(feeds.get(key) ?? []).slice(1 - FEED_KEPT), item])
  io.to(dashboardRoom(key)).emit('feed:events', [item])
  if (event.type === 'gift') io.to(key).emit('ranking:update', getRanking(key))
  countEvent(key, event, origin)
  const room = bivio.get(key) ?? incastro.get(key) ?? quizzland.get(key)
  if (room && plays && !session.ended) for (const t of triggersFor(session.triggers, event)) room.action(t.action, event)
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
        if (status.state === 'connected') touchCreator(status.kind, status.username, getSession(key).gameId)
      },
    )
    sources.set(key, room)
  }
  return room
}

// ZeroFollowerBot's event bridge, for this Zerocade's room: its events go where the direct feeds' go.
const zfb = new ZfbBridge(
  (event, kind, account, id) => {
    // A ZeroWords guess that only repeats words the level already has: ZeroFollowerBot's voice need not read it.
    // Asked before the game plays the comment, so the one that finds a word is still read.
    const repeat =
      id !== '' &&
      event.type === 'comment' &&
      triggersFor(getSession(roomKey).triggers, event).some((t) => t.action === 'guess') &&
      incastro.get(roomKey)?.alreadyGuessed(event.text) === true
    // ZeroFollowerBot's voice does not read the comments the game ignores ("Chi può giocare"), nor, with "Voce solo
    // ai follower", the ones of viewers the bridge says do not follow (a viewer it says nothing about is read), and
    // never ZeroWordle's guesses.
    const session = getSession(roomKey)
    const silent =
      id !== '' &&
      event.type === 'comment' &&
      (session.gameId === 'zerowordle' ||
        !allowedToPlay(session.settings, event.user) ||
        (session.settings.voiceFollowersOnly === true && event.user.follower === false && event.user.fan !== true))
    broadcastEvent(roomKey, event, kind, account ? `${kind}:${account}` : '')
    if (repeat || silent) zfb.skip(id)
  },
  (status) => {
    io.to(dashboardRoom(roomKey)).emit('bridge:status', status)
    for (const a of zfb.accounts()) touchCreator(a.kind, a.username, getSession(roomKey).gameId)
  },
)
zfb.configure(bridgeConfig())

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
    if (!seen.has(id)) seen.set(id, { kind: a.kind, username: a.username, gameId: getSession(roomKey).gameId, at: a.since })
  }
  return [...seen.values()].sort((a, b) => (b.viewers ?? -1) - (a.viewers ?? -1) || a.at - b.at)
}

// Keeps each live creator's game, viewers and last time seen for the Recent list.
setInterval(() => {
  for (const c of liveCreators()) touchCreator(c.kind, c.username, c.gameId, c.viewers)
}, 30_000).unref()

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

// Each overlay key is a room: the dashboard and every overlay opened with that key share it.
io.on('connection', (socket) => {
  const { clientType, key } = socket.handshake.auth as HandshakeAuth
  void socket.join(key)
  const session = getSession(key)
  socket.emit('session:state', session)
  const secret = roomSecrets.get(key)
  if (SECRET_GAMES.includes(session.gameId) && secret) socket.emit('secret:word', { word: secret })
  if (session.gameId === 'zerodubbi') socket.emit('bivio:state', bivio.open(key, session.settings))
  if (session.gameId === 'incastro') socket.emit('incastro:state', incastro.open(key, session.settings))
  if (session.gameId === 'quizzland') socket.emit('quizzland:state', quizzland.open(key, session.settings))

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
    if (command === 'restart' || command === 'start') roomSecrets.delete(key)
    io.to(key).emit('session:state', controlGame(key, command as GameControl))
  })

  // Points a viewer has just earned, from the overlay of the game in play (never the dashboard's preview).
  socket.on('score:add', (raw: unknown) => {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const u = r?.user && typeof r.user === 'object' ? (r.user as Record<string, unknown>) : null
    const session = getSession(key)
    if (!r || !u || r.game !== session.gameId || session.paused || session.ended) return
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
    const { word, prev } = raw as { word?: unknown; prev?: unknown }
    // One word, or a chain of them joined by "-" (ZeroReazioniACatena's led by its mode and round).
    if (typeof word !== 'string' || word.length > ROOM_SECRET_MAX || !ROOM_SECRET.test(word)) return
    const current = roomSecrets.get(key)
    if (current === undefined || current === (typeof prev === 'string' ? prev : null)) {
      roomSecrets.set(key, word)
      io.to(key).emit('secret:word', { word })
    } else socket.emit('secret:word', { word: current })
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

  void socket.join(dashboardRoom(key))
  const words = incastro.get(key)
  if (words) socket.emit('incastro:solution', words.solution())
  const quiz = quizzland.get(key)?.solution()
  if (quiz) socket.emit('quizzland:solution', quiz)
  socket.emit('ranking:update', getRanking(key))
  socket.emit('pads:state', padBoard(key))
  for (const status of roomSources(key).statuses()) socket.emit('source:status', status)
  socket.emit('source:saved', savedSources(key))
  socket.emit('feed:events', feeds.get(key) ?? [])
  socket.emit('bridge:status', zfb.status())
  socket.emit('stats:update', liveStats(key))

  socket.on('bridge:set', (raw: unknown) => {
    const config = sanitizeBridgeConfig(raw)
    if (!config) return
    saveBridgeConfig(config)
    zfb.configure(config)
  })

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
    if (event) broadcastEvent(key, event)
  })

  socket.on('game:select', (gameId: unknown) => {
    const state = selectGame(key, gameId)
    if (!state) return
    roomSecrets.delete(key)
    io.to(key).emit('session:state', state)
    // Selecting Bivio or Quizzland again starts a fresh round (and Quizzland a fresh
    // leaderboard); Incastro picks up its saved level with a fresh leaderboard.
    bivio.close(key)
    incastro.close(key)
    quizzland.close(key)
    if (state.gameId === 'zerodubbi') bivio.open(key, state.settings)
    if (state.gameId === 'incastro') incastro.open(key, state.settings)
    if (state.gameId === 'quizzland') quizzland.open(key, state.settings)
  })

  socket.on('triggers:set', (raw: unknown) => {
    const triggers = sanitizeTriggers(getSession(key).gameId, raw)
    if (triggers) io.to(key).emit('session:state', setTriggers(key, triggers))
  })

  socket.on('settings:set', (raw: unknown) => {
    // Partial updates are merged onto the current settings, so two quick changes to
    // different fields cannot overwrite each other.
    const current = getSession(key)
    const settings = sanitizeSettings(current.gameId, raw && typeof raw === 'object' ? { ...current.settings, ...raw } : raw)
    if (!settings) return
    io.to(key).emit('session:state', setSettings(key, settings))
    bivio.get(key)?.applySettings(settings)
    incastro.get(key)?.applySettings(settings)
    quizzland.get(key)?.applySettings(settings)
  })

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

  socket.on('pad:volume', (raw: unknown) => {
    const volume = Number(raw)
    if (!Number.isFinite(volume)) return
    setPadVolume(key, Math.min(1, Math.max(0, Math.round(volume * 100) / 100)))
    io.to(key).emit('pads:state', padBoard(key))
  })

  socket.on('pad:remove', (id: unknown) => {
    if (typeof id !== 'string') return
    removePad(key, id)
    io.to(key).emit('pads:state', padBoard(key))
  })
})

// The Windows launcher sets ZEROCADE_OPEN=1 to open the dashboard in the default browser.
const openDashboard = () => {
  if (process.env.ZEROCADE_OPEN !== '1' || process.platform !== 'win32') return
  spawn('cmd', ['/c', 'start', '', LOCAL_URL], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
  console.error(`La porta ${PORT} è già in uso: Zerocade è probabilmente già aperto (${LOCAL_URL}).`)
  openDashboard()
  process.exit(1)
}

// Before the dashboard opens, so the link it shows already works.
await ensureDomain(OVERLAY_URL)

// The leaderboards for anyone who can reach this PC, on a port of their own (public-server.ts).
const publicApp = await startPublicServer(roomKey)

// Ctrl+C or a kill: stop the live feeds and the servers, then fold the database log into its file.
const shutdown = createShutdown({
  steps: [
    { name: 'live sources', run: () => sources.forEach((room) => room.disconnectAll()) },
    { name: 'sockets', run: () => new Promise<void>((resolve) => void io.close(() => resolve())) },
    { name: 'public server', run: () => publicApp?.close() },
    { name: 'server', run: () => app.close() },
    { name: 'database', run: closeDb },
  ],
  exit: (code) => process.exit(code),
  log: (message, err) => (err ? app.log.error({ err }, message) : app.log.info(message)),
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown(signal))

if (dashboardDir) {
  console.log(`\nZerocade è avviato: apri ${LOCAL_URL} (chiudi questa finestra per fermarlo)\n`)
  openDashboard()
}
