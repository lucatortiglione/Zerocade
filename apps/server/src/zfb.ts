import { giftIdForTiktok, type BridgeConfig, type BridgeStatus, type LiveEvent, type SourceKind, type Viewer } from '@zerocade/shared'

// ZeroFollowerBot's event bridge (ZeroFollowerBot, core/src/eventbridge.rs): ZeroFollowerBot already reads the
// TikTok live through Euler Stream and the Twitch chat, and repeats them on ws://127.0.0.1:<port>, one JSON event
// per message. Zerocade listens there instead of opening a second Euler Stream connection (its free plan counts
// requests). While enabled it keeps trying, so ZeroFollowerBot can be started before or after Zerocade.
//
// Protocol 1: {"type":"hello","protocol":1,"requests":["skip","words"]}, {"type":"status","tiktok":"","twitch":""},
// then {"type":"comment"|"gift"|"like"|"follow"|"share"|"join"|"bits","platform":"tiktok"|"twitch","user":{"id",
// "name","nickname","avatar"?},"id", ...}: "text" for a comment, "gift"/"count"/"coins" for a gift, "count" for likes
// and bits. Zerocade can answer:
// - {"type":"skip","id"} for a comment its voice need not read (a word the game already has): ZeroFollowerBot takes
//   it out of the speech queue if it is still waiting. An older one ignores it.
// - {"type":"words","words":[...]} with the right answers of the ZeroWords level in play ([] = no game): of the
//   comments made of a single word, ZeroFollowerBot's voice reads only a right answer, the first time. Each list
//   starts over there; the list ends when this connection closes. Sent only when hello's "requests" has "words".

const PROTOCOL = 1
// Waits between attempts while ZeroFollowerBot is not there: quick at first, then every few seconds.
const RETRY_MS = [1000, 2000, 5000]
const MAX_TEXT = 140
// As ZeroFollowerBot accepts in a skip (its MAX_SKIP_ID).
const MAX_ID = 128
// As ZeroFollowerBot accepts in a words list (its MAX_GAME_WORDS and MAX_GAME_WORD_CHARS).
const MAX_WORDS = 4096
const MAX_WORD = 32

// Each event with its feed, the account read there and the message's id ('' when it has none).
type Emit = (event: LiveEvent, kind: SourceKind, account: string, id: string) => void

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')
const count = (x: unknown) => {
  const n = Math.floor(Number(x))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 1
}

// A boolean the bridge sends under one of these names, or undefined.
const flag = (u: Record<string, unknown>, ...names: string[]): boolean | undefined =>
  names.map((n) => u[n]).find((v): v is boolean => typeof v === 'boolean')

// TikTok viewers go by their @name (as the direct TikTok feed does), Twitch ones by their display name.
function viewerOf(raw: unknown, kind: SourceKind): Viewer {
  const u = rec(raw)
  const name = str(u.name, 64)
  const shown = kind === 'tiktok' ? name || str(u.nickname, 32) : str(u.nickname, 32) || name
  const avatar = str(u.avatar, 1024)
  return {
    // TikTok and Twitch have independent user IDs. The same ID on the two
    // platforms must get separate answers and scores in a shared quiz.
    id: `${kind}:${str(u.id, 64) || name || 'anonymous'}`,
    nickname: shown.slice(0, 32) || 'anonymous',
    avatar: /^https:\/\/\S+$/.test(avatar) ? avatar : undefined,
    // When the bridge says so ("follower" and "fan" flags, or the names Euler Stream uses): true or false;
    // absent, a viewer stays unknown.
    ...(flag(u, 'follower', 'isFollower', 'is_follower') !== undefined && { follower: flag(u, 'follower', 'isFollower', 'is_follower') }),
    ...(flag(u, 'fan', 'isSubscriber', 'is_subscriber') !== undefined && { fan: flag(u, 'fan', 'isSubscriber', 'is_subscriber') }),
  }
}

// A bridge message -> a live event, with the message's id; null for the ones Zerocade has no event for.
export function bridgeEvent(raw: unknown): { event: LiveEvent; kind: SourceKind; id: string } | null {
  const m = rec(raw)
  const kind = m.platform === 'tiktok' || m.platform === 'twitch' ? m.platform : null
  if (!kind) return null
  const user = viewerOf(m.user, kind)
  // A cut id would name another message: one too long is left out.
  const id = typeof m.id === 'string' && m.id.length <= MAX_ID ? m.id : ''
  switch (m.type) {
    case 'comment':
      return { kind, id, event: { type: 'comment', user, text: str(m.text, MAX_TEXT) } }
    case 'gift': {
      const n = count(m.count)
      const each = Math.round(Number(m.coins) / n) || 1
      return { kind, id, event: { type: 'gift', user, giftId: giftIdForTiktok(str(m.gift, 64), each), count: Math.min(n, 100) } }
    }
    // Twitch bits count as likes, as with the direct Twitch feed.
    case 'like':
    case 'bits':
      return { kind, id, event: { type: 'like', user, count: Math.min(count(m.count), 100) } }
    case 'follow':
    case 'share':
    case 'join':
      return { kind, id, event: { type: m.type, user } }
    default:
      return null
  }
}

