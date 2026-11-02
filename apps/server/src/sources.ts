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
  disconnect: () => unknown
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

// The connector's most common failures, in the dashboard's language; anything else as it is.
function tiktokError(err: unknown, user: string): string {
  const message = err instanceof Error ? err.message : String(err)
  if (err instanceof Error && err.constructor.name === 'UserOfflineError') {
    return `@${user} non è in diretta: avvia la LIVE su TikTok, poi ricollega.`
  }
  if (/room id/i.test(message)) {
    return `Diretta di @${user} non trovata: controlla il nome utente (quello dopo la @ nel profilo) e che la LIVE sia avviata.`
  }
  return message
}

export interface LiveSource {
  kind: SourceKind
  username: string
  since: number
  viewers?: number
}

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
  // For the dashboard's Creators list: when each feed went live, and TikTok's viewer count.
  private tiktokSince = 0
  private twitchSince = 0
  private tiktokViewers: number | undefined

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

  live(): LiveSource[] {
    const out: LiveSource[] = []
    if (this.tiktokState === 'connected')
      out.push({ kind: 'tiktok', username: this.tiktokUser, since: this.tiktokSince, viewers: this.tiktokViewers })
    if (this.twitchState === 'connected') out.push({ kind: 'twitch', username: this.twitchUser, since: this.twitchSince })
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

    let conn: LegacyTikTokConn | null = null
    try {
      // Version 2 of the connector needs the options object, even empty: without it the
      // constructor throws before any request.
      conn = new LegacyConn(uname, {})
      this.tiktok = conn
      // An 'error' event with nobody listening would bring the whole server down. The
      // connector sends { info, exception }; a failed connect also rejects, which the
      // dashboard gets below.
      conn.on('error', (err) => {
        const e = rec(err)
        const detail = err instanceof Error ? err.message : [e.info, e.exception instanceof Error ? e.exception.message : ''].filter(Boolean).join(': ')
        console.warn(`[tiktok] ${detail}`)
      })
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
      conn.on('roomUser', (data) => {
        const d = rec(data)
        const viewers = Math.floor(Number(d.viewerCount ?? d.total))
        if (Number.isFinite(viewers) && viewers >= 0) this.tiktokViewers = viewers
      })
      // The creator ended the live: the connector is closed, so show it as disconnected.
      conn.on('streamEnd', () => {
        if (this.tiktok === conn) this.disconnectTiktok()
      })
      await conn.connect()
      // Disconnected, or replaced by another account, while connecting: close this one.
      if (this.tiktok !== conn) {
        void Promise.resolve(conn.disconnect()).catch(() => {})
        return
      }
      this.tiktokSince = Date.now()
      this.tiktokState = 'connected'
      this.status({ kind: 'tiktok', username: uname, state: 'connected' })
    } catch (err) {
      // A late failure of an attempt already replaced says nothing about the current one.
      if (conn && this.tiktok !== conn) return
      this.tiktok = null
      this.tiktokState = 'error'
      this.status({ kind: 'tiktok', username: uname, state: 'error', message: tiktokError(err, uname) })
    }
  }

  private disconnectTiktok(): void {
    if (this.tiktok) {
      const conn = this.tiktok
      this.tiktok = null
      try {
        // A promise in version 2 of the connector; it rejects when the connection never opened.
        void Promise.resolve(conn.disconnect()).catch(() => {})
      } catch {
        // noop
      }
    }
    if (this.tiktokUser) {
      this.status({ kind: 'tiktok', username: this.tiktokUser, state: 'idle' })
      this.tiktokUser = ''
      this.tiktokState = 'idle'
      this.tiktokViewers = undefined
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
      this.twitchSince = Date.now()
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
        // Rejects when the chat never connected.
        void this.twitch.disconnect().catch(() => {})
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