import type { LiveEvent } from '@zerocade/shared'

// Twitch EventSub over WebSocket (no public webhook needed): connects with an app
// access token and subscribes to channel.follow + channel.raid for the channel.
// Requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET env vars.

interface EvMsg {
  metadata: { message_type: string }
  payload: Record<string, unknown>
}

export class TwitchEventSub {
  private ws: WebSocket | null = null
  private token = ''
  private broadcasterId = ''
  private sessionId = ''

  constructor(
    private channel: string,
    private emit: (event: LiveEvent) => void,
  ) {}

  async start(): Promise<void> {
    const clientId = process.env.TWITCH_CLIENT_ID ?? ''
    const secret = process.env.TWITCH_CLIENT_SECRET ?? ''
    if (!clientId || !secret) throw new Error('Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET')

    this.token = await this.fetchToken(clientId, secret)
    this.broadcasterId = await this.fetchBroadcasterId(clientId)

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws')
      this.ws = ws
      ws.onmessage = (ev) => {
        try {
          this.handle(String(ev.data), resolve)
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
      ws.onerror = () => reject(new Error('Twitch EventSub websocket error'))
    })

    await this.subscribe('channel.follow')
    await this.subscribe('channel.raid')
  }

  close(): void {
    try {
      this.ws?.close()
    } catch {
      // noop
    }
    this.ws = null
  }

  private async fetchToken(clientId: string, secret: string): Promise<string> {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
      { method: 'POST' },
    )
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) throw new Error('Twitch app token request failed')
    return data.access_token
  }

  private async fetchBroadcasterId(clientId: string): Promise<string> {
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(this.channel)}`, {
      headers: { 'Client-Id': clientId, Authorization: `Bearer ${this.token}` },
    })
    const data = (await res.json()) as { data?: { id: string }[] }
    if (!data.data?.length) throw new Error(`Twitch channel not found: ${this.channel}`)
    return data.data[0].id
  }

  private handle(text: string, onWelcome: () => void): void {
    const msg = JSON.parse(text) as EvMsg
    if (msg.metadata.message_type === 'session_welcome') {
      const session = msg.payload.session as { id: string }
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

  private async subscribe(type: string): Promise<void> {
    const clientId = process.env.TWITCH_CLIENT_ID ?? ''
    await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
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
    })
  }
}