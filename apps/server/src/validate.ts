import {
  GAMES,
  MAX_TRIGGERS,
  djSoundById,
  giftById,
  type BivioCommand,
  type BridgeConfig,
  type DjPlay,
  type GameSettings,
  type IncastroCommand,
  type LiveEvent,
  type QuizzlandCommand,
  type SourceConfig,
  type Trigger,
  type TriggerSource,
  type Viewer,
  type WidgetConfig,
  TICKER_LIMITS,
  type WidgetId,
} from '@zerocade/shared'

// Everything arriving over the socket is untrusted until it passes through here.

const asRecord = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)

const clampCount = (n: unknown) => Math.min(Math.max(Math.floor(Number(n)) || 1, 1), 100)

function sanitizeViewer(raw: unknown): Viewer | null {
  const r = asRecord(raw)
  if (!r || typeof r.id !== 'string' || typeof r.nickname !== 'string' || !r.nickname) return null
  const avatar = typeof r.avatar === 'string' && /^https?:\/\//.test(r.avatar) ? r.avatar.slice(0, 512) : undefined
  return {
    id: r.id.slice(0, 64),
    nickname: r.nickname.slice(0, 32),
    avatar,
    ...(r.follower === true && { follower: true }),
    ...(r.fan === true && { fan: true }),
    ...(r.host === true && { host: true }),
  }
}

export function sanitizeEvent(raw: unknown): LiveEvent | null {
  const r = asRecord(raw)
  const user = r && sanitizeViewer(r.user)
  if (!r || !user) return null
  switch (r.type) {
    case 'gift':
      return typeof r.giftId === 'string' && giftById(r.giftId)
        ? { type: 'gift', user, giftId: r.giftId, count: clampCount(r.count) }
        : null
    case 'like':
      return { type: 'like', user, count: clampCount(r.count) }
    case 'follow':
    case 'share':
      return { type: r.type, user }
    case 'comment':
      return typeof r.text === 'string' && r.text ? { type: 'comment', user, text: r.text.slice(0, 140) } : null
    case 'join':
      return { type: 'join', user }
    default:
      return null
  }
}

function sanitizeSource(raw: unknown): TriggerSource | null {
  const r = asRecord(raw)
  if (!r) return null
  if (r.type === 'like' || r.type === 'follow' || r.type === 'share' || r.type === 'join') return { type: r.type }
  if (r.type === 'comment') {
    if (r.match === undefined) return { type: 'comment' }
    return typeof r.match === 'string' && r.match ? { type: 'comment', match: r.match.slice(0, 40) } : null
  }
  if (r.type !== 'gift') return null
  if (r.giftId === undefined) return { type: 'gift' }
  return typeof r.giftId === 'string' && giftById(r.giftId) ? { type: 'gift', giftId: r.giftId } : null
}

export function sanitizeTriggers(gameId: string, raw: unknown): Trigger[] | null {
  const game = GAMES.find((g) => g.id === gameId)
  if (!game || !Array.isArray(raw) || raw.length > MAX_TRIGGERS) return null
  const triggers: Trigger[] = []
  for (const item of raw) {
    const r = asRecord(item)
    const source = r && sanitizeSource(r.source)
    if (!r || !source || !game.actions.some((a) => a.id === r.action)) return null
    triggers.push({ source, action: r.action as string })
  }
  return triggers
}

export function sanitizeSettings(gameId: string, raw: unknown): GameSettings | null {
  const game = GAMES.find((g) => g.id === gameId)
  const r = asRecord(raw)
  if (!game || !r) return null
  const out: GameSettings = {}
  for (const s of game.settings) {
    const v = r[s.id]
    switch (s.kind) {
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) return null
        out[s.id] = Math.min(s.max, Math.max(s.min, v))
        break
      case 'toggle':
        if (typeof v !== 'boolean') return null
        out[s.id] = v
        break
      case 'select':
        if (typeof v !== 'string' || !s.options.some((o) => o.value === v)) return null
        out[s.id] = v
        break
      case 'multi': {
        if (typeof v !== 'string') return null
        const values = v ? v.split(',') : []
        if (values.some((x) => !s.options.some((o) => o.value === x))) return null
        out[s.id] = [...new Set(values)].join(',')
        break
      }
      case 'color':
        if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) return null
        out[s.id] = v.toLowerCase()
        break
      case 'image':
        // Only images uploaded to this server (POST /api/<game>/background/:key).
        if (typeof v !== 'string' || (v !== '' && !/^\/api\/(bivio|incastro|quizzland)\/background\/[A-Za-z0-9-]{8,64}\?v=\d{1,15}$/.test(v))) return null
        out[s.id] = v
        break
    }
  }
  return out
}

