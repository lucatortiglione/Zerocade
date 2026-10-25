import { WebcastPushConnection } from 'tiktok-live-connector/legacy'
import { Client as TmiClient } from 'tmi.js'
import {
  giftIdForTiktok,
  type LiveEvent,
  type SourceConfig,
  type SourceKind,
  type SourceStatus,
  type Viewer,
} from '@zerocade/shared'
import { TwitchEventSub } from './twitch-eventsub.js'

// Real TikTok and Twitch feeds, translated into the internal LiveEvent shape and
// forwarded by the caller. TikTok uses the legacy flattened event payloads, which
// are untyped, so every field is read defensively.

type LegacyTikTokConn = {
  connect: () => Promise<unknown>
  disconnect: () => void
  on: (event: string, listener: (data: unknown) => void) => unknown
}

const LegacyConn = WebcastPushConnection as unknown as new (uniqueId: string, options?: unknown) => LegacyTikTokConn

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' ? (x as Record<string, unknown>) : {}

const toViewer = (id: unknown, nickname: unknown, avatar?: unknown): Viewer => ({
  id: String(id ?? '').slice(0, 64) || String(nickname ?? '').slice(0, 32) || 'anonymous',
  nickname: String(nickname ?? '').slice(0, 32) || 'anonymous',
  avatar: typeof avatar === 'string' && /^https?:\/\//.test(avatar) ? avatar.slice(0, 512) : undefined,
})

const clampCount = (n: unknown, fallback = 1) => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) && v > 0 ? Math.min(v, 100) : fallback
}

export class RoomSources {
  private tiktok: LegacyTikTokConn | null = null
  private twitch: TmiClient | null = null
  private twitchEv: TwitchEventSub | null = null
  private tiktokUser = ''
  private twitchUser = ''
  private tiktokState: SourceStatus['state'] = 'idle'
  private twitchState: SourceStatus['state'] = 'idle'

  constructor(
    private emit: (event: LiveEvent) => void,
    private status: (status: SourceStatus) => void,
  ) {}

  connect(config: SourceConfig): void {
    if (config.kind === 'tiktok') void this.connectTiktok(config.username)
    else void this.connectTwitch(config.username)
  }

  disconnect(kind: SourceKind): void {
    if (kind === 'tiktok') this.disconnectTiktok()
    else this.disconnectTwitch()
  }

  statuses(): SourceStatus[] {
    const out: SourceStatus[] = []
    if (this.tiktokUser) out.push({ kind: 'tiktok', username: this.tiktokUser, state: this.tiktokState })
    if (this.twitchUser) out.push({ kind: 'twitch', username: this.twitchUser, state: this.twitchState })
    return out
  }

  disconnectAll(): void {
    this.disconnectTiktok()
    this.disconnectTwitch()
  }

  private async connectTiktok(username: string): Promise<void> {
    this.disconnectTiktok()
    const uname = username.replace(/^@/, '').trim()
    this.tiktokUser = uname
    this.tiktokState = 'connecting'
    this.status({ kind: 'tiktok', username: uname, state: 'connecting' })

    const conn = new LegacyConn(uname)
    this.tiktok = conn
    try {
      conn.on('chat', (data) => {
        const d = rec(data)
        this.emit({
          type: 'comment',
          user: toViewer(d.userId, d.uniqueId ?? d.nickname, d.profilePictureUrl),
          text: String(d.comment ?? '').slice(0, 140),
        })
      })
      conn.on('gift', (data) => {
        const d = rec(data)
        if (Number(d.repeatEnd) === 1) return
        this.emit({
          type: 'gift',
          user: toViewer(d.userId, d.uniqueId ?? d.nickname, d.profilePictureUrl),
          giftId: giftIdForTiktok(String(d.giftName ?? ''), clampCount(d.diamondCount, 1)),
          count: clampCount(d.repeatCount, 1),
        })
      })
      conn.on('like', (data) => {
        const d = rec(data)
        this.emit({ type: 'like', user: toViewer(d.userId, d.uniqueId ?? d.nickname, d.profilePictureUrl), count: clampCount(d.likeCount, 1) })
      })
      conn.on('follow', (data) => {
        const d = rec(data)
        this.emit({ type: 'follow', user: toViewer(d.userId, d.uniqueId ?? d.nickname, d.profilePictureUrl) })
      })
      conn.on('share', (data) => {
        const d = rec(data)
        this.emit({ type: 'share', user: toViewer(d.userId, d.uniqueId ?? d.nickname, d.profilePictureUrl) })
      })
      conn.on('member', (data) => {
        const d = rec(data)
        this.emit({ type: 'join', user: toViewer(d.userId, d.uniqueId ?? d.nickname, d.profilePictureUrl) })
      })
      await conn.connect()
      this.tiktokState = 'connected'
      this.status({ kind: 'tiktok', username: uname, state: 'connected' })
    } catch (err) {
      this.tiktok = null
      this.tiktokState = 'error'
      this.status({
        kind: 'tiktok',
        username: uname,
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private disconnectTiktok(): void {
    if (this.tiktok) {
      try {
        this.tiktok.disconnect()
      } catch {
        // noop
      }
      this.tiktok = null
    }
    if (this.tiktokUser) {
      this.status({ kind: 'tiktok', username: this.tiktokUser, state: 'idle' })
      this.tiktokUser = ''
      this.tiktokState = 'idle'
    }
  }

  private async connectTwitch(channel: string): Promise<void> {
    this.disconnectTwitch()
    const ch = channel.replace(/^#/, '').trim().toLowerCase()
    this.twitchUser = ch
    this.twitchState = 'connecting'
    this.status({ kind: 'twitch', username: ch, state: 'connecting' })

    const client = new TmiClient({ channels: [ch] })
    this.twitch = client
    try {
      client.on('message', (_channel, tags, message, self) => {
        if (self) return
        this.emit({
          type: 'comment',
          user: toViewer(tags['user-id'], tags['display-name'] ?? tags.username),
          text: message.slice(0, 140),
        })
      })
      client.on('cheer', (_channel, tags, _message) => {
        this.emit({
          type: 'like',
          user: toViewer(tags['user-id'], tags['display-name'] ?? tags.username),
          count: clampCount(tags.bits, 1),
        })
      })
      await client.connect()
      // EventSub (follows/raids) needs TWITCH_CLIENT_ID/SECRET; chat works without it.
      let note = ''
      if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
        try {
          const ev = new TwitchEventSub(ch, (e) => this.emit(e))
          await ev.start()
          this.twitchEv = ev
        } catch (err) {
          note = ` EventSub: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      this.twitchState = 'connected'
      this.status({ kind: 'twitch', username: ch, state: 'connected', message: note || undefined })
    } catch (err) {
      this.twitch = null
      this.twitchState = 'error'
      this.status({
        kind: 'twitch',
        username: ch,
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private disconnectTwitch(): void {
    if (this.twitch) {
      try {
        void this.twitch.disconnect()
      } catch {
        // noop
      }
      this.twitch = null
    }
    if (this.twitchEv) {
      this.twitchEv.close()
      this.twitchEv = null
    }
    if (this.twitchUser) {
      this.status({ kind: 'twitch', username: this.twitchUser, state: 'idle' })
      this.twitchUser = ''
      this.twitchState = 'idle'
    }
  }
}