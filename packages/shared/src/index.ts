// Types and catalogs shared by the server, the dashboard and the overlay.

export interface Viewer {
  id: string
  nickname: string
  avatar?: string
}

export type LiveEvent =
  | { type: 'gift'; user: Viewer; giftId: string; count: number }
  | { type: 'like'; user: Viewer; count: number }
  | { type: 'follow'; user: Viewer }
  | { type: 'share'; user: Viewer }
  | { type: 'comment'; user: Viewer; text: string }
  | { type: 'join'; user: Viewer }

export type GiftEvent = Extract<LiveEvent, { type: 'gift' }>

export type GiftTier = 'rare' | 'epic' | 'legendary' | 'mythic'

export interface Gift {
  id: string
  name: string
  emoji: string
  coins: number
  tier: GiftTier
}

// Curated subset of the real TikTok gift catalog (names + coin amounts from
// livecade.io/api/gifts), bucketed into TikTok rarity tiers.
export const GIFTS: Gift[] = [
  // Rare (1–99)
  { id: 'rose', name: 'Rose', emoji: '🌹', coins: 1, tier: 'rare' },
  { id: 'finger-heart', name: 'Finger Heart', emoji: '🫰', coins: 5, tier: 'rare' },
  { id: 'heart', name: 'Heart', emoji: '💖', coins: 5, tier: 'rare' },
  { id: 'gg', name: 'GG', emoji: '🎮', coins: 10, tier: 'rare' },
  { id: 'donut', name: 'Donut', emoji: '🍩', coins: 30, tier: 'rare' },
  { id: 'coffee', name: 'Coffee', emoji: '☕', coins: 50, tier: 'rare' },
  { id: 'crown', name: 'Crown', emoji: '👑', coins: 99, tier: 'rare' },

  // Epic (100–999)
  { id: 'pizza', name: 'Pizza', emoji: '🍕', coins: 100, tier: 'epic' },
  { id: 'teddy', name: 'Teddy Bear', emoji: '🧸', coins: 199, tier: 'epic' },
  { id: 'fireworks', name: 'Fireworks', emoji: '🎆', coins: 250, tier: 'epic' },
  { id: 'fire', name: 'Fire', emoji: '🔥', coins: 299, tier: 'epic' },
  { id: 'mic', name: 'Mic', emoji: '🎤', coins: 500, tier: 'epic' },
  { id: 'money-gun', name: 'Money Gun', emoji: '💸', coins: 500, tier: 'epic' },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', coins: 999, tier: 'epic' },

  // Legendary (1000–9999)
  { id: 'galaxy', name: 'Galaxy', emoji: '🌌', coins: 1000, tier: 'legendary' },
  { id: 'sunglasses', name: 'Sunglasses', emoji: '😎', coins: 1499, tier: 'legendary' },
  { id: 'diamond', name: 'Diamond', emoji: '💎', coins: 2999, tier: 'legendary' },
  { id: 'money-rain', name: 'Money Rain', emoji: '💵', coins: 3000, tier: 'legendary' },
  { id: 'crystal', name: 'Crystal', emoji: '🔮', coins: 4000, tier: 'legendary' },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', coins: 5000, tier: 'legendary' },
  { id: 'phoenix', name: 'Phoenix', emoji: '🦅', coins: 8999, tier: 'legendary' },

  // Mythic (10000+)
  { id: 'planet', name: 'Planet', emoji: '🪐', coins: 10000, tier: 'mythic' },
  { id: 'shuttle', name: 'TikTok Shuttle', emoji: '🛸', coins: 20000, tier: 'mythic' },
  { id: 'corgi-drone', name: "Corgi's Drone Show", emoji: '🐶', coins: 20000, tier: 'mythic' },
  { id: 'sports-car', name: 'Golden Sports Car', emoji: '🏎️', coins: 29999, tier: 'mythic' },
  { id: 'leon-lion', name: 'Leon and Lion', emoji: '🦁', coins: 34000, tier: 'mythic' },
  { id: 'zeus', name: 'Zeus', emoji: '⚡', coins: 34000, tier: 'mythic' },
  { id: 'fire-phoenix', name: 'Fire Phoenix', emoji: '🐦‍🔥', coins: 41999, tier: 'mythic' },
  { id: 'universe', name: 'TikTok Universe', emoji: '🌠', coins: 44999, tier: 'mythic' },
]

