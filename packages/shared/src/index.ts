// Types and catalogs shared by the server, the dashboard and the overlay.

export interface Viewer {
  id: string
  nickname: string
}

export type LiveEvent =
  | { type: 'gift'; user: Viewer; giftId: string; count: number }
  | { type: 'like'; user: Viewer; count: number }
  | { type: 'follow'; user: Viewer }
  | { type: 'share'; user: Viewer }

export type GiftEvent = Extract<LiveEvent, { type: 'gift' }>

export interface Gift {
  id: string
  name: string
  emoji: string
  coins: number
}

// Placeholder catalog: a real TikTok source maps its own gift ids onto these.
export const GIFTS: Gift[] = [
  { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1 },
  { id: 'heart', name: 'Heart', emoji: '💖', coins: 5 },
  { id: 'donut', name: 'Donut', emoji: '🍩', coins: 30 },
  { id: 'crown', name: 'Crown', emoji: '👑', coins: 99 },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', coins: 500 },
  { id: 'galaxy', name: 'Galaxy', emoji: '🌌', coins: 1000 },
]

export const giftById = (id: string) => GIFTS.find((g) => g.id === id)

// A gift source without giftId matches any gift.
export type TriggerSource =
  | { type: 'gift'; giftId?: string }
  | { type: 'like' }
  | { type: 'follow' }
  | { type: 'share' }

export interface Trigger {
  source: TriggerSource
  action: string
}

export const MAX_TRIGGERS = 12

export interface GameDef {
  id: string
  name: string
  description: string
  actions: { id: string; label: string }[]
  defaultTriggers: Trigger[]
}

export const GAMES: GameDef[] = [
  {
    id: 'gift-drop',
    name: 'Gift Drop',
    description: 'Gifts fall into the arena and pile up. The bigger the gift, the bigger the ball.',
    actions: [
      { id: 'drop', label: 'Drop in' },
      { id: 'rain', label: 'Heart rain' },
      { id: 'boost', label: 'Jump!' },
      { id: 'bomb', label: 'Bomb' },
    ],
    defaultTriggers: [
      { source: { type: 'gift' }, action: 'drop' },
      { source: { type: 'gift', giftId: 'donut' }, action: 'boost' },
      { source: { type: 'gift', giftId: 'rocket' }, action: 'bomb' },
      { source: { type: 'like' }, action: 'rain' },
      { source: { type: 'follow' }, action: 'drop' },
      { source: { type: 'share' }, action: 'boost' },
    ],
  },
]

export function describeSource(source: TriggerSource): { icon: string; label: string } {
  switch (source.type) {
    case 'gift': {
      const gift = source.giftId ? giftById(source.giftId) : undefined
      return gift ? { icon: gift.emoji, label: gift.name } : { icon: '🎁', label: 'Any gift' }
    }
    case 'like':
      return { icon: '👍', label: 'Likes' }
    case 'follow':
      return { icon: '➕', label: 'Follow' }
    case 'share':
      return { icon: '🔁', label: 'Share' }
  }
}

export function sourceMatches(source: TriggerSource, event: LiveEvent) {
  if (source.type !== event.type) return false
  return source.type !== 'gift' || !source.giftId || (event.type === 'gift' && event.giftId === source.giftId)
}

export const triggersFor = (triggers: Trigger[], event: LiveEvent) =>
  triggers.filter((t) => sourceMatches(t.source, event))

export interface Gifter {
  id: string
  nickname: string
  coins: number
}

export function addToRanking(ranking: Gifter[], event: GiftEvent): Gifter[] {
  const coins = (giftById(event.giftId)?.coins ?? 0) * event.count
  const existing = ranking.find((g) => g.id === event.user.id)
  const next = existing
    ? ranking.map((g) => (g === existing ? { ...g, coins: g.coins + coins } : g))
    : [...ranking, { id: event.user.id, nickname: event.user.nickname, coins }]
  return next.sort((a, b) => b.coins - a.coins)
}

// --- Socket.IO contract ---

export interface SessionState {
  gameId: string
  triggers: Trigger[]
}

export interface ServerToClientEvents {
  'session:state': (state: SessionState) => void
  'live:event': (event: LiveEvent) => void
}

export interface ClientToServerEvents {
  'sim:event': (event: LiveEvent) => void
  'game:select': (gameId: string) => void
  'triggers:set': (triggers: Trigger[]) => void
}

export type ClientType = 'dashboard' | 'overlay'

export interface HandshakeAuth {
  clientType: ClientType
  key: string
}

export const isValidKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(key)
