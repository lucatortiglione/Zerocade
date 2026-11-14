import type { LiveEvent } from '@zerocade/shared'

// Twitch EventSub over WebSocket (no public webhook needed): connects with an app
// access token and subscribes to channel.follow + channel.raid for the channel.
// Requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET env vars.

interface EvMsg {
  metadata: { message_type: string }
  payload: Record<string, unknown>
}

export interface EventSubOptions {
  /** Replaces the global fetch (tests). */
  fetchFn?: typeof fetch
  /** Every HTTP request to Twitch is abandoned after this long. */
  requestTimeoutMs?: number
  /** The WebSocket must send its welcome within this time. */
  welcomeTimeoutMs?: number
}

const SUBSCRIPTIONS = ['channel.follow', 'channel.raid'] as const

/** A message from the socket, or null when it is not JSON or lacks the fields the handler reads. */
export function parseEventSubMessage(text: string): EvMsg | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { metadata, payload } = value as { metadata?: unknown; payload?: unknown }
  if (typeof metadata !== 'object' || metadata === null) return null
  if (typeof (metadata as { message_type?: unknown }).message_type !== 'string') return null
  if (typeof payload !== 'object' || payload === null) return null
  return value as EvMsg
}

export class TwitchEventSub {
  private ws: WebSocket | null = null
  private token = ''
  private broadcasterId = ''
  private sessionId = ''
  private readonly fetchFn: typeof fetch
  private readonly requestTimeoutMs: number
  private readonly welcomeTimeoutMs: number

  constructor(
    private channel: string,
    private emit: (event: LiveEvent) => void,
    options: EventSubOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? fetch
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.welcomeTimeoutMs = options.welcomeTimeoutMs ?? 15_000
  }

  /** Connects and subscribes. Resolves with the subscriptions Twitch refused (empty when all went through);
   *  rejects when nothing could be set up, after closing the socket. */
  async start(): Promise<string[]> {
    const clientId = process.env.TWITCH_CLIENT_ID ?? ''
    const secret = process.env.TWITCH_CLIENT_SECRET ?? ''
    if (!clientId || !secret) throw new Error('Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET')

    try {
      this.token = await this.fetchToken(clientId, secret)
      this.broadcasterId = await this.fetchBroadcasterId(clientId)
      await this.openSocket()

      const refused: string[] = []
      for (const type of SUBSCRIPTIONS) {
        try {
          await this.subscribe(type, clientId)
        } catch (err) {
          refused.push(err instanceof Error ? err.message : String(err))
        }
      }
      if (refused.length === SUBSCRIPTIONS.length) throw new Error(refused.join('; '))
      return refused
    } catch (err) {
      this.close()
      throw err
    }
  }

  close(): void {
    try {
      this.ws?.close()
    } catch {
      // noop
    }
    this.ws = null
  }

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws')
      this.ws = ws
      const timer = setTimeout(() => reject(new Error('Twitch EventSub did not answer in time')), this.welcomeTimeoutMs)
      const done = (fail?: Error) => {
        clearTimeout(timer)
        if (fail) reject(fail)
        else resolve()
      }
      ws.onmessage = (ev) => {
        try {
          this.handle(String(ev.data), () => done())
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)))
        }
      }
      ws.onerror = () => done(new Error('Twitch EventSub websocket error'))
      ws.onclose = () => done(new Error('Twitch EventSub websocket closed'))
    })
  }

  private async request(url: string, init: RequestInit, what: string): Promise<Response> {
    let res: Response
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.requestTimeoutMs) })
    } catch (err) {
      // The message names the step only: a URL or a header could carry the client secret or the token.
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new Error(`Twitch ${what}: ${timedOut ? 'no answer in time' : 'network error'}`)
    }
    if (!res.ok) throw new Error(`Twitch ${what} failed (HTTP ${res.status})`)
    return res
  }

  private async fetchToken(clientId: string, secret: string): Promise<string> {
    const res = await this.request(
      'https://id.twitch.tv/oauth2/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
      },
      'app token request',
    )
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) throw new Error('Twitch app token request failed')
    return data.access_token
  }

  private async fetchBroadcasterId(clientId: string): Promise<string> {
    const res = await this.request(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(this.channel)}`,
      { headers: { 'Client-Id': clientId, Authorization: `Bearer ${this.token}` } },
      'channel lookup',
    )
    const data = (await res.json()) as { data?: { id: string }[] }
    if (!data.data?.length) throw new Error(`Twitch channel not found: ${this.channel}`)
    return data.data[0].id
  }

  private handle(text: string, onWelcome: () => void): void {
    const msg = parseEventSubMessage(text)
    if (!msg) return
    if (msg.metadata.message_type === 'session_welcome') {
      const session = msg.payload.session as { id?: unknown } | undefined
      if (typeof session?.id !== 'string') throw new Error('Twitch EventSub welcome without a session id')
      this.sessionId = session.id
      onWelcome()
    } else if (msg.metadata.message_type === 'notification') {
      const sub = msg.payload.subscription as { type?: string } | undefined
      const ev = msg.payload.event as Record<string, unknown> | undefined
      if (sub?.type && ev) this.onNotification(sub.type, ev)
    }
  }

  private onNotification(type: string, ev: Record<string, unknown>): void {
    if (type === 'channel.follow') {
      const name = String(ev.user_name ?? ev.user_login ?? '')
      const id = String(ev.user_id ?? '')
      this.emit({ type: 'follow', user: { id: id || name, nickname: name || 'someone' } })
    } else if (type === 'channel.raid') {
      const name = String(ev.from_broadcaster_user_name ?? '')
      const viewers = Number(ev.viewers) || 0
      this.emit({
        type: 'comment',
        user: { id: 'raid', nickname: name || 'Raid' },
        text: `⚡ RAID from ${name} with ${viewers} viewers!`,
      })
    }
  }

  private async subscribe(type: string, clientId: string): Promise<void> {
    await this.request(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        method: 'POST',
        headers: {
          'Client-Id': clientId,
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition: { broadcaster_user_id: this.broadcasterId },
          transport: { method: 'websocket', session_id: this.sessionId },
        }),
      },
      `${type} subscription`,
    )
  }
}