export const giftById = (id: string) => GIFTS.find((g) => g.id === id)

export const GIFT_TIERS: { id: GiftTier; label: string }[] = [
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
  { id: 'legendary', label: 'Legendary' },
  { id: 'mythic', label: 'Mythic' },
]

export const TIER_COLORS: Record<GiftTier, string> = {
  rare: '#9aa0a6',
  epic: '#8b5cf6',
  legendary: '#f5b14c',
  mythic: '#ff5c5c',
}

// --- Live sources (TikTok / Twitch) ---

export type SourceKind = 'tiktok' | 'twitch'

export type SourceState = 'idle' | 'connecting' | 'connected' | 'error'

export interface SourceConfig {
  kind: SourceKind
  username: string
}

export interface SourceStatus {
  kind: SourceKind
  username: string
  state: SourceState
  message?: string
}

// Map a real TikTok gift (name + coins) onto our curated catalog: exact name match
// first, otherwise the catalog gift with the closest coin amount.
export function giftIdForTiktok(name: string, coins: number): string {
  const n = name.toLowerCase().trim()
  const exact = GIFTS.find((g) => g.name.toLowerCase() === n)
  if (exact) return exact.id
  let best = GIFTS[0]
  let bestDiff = Infinity
  for (const g of GIFTS) {
    const d = Math.abs(g.coins - coins)
    if (d < bestDiff) {
      bestDiff = d
      best = g
    }
  }
  return best.id
}

// --- Overlay widgets ---

export type WidgetId = 'alerts' | 'follower' | 'goal' | 'gifters'

export interface WidgetConfig {
  widgets: Record<WidgetId, boolean>
  goal: number
}

export const DEFAULT_WIDGETS: WidgetConfig = {
  widgets: { alerts: true, follower: false, goal: false, gifters: false },
  goal: 1000,
}

// A gift source without giftId matches any gift; a comment source without match
// matches any comment.
export type TriggerSource =
  | { type: 'gift'; giftId?: string }
  | { type: 'like' }
  | { type: 'follow' }
  | { type: 'share' }
  | { type: 'comment'; match?: string }
  | { type: 'join' }

export interface Trigger {
  source: TriggerSource
  action: string
}

export const MAX_TRIGGERS = 16

// --- Live-tunable settings ---

export type GameSetting =
  | { id: string; label: string; kind: 'number'; min: number; max: number; step: number; default: number }
  | { id: string; label: string; kind: 'toggle'; default: boolean }
  | { id: string; label: string; kind: 'select'; options: { value: string; label: string }[]; default: string }

export type GameSettings = Record<string, number | boolean | string>

export const defaultSettings = (settings: GameSetting[]): GameSettings => {
  const out: GameSettings = {}
  for (const s of settings) out[s.id] = s.default
  return out
}

export interface GameDef {
  id: string
  name: string
  description: string
  category: string
  emoji: string
  gradient: [string, string]
  actions: { id: string; label: string }[]
  settings: GameSetting[]
  defaultTriggers: Trigger[]
}

