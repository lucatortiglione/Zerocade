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

// Adapters that are not the PC's own network: virtual machines (VMware, VirtualBox, Hyper-V, WSL, Docker), VPNs and
// Bluetooth. Their address is not one a phone on the Wi-Fi can reach (on 13/11/2026 the first adapter was VMware's).
const VIRTUAL = /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|bluetooth|nord|vpn|wireguard|tailscale|zerotier|\btap\b|\btun\b/i
// Home and office networks, best first: almost always 192.168.x.x.
const privateRank = (ip: string): number =>
  ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3

// The address other devices on the network can use for this PC, or null: a real adapter before a virtual one, a
// private network before any other address.
export function lanAddress(): string | null {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? [])
      .filter((nic) => nic.family === 'IPv4' && !nic.internal && !nic.address.startsWith('169.254.'))
      .map((nic) => ({ virtual: VIRTUAL.test(name), rank: privateRank(nic.address), address: nic.address })),
  )
  candidates.sort((a, b) => Number(a.virtual) - Number(b.virtual) || a.rank - b.rank)
  return candidates[0]?.address ?? null
}

// The address shown in the dashboard: ZEROCADE_PUBLIC_HOST when it names one, otherwise the network's.
const advertisedHost = (): string | null => (HOST !== '0.0.0.0' ? HOST : lanAddress())

export const publicBaseUrl = (): string | null => {
  const host = advertisedHost()
  return PUBLIC_PORT > 0 && host ? `http://${host}:${PUBLIC_PORT}/classifica/` : null
}

// This PC: OBS's browser sources and the dashboard, never limited.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export async function startPublicServer(roomKey: string): Promise<FastifyInstance | null> {
  if (!(PUBLIC_PORT > 0)) return null
  const app = Fastify({ logger: false, disableRequestLogging: true })
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'https:'], 'upgrade-insecure-requests': null } },
    // The page is meant to be embedded as a browser source or an iframe on other sites.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false,
  })

  // A visitor over the limit waits for the next minute. The limit counts by address, so this PC is left out of it:
  // one program on it that asks without pause (on 13/11/2026 Steam held a connection to 127.0.0.1:3002) would lock
  // out OBS's sources too. A tunnel running on this PC (cloudflared, ngrok) also arrives from 127.0.0.1.
  const hits = new Map<string, { n: number; until: number }>()
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply.code(405).send({ error: 'read only' })
    if (LOOPBACK.has(req.ip)) return
    const now = Date.now()
    const mine = hits.get(req.ip)
    if (!mine || mine.until <= now) hits.set(req.ip, { n: 1, until: now + WINDOW_MS })
    else if (++mine.n > MAX_PER_WINDOW) return reply.code(429).header('retry-after', '60').send({ error: 'too many requests' })
    if (hits.size > 5000) for (const [ip, h] of hits) if (h.until <= now) hits.delete(ip)
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
  // The address the dashboard and the log show ends with a slash: it is the same page (its links are absolute).
  app.get('/classifica/', async (_req, reply) => reply.type('text/html; charset=utf-8').send(leaderboardIndexHtml()))
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
  console.log(`[public] classifiche su http://${advertisedHost() ?? 'localhost'}:${PUBLIC_PORT}/classifica/`)
  return app
}