export class ZfbBridge {
  private config: BridgeConfig = { enabled: false, port: 0 }
  private socket: WebSocket | null = null
  private retry: NodeJS.Timeout | undefined
  private attempt = 0
  private state: BridgeStatus['state'] = 'off'
  private message: string | undefined
  private tiktok = ''
  private twitch = ''
  // When each account appeared, for the Creators list.
  private since: Record<SourceKind, number> = { tiktok: 0, twitch: 0 }
  // The right answers of the ZeroWords level in play ([] = none), and whether this ZeroFollowerBot takes them.
  private words: string[] = []
  private takesWords = false

  constructor(
    private emit: Emit,
    private onStatus: (status: BridgeStatus) => void,
  ) {}

  status(): BridgeStatus {
    return {
      ...this.config,
      state: this.state,
      ...(this.message && { message: this.message }),
      tiktok: this.tiktok,
      twitch: this.twitch,
    }
  }

  // The accounts ZeroFollowerBot is reading now, with when they appeared.
  accounts(): { kind: SourceKind; username: string; since: number }[] {
    if (this.state !== 'connected') return []
    return (['tiktok', 'twitch'] as const)
      .filter((kind) => this[kind])
      .map((kind) => ({ kind, username: this[kind], since: this.since[kind] }))
  }

  configure(config: BridgeConfig): void {
    if (config.enabled === this.config.enabled && config.port === this.config.port && (this.socket || !config.enabled)) return
    this.config = config
    this.stop()
    this.attempt = 0
    if (config.enabled) this.open()
    else this.update('off')
  }

  close(): void {
    this.config = { ...this.config, enabled: false }
    this.stop()
  }

  // Asks ZeroFollowerBot not to read this comment aloud (see the protocol above). Nothing when not connected.
  skip(id: string): void {
    if (!id || this.state !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ type: 'skip', id }))
  }

  // The right answers of the ZeroWords level in play ([] = none), for ZeroFollowerBot's voice (see the protocol
  // above). Kept for the next connection. Each list sent starts over there, so the same one is sent again only
  // for a new level (`fresh`).
  setWords(words: string[], fresh = false): void {
    const list = words.filter((w) => w.length > 0 && w.length <= MAX_WORD).slice(0, MAX_WORDS)
    if (!fresh && list.length === this.words.length && list.every((w, i) => w === this.words[i])) return
    this.words = list
    this.sendWords()
  }

  private sendWords(): void {
    if (!this.takesWords || this.state !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ type: 'words', words: this.words }))
  }

  private stop(): void {
    clearTimeout(this.retry)
    this.retry = undefined
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.setAccounts('', '')
  }

  private open(): void {
    const socket = new WebSocket(`ws://127.0.0.1:${this.config.port}/`)
    this.socket = socket
    this.update('connecting', this.attempt ? this.message : undefined)
    socket.addEventListener('message', (e) => {
      if (this.socket !== socket || typeof e.data !== 'string') return
      let message: unknown
      try {
        message = JSON.parse(e.data)
      } catch {
        return
      }
      this.onMessage(socket, rec(message))
    })
    // 'error' is always followed by 'close'.
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.setAccounts('', '')
      const wait = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)]
      this.attempt++
      const why =
        this.state === 'connected'
          ? 'ZeroFollowerBot si è scollegato: riprovo da solo.'
          : `ZeroFollowerBot non risponde sulla porta ${this.config.port}: è aperto, con "Manda chat ed eventi a Zerocade" acceso e la stessa porta? Riprovo da solo.`
      this.update('connecting', this.message?.startsWith('Versione') ? this.message : why)
      this.retry = setTimeout(() => {
        this.retry = undefined
        if (this.config.enabled && !this.socket) this.open()
      }, wait)
    })
  }

  private onMessage(socket: WebSocket, m: Record<string, unknown>): void {
    if (m.type === 'hello') {
      if (m.protocol !== PROTOCOL) {
        this.message = `Versione del ponte non supportata (${String(m.protocol)}): aggiorna Zerocade o ZeroFollowerBot.`
        socket.close()
        return
      }
      this.attempt = 0
      // A ZeroFollowerBot that does not say it takes "words" gets none (an older one would close on a long list).
      this.takesWords = Array.isArray(m.requests) && m.requests.includes('words')
      this.update('connected')
      // The level in play, if any: the list ended on ZeroFollowerBot's side with the last connection.
      if (this.words.length) this.sendWords()
      return
    }
    if (m.type === 'status') return this.setAccounts(str(m.tiktok, 64), str(m.twitch, 64))
    if (m.type === 'lost') return console.warn(`[zfb] ${String(m.count)} eventi persi dal ponte: Zerocade era rimasto indietro`)
    if (this.state !== 'connected') return
    const live = bridgeEvent(m)
    if (live) this.emit(live.event, live.kind, live.kind === 'tiktok' ? this.tiktok : this.twitch, live.id)
  }

  private setAccounts(tiktok: string, twitch: string): void {
    if (tiktok === this.tiktok && twitch === this.twitch) return
    const now = Date.now()
    if (tiktok !== this.tiktok) this.since.tiktok = tiktok ? now : 0
    if (twitch !== this.twitch) this.since.twitch = twitch ? now : 0
    this.tiktok = tiktok
    this.twitch = twitch
    this.onStatus(this.status())
  }

  private update(state: BridgeStatus['state'], message?: string): void {
    this.state = state
    this.message = message
    this.onStatus(this.status())
  }
}
