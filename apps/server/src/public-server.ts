import { networkInterfaces } from 'node:os'
import Fastify, { type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import { GAMES } from '@zerocade/shared'
import { leaderboardCss, leaderboardHtml, leaderboardIndexHtml, leaderboardJs } from './leaderboard-page.js'
import { PERIODS, leaderboards } from './scores.js'

// The public mini server: the leaderboards of every game on a port of its own, open to anyone who can reach this
// PC (viewers on the network, or on the internet if the router forwards the port or a tunnel points here). It
// answers only the leaderboard pages and their read-only API: the dashboard, the overlay, the room's key and the
// controls stay on the main server, which listens on this PC alone. Set ZEROCADE_PUBLIC_PORT to change the port
// (default 3002), or to 0 to turn it off; ZEROCADE_PUBLIC_HOST is the address it listens on (default every one).

export const PUBLIC_PORT = Number(process.env.ZEROCADE_PUBLIC_PORT ?? 3002)
const HOST = process.env.ZEROCADE_PUBLIC_HOST ?? '0.0.0.0'

// A visitor may ask this often: the page asks every 5 seconds, the rest is for several tabs behind one address.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
// The boards are summed from the database: a second's cache is enough for any number of viewers.
const CACHE_MS = 2_000

// The address other devices on the network can use for this PC, or null.
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) if (nic.family === 'IPv4' && !nic.internal && !nic.address.startsWith('169.254.')) return nic.address
  }
  return null
}

export const publicBaseUrl = (): string | null => {
  const host = lanAddress()
  return PUBLIC_PORT > 0 && host ? `http://${host}:${PUBLIC_PORT}/classifica/` : null
}

export async function startPublicServer(roomKey: string): Promise<FastifyInstance | null> {
  if (!(PUBLIC_PORT > 0)) return null
  const app = Fastify({ logger: false, disableRequestLogging: true })
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'https:'], 'upgrade-insecure-requests': null } },
    // The page is meant to be embedded as a browser source or an iframe on other sites.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false,
  })

  // A visitor over the limit waits for the next minute.
  const hits = new Map<string, { n: number; until: number }>()
  app.addHook('onRequest', async (req, reply) => {
    const now = Date.now()
    const mine = hits.get(req.ip)
    if (!mine || mine.until <= now) hits.set(req.ip, { n: 1, until: now + WINDOW_MS })
    else if (++mine.n > MAX_PER_WINDOW) return reply.code(429).header('retry-after', '60').send({ error: 'too many requests' })
    if (hits.size > 5000) for (const [ip, h] of hits) if (h.until <= now) hits.delete(ip)
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply.code(405).send({ error: 'read only' })
  })

  const cache = new Map<string, { at: number; body: unknown }>()
  app.get('/api/leaderboard/:game', async (req, reply) => {
    const game = GAMES.find((g) => g.id === (req.params as { game: string }).game)
    if (!game) return reply.code(404).send({ error: 'not found' })
    const limit = Math.min(50, Math.max(1, Math.floor(Number((req.query as { limit?: string }).limit)) || 10))
    const id = `${game.id}:${limit}`
    const now = Date.now()
    let hit = cache.get(id)
    if (!hit || now - hit.at > CACHE_MS) {
      hit = {
        at: now,
        body: { game: { id: game.id, name: game.name, emoji: game.emoji }, periods: PERIODS, boards: leaderboards(roomKey, game.id, limit) },
      }
      cache.set(id, hit)
    }
    return reply.header('cache-control', 'no-store').header('access-control-allow-origin', '*').send(hit.body)
  })
  app.get('/', async (_req, reply) => reply.redirect('/classifica'))
  app.get('/classifica', async (_req, reply) => reply.type('text/html; charset=utf-8').send(leaderboardIndexHtml()))
  app.get('/classifica/classifica.css', async (_req, reply) => reply.type('text/css; charset=utf-8').send(leaderboardCss))
  app.get('/classifica/classifica.js', async (_req, reply) => reply.type('text/javascript; charset=utf-8').send(leaderboardJs))
  app.get('/classifica/:game', async (req, reply) => {
    const game = GAMES.find((g) => g.id === (req.params as { game: string }).game)
    if (!game) return reply.code(404).send({ error: 'not found' })
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(leaderboardHtml(game))
  })
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not found' }))

  try {
    await app.listen({ port: PUBLIC_PORT, host: HOST })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    console.warn(
      code === 'EADDRINUSE'
        ? `[public] la porta ${PUBLIC_PORT} è già in uso: il server pubblico delle classifiche non parte (ZEROCADE_PUBLIC_PORT per cambiarla).`
        : `[public] il server pubblico delle classifiche non parte: ${err instanceof Error ? err.message : String(err)}`,
    )
    await app.close()
    return null
  }
  console.log(`[public] classifiche su http://${HOST === '0.0.0.0' ? (lanAddress() ?? 'localhost') : HOST}:${PUBLIC_PORT}/classifica/`)
  return app
}
