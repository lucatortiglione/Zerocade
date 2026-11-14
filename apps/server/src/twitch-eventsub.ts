import { readBoundedBytes, type LiveEvent } from '@zerocade/shared'

// EventSub WebSocket requires a USER token. Tokens stay in the environment and
// headers; ordinary Twitch chat remains independent of this optional feed.
const ENDPOINT = 'wss://eventsub.wss.twitch.tv/ws'
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const text = (value: unknown, limit = 64) => typeof value === 'string' ? value.slice(0, limit) : ''
interface EvMsg { metadata: Record<string, unknown>; payload: Record<string, unknown> }
class EventSubError extends Error {
  constructor(message: string, readonly retryable = false) { super(message) }
}
export interface EventSubOptions {
  fetchFn?: typeof fetch
  socketFactory?: (url: string) => WebSocket
  requestTimeoutMs?: number
  welcomeTimeoutMs?: number
  userToken?: string
  onStatus?: (message: string) => void
}
export function parseEventSubMessage(raw: string): EvMsg | null {
  if (raw.length > 256 * 1024) return null
  try {
    const message = record(JSON.parse(raw))
    const metadata = record(message.metadata)
    if (typeof metadata.message_type !== 'string' || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) return null
    return { metadata, payload: record(message.payload) }
  } catch { return null }
}

export class TwitchEventSub {
  private ws: WebSocket | null = null
  private replacement: WebSocket | null = null
  private controller = new AbortController()
  private epoch = 0
  private closed = true
  private token = ''
  private userId = ''
  private broadcasterId = ''
  private sessionId = ''
  private scopes: string[] = []
  private retryCount = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private keepaliveMs = 15_000
  private seen = new Set<string>()
  private readonly fetchFn: typeof fetch
  private readonly socketFactory: (url: string) => WebSocket
  private readonly requestTimeoutMs: number
  private readonly welcomeTimeoutMs: number

