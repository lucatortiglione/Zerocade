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
  backgroundPath,
  isValidKey,
  padFilePath,
  triggersFor,
  type BackgroundGame,
  type ClientToServerEvents,
  type Feed,
  type FeedCreator,
  type HandshakeAuth,
  type LiveEvent,
  type RoomInfo,
  type ServerToClientEvents,
} from '@zerocade/shared'
import { BivioRooms, bivioCsv, bivioStats } from './bivio.js'
import { IncastroRooms } from './incastro.js'
import {
  dataDir,
  getPad,
  getRanking,
  giftedCreators,
  latestGifts,
  listEvents,
  recentCreators,
  recordEvent,
  recordGift,
  roomKey,
  setPadVolume,
  topGiftSince,
  touchCreator,
} from './db.js'
import { getContent } from './content.js'
import { HOSTS_LINE, LOCAL_DOMAIN, domainRegistered, ensureDomain } from './hosts.js'
import { PAD_FILE_MAX, padBoard, padFile, removePad, savePadInput } from './pads.js'
import { getSession, selectGame, setScene, setSettings, setTriggers } from './sessions.js'
import { RoomSources } from './sources.js'
import {
  sanitizeBivioCommand,
  sanitizeDj,
  sanitizeEvent,
  sanitizeIncastroCommand,
  sanitizeLevel,
  sanitizeMessage,
  sanitizeScene,
  sanitizeSettings,
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
}))
app.get('/api/games', async () => GAMES)
app.get('/api/content', async () => getContent())
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

// Background images (Bivio, Incastro): one per game and overlay key, stored in the data
// folder next to the databases. No SVG, which could carry scripts.
const BACKGROUND_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const backgroundsDir = join(dataDir, 'backgrounds')
// Bivio's files keep the name they had before other games could have one.
const backgroundFile = (game: BackgroundGame, key: string, ext: string) =>
  join(backgroundsDir, game === 'bivio' ? `${key}.${ext}` : `${game}-${key}.${ext}`)
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
)

// Persist + relay every live event (simulated or real), and keep the gifters ranking.
// Bivio and Incastro run on the server, so their triggers are applied here rather than in
// the overlay. `creator` is the live feed the event came from ('tiktok:<username>'), ''
// when simulated.
function broadcastEvent(key: string, event: LiveEvent, creator = '') {
  recordEvent(key, event)
  if (event.type === 'gift') recordGift(key, creator, getSession(key).gameId, event)
  io.to(key).emit('live:event', event)
  if (event.type === 'gift') io.to(key).emit('ranking:update', getRanking(key))
  const room = bivio.get(key) ?? incastro.get(key)
  if (room) for (const t of triggersFor(getSession(key).triggers, event)) room.action(t.action, event)
}

// One RoomSources per overlay key: real TikTok/Twitch feeds are relayed as live events.
const sources = new Map<string, RoomSources>()
const roomSources = (key: string) => {
  let room = sources.get(key)
  if (!room) {
    room = new RoomSources(
      (event) => {
        const tiktok = sources.get(key)?.live().find((s) => s.kind === 'tiktok')
        broadcastEvent(key, event, tiktok ? `tiktok:${tiktok.username}` : '')
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

const liveCreators = (): FeedCreator[] => {
  const seen = new Map<string, FeedCreator>()
  for (const [key, room] of sources) {
    for (const s of room.live()) {
      const creator: FeedCreator = { kind: s.kind, username: s.username, gameId: getSession(key).gameId, at: s.since }
      if (s.viewers !== undefined) creator.viewers = s.viewers
      seen.set(`${s.kind}:${s.username}`, creator)
    }
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

// Each overlay key is a room: the dashboard and every overlay opened with that key share it.
io.on('connection', (socket) => {
  const { clientType, key } = socket.handshake.auth as HandshakeAuth
  void socket.join(key)
  const session = getSession(key)
  socket.emit('session:state', session)
  if (session.gameId === 'bivio') socket.emit('bivio:state', bivio.open(key, session.settings))
  if (session.gameId === 'incastro') socket.emit('incastro:state', incastro.open(key, session.settings))

  socket.on('disconnect', () => {
    if (io.sockets.adapter.rooms.get(key)?.size) return
    bivio.get(key)?.suspend()
    incastro.get(key)?.suspend()
  })

  // A click on ZeroWords' wheel shuffles it: in the dashboard's preview, the overlay page in a
  // browser, or OBS's Interact window.
  socket.on('incastro:shuffle', () => incastro.get(key)?.control('shuffle'))

  // Otherwise overlays only listen; everything that changes state comes from the dashboard.
  if (clientType !== 'dashboard') return

  void socket.join(dashboardRoom(key))
  const words = incastro.get(key)
  if (words) socket.emit('incastro:solution', words.solution())
  socket.emit('ranking:update', getRanking(key))
  socket.emit('pads:state', padBoard(key))
  for (const status of roomSources(key).statuses()) socket.emit('source:status', status)

  socket.on('source:connect', (raw: unknown) => {
    const config = sanitizeSourceConfig(raw)
    if (config) roomSources(key).connect(config)
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
    io.to(key).emit('session:state', state)
    // Selecting Bivio again starts a fresh round; Incastro picks up its saved level with
    // a fresh leaderboard.
    bivio.close(key)
    incastro.close(key)
    if (state.gameId === 'bivio') bivio.open(key, state.settings)
    if (state.gameId === 'incastro') incastro.open(key, state.settings)
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
  })

  socket.on('bivio:control', (raw: unknown) => {
    const command = sanitizeBivioCommand(raw)
    if (command) bivio.get(key)?.control(command)
  })

  socket.on('incastro:control', (raw: unknown) => {
    const command = sanitizeIncastroCommand(raw)
    if (command) incastro.get(key)?.control(command)
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

if (dashboardDir) {
  console.log(`\nZerocade è avviato: apri ${LOCAL_URL} (chiudi questa finestra per fermarlo)\n`)
  openDashboard()
}
