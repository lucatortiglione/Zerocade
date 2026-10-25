import {
  GAMES,
  MAX_TRIGGERS,
  djSoundById,
  giftById,
  type DjPlay,
  type GameSettings,
  type LiveEvent,
  type SourceConfig,
  type Trigger,
  type TriggerSource,
  type Viewer,
  type WidgetConfig,
  type WidgetId,
} from '@zerocade/shared'

// Everything arriving over the socket is untrusted until it passes through here.

const asRecord = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)

const clampCount = (n: unknown) => Math.min(Math.max(Math.floor(Number(n)) || 1, 1), 100)

function sanitizeViewer(raw: unknown): Viewer | null {
  const r = asRecord(raw)
  if (!r || typeof r.id !== 'string' || typeof r.nickname !== 'string' || !r.nickname) return null
  const avatar = typeof r.avatar === 'string' && /^https?:\/\//.test(r.avatar) ? r.avatar.slice(0, 512) : undefined
  return { id: r.id.slice(0, 64), nickname: r.nickname.slice(0, 32), avatar }
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
    if (s.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null
      out[s.id] = Math.min(s.max, Math.max(s.min, v))
    } else if (s.kind === 'toggle') {
      if (typeof v !== 'boolean') return null
      out[s.id] = v
    } else {
      if (typeof v !== 'string' || !s.options.some((o) => o.value === v)) return null
      out[s.id] = v
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
    for (const [k, v] of Object.entries(w)) {
      if (typeof v !== 'boolean') return null
      widgets[k] = v
    }
    out.widgets = widgets as Record<WidgetId, boolean>
  }
  if (r.goal !== undefined) {
    if (typeof r.goal !== 'number' || !Number.isFinite(r.goal) || r.goal < 1) return null
    out.goal = Math.min(1_000_000, Math.floor(r.goal))
  }
  return out
}