export const GAMES: GameDef[] = [
  {
    id: 'gift-drop',
    name: 'Gift Drop',
    category: 'Arcade',
    description: 'Gifts fall into the arena and pile up. The bigger the gift, the bigger the ball.',
    emoji: '🎁',
    gradient: ['#7c5cff', '#2a1f5e'],
    actions: [
      { id: 'drop', label: 'Drop in' },
      { id: 'rain', label: 'Heart rain' },
      { id: 'boost', label: 'Jump!' },
      { id: 'bomb', label: 'Bomb' },
    ],
    settings: [
      { id: 'gravity', label: 'Gravity', kind: 'number', min: 200, max: 2000, step: 50, default: 900 },
      { id: 'trails', label: 'Trails', kind: 'toggle', default: true },
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
  {
    id: 'mma-clash',
    name: 'MMA Clash',
    category: 'Fighting',
    description: 'Viewers join the red or blue corner and gift to land hits. Last fighter standing wins the round.',
    emoji: '🥊',
    gradient: ['#ff5c5c', '#2a0a1a'],
    actions: [
      { id: 'join-red', label: 'Join red' },
      { id: 'join-blue', label: 'Join blue' },
      { id: 'punch', label: 'Punch' },
      { id: 'heal', label: 'Heal' },
    ],
    settings: [
      { id: 'rounds', label: 'Rounds', kind: 'number', min: 1, max: 5, step: 1, default: 3 },
      { id: 'showNames', label: 'Show names', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'join' }, action: 'join-red' },
      { source: { type: 'join' }, action: 'join-blue' },
      { source: { type: 'gift' }, action: 'punch' },
      { source: { type: 'like' }, action: 'heal' },
    ],
  },
  {
    id: 'lunar-dash',
    name: 'Lunar Dash',
    category: 'Endless Runner',
    description: 'An endless runner where likes jump, gifts power up and comments spawn obstacles.',
    emoji: '🌙',
    gradient: ['#3ccf7a', '#0a2433'],
    actions: [
      { id: 'jump', label: 'Jump' },
      { id: 'power', label: 'Power-up' },
      { id: 'obstacle', label: 'Obstacle' },
      { id: 'speed', label: 'Boost speed' },
    ],
    settings: [
      { id: 'speed', label: 'Base speed', kind: 'number', min: 200, max: 700, step: 25, default: 360 },
      { id: 'night', label: 'Night mode', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'like' }, action: 'jump' },
      { source: { type: 'gift' }, action: 'power' },
      { source: { type: 'comment' }, action: 'obstacle' },
      { source: { type: 'share' }, action: 'speed' },
    ],
  },
  {
    id: 'trivia',
    name: 'Trivia',
    category: 'Quiz',
    description: 'Viewers answer multiple-choice questions by typing A, B, C or D in chat.',
    emoji: '❓',
    gradient: ['#f5b14c', '#3a2a0a'],
    actions: [
      { id: 'answer', label: 'Answer' },
      { id: 'skip', label: 'Skip question' },
    ],
    settings: [
      { id: 'seconds', label: 'Seconds per question', kind: 'number', min: 5, max: 60, step: 5, default: 20 },
      { id: 'questions', label: 'Questions per round', kind: 'number', min: 3, max: 12, step: 1, default: 5 },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'answer' }],
  },
  {
    id: 'word-guess',
    name: 'Word Guess',
    category: 'Quiz',
    description: 'Viewers guess the hidden word by typing it (or single letters) in chat.',
    emoji: '🔤',
    gradient: ['#3ccf7a', '#0a2a1a'],
    actions: [{ id: 'answer', label: 'Guess' }],
    settings: [
      { id: 'seconds', label: 'Seconds per word', kind: 'number', min: 10, max: 90, step: 5, default: 45 },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'answer' }],
  },
  {
    id: 'word-swipe',
    name: 'Word Swipe',
    category: 'Quiz',
    description: 'A wheel of letters: viewers type any word they can build from it (Zen Word style).',
    emoji: '🌀',
    gradient: ['#3ccf7a', '#0a2a1a'],
    actions: [{ id: 'guess', label: 'Guess word' }],
    settings: [
      { id: 'seconds', label: 'Seconds per round', kind: 'number', min: 20, max: 120, step: 5, default: 60 },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'four-pics',
    name: '4 Pics 1 Word',
    category: 'Quiz',
    description: 'Four pictures, one common word: viewers type the answer in chat.',
    emoji: '🖼️',
    gradient: ['#f5b14c', '#3a2a0a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'seconds', label: 'Seconds per puzzle', kind: 'number', min: 10, max: 90, step: 5, default: 30 },
      {
        id: 'imageProvider',
        label: 'Image source',
        kind: 'select',
        default: 'loremflickr',
        options: [
          { value: 'loremflickr', label: 'Foto reali (LoremFlickr)' },
          { value: 'unsplash', label: 'Foto Unsplash' },
          { value: 'picsum', label: 'Foto stock (Picsum)' },
          { value: 'twemoji', label: 'Emoji (Twemoji)' },
          { value: 'placehold', label: 'Testo (Placehold)' },
        ],
      },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'picwords',
    name: 'Picwords 2',
    category: 'Quiz',
    description: 'A picture, one word: viewers guess it in chat.',
    emoji: '🧩',
    gradient: ['#3ccf7a', '#0a2a1a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'seconds', label: 'Seconds per picture', kind: 'number', min: 10, max: 90, step: 5, default: 30 },
      { id: 'wordsPerRound', label: 'Words per round', kind: 'number', min: 1, max: 5, step: 1, default: 3 },
      {
        id: 'imageProvider',
        label: 'Image source',
        kind: 'select',
        default: 'loremflickr',
        options: [
          { value: 'loremflickr', label: 'Foto reali (LoremFlickr)' },
          { value: 'unsplash', label: 'Foto Unsplash' },
          { value: 'picsum', label: 'Foto stock (Picsum)' },
          { value: 'twemoji', label: 'Emoji (Twemoji)' },
          { value: 'placehold', label: 'Testo (Placehold)' },
        ],
      },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'wow-guru',
    name: 'Words of Wonders: Guru',
    category: 'Quiz',
    description: 'Find every hidden word from the letters to complete the crossword board.',
    emoji: '🌍',
    gradient: ['#4cc3ff', '#0a1a3a'],
    actions: [{ id: 'guess', label: 'Find word' }],
    settings: [
      { id: 'seconds', label: 'Seconds per round', kind: 'number', min: 20, max: 120, step: 5, default: 60 },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
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
    case 'comment':
      return source.match ? { icon: '💬', label: `"${source.match}"` } : { icon: '💬', label: 'Any comment' }
    case 'join':
      return { icon: '👋', label: 'Join' }
  }
}

export function sourceMatches(source: TriggerSource, event: LiveEvent) {
  if (source.type !== event.type) return false
  if (source.type === 'gift' && source.giftId) return event.type === 'gift' && event.giftId === source.giftId
  if (source.type === 'comment' && source.match)
    return event.type === 'comment' && event.text.toLowerCase().includes(source.match.toLowerCase())
  return true
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

// --- DJ Pad ---

export type DjSoundKind = 'builtin' | 'url'

export interface DjSound {
  id: string
  label: string
  emoji: string
  kind: DjSoundKind
  url?: string
}

// Built-in sounds are synthesized in the overlay with the Web Audio API, so there
// are no binary assets to ship. Custom URLs are relayed as-is.
export const DJ_SOUNDS: DjSound[] = [
  { id: 'airhorn', label: 'Air horn', emoji: '📢', kind: 'builtin' },
  { id: 'coin', label: 'Coin', emoji: '🪙', kind: 'builtin' },
  { id: 'hit', label: 'Hit', emoji: '💥', kind: 'builtin' },
  { id: 'pop', label: 'Pop', emoji: '🎈', kind: 'builtin' },
  { id: 'riser', label: 'Riser', emoji: '🚀', kind: 'builtin' },
  { id: 'wow', label: 'Wow', emoji: '😱', kind: 'builtin' },
]

export const djSoundById = (id: string) => DJ_SOUNDS.find((s) => s.id === id)

export interface DjPlay {
  soundId?: string
  url?: string
}

// --- Socket.IO contract ---

export interface SessionState {
  gameId: string
  triggers: Trigger[]
  settings: GameSettings
  widgets: Record<WidgetId, boolean>
  goal: number
}

export interface ServerToClientEvents {
  'session:state': (state: SessionState) => void
  'live:event': (event: LiveEvent) => void
  'dj:play': (play: DjPlay) => void
  'source:status': (status: SourceStatus) => void
  'ranking:update': (ranking: Gifter[]) => void
}

export interface ClientToServerEvents {
  'sim:event': (event: LiveEvent) => void
  'game:select': (gameId: string) => void
  'triggers:set': (triggers: Trigger[]) => void
  'settings:set': (settings: GameSettings) => void
  'dj:play': (play: DjPlay) => void
  'source:connect': (config: SourceConfig) => void
  'source:disconnect': (kind: SourceKind) => void
  'scene:set': (scene: Partial<WidgetConfig>) => void
}

export type ClientType = 'dashboard' | 'overlay'

export interface HandshakeAuth {
  clientType: ClientType
  key: string
}

export const isValidKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(key)
