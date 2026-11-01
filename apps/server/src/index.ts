import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { Server } from 'socket.io'
import {
  GAMES,
  bivioBackgroundPath,
  isValidKey,
  triggersFor,
  type ClientToServerEvents,
  type HandshakeAuth,
  type LiveEvent,
  type ServerToClientEvents,
} from '@zerocade/shared'
import { BivioRooms, bivioCsv, bivioStats } from './bivio.js'
import { dataDir, getRanking, listEvents, recordEvent } from './db.js'
import { getContent } from './content.js'
import { getSession, selectGame, setScene, setSettings, setTriggers } from './sessions.js'
import { RoomSources } from './sources.js'
import {
  sanitizeBivioCommand,
  sanitizeDj,
  sanitizeEvent,
  sanitizeMessage,
  sanitizeScene,
  sanitizeSettings,
  sanitizeSourceConfig,
  sanitizeTriggers,
} from './validate.js'

const PORT = Number(process.env.PORT ?? 3001)
const LOCAL_URL = `http://localhost:${PORT}/`

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

app.get('/api/health', async () => ({ ok: true }))
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

// Bivio background image: one per overlay key, stored in the data folder next to the
// databases. No SVG, which could carry scripts.
const BACKGROUND_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const backgroundsDir = join(dataDir, 'backgrounds')
const backgroundFile = (key: string, ext: string) => join(backgroundsDir, `${key}.${ext}`)
app.addContentTypeParser(Object.keys(BACKGROUND_TYPES), { parseAs: 'buffer', bodyLimit: 8 * 1024 * 1024 }, (_req, body, done) =>
  done(null, body),
)
app.post('/api/bivio/background/:key', async (req, reply) => {
  const { key } = req.params as { key: string }
  const ext = BACKGROUND_TYPES[String(req.headers['content-type']).split(';')[0].trim()]
  if (!isValidKey(key) || !ext || !Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'bad request' })
  mkdirSync(backgroundsDir, { recursive: true })
  for (const old of Object.values(BACKGROUND_TYPES)) rmSync(backgroundFile(key, old), { force: true })
  writeFileSync(backgroundFile(key, ext), req.body)
  // The version busts the overlay's cached copy when the image is replaced.
  return { url: `${bivioBackgroundPath(key)}?v=${Date.now()}` }
})
app.get('/api/bivio/background/:key', async (req, reply) => {
  const { key } = req.params as { key: string }
  const found = isValidKey(key)
    ? Object.entries(BACKGROUND_TYPES).find(([, ext]) => existsSync(backgroundFile(key, ext)))
    : undefined
  if (!found) return reply.code(404).send({ error: 'not found' })
  return reply.header('content-type', found[0]).send(readFileSync(backgroundFile(key, found[1])))
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
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, { path: '/socket.io', serveClient: false })

const bivio = new BivioRooms((key, state) => io.to(key).emit('bivio:state', state))

// Persist + relay every live event (simulated or real), and keep the gifters ranking.
// Bivio runs on the server, so its triggers are applied here rather than in the overlay.
function broadcastEvent(key: string, event: LiveEvent) {
  recordEvent(key, event)
  io.to(key).emit('live:event', event)
  if (event.type === 'gift') io.to(key).emit('ranking:update', getRanking(key))
  const room = bivio.get(key)
  if (room) for (const t of triggersFor(getSession(key).triggers, event)) room.action(t.action, event)
}

// One RoomSources per overlay key: real TikTok/Twitch feeds are relayed as live events.
const sources = new Map<string, RoomSources>()
const roomSources = (key: string) => {
  let room = sources.get(key)
  if (!room) {
    room = new RoomSources(
      (event) => broadcastEvent(key, event),
      (status) => io.to(key).emit('source:status', status),
    )
    sources.set(key, room)
  }
  return room
}

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

  socket.on('disconnect', () => {
    if (!io.sockets.adapter.rooms.get(key)?.size) bivio.get(key)?.suspend()
  })

  // Overlays only listen; everything that changes state comes from the dashboard.
  if (clientType !== 'dashboard') return

  socket.emit('ranking:update', getRanking(key))
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
    // Selecting Bivio again starts a fresh round.
    bivio.close(key)
    if (state.gameId === 'bivio') bivio.open(key, state.settings)
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
  })

  socket.on('bivio:control', (raw: unknown) => {
    const command = sanitizeBivioCommand(raw)
    if (command) bivio.get(key)?.control(command)
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
    if (play) io.to(key).emit('dj:play', play)
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

if (dashboardDir) {
  console.log(`\nZerocade è avviato: apri ${LOCAL_URL} (chiudi questa finestra per fermarlo)\n`)
  openDashboard()
}