export function sanitizeDj(raw: unknown): DjPlay | null {
  const r = asRecord(raw)
  if (!r) return null
  if (typeof r.url === 'string' && r.url) {
    const url = r.url.slice(0, 512)
    return /^https?:\/\//.test(url) ? { url } : null
  }
  if (typeof r.soundId === 'string' && djSoundById(r.soundId)) return { soundId: r.soundId }
  return null
}

// ZeroFollowerBot's bridge: on or off, and a port that can be opened without privileges.
export function sanitizeBridgeConfig(raw: unknown): BridgeConfig | null {
  const r = asRecord(raw)
  if (!r || typeof r.enabled !== 'boolean') return null
  const port = Number(r.port)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null
  return { enabled: r.enabled, port }
}

export function sanitizeSourceConfig(raw: unknown): SourceConfig | null {
  const r = asRecord(raw)
  if (!r) return null
  if (r.kind !== 'tiktok' && r.kind !== 'twitch') return null
  if (typeof r.username !== 'string' || !r.username.trim()) return null
  return { kind: r.kind, username: r.username.trim().slice(0, 64) }
}

export function sanitizeScene(raw: unknown): Partial<WidgetConfig> | null {
  const r = asRecord(raw)
  if (!r) return null
  const out: Partial<WidgetConfig> = {}
  if (r.widgets !== undefined) {
    const w = asRecord(r.widgets)
    if (!w) return null
    const widgets: Record<string, boolean> = {}
    const widgetIds = new Set(['alerts', 'joins', 'follower', 'goal', 'gifters'])
    for (const [k, v] of Object.entries(w)) {
      if (!widgetIds.has(k) || typeof v !== 'boolean') return null
      widgets[k] = v
    }
    out.widgets = widgets as Record<WidgetId, boolean>
  }
  if (r.goal !== undefined) {
    if (typeof r.goal !== 'number' || !Number.isFinite(r.goal) || r.goal < 1) return null
    out.goal = Math.min(1_000_000, Math.floor(r.goal))
  }
  if (r.ticker !== undefined) {
    const t = asRecord(r.ticker)
    if (!t || typeof t.enabled !== 'boolean' || typeof t.intervalSec !== 'number' || !Number.isFinite(t.intervalSec) || !Array.isArray(t.messages)) return null
    if (t.messages.some((m) => typeof m !== 'string')) return null
    out.ticker = {
      enabled: t.enabled,
      intervalSec: Math.min(TICKER_LIMITS.intervalMax, Math.max(TICKER_LIMITS.intervalMin, Math.round(t.intervalSec))),
      messages: (t.messages as string[]).map((m) => m.trim().slice(0, TICKER_LIMITS.maxLength)).filter(Boolean).slice(0, TICKER_LIMITS.maxMessages),
    }
    for (const k of ['tickerPos', 'messagePos'] as const) {
      if (t[k] === undefined) continue
      if (t[k] === null) {
        out.ticker[k] = null
        continue
      }
      const p = asRecord(t[k])
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
      const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
      out.ticker[k] = { x: clamp(p.x), y: clamp(p.y) }
    }
  }
  return out
}

const BIVIO_COMMANDS: BivioCommand[] = ['next', 'reveal', 'extra-time', 'pause', 'resume', 'restart', 'flag', 'unflag']

export const sanitizeBivioCommand = (raw: unknown): BivioCommand | null =>
  BIVIO_COMMANDS.includes(raw as BivioCommand) ? (raw as BivioCommand) : null

const INCASTRO_COMMANDS: IncastroCommand[] = [
  'next',
  'prev',
  'hint',
  'reveal-word',
  'shuffle',
  'extra-time',
  'pause',
  'resume',
  'replay',
  'restart',
  'clear-scores',
]

export const sanitizeIncastroCommand = (raw: unknown): IncastroCommand | null =>
  INCASTRO_COMMANDS.includes(raw as IncastroCommand) ? (raw as IncastroCommand) : null

const QUIZZLAND_COMMANDS: QuizzlandCommand[] = [
  'next',
  'reveal',
  'extra-time',
  'fifty',
  'pause',
  'resume',
  'restart',
  'clear-scores',
  'flag',
  'unflag',
]

export const sanitizeQuizzlandCommand = (raw: unknown): QuizzlandCommand | null =>
  QUIZZLAND_COMMANDS.includes(raw as QuizzlandCommand) ? (raw as QuizzlandCommand) : null

// A level number for "Vai al livello"; the room wraps it into its own range.
export const sanitizeLevel = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 1_000_000 ? raw : null

export function sanitizeMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return raw.replace(/\s+/g, ' ').trim().slice(0, 140) || null
}
