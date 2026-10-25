import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import { Server } from 'socket.io'
import {
  GAMES,
  isValidKey,
  type ClientToServerEvents,
  type HandshakeAuth,
  type LiveEvent,
  type ServerToClientEvents,
} from '@zerocade/shared'
import { getRanking, listEvents, recordEvent } from './db.js'
import { getSession, selectGame, setScene, setSettings, setTriggers } from './sessions.js'
import { RoomSources } from './sources.js'
import { sanitizeDj, sanitizeEvent, sanitizeScene, sanitizeSettings, sanitizeSourceConfig, sanitizeTriggers } from './validate.js'

const PORT = Number(process.env.PORT ?? 3001)

const app = Fastify({ logger: true })
await app.register(helmet)

app.get('/api/health', async () => ({ ok: true }))
app.get('/api/games', async () => GAMES)
app.get('/api/events', async (req) => {
  const q = (req.query ?? {}) as { key?: string; limit?: number }
  const key = q.key ?? ''
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500)
  return { events: listEvents(key, limit) }
})

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, { path: '/socket.io' })

// Persist + relay every live event (simulated or real), and keep the gifters ranking.
function broadcastEvent(key: string, event: LiveEvent) {
  recordEvent(key, event)
  io.to(key).emit('live:event', event)
  if (event.type === 'gift') io.to(key).emit('ranking:update', getRanking(key))
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
  socket.emit('session:state', getSession(key))

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
    if (state) io.to(key).emit('session:state', state)
  })

  socket.on('triggers:set', (raw: unknown) => {
    const triggers = sanitizeTriggers(getSession(key).gameId, raw)
    if (triggers) io.to(key).emit('session:state', setTriggers(key, triggers))
  })

  socket.on('settings:set', (raw: unknown) => {
    const settings = sanitizeSettings(getSession(key).gameId, raw)
    if (settings) io.to(key).emit('session:state', setSettings(key, settings))
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

await app.listen({ port: PORT, host: '127.0.0.1' })
