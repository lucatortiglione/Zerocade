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

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' ? (x as Record<string, unknown>) : {}

// A v3 picture (ImageModel) that has an address.
const hasPicture = (image: unknown) => {
  const urls = rec(image).urlList
  return Array.isArray(urls) && typeof urls[0] === 'string' && urls[0] !== ''
}

// Version 2.5 of the connector decodes TikTok's messages in their v3 shape, but its legacy layer
// still reads some of them as they were; they are put right before it reads them.
// - The viewer count keeps its top viewers in `ranks`, the legacy layer reads `ranksList`: that
//   message threw "Cannot read properties of undefined (reading 'map')", and when it came with
//   the first batch the connection failed. The list is copied under the old name.
// - The viewer's picture is read from `avatarLarge`, which TikTok leaves empty on comments, votes
//   and likes: no picture ever reached the games. The small one (`avatarThumb`, the picture of
//   version 1) or the medium one stands in.
class PushConnection extends WebcastPushConnection {
  protected override async processProtoMessageFetchResult(
    fetchResult: Parameters<WebcastPushConnection['processProtoMessageFetchResult']>[0],
  ): Promise<void> {
    for (const message of fetchResult.messages) {
      const data = rec(rec(rec(message).decodedData).data)
      if (message.method === 'WebcastRoomUserSeqMessage' && !Array.isArray(data.ranksList))
        data.ranksList = Array.isArray(data.ranks) ? data.ranks : []
      const user = rec(data.user)
      if (!hasPicture(user.avatarLarge)) {
        const picture = [user.avatarThumb, user.avatarMedium].find(hasPicture)
        if (picture) user.avatarLarge = picture
      }
    }
    return super.processProtoMessageFetchResult(fetchResult)
  }
}

const LegacyConn = PushConnection as unknown as new (uniqueId: string, options?: unknown) => LegacyTikTokConn

const toViewer = (id: unknown, nickname: unknown, avatar?: unknown): Viewer => ({
  id: String(id ?? '').slice(0, 64) || String(nickname ?? '').slice(0, 32) || 'anonymous',
  nickname: String(nickname ?? '').slice(0, 32) || 'anonymous',
  avatar: typeof avatar === 'string' && /^https?:\/\//.test(avatar) ? avatar.slice(0, 512) : undefined,
})

// The viewer of a TikTok event. Version 2 of the connector sometimes leaves userId empty (the
// @name stands in) and keeps the picture in userDetails rather than profilePictureUrl (which it
// always leaves null; the picture itself is put there by PushConnection).
// followRole is TikTok's follow status (1 follows the host, 2 is a friend); isSubscriber is the
// subscription badge, which is what the fan club shows as.
export const tiktokViewer = (d: Record<string, unknown>): Viewer => {
  const shown = typeof d.nickname === 'string' && d.nickname.trim() ? d.nickname : d.uniqueId
  const viewer = toViewer(String(d.userId ?? '').trim() || d.uniqueId, shown, d.profilePictureUrl ?? rec(d.userDetails).profilePictureUrls)
  if (Number(d.followRole) >= 1) viewer.follower = true
  if (d.isSubscriber === true) viewer.fan = true
  return viewer
}

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

// The name as typed -> as connected (and saved): TikTok without the @, a Twitch channel
// without the # and in lower case.
export function sourceUsername(kind: SourceKind, raw: string): string {
  return kind === 'tiktok' ? raw.replace(/^@/, '').trim() : raw.replace(/^#/, '').trim().toLowerCase()
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
    // Each event with the feed it came from.
    private emit: (event: LiveEvent, kind: SourceKind) => void,
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
    const uname = sourceUsername('tiktok', username)
    this.tiktokUser = uname
    this.tiktokState = 'connecting'
    this.status({ kind: 'tiktok', username: uname, state: 'connecting' })
    const emit = (event: LiveEvent) => this.emit(event, 'tiktok')

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
      // Version 2 of the connector has the text in `content` (`comment` in version 1) and
      // the likes in `count` (`likeCount`).
      conn.on('chat', (data) => {
        const d = rec(data)
        emit({ type: 'comment', user: tiktokViewer(d), text: String(d.content ?? d.comment ?? '').slice(0, 140) })
      })
      conn.on('gift', (data) => {
        const d = rec(data)
        if (Number(d.repeatEnd) === 1) return
        emit({
          type: 'gift',
          user: tiktokViewer(d),
          giftId: giftIdForTiktok(String(d.giftName ?? ''), clampCount(d.diamondCount, 1)),
          count: clampCount(d.repeatCount, 1),
        })
      })
      conn.on('like', (data) => {
        const d = rec(data)
        emit({ type: 'like', user: tiktokViewer(d), count: clampCount(d.likeCount ?? d.count, 1) })
      })
      conn.on('follow', (data) => emit({ type: 'follow', user: tiktokViewer(rec(data)) }))
      conn.on('share', (data) => emit({ type: 'share', user: tiktokViewer(rec(data)) }))
      conn.on('member', (data) => emit({ type: 'join', user: tiktokViewer(rec(data)) }))
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
        // Closing what was just opened: a failure here only means there was nothing left to close.
        void Promise.resolve(conn.disconnect()).catch(() => undefined)
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
        // A promise in version 2 of the connector; it rejects when the connection never opened, and an older
        // connector can throw at once instead. Either way there is nothing left to close: the state below is reset.
        void Promise.resolve(conn.disconnect()).catch(() => undefined)
      } catch {
        // As above: a connection that never opened has nothing to close.
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
    const ch = sourceUsername('twitch', channel)
    this.twitchUser = ch
    this.twitchState = 'connecting'
    this.status({ kind: 'twitch', username: ch, state: 'connecting' })
    const emit = (event: LiveEvent) => this.emit(event, 'twitch')

    const client = new TmiClient({ channels: [ch] })
    this.twitch = client
    try {
      client.on('message', (_channel, tags, message, self) => {
        if (self) return
        emit({
          type: 'comment',
          user: toViewer(tags['user-id'], tags['display-name'] || tags.username),
          text: message.slice(0, 140),
        })
      })
      client.on('cheer', (_channel, tags, _message) => {
        emit({
          type: 'like',
          user: toViewer(tags['user-id'], tags['display-name'] || tags.username),
          count: clampCount(tags.bits, 1),
        })
      })
      await client.connect()
      // EventSub (follows/raids) needs TWITCH_CLIENT_ID/SECRET; chat works without it.
      let note = ''
      if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
        try {
          const ev = new TwitchEventSub(ch, emit)
          const refused = await ev.start()
          this.twitchEv = ev
          // Twitch refused some subscriptions: chat and the rest still work, but the streamer must be told.
          if (refused.length) note = ` EventSub: ${refused.join('; ')}`
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
        // Rejects (or throws, in an older tmi.js) when the chat never connected: there is nothing left to close.
        void this.twitch.disconnect().catch(() => undefined)
      } catch {
        // As above: a chat that never connected has nothing to close.
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
