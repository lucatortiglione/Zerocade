import {
  GAMES,
  MAX_TRIGGERS,
  giftById,
  type LiveEvent,
  type Trigger,
  type TriggerSource,
  type Viewer,
} from '@zerocade/shared'

// Everything arriving over the socket is untrusted until it passes through here.

const asRecord = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)

const clampCount = (n: unknown) => Math.min(Math.max(Math.floor(Number(n)) || 1, 1), 100)

function sanitizeViewer(raw: unknown): Viewer | null {
  const r = asRecord(raw)
  if (!r || typeof r.id !== 'string' || typeof r.nickname !== 'string' || !r.nickname) return null
  return { id: r.id.slice(0, 64), nickname: r.nickname.slice(0, 32) }
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
    default:
      return null
  }
}

function sanitizeSource(raw: unknown): TriggerSource | null {
  const r = asRecord(raw)
  if (!r) return null
  if (r.type === 'like' || r.type === 'follow' || r.type === 'share') return { type: r.type }
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