  constructor(private channel: string, private emit: (event: LiveEvent) => void, private options: EventSubOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url))
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.welcomeTimeoutMs = options.welcomeTimeoutMs ?? 15_000
  }
  async start(): Promise<string[]> {
    this.close()
    this.closed = false
    this.retryCount = 0
    return this.establish()
  }
  close(): void {
    this.closed = true
    this.epoch++
    clearTimeout(this.retry)
    this.retry = undefined
    this.stopConnection()
    this.seen.clear()
    this.token = ''
  }
  private stopConnection(): void {
    this.controller.abort()
    clearTimeout(this.watchdog)
    const sockets = [this.ws, this.replacement]
    this.ws = this.replacement = null
    for (const socket of sockets) {
      try { socket?.close() } catch { /* A connecting socket has no active session. */ }
    }
  }
  private async establish(): Promise<string[]> {
    const epoch = ++this.epoch
    this.controller = new AbortController()
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(30_000)])
    const clientId = process.env.TWITCH_CLIENT_ID ?? ''
    this.token = this.options.userToken ?? process.env.TWITCH_USER_ACCESS_TOKEN ?? ''
    if (!clientId || !this.token) throw new EventSubError('EventSub richiede TWITCH_CLIENT_ID e TWITCH_USER_ACCESS_TOKEN (token utente).')
    try {
      const auth = record(await this.request('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${this.token}` },
      }, 'token validation', signal))
      if (auth.client_id !== clientId || !text(auth.user_id)) throw new EventSubError('EventSub richiede un token utente della stessa applicazione Twitch.')
      this.userId = text(auth.user_id)
      this.scopes = Array.isArray(auth.scopes) ? auth.scopes.filter((scope): scope is string => typeof scope === 'string') : []
      const users = record(await this.request(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(this.channel)}`,
        { headers: { 'Client-Id': clientId, Authorization: `Bearer ${this.token}` } }, 'channel lookup', signal))
      this.broadcasterId = text(record(Array.isArray(users.data) ? users.data[0] : null).id)
      if (!this.broadcasterId) throw new EventSubError(`Twitch channel not found: ${this.channel}`)
      await this.openSocket(ENDPOINT, epoch, signal)
      const refused: string[] = []
      for (const type of ['channel.follow', 'channel.raid'] as const) {
        if (type === 'channel.follow' && !this.scopes.includes('moderator:read:followers')) {
          refused.push('channel.follow richiede lo scope moderator:read:followers del token utente.')
          continue
        }
        try { await this.subscribe(type, clientId, signal) }
        catch (error) { signal.throwIfAborted(); refused.push(error instanceof Error ? error.message : 'Sottoscrizione rifiutata') }
      }
      signal.throwIfAborted()
      if (epoch !== this.epoch || this.closed) throw new EventSubError('Connessione annullata')
      if (refused.length === 2) throw new EventSubError(refused.join('; '))
      this.retryCount = 0
      this.options.onStatus?.(refused.join('; '))
      return refused
    } catch (error) {
      if (epoch === this.epoch) this.stopConnection()
      throw error
    }
  }
  private async request(url: string, init: RequestInit, step: string, signal: AbortSignal): Promise<unknown> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.requestTimeoutMs)])
    try {
      bounded.throwIfAborted()
      const response = await this.fetchFn(url, { ...init, signal: bounded })
      bounded.throwIfAborted()
      if (!response.ok) throw new EventSubError(`Twitch ${step} failed (HTTP ${response.status})`, response.status === 429 || response.status >= 500)
      const bytes = await readBoundedBytes(response, 256 * 1024)
      bounded.throwIfAborted()
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch (error) {
      if (error instanceof EventSubError) throw error
      const timeout = bounded.aborted && !this.controller.signal.aborted
      throw new EventSubError(`Twitch ${step}: ${timeout ? 'no answer in time' : 'network error'}`, !this.controller.signal.aborted)
    }
  }
  private openSocket(url: string, epoch: number, signal: AbortSignal, migrating = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory(url)
      if (migrating) this.replacement = socket
      else this.ws = socket
      let ready = false
      let settled = false
      const timer = setTimeout(() => settle(new EventSubError('Twitch EventSub did not answer in time', true)), this.welcomeTimeoutMs)
      const abort = () => settle(new EventSubError('Connessione annullata'))
      const settle = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (error) { try { socket.close() } catch { /* no established session */ }; reject(error) }
        else resolve()
      }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { abort(); return }
      socket.onmessage = (event) => {
        if (this.closed || epoch !== this.epoch || (socket !== this.ws && socket !== this.replacement)) return
        const message = parseEventSubMessage(typeof event.data === 'string' ? event.data : '')
        if (!message) return
        const type = message.metadata.message_type
        if (type === 'session_welcome') {
          if (ready) return
          const session = record(message.payload.session)
          const id = text(session.id, 256)
          if (!id) { settle(new EventSubError('Twitch EventSub welcome without a session id')); return }
          ready = true
          this.sessionId = id
          const seconds = Number(session.keepalive_timeout_seconds)
          this.keepaliveMs = Number.isFinite(seconds) && seconds >= 1 && seconds <= 600 ? seconds * 1000 + 1000 : 15_000
          if (migrating) {
            const old = this.ws
            this.ws = socket
            this.replacement = null
            old?.close()
          }
          this.armWatchdog()
          settle()
        } else if (ready && (type === 'notification' || type === 'session_keepalive')) {
          if (socket === this.ws) this.armWatchdog()
          if (type === 'notification') {
            const id = text(message.metadata.message_id, 128)
            if (id && this.seen.has(id)) return
            if (id) { this.seen.add(id); if (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value!) }
            this.notification(text(record(message.payload.subscription).type), record(message.payload.event))
          }
        } else if (ready && type === 'session_reconnect' && socket === this.ws && !this.replacement) {
          const target = text(record(message.payload.session).reconnect_url, 2048)
          let safe = false
          try { const parsed = new URL(target); safe = parsed.protocol === 'wss:' && parsed.hostname === 'eventsub.wss.twitch.tv' && !parsed.username && !parsed.password && (!parsed.port || parsed.port === '443') } catch { /* invalid peer URL */ }
          if (!safe) { this.options.onStatus?.('URL di riconnessione EventSub rifiutato.'); return }
          void this.openSocket(target, epoch, this.controller.signal, true).catch(() => {
            this.replacement = null
            if (!this.closed && epoch === this.epoch) this.options.onStatus?.('Riconnessione EventSub non riuscita: attendo il ripristino.')
          })
        } else if (type === 'revocation') this.options.onStatus?.(`EventSub: sottoscrizione ${text(record(message.payload.subscription).type)} revocata.`)
      }
      const lost = () => {
        if (!ready) { settle(new EventSubError('Twitch EventSub websocket closed', true)); return }
        if (this.ws === socket && !this.closed && epoch === this.epoch) this.reconnect()
      }
      socket.onerror = lost
      socket.onclose = lost
    })
  }
  private armWatchdog(): void {
    clearTimeout(this.watchdog)
    this.watchdog = setTimeout(() => this.reconnect(), this.keepaliveMs)
  }
  private reconnect(): void {
    this.stopConnection()
    if (this.closed || this.retry) return
    if (this.retryCount >= 6) { this.options.onStatus?.('EventSub non disponibile: ricollega Twitch per riprovare.'); return }
    const delay = Math.min(30_000, 1000 * 2 ** this.retryCount++) * (0.8 + Math.random() * 0.4)
    this.options.onStatus?.('EventSub scollegato: riprovo automaticamente. La chat resta attiva.')
    this.retry = setTimeout(() => {
      this.retry = undefined
      void this.establish().catch((error: unknown) => {
        if (this.closed) return
        if (error instanceof EventSubError && !error.retryable) this.options.onStatus?.(error.message)
        else this.reconnect()
      })
    }, delay)
  }
  private notification(type: string, event: Record<string, unknown>): void {
    if (type === 'channel.follow') {
      const name = text(event.user_name || event.user_login, 32)
      this.emit({ type: 'follow', user: { id: text(event.user_id) || name || 'anonymous', nickname: name || 'someone' } })
    } else if (type === 'channel.raid') {
      const name = text(event.from_broadcaster_user_name, 32) || 'Raid'
      const viewers = Math.max(0, Math.min(1_000_000, Math.floor(Number(event.viewers)) || 0))
      this.emit({ type: 'comment', user: { id: 'raid', nickname: name }, text: `⚡ RAID from ${name} with ${viewers} viewers!` })
    }
  }
  private async subscribe(type: 'channel.follow' | 'channel.raid', clientId: string, signal: AbortSignal): Promise<void> {
    await this.request('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST', headers: { 'Client-Id': clientId, Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, version: type === 'channel.follow' ? '2' : '1',
        condition: type === 'channel.follow' ? { broadcaster_user_id: this.broadcasterId, moderator_user_id: this.userId } : { to_broadcaster_user_id: this.broadcasterId },
        transport: { method: 'websocket', session_id: this.sessionId } }),
    }, `${type} subscription`, signal)
  }
}
