import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import { Server } from 'socket.io'
import {
  GAMES,
  isValidKey,
  type ClientToServerEvents,
  type HandshakeAuth,
  type ServerToClientEvents,
} from '@zerocade/shared'
import { getSession, selectGame, setTriggers } from './sessions.js'
import { sanitizeEvent, sanitizeTriggers } from './validate.js'

const PORT = Number(process.env.PORT ?? 3001)

const app = Fastify({ logger: true })
await app.register(helmet)

app.get('/api/health', async () => ({ ok: true }))
app.get('/api/games', async () => GAMES)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, { path: '/socket.io' })

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

  socket.on('sim:event', (raw: unknown) => {
    const event = sanitizeEvent(raw)
    if (event) io.to(key).emit('live:event', event)
  })

  socket.on('game:select', (gameId: unknown) => {
    const state = selectGame(key, gameId)
    if (state) io.to(key).emit('session:state', state)
  })

  socket.on('triggers:set', (raw: unknown) => {
    const triggers = sanitizeTriggers(getSession(key).gameId, raw)
    if (triggers) io.to(key).emit('session:state', setTriggers(key, triggers))
  })
})

await app.listen({ port: PORT, host: '127.0.0.1' })
