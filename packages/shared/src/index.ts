// Types and catalogs shared by the server, the dashboard and the overlay.
import type { WordAssociationRoundReport } from './wordAssociation.js'
import { CONTEXT_COLOR_STOPS, CONTEXT_COLOR_MAX } from './context.js'
export { CONTEXT_LIMITS, CONTEXT_COLORS, CONTEXT_COLOR_STOPS, CONTEXT_COLOR_MAX, normalizeContextColors, ContextError, type ContextErrorKind } from './context.js'
export { payloadBytes } from './threadBudget.js'
export { BodyLimitError, readBoundedBytes } from './httpBody.js'
export * from './contextTournament.js'
export * from './contextSemantic.js'
export * from './contextProfiles.js'
export * from './taboo.js'
export * from './wordhunt.js'
import type { ContextSemanticState } from './contextSemantic.js'
export { pickSecret } from './secretPick.js'
import type { ContextTournamentAdmin, ContextTournamentState, TournamentCommand, TournamentReply, TournamentRow, TournamentSummary } from './contextTournament.js'
import { TABOO_RULES, type TabooAdminState, type TabooCommand, type TabooPublicState, type TabooReply } from './taboo.js'
import { WORDHUNT_RULES, WORDHUNT_SIZES, WORDHUNT_SIZE_DEFAULT, type WordHuntSize, type WordHuntAdminState, type WordHuntCommand, type WordHuntPublicState, type WordHuntReply } from './wordhunt.js'

export {
  WORD_ASSOCIATION_MAX_WORDS,
  WORD_ASSOCIATION_MIN_WORDS,
  WORD_ASSOCIATION_WRONG_SENT,
  answerKey,
  drawAnswers,
  drawPuzzle,
  guessKey,
  inflections,
  isWordAssociationPool,
  isWordAssociationPuzzle,
  type WordAssociationAnswer,
  type WordAssociationPool,
  type WordAssociationPos,
  type WordAssociationPuzzle,
  type WordAssociationRoundReport,
} from './wordAssociation.js'
export {
  CHAIN_MODES,
  ROOM_SECRET,
  ROOM_SECRET_MAX,
  chainModeFor,
  chainModeLabel,
  chainSecret,
  parseChainSecret,
  type ChainMode,
  type ChainRound,
} from './chainReaction.js'

export interface Viewer {
  id: string
  nickname: string
  avatar?: string
  // Only when the source says so (TikTok's follow status and subscription badge): a game can be
  // restricted to followers or to the fan club. `host` is the streamer, who may always play.
  follower?: boolean
  fan?: boolean
  host?: boolean
  moderator?: boolean // a moderator of the channel (ZeroFollowerBot sends it only when true): "!next" ends the round
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

// The TikTok and Twitch names last entered for this room, kept for the next lives.
export type SavedSources = Partial<Record<SourceKind, string>>

// ZeroFollowerBot's event bridge: ZeroFollowerBot, on this PC, already reads the TikTok live (through Euler
// Stream) and the Twitch chat, and repeats them on a local port; Zerocade listens there instead of opening its own
// connections. The port is ZeroFollowerBot's (Account tab, "Zerocade").
export const BRIDGE_DEFAULT_PORT = 8780

export interface BridgeConfig {
  enabled: boolean
  port: number
}

export interface BridgeStatus extends BridgeConfig {
  // 'connecting' also while ZeroFollowerBot is closed: Zerocade keeps trying.
  state: 'off' | 'connecting' | 'connected'
  // Why it is not connected, in the dashboard's language.
  message?: string
  // The accounts ZeroFollowerBot is reading now ('' = none).
  tiktok: string
  twitch: string
}

// Where a live event came from: a real feed, or the dashboard's simulator.
export type EventOrigin = SourceKind | 'sim'

// One line of the dashboard's chat and events box.
export interface FeedEvent {
  seq: number
  // ms epoch.
  at: number
  origin: EventOrigin
  event: LiveEvent
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

export type WidgetId = 'alerts' | 'joins' | 'follower' | 'goal' | 'gifters'

// Messages shown one at a time on the overlay, in turn, one every `intervalSec` seconds (decided 15/11/2026).
// Centre of a box on the overlay, in % of its width (x) and height (y).
export interface BoxPos {
  x: number
  y: number
}

export interface TickerConfig {
  enabled: boolean
  intervalSec: number
  messages: string[]
  // Where the creator dragged the rotating-message box and the dashboard's message box in the preview.
  // Missing or null: the default place.
  tickerPos?: BoxPos | null
  messagePos?: BoxPos | null
}

export const TICKER_LIMITS = { intervalMin: 5, intervalMax: 3600, maxMessages: 20, maxLength: 140, showSec: 8 } as const

export const DEFAULT_TICKER: TickerConfig = { enabled: false, intervalSec: 30, messages: [] }

export interface WidgetConfig {
  widgets: Record<WidgetId, boolean>
  goal: number
  ticker: TickerConfig
}

export const DEFAULT_WIDGETS: WidgetConfig = {
  // Every widget starts off. `alerts`: gifts, follows, likes and shares over the game (never the viewers' messages);
  // `joins` adds the "X joined" ones (a busy live fills the screen with them).
  widgets: { alerts: false, joins: false, follower: false, goal: false, gifters: false },
  goal: 1000,
  ticker: DEFAULT_TICKER,
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

// `group` puts a setting under a sub-heading in the dashboard, `hint` explains it, `when`
// shows it (indented) only while another setting has the given value.
// A 'multi' value is a comma-separated list of option values, '' meaning all of them;
// an 'image' value is the URL of an image uploaded to the server, '' meaning none.
type SettingBase = {
  id: string
  label: string
  group?: string
  hint?: string
  when?: { id: string; value: number | boolean | string }
}

export type GameSetting = SettingBase &
  (
    | { kind: 'number'; min: number; max: number; step: number; default: number }
    | { kind: 'toggle'; default: boolean }
    | { kind: 'select'; options: { value: string; label: string }[]; default: string }
    | { kind: 'multi'; options: { value: string; label: string }[]; default: string }
    | { kind: 'color'; default: string }
    | { kind: 'image'; default: string }
  )

export type GameSettings = Record<string, number | boolean | string>

// A setting with `when` shows only while the setting it depends on has that value (its saved
// value, or its default).
export function settingVisible(setting: GameSetting, all: GameSetting[], values: GameSettings): boolean {
  if (!setting.when) return true
  const parent = all.find((s) => s.id === setting.when?.id)
  return (values[setting.when.id] ?? parent?.default) === setting.when.value
}

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
  // `help`: the action helps the players (a letter, a closer word, a 50:50, more time…), so the "Aiuti dal pubblico"
  // switches can stop the live's gifts, likes, follows… from triggering it.
  actions: { id: string; label: string; help?: boolean }[]
  settings: GameSetting[]
  defaultTriggers: Trigger[]
}

// --- Bivio ("Preferiresti…?") ---
// Shown as ZeroDubbi; the code, the saved settings and the database still say bivio.
// The one server-driven game: the server picks the dilemma, counts the A/B votes from
// chat (once per room, however many overlays are open) and stores them in SQLite.
// The overlay and the dashboard only render the BivioState it sends.

export type BivioLang = 'it' | 'en'
export type BivioChoice = 'a' | 'b'

export interface BivioCategory {
  id: string
  it: string
  en: string
  colors: [string, string]
}

// Same ids and colours as gioco-dilemmi/script/make_category_assets.py.
export const BIVIO_CATEGORIES: BivioCategory[] = [
  { id: 'cibo', it: 'Cibo', en: 'Food', colors: ['#ffb547', '#f97316'] },
  { id: 'soldi', it: 'Soldi', en: 'Money', colors: ['#4ade80', '#15803d'] },
  { id: 'fantasia', it: 'Fantasia', en: 'Fantasy', colors: ['#c084fc', '#7e22ce'] },
  { id: 'sopravvivenza', it: 'Sopravvivenza', en: 'Survival', colors: ['#a3a36b', '#4d5b2a'] },
  { id: 'viaggi', it: 'Viaggi', en: 'Travel', colors: ['#38bdf8', '#0369a1'] },
  { id: 'scuola_lavoro', it: 'Scuola e lavoro', en: 'School & work', colors: ['#94a3b8', '#334155'] },
  { id: 'social_tech', it: 'Social e tech', en: 'Social & tech', colors: ['#f472b6', '#be185d'] },
  { id: 'sport', it: 'Sport', en: 'Sports', colors: ['#fb7185', '#b91c1c'] },
  { id: 'tempo', it: 'Tempo', en: 'Time', colors: ['#fcd34d', '#b45309'] },
  { id: 'amici_famiglia', it: 'Amici e famiglia', en: 'Friends & family', colors: ['#5eead4', '#0f766e'] },
  { id: 'dilemmi', it: 'Dilemmi', en: 'Dilemmas', colors: ['#818cf8', '#3730a3'] },
  { id: 'assurde', it: 'Assurde', en: 'Absurd', colors: ['#facc15', '#ea580c'] },
]

export const bivioCategoryById = (id: string) => BIVIO_CATEGORIES.find((c) => c.id === id)

export interface BivioTally {
  a: number
  b: number
}

export interface BivioVoter {
  // The viewer's id: stable across rounds and side changes, so the overlay can tell a new
  // voter from one it already shows.
  id: string
  nickname: string
  avatar?: string
  choice: BivioChoice
}

// How many voters each option keeps for the overlay's avatar bubbles.
export const BIVIO_CROWD_SIZE = 12

export interface BivioState {
  // 'break' is the pause between a result and the next dilemma; 'empty' when no
  // dilemma matches the chosen language, categories and difficulty.
  phase: 'voting' | 'reveal' | 'break' | 'empty'
  paused: boolean
  lang: BivioLang
  roundId: string
  // `flagged`: marked as wrong from the dashboard (it will not come back).
  question: { id: string; category: string; difficulty: string; a: string; b: string; flagged: boolean } | null
  // Questions marked as wrong so far, saved in data/bivio-domande-sbagliate.csv.
  flagged: number
  votes: BivioTally
  // Every vote ever stored for this dilemma, across all lives; sent with the reveal.
  allTime: BivioTally | null
  // Time left in the current phase when the state was sent; 0 with no timer running.
  remainingMs: number
  durationMs: number
  liveCounts: boolean
  voters: BivioVoter[]
  // The latest voters on each side, newest first: one avatar bubble each in that option.
  crowd: Record<BivioChoice, BivioVoter[]>
  played: number
}

// 'flag' / 'unflag' mark the question in play as wrong, or take the mark back.
export type BivioCommand = 'next' | 'reveal' | 'extra-time' | 'pause' | 'resume' | 'restart' | 'flag' | 'unflag'

// Default look, taken from gioco-dilemmi/assets: with these values the overlay uses the
// game's own artwork instead of flat colours.
export const BIVIO_DEFAULT_COLORS = { a: '#2dd4bf', b: '#a78bfa', accent: '#ffffff', text: '#ffffff', background: '#0b0c18' }

// Games whose look can take an uploaded background image (an 'image' setting).
export const BACKGROUND_GAMES = ['zerodubbi', 'incastro', 'quizzland'] as const
export type BackgroundGame = (typeof BACKGROUND_GAMES)[number]

// Path the server hosts a room's uploaded background at, for one of those games.
export const backgroundPath = (game: BackgroundGame, key: string) => `/api/${game}/background/${key}`
export const bivioBackgroundPath = (key: string) => backgroundPath('zerodubbi', key)

export interface BivioQuestionStats {
  id: string
  category: string
  a: string
  b: string
  votesA: number
  votesB: number
  rounds: number
}

export interface BivioStats {
  totalVotes: number
  questions: BivioQuestionStats[]
}

// --- Incastro (letter wheel and crossword) ---
// Shown as ZeroWords; the code, the saved settings and the database still say incastro.
// Server-driven like Bivio: the server holds the level, checks the words typed in chat
// and saves how far each overlay key has got. Levels, chapters and artwork come from
// gioco-parole/ (generated from a free Italian dictionary by its tools/). Italian only.

export interface IncastroPlayer {
  id: string
  nickname: string
  avatar?: string
}

export interface IncastroScore extends IncastroPlayer {
  points: number
  words: number
  // The longest word this player found in the level in play (grid, extra or secret), in the
  // live's ranking too; null when they have found none in it yet.
  levelLongest: string | null
}

export interface IncastroWord {
  r: number
  c: number
  d: 'H' | 'V'
  length: number
  // Null until the word is on the board: found by a viewer (`by`), completed by hints
  // (`by` null), or shown in grey when the time ran out (`missed`).
  text: string | null
  by: IncastroPlayer | null
  missed: boolean
}

// What just happened, for the overlay's animations and feed; `seq` grows with each one.
export type IncastroMoment = { seq: number } & (
  | { kind: 'found'; word: string; by: IncastroPlayer; points: number; full: boolean }
  | { kind: 'extra'; word: string; by: IncastroPlayer; points: number }
  | { kind: 'secret'; word: string; by: IncastroPlayer; points: number }
  | { kind: 'repeat'; word: string; by: IncastroPlayer }
  | { kind: 'hint'; by: IncastroPlayer | null }
  | { kind: 'reveal'; word: string; by: IncastroPlayer | null }
  | { kind: 'shuffle'; by: IncastroPlayer | null }
)

// The longest word found this live, grid or extra; at equal length the first finder keeps it.
export interface IncastroRecord {
  word: string
  by: IncastroPlayer
}

export interface IncastroChapter {
  id: number
  name: string
  accent: string
  // File name in gioco-parole/assets/backgrounds.
  background: string
  levelInChapter: number
  size: number
}

// The three grids of a level (DDA): easier, as generated, harder.
export type IncastroVariant = 'easy' | 'standard' | 'expert'

// How the chat did on a level, for DDA: it needs an easier grid, a harder one, the same, or
// nobody played (no signal).
export type IncastroOutcome = 'easier' | 'harder' | 'steady' | 'idle'

export interface IncastroState {
  // 'intro' shows the new level's background alone for a few seconds, before the grid;
  // 'complete' is the summary between levels; 'loading' while the level is being generated;
  // 'empty' when no level can be made (the generator's files are missing).
  phase: 'intro' | 'playing' | 'complete' | 'loading' | 'empty'
  paused: boolean
  // Levels never run out: they are generated as the game gets to them.
  level: number
  // The grid in play, and the one the next level will use (while playing: the one this
  // level asked for, when its wheel has no such variant and the standard one is played).
  variant: IncastroVariant
  nextVariant: IncastroVariant
  // DDA: how the chat did on the last level finished, and how many levels in a row went that
  // way; the grid changes after ddaNeeded alike.
  ddaOutcome: IncastroOutcome | null
  ddaStreak: number
  ddaNeeded: number
  // Simulated difficulty of the grid in play and its target, 0..100.
  difficulty: { target: number; dsim: number } | null
  // NASA's Image of the Day behind this level, when the background is 'nasa'.
  photo: NasaPhoto | null
  // The next level's picture, for the overlay to load ahead of time.
  nextPhoto: string | null
  chapter: IncastroChapter
  // The wheel in its current order; `shuffles` counts this level's shuffles.
  letters: string
  shuffles: number
  rows: number
  cols: number
  // One string per row: '.' no cell, '_' hidden, lower case shown by a hint, upper case
  // found (or missed: see the words).
  grid: string[]
  words: IncastroWord[]
  extrasFound: number
  extrasTotal: number
  // Newest first.
  moments: IncastroMoment[]
  // This live (since the game was picked), and this level only.
  scores: IncastroScore[]
  levelScores: IncastroScore[]
  longest: IncastroRecord | null
  // The level's secret word: from the wheel, never in the grid, a new length each level.
  // `word` stays null until someone finds it or the level ends.
  secret: { length: number; word: string | null; by: IncastroPlayer | null } | null
  // Level timer while playing (0 = no limit), summary countdown when complete, the
  // background's seconds in the intro.
  remainingMs: number
  durationMs: number
  // Until the next automatic hint; 0 when off or not playing.
  hintInMs: number
  timeUp: boolean
  // The level just finished closed its chapter: the garden grows.
  chapterDone: boolean
}

// Sent to the dashboard only, for the control column and the simulator.
export interface IncastroSolution {
  level: number
  words: string[]
  extras: string[]
  secret: string | null
}

export type IncastroCommand =
  | 'next'
  | 'prev'
  | 'hint'
  | 'reveal-word'
  | 'shuffle'
  | 'extra-time'
  | 'pause'
  | 'resume'
  | 'replay'
  | 'restart'
  | 'clear-scores'

// --- Quizzland (intelligence quiz) ---
// Shown as ZeroQuizz; the code, the saved settings and the database still say quizzland.
// Server-driven like Bivio: the server deals the question, takes each viewer's first answer
// (A-D, or 1-4) from chat, scores it at the reveal and stores every answer in SQLite. The
// questions come from database/ZeroQuizz.sqlite3. Italian only.

export interface QuizzlandCategory {
  id: string
  label: string
  colors: [string, string]
}

// The categories of database/ZeroQuizz.sqlite3 (table categorie); one missing here still plays, with a neutral chip.
export const QUIZZLAND_CATEGORIES: QuizzlandCategory[] = [
  { id: 'logica', label: 'Logica', colors: ['#60a5fa', '#4338ca'] },
  { id: 'numeri', label: 'Numeri', colors: ['#fbbf24', '#ea580c'] },
  { id: 'trabocchetti', label: 'Trabocchetti', colors: ['#f472b6', '#9333ea'] },
  // General knowledge from open sources, translated (gioco-quizzland/data/fonti): Open Trivia
  // Database, The Trivia API (not active: non-commercial licence), OpenBookQA (not active).
  { id: 'cultura', label: 'Cultura', colors: ['#34d399', '#0f766e'] },
  { id: 'curiosita', label: 'Curiosità', colors: ['#fb923c', '#be123c'] },
  { id: 'scienze', label: 'Scienze', colors: ['#22d3ee', '#1d4ed8'] },
]

export const quizzlandCategoryById = (id: string) => QUIZZLAND_CATEGORIES.find((c) => c.id === id)

// The answers' letters, in the order the overlay shows them.
export const QUIZZLAND_LETTERS = ['A', 'B', 'C', 'D'] as const

export interface QuizzlandPlayer {
  id: string
  nickname: string
  avatar?: string
}

export interface QuizzlandScore extends QuizzlandPlayer {
  points: number
  // Right answers this live, and in a row (an answer wrong or missed resets it).
  correct: number
  streak: number
  // Points won on the question last revealed.
  last: number
}

// One of the first right answers of a question: how long it took and what it was worth.
export interface QuizzlandFast extends QuizzlandPlayer {
  ms: number
  points: number
}

export interface QuizzlandState {
  // 'question' takes answers; 'reveal' shows the right one; 'break' the leaderboard before the
  // next question; 'empty' when no question matches the filters.
  phase: 'question' | 'reveal' | 'break' | 'empty'
  paused: boolean
  roundId: string
  // Questions asked since the game was picked (or restarted), and how many there are to ask.
  number: number
  available: number
  // `options` in the order shown (shuffled each round unless the question keeps its order);
  // `flagged`: marked as wrong from the dashboard (it will not come back).
  question: { id: string; category: string; difficulty: number; text: string; options: string[]; flagged: boolean } | null
  // From the reveal on: the right option (an index of `options`) and why.
  correct: number | null
  explanation: string | null
  // 50:50: the options taken out, and who did it (null from the dashboard).
  eliminated: number[]
  fiftyBy: QuizzlandPlayer | null
  answered: number
  // Answers per option, from the reveal on (or live with "liveCounts"); null otherwise.
  counts: number[] | null
  // The latest viewers who answered, newest first; nothing about what they answered.
  answerers: QuizzlandPlayer[]
  // From the reveal on: how many got it right, and the fastest of them.
  right: number
  fastest: QuizzlandFast[]
  // The live's leaderboard. It changes only at the reveal, so it never gives the answer away.
  scores: QuizzlandScore[]
  remainingMs: number
  durationMs: number
  // Questions marked as wrong so far.
  flagged: number
}

// Sent to the dashboard only, as each question starts: the right option, for the streamer.
export interface QuizzlandSolution {
  roundId: string
  correct: number
}

export type QuizzlandCommand =
  | 'next'
  | 'reveal'
  | 'extra-time'
  | 'fifty'
  | 'pause'
  | 'resume'
  | 'restart'
  | 'clear-scores'
  | 'flag'
  | 'unflag'

export interface QuizzlandQuestionStats {
  id: string
  category: string
  text: string
  answer: string
  // Rounds with at least one answer, answers, and how many were right.
  rounds: number
  answers: number
  correct: number
}

export interface QuizzlandStats {
  totalAnswers: number
  questions: QuizzlandQuestionStats[]
}

// Settings of every game: who may play, and whose words ZeroFollowerBot's voice reads. They come from the
// TikTok connection (or the bridge), which says whether a viewer follows or is in the fan club; a game that
// defines the same id keeps its own.
const VOICE_HINT = 'La voce di ZeroFollowerBot salta i commenti di chi il ponte dice che non segue il profilo (e non è del fan club). Chi non è noto viene letto.'
export const COMMON_SETTINGS: GameSetting[] = [
  {
    id: 'audience',
    label: 'Chi può giocare',
    kind: 'select',
    default: 'all',
    group: 'Chat',
    options: [
      { value: 'all', label: 'Tutti' },
      { value: 'followers', label: 'Solo i follower' },
      { value: 'fans', label: 'Solo il fan club' },
    ],
    hint: 'I commenti di chi non rientra vengono ignorati dal gioco. Conta chi scrive dopo il collegamento TikTok, che dice se segue il profilo o ha il badge del fan club (abbonamento): se non lo sa, il commento non vale. Chi segue durante la diretta vale subito come follower, anche prima che TikTok lo dica. Lo streamer gioca sempre.',
  },
  { id: 'voiceFollowersOnly', label: 'Voce solo ai follower', kind: 'toggle', default: false, group: 'Chat', hint: VOICE_HINT },
  {
    id: 'voiceSkipAnswers',
    label: 'Voce: non leggere le risposte',
    kind: 'toggle',
    default: false,
    group: 'Chat',
    hint: 'La voce di ZeroFollowerBot non legge i commenti che il gioco prende come risposte. ZeroWordle: tutti i tentativi. ZeroContext: le parole singole a round finito. ZeroTaboo: i commenti con una carta aperta. ZeroWordHunt: i commenti a round in corso. Gli altri giochi: i commenti che attivano un’azione “risposta”. Spento, la voce legge anche le risposte.',
  },
]
// The games whose answers the voice never read before this was a setting: they keep that, on, until it is switched off.
const VOICE_SKIPS_ANSWERS = new Set(['zerowordle', 'context', 'zerotaboo'])

// NASA's Image of the Day behind a game (GET /api/nasa: the latest few dozen pictures of the feed). The picture
// in view comes from the clock and that list, so the dashboard preview and the stream show the same one, and it
// changes every `photoMinutes`.
export interface NasaPhoto {
  url: string
  title: string
  link: string
}

const PHOTO_MINUTES = (when: { id: string; value: string | boolean }, group: string): GameSetting => ({
  id: 'photoMinutes',
  label: 'Cambia foto ogni (minuti)',
  group,
  kind: 'number',
  min: 1,
  max: 60,
  step: 1,
  default: 3,
  when,
})

// The picture in view at `now`: the same in every overlay of the PC for the same list.
export function nasaPhotoAt(photos: NasaPhoto[], minutes: number, now: number): NasaPhoto | null {
  if (!photos.length) return null
  const slot = Math.floor(now / (Math.max(1, minutes) * 60_000))
  return photos[slot % photos.length]
}

// The canvas games' background: until now always the plain dark page.
const PHOTO_BACKGROUND: GameSetting[] = [
  {
    id: 'background',
    label: 'Sfondo',
    group: 'Aspetto',
    kind: 'select',
    default: 'nasa',
    options: [
      { value: 'nasa', label: 'Foto NASA del giorno' },
      { value: 'dark', label: 'Scuro' },
    ],
    hint: 'Una delle ultime foto «Image of the Day» della NASA, scurita perché il gioco resti leggibile. Senza internet resta lo sfondo scuro.',
  },
  PHOTO_MINUTES({ id: 'background', value: 'nasa' }, 'Aspetto'),
]
// Games whose own scene fills the screen and would hide the picture (Lunar Dash's sky, Guess the Location's
// panorama), and the ones with background settings of their own (ZeroDubbi, ZeroQuizz, ZeroWords).
const OWN_BACKGROUND = new Set(['lunar-dash', 'guess-location', 'zerodubbi', 'quizzland', 'incastro'])
// Whether the overlay puts the shared background (PHOTO_BACKGROUND) behind this game's canvas.
export const sharesPhotoBackground = (gameId: string) => !OWN_BACKGROUND.has(gameId)

const GAME_DEFS: GameDef[] = [
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
  {
    id: 'zerowordle',
    name: 'ZeroWordle',
    category: 'Quiz',
    description: 'La chat indovina insieme una parola di 5 lettere: ogni parola scritta è una riga di tessere verdi, oro e grigie.',
    emoji: '🟩',
    gradient: ['#3e8bff', '#0a1a3a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_letter', label: 'Rivela lettera', help: true },
      { id: 'find_letter', label: 'Trova lettera', help: true },
      { id: 'rule_out', label: 'Escludi lettera', help: true },
    ],
    settings: [
      {
        id: 'wordLength',
        label: 'Lunghezza della parola',
        kind: 'select',
        default: '5',
        options: [
          { value: '5', label: '5 lettere' },
          { value: '6', label: '6 lettere' },
          { value: '7', label: '7 lettere' },
          { value: '8', label: '8 lettere' },
          { value: 'mix', label: 'A caso (da 5 a 8)' },
        ],
        hint: 'Cambia dalla parola successiva. Con "A caso" ogni round sceglie una lunghezza.',
      },
      { id: 'maxGuesses', label: 'Tentativi per parola (0 = senza limite)', kind: 'number', min: 0, max: 12, step: 1, default: 6, hint: 'Finiti i tentativi senza trovarla, il round si chiude e la parola viene svelata.' },
      { id: 'roundMode', label: 'Modalità', kind: 'select', default: 'untimed', options: [{ value: 'untimed', label: 'Senza tempo' }, { value: 'timed', label: 'A tempo' }] },
      { id: 'roundSeconds', label: 'Secondi per parola', kind: 'number', min: 60, max: 1800, step: 30, default: 180, when: { id: 'roundMode', value: 'timed' } },
      { id: 'breakSeconds', label: 'Secondi prima della prossima parola', kind: 'number', min: 3, max: 20, step: 1, default: 6 },
      { id: 'autoHints', label: 'Suggerimenti automatici', kind: 'toggle', default: true },
      { id: 'autoHintSeconds', label: 'Secondi tra aiuti', kind: 'number', min: 20, max: 300, step: 10, default: 60, when: { id: 'autoHints', value: true } },
      { id: 'maxRevealed', label: 'Lettere rivelate max', kind: 'number', min: 1, max: 4, step: 1, default: 3 },
      { id: 'pointsPerGreen', label: 'Punti per una nuova lettera verde', kind: 'number', min: 0, max: 10, step: 1, default: 2, hint: 'Si guadagna solo ciò che il tentativo scopre di nuovo: ripetere lettere già note non dà punti.' },
      { id: 'pointsPerGold', label: 'Punti per una nuova lettera oro', kind: 'number', min: 0, max: 10, step: 1, default: 1 },
      { id: 'solveBonus', label: 'Bonus parola trovata', kind: 'number', min: 0, max: 100, step: 5, default: 15 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_letter' },
    ],
  },
  {
    id: 'zeroreazioniacatena',
    name: 'ZeroReazioniACatena',
    category: 'Quiz',
    description: 'Parole associate in tre modalità che si danno il cambio: Effetto domino, Catena completa e Parola chiave.',
    emoji: '⛓️',
    gradient: ['#ff9a3c', '#3a0a2a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_letter', label: 'Rivela lettera o indizio', help: true },
      { id: 'reveal_word', label: 'Rivela parola', help: true },
    ],
    settings: [
      {
        id: 'chainMode',
        label: 'Modalità',
        kind: 'select',
        default: 'rotate',
        options: [
          { value: 'rotate', label: 'Alternate: Effetto domino → Catena completa → Parola chiave' },
          { value: 'domino', label: 'Solo Effetto domino' },
          { value: 'catena', label: 'Solo Catena completa' },
          { value: 'chiave', label: 'Solo Parola chiave' },
        ],
        hint: 'Effetto domino: le parole vanno trovate in ordine. Catena completa: in qualunque ordine. Parola chiave: una parola legata a tutti gli indizi.',
      },
      { id: 'roundsPerMode', label: 'Round per modalità', kind: 'number', min: 1, max: 20, step: 1, default: 5, when: { id: 'chainMode', value: 'rotate' }, hint: 'Dopo questi round si passa alla modalità successiva.' },
      { id: 'chainLength', label: 'Parole nella catena', kind: 'number', min: 4, max: 9, step: 1, default: 6, hint: 'Effetto domino e Catena completa, partenza compresa. Cambia dalla catena successiva.' },
      {
        id: 'givenWords',
        label: 'Parole date (Catena completa)',
        kind: 'select',
        default: 'ends',
        options: [
          { value: 'ends', label: 'Partenza e arrivo' },
          { value: 'first', label: 'Solo la partenza' },
        ],
      },
      { id: 'roundSeconds', label: 'Secondi per round (0 = senza limite)', kind: 'number', min: 0, max: 600, step: 10, default: 120 },
      { id: 'breakSeconds', label: 'Secondi prima del prossimo round', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'autoHints', label: 'Aiuti automatici', kind: 'toggle', default: true, hint: 'Ogni tanto compare una lettera in più (in Parola chiave prima un indizio, poi le lettere).' },
      { id: 'autoHintSeconds', label: 'Secondi tra un aiuto e l\'altro', kind: 'number', min: 5, max: 120, step: 5, default: 20, when: { id: 'autoHints', value: true } },
      { id: 'wordPoints', label: 'Punti per una parola della catena', kind: 'number', min: 0, max: 200, step: 5, default: 20 },
      { id: 'letterPenalty', label: 'Punti persi per ogni lettera mostrata', kind: 'number', min: 0, max: 20, step: 1, default: 2, hint: 'Più lettere sono già visibili, meno vale la parola (mai meno di 1).' },
      { id: 'chainBonus', label: 'Bonus catena completata', kind: 'number', min: 0, max: 500, step: 5, default: 30 },
      { id: 'keyPoints', label: 'Punti per la parola chiave', kind: 'number', min: 0, max: 500, step: 5, default: 60, hint: 'Con i primi due indizi e la prima lettera; ogni indizio o lettera in più ne toglie un po\'.' },
      { id: 'keyPenalty', label: 'Punti persi per ogni indizio o lettera in più', kind: 'number', min: 0, max: 50, step: 1, default: 6 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_letter' },
    ],
  },
  {
    id: 'find-the-word',
    name: 'Find the Word',
    category: 'Quiz',
    description: 'Il prefisso della parola nascosta cresce a ogni tentativo: indovina la parola completa.',
    emoji: '🔎',
    gradient: ['#4cc3ff', '#0a1a3a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_letter', label: 'Rivela lettera', help: true },
    ],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per parola', kind: 'number', min: 10, max: 60, step: 1, default: 24 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 3 },
      { id: 'basePointsPerLetter', label: 'Punti per lettera', kind: 'number', min: 1, max: 20, step: 1, default: 1 },
      { id: 'fullMatchBonus', label: 'Bonus parola intera', kind: 'number', min: 0, max: 100, step: 5, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_letter' },
    ],
  },
  {
    id: 'true-or-false',
    name: 'True or False',
    category: 'Quiz',
    description: 'Giudica l’affermazione con V (vero) o F (falso); la rivelazione mostra la spiegazione.',
    emoji: '✅',
    gradient: ['#1e6bff', '#0a1a3a'],
    actions: [
      { id: 'answer', label: 'Answer' },
      { id: 'skip_statement', label: 'Salta' },
      { id: 'extra_time', label: 'Tempo extra', help: true },
      { id: 'spotlight', label: 'Riflettore' },
    ],
    settings: [
      { id: 'statementSeconds', label: 'Secondi per affermazione', kind: 'number', min: 8, max: 120, step: 1, default: 25 },
      { id: 'revealSeconds', label: 'Secondi rivelazione', kind: 'number', min: 3, max: 120, step: 1, default: 10 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 1, max: 60, step: 1, default: 2 },
      { id: 'pointsPerCorrect', label: 'Punti per risposta', kind: 'number', min: 1, max: 1000, step: 1, default: 10 },
      { id: 'speedBonus', label: 'Bonus velocità', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'answer' },
      { source: { type: 'gift' }, action: 'extra_time' },
    ],
  },
  {
    id: 'trivia-time',
    name: 'Trivia Time',
    category: 'Quiz',
    description: 'Quiz a quattro risposte con classifica, bonus velocità e aiuto 50/50.',
    emoji: '⏱️',
    gradient: ['#f6c945', '#3a2a0a'],
    actions: [
      { id: 'answer', label: 'Answer' },
      { id: 'fifty_fifty', label: '50/50', help: true },
      { id: 'skip_question', label: 'Salta domanda' },
    ],
    settings: [
      { id: 'questionSeconds', label: 'Secondi per domanda', kind: 'number', min: 8, max: 60, step: 1, default: 20 },
      { id: 'revealSeconds', label: 'Secondi rivelazione', kind: 'number', min: 3, max: 20, step: 1, default: 8 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 1, max: 15, step: 1, default: 3 },
      { id: 'pointsPerCorrect', label: 'Punti per risposta', kind: 'number', min: 1, max: 100, step: 1, default: 10 },
      { id: 'speedBonus', label: 'Bonus velocità', kind: 'toggle', default: true },
      { id: 'showVoteCounts', label: 'Mostra voti', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'answer' },
      { source: { type: 'gift' }, action: 'fifty_fifty' },
    ],
  },
  {
    id: 'memory-maestro',
    name: 'Memory Maestro',
    category: 'Arcade',
    description: 'Memorizza la sequenza numerica mostrata per pochi secondi e riscrivila in chat.',
    emoji: '🧠',
    gradient: ['#8b5cf6', '#1a0a3a'],
    actions: [
      { id: 'answer', label: 'Answer' },
      { id: 'show_again', label: 'Rimostra', help: true },
      { id: 'extra_time', label: 'Tempo extra', help: true },
    ],
    settings: [
      { id: 'memorySeconds', label: 'Secondi di memoria', kind: 'number', min: 0.4, max: 6, step: 0.1, default: 1.5 },
      { id: 'startingLevel', label: 'Livello iniziale', kind: 'number', min: 1, max: 25, step: 1, default: 1 },
      { id: 'answerSeconds', label: 'Secondi per rispondere', kind: 'number', min: 5, max: 30, step: 1, default: 15 },
      { id: 'revealSeconds', label: 'Secondi rivelazione', kind: 'number', min: 2, max: 10, step: 1, default: 4 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'answer' },
      { source: { type: 'gift' }, action: 'show_again' },
    ],
  },
  {
    id: 'word-association',
    name: 'ZeroAssociazioni',
    category: 'Quiz',
    description: 'Una parola in vista e 7 o 8 parole collegate nascoste: la chat le indovina una a una. Ogni tanto un round speciale al contrario.',
    emoji: '🔗',
    gradient: ['#3258d4', '#0a1a3a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_letter', label: 'Rivela lettere', help: true },
      { id: 'next_round', label: 'Round successivo' },
    ],
    settings: [
      { id: 'answerCount', label: 'Parole da indovinare', kind: 'select', default: 'random', options: [
        { value: 'random', label: '7 o 8 a caso' },
        { value: '7', label: '7' },
        { value: '8', label: '8 (solo i prompt che ne hanno abbastanza)' },
      ] },
      { id: 'roundMode', label: 'Modalità del round', kind: 'select', default: 'timed', options: [
        { value: 'timed', label: 'A tempo (finisce prima se le trovano tutte)' },
        { value: 'untilSolved', label: 'Finché non le trovano tutte' },
      ] },
      { id: 'roundSeconds', label: 'Durata del round (secondi)', kind: 'number', min: 30, max: 300, step: 10, default: 60, when: { id: 'roundMode', value: 'timed' } },
      { id: 'breakSeconds', label: 'Secondi tra un round e l’altro', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'matchEnd', label: 'Fine della partita', kind: 'select', default: 'endless', options: [
        { value: 'endless', label: 'Mai (una classifica per tutta la live)' },
        { value: 'rounds', label: 'Dopo un numero di round' },
        { value: 'points', label: 'Quando qualcuno raggiunge i punti' },
      ] },
      { id: 'matchRounds', label: 'Round per partita', kind: 'number', min: 3, max: 50, step: 1, default: 10, when: { id: 'matchEnd', value: 'rounds' } },
      { id: 'matchPoints', label: 'Punti per vincere', kind: 'number', min: 10, max: 5000, step: 10, default: 100, when: { id: 'matchEnd', value: 'points' } },
      { id: 'pointsPerCorrect', label: 'Punti per parola', kind: 'number', min: 1, max: 20, step: 1, default: 1 },
      { id: 'speedBonusEnabled', label: 'Le risposte più veloci valgono di più', kind: 'toggle', default: true },
      { id: 'comboEnabled', label: 'Bonus combo per parole trovate di fila', kind: 'toggle', default: true },
      { id: 'longWordHeadStart', label: 'Lettere iniziali in più sulle parole lunghe', kind: 'toggle', default: true },
      { id: 'dripRevealEnabled', label: 'Scopri un’altra lettera mentre il round avanza', kind: 'toggle', default: true },
      { id: 'giftRevealLetters', label: 'Lettere scoperte per regalo', kind: 'number', min: 1, max: 3, step: 1, default: 2 },
      { id: 'guessCapEnabled', label: 'Limita i tentativi per spettatore per round', kind: 'toggle', default: false },
      { id: 'guessesPerUser', label: 'Tentativi massimi per spettatore per round', kind: 'number', min: 1, max: 50, step: 1, default: 10, when: { id: 'guessCapEnabled', value: true } },
      { id: 'specialRoundEnabled', label: 'Round speciale: indovina la parola dagli indizi', kind: 'toggle', default: true,
        hint: 'Gli indizi compaiono uno alla volta: chi indovina per primo la parola di partenza vince punti, tanti più quanti meno indizi sono usciti.' },
      { id: 'specialRoundEvery', label: 'Un round speciale ogni (round)', kind: 'number', min: 3, max: 50, step: 1, default: 10, when: { id: 'specialRoundEnabled', value: true } },
      { id: 'specialRevealSeconds', label: 'Secondi tra un indizio e l’altro', kind: 'number', min: 3, max: 20, step: 1, default: 6, when: { id: 'specialRoundEnabled', value: true } },
      { id: 'showSenseHint', label: 'Mostra l’accezione', kind: 'toggle', default: false },
      { id: 'showSessionLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_letter' },
    ],
  },
  {
    id: 'word-hunt',
    name: 'Word Hunt',
    category: 'Quiz',
    description: 'Cerca le parole nascoste nella griglia: scrivi la parola o le coordinate in chat.',
    emoji: '🔡',
    gradient: ['#3ccf7a', '#0a2a1a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_word', label: 'Rivela parola', help: true },
      { id: 'new_board', label: 'Nuova griglia' },
    ],
    settings: [
      { id: 'boardSize', label: 'Dimensione', kind: 'select', default: 'standard', options: [{ value: 'quick', label: 'Veloce' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Grande' }] },
      { id: 'allowDiagonal', label: 'Diagonali', kind: 'toggle', default: true },
      { id: 'allowBackwards', label: 'Al contrario', kind: 'toggle', default: false },
      { id: 'secondsBetweenBoards', label: 'Pausa tra griglie', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'showHints', label: 'Mostra suggerimenti', kind: 'toggle', default: true },
      { id: 'creditWords', label: 'Accredita parole', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_word' },
    ],
  },
  {
    id: 'word-cross',
    name: 'Word Cross',
    category: 'Quiz',
    description: 'Un cruciverba costruito da un insieme di lettere: trova le parole che si incrociano.',
    emoji: '✖️',
    gradient: ['#4cc3ff', '#0a1a3a'],
    actions: [
      { id: 'guess', label: 'Find word' },
      { id: 'hint', label: 'Aiuto', help: true },
      { id: 'shuffle', label: 'Mescola' },
    ],
    settings: [
      { id: 'breakSeconds', label: 'Pausa tra cruciverba', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'creditWords', label: 'Accredita parole', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'hint' },
    ],
  },
  {
    id: 'guess-logo',
    name: 'Guess the Logo',
    category: 'Quiz',
    description: 'Il logo si svela progressivamente: indovina il brand (alias accettati).',
    emoji: '🏷️',
    gradient: ['#6b8aff', '#1a0a3a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_hint', label: 'Aiuto', help: true },
    ],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per logo', kind: 'number', min: 5, max: 120, step: 1, default: 20 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 4 },
      { id: 'obscureMode', label: 'Rivelazione', kind: 'select', default: 'zoom', options: [{ value: 'zoom', label: 'Zoom' }, { value: 'blur', label: 'Sfocatura' }, { value: 'scramble', label: 'Mosaico' }, { value: 'none', label: 'Nessuna' }] },
      { id: 'roundMode', label: 'Modalità', kind: 'select', default: 'timedCollect', options: [{ value: 'timedCollect', label: 'A tempo' }, { value: 'firstWins', label: 'Primo vince' }] },
      { id: 'pointsPerCorrect', label: 'Punti per risposta', kind: 'number', min: 1, max: 20, step: 1, default: 3 },
      { id: 'winnerBonus', label: 'Bonus vincitore', kind: 'number', min: 0, max: 100, step: 5, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_hint' },
    ],
  },
  {
    id: 'guess-location',
    name: 'Guess the Location',
    category: 'Quiz',
    description: 'Un panorama stilizzato e indizi: indovina il paese (e la città).',
    emoji: '🗺️',
    gradient: ['#ffc02e', '#1a1a0a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_letter', label: 'Rivela lettera', help: true },
      { id: 'show_continent', label: 'Mostra continente', help: true },
      { id: 'add_time', label: 'Tempo extra', help: true },
    ],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per località', kind: 'number', min: 20, max: 120, step: 5, default: 45 },
      { id: 'revealSeconds', label: 'Secondi rivelazione', kind: 'number', min: 5, max: 20, step: 1, default: 9 },
      { id: 'answerMode', label: 'Risposta', kind: 'select', default: 'both', options: [{ value: 'country', label: 'Solo paese' }, { value: 'both', label: 'Paese e città' }] },
      { id: 'countryPoints', label: 'Punti paese', kind: 'number', min: 20, max: 500, step: 10, default: 100 },
      { id: 'cityPoints', label: 'Punti città', kind: 'number', min: 20, max: 500, step: 10, default: 60 },
      { id: 'autoHints', label: 'Suggerimenti automatici', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_letter' },
      { source: { type: 'like' }, action: 'show_continent' },
      { source: { type: 'share' }, action: 'add_time' },
    ],
  },
  {
    id: 'guess-drawing',
    name: 'Guess the Drawing',
    category: 'Quiz',
    description: 'Un disegno si traccia colpo dopo colpo: indovina la parola in chat.',
    emoji: '🎨',
    gradient: ['#17b7a8', '#0a1a1a'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_letter', label: 'Rivela lettera', help: true },
    ],
    settings: [
      { id: 'drawSeconds', label: 'Secondi di disegno', kind: 'number', min: 10, max: 120, step: 5, default: 30 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'roundMode', label: 'Modalità', kind: 'select', default: 'timed', options: [{ value: 'timed', label: 'A tempo' }, { value: 'untilSolved', label: 'Finché risolto' }] },
      { id: 'showWordLength', label: 'Mostra lunghezza', kind: 'toggle', default: true },
      { id: 'basePoints', label: 'Punti base', kind: 'number', min: 0, max: 500, step: 10, default: 100 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_letter' },
    ],
  },
  {
    id: 'context',
    name: 'ZeroContext',
    category: 'Quiz',
    description: 'Trova la parola segreta con posizione e temperatura semantica. Tutti i round sono ordinari, senza limite di tempo.',
    emoji: '🎯',
    gradient: ['#ffffff', '#2d3642'],
    actions: [
      { id: 'guess', label: 'Guess' },
      { id: 'reveal_closer', label: 'Rivela più vicino', help: true },
      { id: 'small_hint', label: 'Piccolo aiuto', help: true },
    ],
    settings: [
      { id: 'associationSource', label: 'Associazioni', kind: 'select', default: 'original', options: [
        { value: 'original', label: 'Associazioni originali' },
        { value: 'abtt', label: 'Associazioni ABTT' },
        { value: 'pipeline_b', label: 'Pipeline B (fastText + PMI-SVD + ConceptNet)' },
      ], hint: 'Il cambio avvia un nuovo round senza riavviare il server. La classifica generale è conservata.' },
      { id: 'disableAllHints', label: 'Disabilita tutti gli aiuti', kind: 'toggle', default: false, hint: 'Blocca regali, comandi, suggerimenti automatici e iniziali e lettere rivelate. Nasconde gli aiuti già mostrati, conservando i tentativi dei giocatori.' },
      { id: 'showWordLength', label: 'Mostra numero di lettere', kind: 'toggle', default: true, hint: 'Nella modalità classica mostra un riquadro per ogni lettera della parola segreta. Spento, nasconde la lunghezza fino alla fine del round; gli eventuali piccoli aiuti mostrano solo le lettere già rivelate. Disabilita tutti gli aiuti ha precedenza.' },
      { id: 'starterWords', label: 'Parole iniziali', kind: 'toggle', default: false, hint: 'A inizio round mostra tre parole lontane, per dare alla chat un punto di partenza.' },
      { id: 'startHintOn', label: 'Suggerimento iniziale', kind: 'toggle', default: false, hint: 'Ogni round parte con una parola già sul tabellone. Spento (predefinito), il tabellone parte vuoto (o con le parole iniziali).' },
      { id: 'startHint', label: 'Posizione del suggerimento iniziale', kind: 'number', min: 3, max: 1000, step: 1, default: 30, when: { id: 'startHintOn', value: true }, hint: 'La parola a questa posizione è già sul tabellone: un poco lontana dalla più vicina (la 2).' },
      { id: 'autoHints', label: 'Suggerimenti automatici', kind: 'toggle', default: false },
      { id: 'autoHintSeconds', label: 'Secondi tra aiuti', kind: 'number', min: 15, max: 180, step: 5, default: 45, when: { id: 'autoHints', value: true } },
      { id: 'hintClosest', label: 'Posizione più vicina di un aiuto', kind: 'number', min: 2, max: 100, step: 1, default: 4, hint: 'Un aiuto non rivela mai una parola più vicina di questa posizione (2 = la più vicina di tutte: la 1 è la parola segreta).' },
      { id: 'maxHintsPerRound', label: 'Aiuti massimi per parola', kind: 'number', min: 1, max: 30, step: 1, default: 5 },
      { id: 'redUntil', label: 'Rosso fino alla posizione', kind: 'number', min: 1, max: CONTEXT_COLOR_MAX.red, step: 1, default: CONTEXT_COLOR_STOPS.red, hint: 'Le parole più vicine alla soluzione. La posizione 1 è la soluzione.' },
      { id: 'orangeUntil', label: 'Arancione fino alla posizione', kind: 'number', min: 2, max: CONTEXT_COLOR_MAX.orange, step: 1, default: CONTEXT_COLOR_STOPS.orange },
      { id: 'yellowUntil', label: 'Giallo fino alla posizione', kind: 'number', min: 3, max: CONTEXT_COLOR_MAX.yellow, step: 1, default: CONTEXT_COLOR_STOPS.yellow },
      { id: 'cyanUntil', label: 'Ciano fino alla posizione', kind: 'number', min: 4, max: CONTEXT_COLOR_MAX.cyan, step: 1, default: CONTEXT_COLOR_STOPS.cyan, hint: 'Oltre questa posizione le parole sono blu.' },
      { id: 'breakSeconds', label: 'Secondi prima della prossima parola', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'finderPoints', label: 'Punti per la parola trovata', kind: 'number', min: 0, max: 10000, step: 10, default: 100 },
      {
        id: 'closestPoints',
        label: 'Punti per un nuovo miglior tentativo',
        kind: 'select',
        default: 'normal',
        options: [
          { value: 'none', label: 'Nessuno' },
          { value: 'low', label: 'Pochi' },
          { value: 'normal', label: 'Normale' },
          { value: 'high', label: 'Tanti' },
        ],
        hint: 'Chi batte il miglior tentativo del round prende punti, tanti più quanto è vicino alla parola.',
      },
      {
        id: 'matchEnds',
        label: 'Fine partita',
        kind: 'select',
        default: 'never',
        options: [
          { value: 'never', label: 'Mai (una classifica per tutta la diretta)' },
          { value: 'words', label: 'Dopo un numero di parole' },
        ],
      },
      { id: 'matchWords', label: 'Parole per partita', kind: 'number', min: 2, max: 100, step: 1, default: 10, when: { id: 'matchEnds', value: 'words' } },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
      { id: 'tournamentTypedWords', label: 'Parole scritte a schermo', kind: 'toggle', default: false, group: 'Torneo', hint: 'Nel torneo, mostra sotto il pannello le parole che gli utenti scrivono mentre la finestra è aperta, come nel gioco normale (senza colore: la vicinanza si scopre a finestra chiusa).' },
      { id: 'voiceFollowersOnly', label: 'Voce solo ai follower', kind: 'toggle', default: true, group: 'Chat', hint: VOICE_HINT },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift' }, action: 'reveal_closer' },
    ],
  },
  {
    id: 'million-quiz',
    name: 'Million Quiz',
    category: 'Quiz',
    description: 'Il pubblico vota A/B/C/D: la risposta di maggioranza sale la scala dei premi.',
    emoji: '💎',
    gradient: ['#f5b14c', '#1a0a3a'],
    actions: [
      { id: 'vote', label: 'Vote' },
      { id: 'fifty_fifty', label: '50/50', help: true },
      { id: 'skip_question', label: 'Salta domanda' },
    ],
    settings: [
      { id: 'votingDuration', label: 'Secondi di voto', kind: 'number', min: 15, max: 60, step: 5, default: 30 },
      { id: 'finaleDuration', label: 'Secondi finale', kind: 'number', min: 10, max: 120, step: 5, default: 20 },
      { id: 'restartDelay', label: 'Pausa riavvio', kind: 'number', min: 3, max: 15, step: 1, default: 5 },
      { id: 'prizeUnit', label: 'Unità premio', kind: 'select', default: 'points', options: [{ value: 'points', label: 'Punti' }, { value: 'euro', label: 'Euro' }, { value: 'dollar', label: 'Dollari' }, { value: 'coin', label: 'Monete' }] },
      { id: 'fiftyMaxPerGame', label: '50/50 per partita', kind: 'number', min: 0, max: 10, step: 1, default: 3 },
      { id: 'skipMaxPerGame', label: 'Salta per partita', kind: 'number', min: 0, max: 5, step: 1, default: 3 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'vote' },
      { source: { type: 'gift' }, action: 'fifty_fifty' },
    ],
  },
  {
    id: 'associations',
    name: 'Associations',
    category: 'Quiz',
    description: 'Una parola e tante parole associate nascoste: trovale in chat.',
    emoji: '🔗',
    gradient: ['#3258d4', '#0a1a3a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per round', kind: 'number', min: 30, max: 300, step: 10, default: 60 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'pointsPerCorrect', label: 'Punti per parola', kind: 'number', min: 1, max: 20, step: 1, default: 1 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'connect-word',
    name: 'Connect Word',
    category: 'Quiz',
    description: 'Una griglia di lettere con parole nascoste: trovale in chat.',
    emoji: '🔠',
    gradient: ['#3ccf7a', '#0a2a1a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'secondsBetweenBoards', label: 'Pausa tra griglie', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'cross-world',
    name: 'Cross World',
    category: 'Quiz',
    description: 'Un cruciverba di parole che si incrociano: trova le parole in chat.',
    emoji: '🌐',
    gradient: ['#4cc3ff', '#0a1a3a'],
    actions: [{ id: 'guess', label: 'Find word' }],
    settings: [
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'creditWords', label: 'Accredita parole', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'crostic',
    name: 'Crostic',
    category: 'Quiz',
    description: 'Risolvi gli indizi: le prime lettere delle risposte formano la frase nascosta.',
    emoji: '🔤',
    gradient: ['#f5b14c', '#3a2a0a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'pointsPerCorrect', label: 'Punti per risposta', kind: 'number', min: 1, max: 50, step: 1, default: 5 },
      { id: 'solveBonus', label: 'Bonus frase', kind: 'number', min: 0, max: 100, step: 5, default: 20 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'crucintarsio',
    name: 'Crucintarsio',
    category: 'Quiz',
    description: 'Cruciverba all’italiana con Orizzontali e Verticali: trova le parole.',
    emoji: '🧩',
    gradient: ['#8b5cf6', '#1a0a3a'],
    actions: [{ id: 'guess', label: 'Find word' }],
    settings: [
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'creditWords', label: 'Accredita parole', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'palora',
    name: 'Palora',
    category: 'Quiz',
    description: 'Lettere mescolate: riordinale e scrivi la parola in chat.',
    emoji: '🔀',
    gradient: ['#4cc3ff', '#0a1a3a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per parola', kind: 'number', min: 15, max: 90, step: 5, default: 45 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'parole-popolari',
    name: 'Parole Popolari',
    category: 'Quiz',
    description: 'Un tema e le risposte più popolari: indovinale e guadagna punti.',
    emoji: '🗣️',
    gradient: ['#f5b14c', '#3a2a0a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per round', kind: 'number', min: 30, max: 300, step: 10, default: 60 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'parole-solitario',
    name: 'Parole Solitario',
    category: 'Quiz',
    description: 'Una catena di parole associate: indovina la prossima per avanzare.',
    emoji: '🃏',
    gradient: ['#3258d4', '#0a1a3a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per round', kind: 'number', min: 30, max: 300, step: 10, default: 60 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'pointsPerCorrect', label: 'Punti per parola', kind: 'number', min: 1, max: 50, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'perle-parole',
    name: 'Perle Parole',
    category: 'Quiz',
    description: 'Le lettere sono perle in cerchio: trova la parola.',
    emoji: '📿',
    gradient: ['#22c55e', '#0a2a1a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per parola', kind: 'number', min: 15, max: 90, step: 5, default: 45 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'quiz-blitz',
    name: 'Quiz Blitz',
    category: 'Quiz',
    description: 'Quiz rapidissimo: rispondi in fretta per il bonus velocità.',
    emoji: '⚡',
    gradient: ['#ff5c5c', '#2a0a0a'],
    actions: [{ id: 'answer', label: 'Answer' }],
    settings: [
      { id: 'questionSeconds', label: 'Secondi per domanda', kind: 'number', min: 5, max: 30, step: 1, default: 10 },
      { id: 'revealSeconds', label: 'Secondi rivelazione', kind: 'number', min: 3, max: 15, step: 1, default: 5 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 1, max: 15, step: 1, default: 2 },
      { id: 'pointsPerCorrect', label: 'Punti per risposta', kind: 'number', min: 1, max: 100, step: 1, default: 10 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'answer' }],
  },
  {
    id: 'quizzland',
    name: 'ZeroQuizz',
    category: 'Quiz',
    description:
      'Quiz d’intelligenza: indovinelli, logica e trabocchetti. La chat risponde A, B, C o D; chi indovina prima prende più punti. Domande e risposte salvate sul PC.',
    emoji: '🧠',
    gradient: ['#8b5cf6', '#1a0a3a'],
    actions: [
      { id: 'answer', label: 'Rispondi' },
      { id: 'fifty', label: '50:50', help: true },
      { id: 'extra_time', label: 'Tempo extra', help: true },
      { id: 'next', label: 'Prossima domanda' },
    ],
    settings: [
      {
        id: 'categories',
        label: 'Categorie',
        kind: 'multi',
        default: '',
        options: QUIZZLAND_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
      },
      {
        id: 'difficulty',
        label: 'Difficoltà',
        kind: 'select',
        default: 'all',
        options: [
          { value: 'all', label: 'Tutte' },
          { value: '1', label: 'Facili' },
          { value: '2', label: 'Medie' },
          { value: '3', label: 'Difficili' },
        ],
      },
      { id: 'questionSeconds', label: 'Secondi per rispondere', kind: 'number', min: 8, max: 90, step: 1, default: 20 },
      { id: 'revealSeconds', label: 'Secondi sulla risposta giusta', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      {
        id: 'breakSeconds',
        label: 'Secondi sulla classifica',
        hint: 'Tra una domanda e l’altra. 0 = subito la prossima.',
        kind: 'number',
        min: 0,
        max: 30,
        step: 1,
        default: 5,
      },
      {
        id: 'inputMode',
        label: 'Cosa scrivono gli spettatori',
        hint: 'Automatico accetta A–D e 1–4. Un commento conta solo se contiene solo la risposta; vale la prima.',
        kind: 'select',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Automatico' },
          { value: 'letters', label: 'A, B, C o D' },
          { value: 'numbers', label: '1, 2, 3 o 4' },
        ],
      },
      { id: 'points', label: 'Punti per risposta giusta', kind: 'number', min: 10, max: 1000, step: 10, default: 100 },
      {
        id: 'speedBonus',
        label: 'Bonus velocità',
        hint: 'Fino al 50% di punti in più a chi risponde subito; scende con il tempo.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'shuffleOptions',
        label: 'Mescola le risposte',
        hint: 'A ogni domanda le risposte cambiano posto, tranne nelle domande con ordine fisso.',
        kind: 'toggle',
        default: true,
      },
      { id: 'autoNext', label: 'Avanza da solo', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
      {
        id: 'liveCounts',
        label: 'Percentuali durante la domanda',
        hint: 'Se spento compaiono solo con la risposta giusta, così la chat non copia.',
        kind: 'toggle',
        default: false,
      },
      {
        id: 'sounds',
        label: 'Suoni del gioco',
        hint: 'Suoni sintetizzati nell’overlay; l’anteprima della dashboard resta muta.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'tts',
        label: 'Leggi la domanda ad alta voce (TTS)',
        hint: 'Usa la sintesi vocale del browser dell’overlay; l’anteprima della dashboard resta muta.',
        kind: 'toggle',
        default: false,
      },
      {
        id: 'background',
        label: 'Sfondo',
        group: 'Aspetto',
        kind: 'select',
        default: 'theme',
        options: [
          { value: 'theme', label: 'ZeroQuizz (cielo animato)' },
          { value: 'nasa', label: 'Foto NASA del giorno' },
          { value: 'color', label: 'Colore' },
          { value: 'transparent', label: 'Trasparente' },
          { value: 'image', label: 'Immagine caricata' },
        ],
      },
      PHOTO_MINUTES({ id: 'background', value: 'nasa' }, 'Aspetto'),
      { id: 'bgColor', label: 'Colore', group: 'Aspetto', kind: 'color', default: '#1d1147' },
      { id: 'bgImage', label: 'Immagine', group: 'Aspetto', kind: 'image', default: '' },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'answer' },
      { source: { type: 'gift', giftId: 'rose' }, action: 'fifty' },
    ],
  },
  {
    id: 'zerotaboo',
    name: 'ZeroTaboo',
    category: 'Parole',
    description:
      'Taboo per la diretta: lo streamer descrive la carta senza dire le parole vietate, la chat indovina e il primo messaggio valido vince. Cinque round da 90 secondi contro una soglia di squadra. Funziona con il ponte ZeroFollowerBot.',
    emoji: '🎭',
    gradient: ['#f43f5e', '#2a0a14'],
    // ZEROTABOO.md prevede nessun aiuto dal pubblico: niente azioni "help".
    actions: [{ id: 'guess', label: 'Risposta' }],
    settings: [
      {
        id: 'tabooThreshold',
        label: 'Soglia di squadra',
        hint: 'Punti da raggiungere. Vale dalla partita successiva: non cambia a partita in corso.',
        kind: 'number',
        min: TABOO_RULES.thresholdMin,
        max: TABOO_RULES.thresholdMax,
        step: 1,
        default: TABOO_RULES.thresholdDefault,
      },
      {
        id: 'tabooPlatform',
        label: 'Piattaforma competitiva',
        hint: 'Solo qui si assegna il primo indovino. Una risposta giusta dall’altra piattaforma chiude la carta per la squadra, senza vincitore individuale.',
        kind: 'select',
        default: 'tiktok',
        options: [
          { value: 'tiktok', label: 'TikTok' },
          { value: 'twitch', label: 'Twitch' },
        ],
      },
      {
        id: 'tabooIntermissionSeconds',
        label: 'Secondi tra i round',
        hint: 'Da 15 a 30. Il round parte quando premi “Avvia round”, dopo questo intervallo.',
        kind: 'number',
        min: TABOO_RULES.intermissionMinMs / 1000,
        max: TABOO_RULES.intermissionMaxMs / 1000,
        step: 1,
        default: TABOO_RULES.intermissionDefaultMs / 1000,
      },
      { id: 'tabooAnimations', label: 'Animazioni', hint: 'Brevi e silenziabili.', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'zerowordhunt',
    name: 'ZeroWordHunt',
    category: 'Parole',
    description:
      'Cerca-parole per la diretta: una griglia 20×15, la chat scrive le parole nascoste e il primo messaggio valido le conquista. La parola prende un colore e nella casella accanto compare l’avatar di chi l’ha trovata.',
    emoji: '🔎',
    gradient: ['#22d3ee', '#0a1f2a'],
    // Le risposte sono i commenti della chat: il server li legge direttamente, senza trigger né aiuti del pubblico.
    actions: [{ id: 'guess', label: 'Risposta' }],
    settings: [
      {
        id: 'wordhuntSeconds',
        label: 'Durata massima del round (secondi)',
        hint: `0 = nessun limite: il round finisce quando tutte le parole sono trovate o lo chiudi tu. Altrimenti da ${WORDHUNT_RULES.roundSecondsMin} a ${WORDHUNT_RULES.roundSecondsMax}. Vale dal round successivo.`,
        kind: 'number',
        min: 0,
        max: WORDHUNT_RULES.roundSecondsMax,
        step: 10,
        default: WORDHUNT_RULES.roundSecondsDefault,
      },
      {
        id: 'wordhuntCountdown',
        label: 'Conto alla rovescia',
        hint: 'Secondi di preparazione prima che il round si apra.',
        kind: 'number',
        min: 0,
        max: WORDHUNT_RULES.countdownSecondsMax,
        step: 1,
        default: WORDHUNT_RULES.countdownSecondsDefault,
      },
      {
        id: 'wordhuntReverse',
        label: 'Parole al contrario',
        hint: 'Le parole possono essere scritte anche da destra a sinistra e dal basso in alto. Con le diagonali attive, anche quelle possono essere al contrario. Vale dal round successivo.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'wordhuntDiagonal',
        label: 'Parole in diagonale',
        hint: 'Le parole possono essere scritte anche in diagonale. Con «Parole al contrario» attivo, anche al contrario. L’avatar sta sempre nella casella dopo l’ultima lettera o prima della prima, lungo la diagonale. Vale dal round successivo.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'wordhuntSize',
        label: 'Dimensione tabellone',
        hint: 'Colonne × righe e parole da trovare. Il tempo del round si adatta in proporzione alle parole (il valore sotto è per 24). Vale dal round successivo; la griglia di riferimento è sempre 15 × 20.',
        kind: 'select',
        default: WORDHUNT_SIZE_DEFAULT,
        options: (Object.keys(WORDHUNT_SIZES) as WordHuntSize[]).map((value) => ({
          value,
          label: `${WORDHUNT_SIZES[value].label} (${WORDHUNT_SIZES[value].cols} × ${WORDHUNT_SIZES[value].rows}, ${WORDHUNT_SIZES[value].words} parole)`,
        })),
      },
      {
        id: 'wordhuntAuto',
        label: 'Round automatici',
        hint: 'Il primo round parte da solo alla scelta del gioco e un nuovo round parte dopo ogni round, con un “Tabellone Grande” da 24 parole. “Chiudi” in regia ferma l’automatismo.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'wordhuntPauseSeconds',
        label: 'Pausa tra i round',
        hint: `Da ${WORDHUNT_RULES.pauseSecondsMin} a ${WORDHUNT_RULES.pauseSecondsMax} secondi: la griglia finita resta in vista prima del round successivo.`,
        kind: 'number',
        min: WORDHUNT_RULES.pauseSecondsMin,
        max: WORDHUNT_RULES.pauseSecondsMax,
        step: 5,
        default: WORDHUNT_RULES.pauseSecondsDefault,
      },
      {
        id: 'wordhuntTheme',
        label: 'Colori della griglia',
        hint: 'Automatico: carta chiara con lettere scure dalle 7 alle 19, ardesia scura con lettere morbide la sera e la notte. Le parole trovate tengono i loro colori. «Personalizzati» apre tre selettori di colore che cambiano la griglia in tempo reale.',
        kind: 'select',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Automatico (giorno/sera)' },
          { value: 'day', label: 'Giorno (carta chiara)' },
          { value: 'night', label: 'Sera (ardesia scura)' },
          { value: 'custom', label: 'Personalizzati (scegli i colori)' },
        ],
      },
      {
        id: 'wordhuntFont',
        label: 'Carattere delle lettere',
        hint: 'Per chi ha difficoltà di lettura: OpenDyslexic ha le lettere ancorate in basso per non farle scambiare o ruotare; Atkinson Hyperlegible distingue bene le lettere simili. Cambia subito, anche a round in corso.',
        kind: 'select',
        default: 'atkinson',
        options: [
          { value: 'atkinson', label: 'Atkinson Hyperlegible (alta leggibilità)' },
          { value: 'opendyslexic', label: 'OpenDyslexic (dislessia)' },
          { value: 'standard', label: 'Standard (Nunito)' },
        ],
      },
      { id: 'wordhuntLetterColor', label: 'Colore delle lettere', hint: 'Cambia subito, anche a round in corso.', kind: 'color', default: '#e4e7ef', when: { id: 'wordhuntTheme', value: 'custom' } },
      { id: 'wordhuntTileColor', label: 'Sfondo delle lettere', hint: 'Il riquadro di ogni lettera. Le parole trovate tengono i loro colori.', kind: 'color', default: '#1c2030', when: { id: 'wordhuntTheme', value: 'custom' } },
      { id: 'wordhuntBoardColor', label: 'Sfondo della griglia', hint: 'Il fondo dietro i riquadri.', kind: 'color', default: '#12141c', when: { id: 'wordhuntTheme', value: 'custom' } },
      { id: 'wordhuntAnimations', label: 'Animazioni', hint: 'Brevi e silenziabili: nessuna nella vista di riferimento.', kind: 'toggle', default: true },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'ruzzle',
    name: 'Ruzzle',
    category: 'Quiz',
    description: 'Una griglia 4x4: trova più parole possibile prima che scada il tempo.',
    emoji: '🧊',
    gradient: ['#4cc3ff', '#0a1a3a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per round', kind: 'number', min: 30, max: 180, step: 10, default: 60 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'top-7',
    name: 'Top 7',
    category: 'Quiz',
    description: 'Un tema, sette risposte: trovale tutte.',
    emoji: '7️⃣',
    gradient: ['#f5b14c', '#3a2a0a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per round', kind: 'number', min: 30, max: 300, step: 10, default: 60 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'wild-words',
    name: 'Wild Words',
    category: 'Quiz',
    description: 'Una parola con una lettera nascosta: completala in chat.',
    emoji: '❓',
    gradient: ['#f5b14c', '#0a2a1a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per parola', kind: 'number', min: 15, max: 90, step: 5, default: 45 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'word-merge',
    name: 'Word Merge',
    category: 'Quiz',
    description: 'Due metà di una parola: uniscile e scrivi la parola completa.',
    emoji: '➕',
    gradient: ['#3ccf7a', '#0a2a1a'],
    actions: [{ id: 'guess', label: 'Guess' }],
    settings: [
      { id: 'roundSeconds', label: 'Secondi per parola', kind: 'number', min: 15, max: 90, step: 5, default: 45 },
      { id: 'breakSeconds', label: 'Pausa', kind: 'number', min: 2, max: 20, step: 1, default: 5 },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'guess' }],
  },
  {
    id: 'zerodubbi',
    name: 'ZeroDubbi',
    category: 'Party',
    description: 'Preferiresti…? Il pubblico vota A o B in chat; ogni risposta resta salvata sul PC.',
    emoji: '🔀',
    gradient: ['#2dd4bf', '#5b21b6'],
    actions: [
      { id: 'vote', label: 'Vota' },
      { id: 'extra_time', label: 'Tempo extra' },
      { id: 'next', label: 'Prossima domanda' },
    ],
    settings: [
      {
        id: 'lang',
        label: 'Lingua',
        kind: 'select',
        default: 'it',
        options: [
          { value: 'it', label: 'Italiano' },
          { value: 'en', label: 'English' },
        ],
      },
      {
        id: 'categories',
        label: 'Categorie',
        kind: 'multi',
        default: '',
        options: BIVIO_CATEGORIES.map((c) => ({ value: c.id, label: c.it })),
      },
      {
        id: 'difficulty',
        label: 'Domande',
        hint: 'Leggere: dilemmi veloci. Impegnative: scelte più difficili.',
        kind: 'select',
        default: 'all',
        options: [
          { value: 'all', label: 'Miste' },
          { value: 'light', label: 'Leggere' },
          { value: 'tough', label: 'Impegnative' },
        ],
      },
      { id: 'voteSeconds', label: 'Secondi per votare', kind: 'number', min: 10, max: 120, step: 1, default: 30 },
      { id: 'revealSeconds', label: 'Secondi sul risultato', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'breakSeconds', label: 'Secondi tra le domande', kind: 'number', min: 0, max: 30, step: 1, default: 2 },
      {
        id: 'inputMode',
        label: 'Cosa scrivono gli spettatori',
        hint: 'Automatico accetta A/B, 1/2 e 🅰️/🅱️. Un commento conta solo se contiene solo la scelta.',
        kind: 'select',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Automatico' },
          { value: 'letters', label: 'A o B' },
          { value: 'numbers', label: '1 o 2' },
        ],
      },
      {
        id: 'allowChange',
        label: 'Gli spettatori possono cambiare lato',
        hint: 'Se attivo, vale l’ultimo voto di ogni spettatore; altrimenti il primo.',
        kind: 'toggle',
        default: true,
      },
      { id: 'autoNext', label: 'Avanza da solo', kind: 'toggle', default: true },
      {
        id: 'tts',
        label: 'Leggi la domanda ad alta voce (TTS)',
        hint: 'Usa la sintesi vocale del browser dell’overlay; l’anteprima della dashboard resta muta.',
        kind: 'toggle',
        default: false,
      },
      {
        id: 'layout',
        label: 'Layout',
        group: 'Aspetto',
        kind: 'select',
        default: 'side',
        options: [
          { value: 'side', label: 'Affiancate' },
          { value: 'stacked', label: 'Una sopra l’altra' },
        ],
      },
      { id: 'colorA', label: 'Prima opzione', group: 'Aspetto', kind: 'color', default: BIVIO_DEFAULT_COLORS.a },
      { id: 'colorB', label: 'Seconda opzione', group: 'Aspetto', kind: 'color', default: BIVIO_DEFAULT_COLORS.b },
      {
        id: 'accent',
        label: 'Accento',
        hint: 'Barra del tempo, bordo dell’opzione vincente e cerchio «o».',
        group: 'Aspetto',
        kind: 'color',
        default: BIVIO_DEFAULT_COLORS.accent,
      },
      {
        id: 'textColor',
        label: 'Testo sullo sfondo',
        hint: 'Titolo, stato e nomi di chi vota; il testo sulle opzioni resta bianco.',
        group: 'Aspetto',
        kind: 'color',
        default: BIVIO_DEFAULT_COLORS.text,
      },
      { id: 'bgColor', label: 'Colore', group: 'Sfondo', kind: 'color', default: BIVIO_DEFAULT_COLORS.background },
      { id: 'bgTransparent', label: 'Trasparente', group: 'Sfondo', kind: 'toggle', default: false },
      { id: 'bgImage', label: 'Immagine (sostituisce il colore)', group: 'Sfondo', kind: 'image', default: '' },
      { id: 'bgNasa', label: 'Foto NASA del giorno (sostituisce colore e immagine)', group: 'Sfondo', kind: 'toggle', default: false },
      PHOTO_MINUTES({ id: 'bgNasa', value: true }, 'Sfondo'),
      {
        id: 'liveCounts',
        label: 'Percentuali durante il voto',
        hint: 'Se spento, le percentuali compaiono solo con il risultato.',
        group: 'Effetti',
        kind: 'toggle',
        default: true,
      },
    ],
    defaultTriggers: [{ source: { type: 'comment' }, action: 'vote' }],
  },
  {
    id: 'incastro',
    name: 'ZeroWords',
    category: 'Parole',
    description:
      'Ruota di lettere e schema a incastro: il pubblico scrive in chat le parole che trova. Livelli senza fine, generati durante la partita; a ogni capitolo il giardino cresce.',
    emoji: '🌱',
    gradient: ['#8bd17c', '#1f5f3a'],
    actions: [
      { id: 'guess', label: 'Parola' },
      { id: 'hint', label: 'Rivela una lettera', help: true },
      { id: 'reveal_word', label: 'Rivela una parola', help: true },
      { id: 'shuffle', label: 'Mescola la ruota' },
      { id: 'extra_time', label: 'Tempo extra', help: true },
    ],
    settings: [
      {
        id: 'autoHints',
        label: 'Lettera automatica',
        hint: 'Ogni tot secondi si rivela una lettera da sola. Il conto riparte quando qualcuno trova una parola.',
        kind: 'toggle',
        default: true,
      },
      { id: 'hintSeconds', label: 'Secondi tra una lettera e l’altra', kind: 'number', min: 10, max: 180, step: 5, default: 30 },
      {
        id: 'dda',
        label: 'Difficoltà automatica',
        hint: 'La griglia passa ad Agevolata, Standard o Esperto dopo due livelli andati allo stesso modo: più facile se è scaduto il tempo o le lettere automatiche e i tuoi aiuti hanno completato almeno un terzo delle parole, più difficile se la chat le ha trovate quasi senza lettere automatiche. Gli aiuti dei regali non contano, un livello in cui nessuno gioca non conta.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'giftHints',
        label: 'Aiuti dai trigger per livello',
        hint: 'Quante lettere o parole possono rivelare regali e trigger in un livello, al massimo una ogni 2 secondi.',
        kind: 'number',
        min: 0,
        max: 30,
        step: 1,
        default: 6,
      },
      {
        id: 'levelSeconds',
        label: 'Secondi per livello',
        hint: '0 = senza limite. Allo scadere le parole mancanti compaiono in grigio e si passa oltre.',
        kind: 'number',
        min: 0,
        max: 900,
        step: 10,
        default: 0,
      },
      { id: 'completeSeconds', label: 'Secondi sul riepilogo', kind: 'number', min: 3, max: 30, step: 1, default: 8 },
      { id: 'autoNext', label: 'Avanza da solo', kind: 'toggle', default: true },
      {
        id: 'extras',
        label: 'Accetta parole extra',
        hint: 'Parole valide che non sono nello schema: 1 punto ciascuna.',
        kind: 'toggle',
        default: true,
      },
      { id: 'showLeaderboard', label: 'Classifica', kind: 'toggle', default: true },
      {
        id: 'sounds',
        label: 'Suoni del gioco',
        hint: 'Suoni sintetizzati nell’overlay; l’anteprima della dashboard resta muta.',
        kind: 'toggle',
        default: true,
      },
      {
        id: 'background',
        label: 'Sfondo',
        group: 'Aspetto',
        kind: 'select',
        default: 'nasa',
        options: [
          { value: 'nasa', label: 'Foto NASA del giorno, una a caso per livello' },
          { value: 'garden', label: 'Il giardino del capitolo' },
          { value: 'color', label: 'Colore' },
          { value: 'transparent', label: 'Trasparente' },
          { value: 'image', label: 'Immagine caricata' },
        ],
      },
      { id: 'bgColor', label: 'Colore', group: 'Aspetto', kind: 'color', default: '#173b2c' },
      { id: 'bgImage', label: 'Immagine', group: 'Aspetto', kind: 'image', default: '' },
      {
        id: 'introSeconds',
        label: 'Secondi sullo sfondo',
        hint: 'A ogni nuovo livello si vede solo lo sfondo per questi secondi, poi compare la griglia. 0 = subito la griglia. Con sfondo a colore o trasparente la griglia compare subito.',
        group: 'Aspetto',
        kind: 'number',
        min: 0,
        max: 15,
        step: 1,
        default: 4,
      },
    ],
    defaultTriggers: [
      { source: { type: 'comment' }, action: 'guess' },
      { source: { type: 'gift', giftId: 'rose' }, action: 'hint' },
      { source: { type: 'gift', giftId: 'donut' }, action: 'reveal_word' },
      { source: { type: 'share' }, action: 'shuffle' },
    ],
  },
]

// The applause the overlay plays at the end of every round (apps/overlay/src/audio.ts, roundCheer), for every game
// that has rounds: Gift Drop and Lunar Dash go on without an end.
const ROUND_CHEER: GameSetting = {
  id: 'roundCheer',
  label: 'Applauso a fine round',
  hint: 'Alla fine di ogni round l’overlay fa sentire un applauso del pubblico; l’anteprima della dashboard resta muta.',
  group: 'Effetti',
  kind: 'toggle',
  default: true,
}
const WITHOUT_ROUNDS = new Set(['gift-drop', 'lunar-dash'])

// "Aiuti dal pubblico", in every game with help actions (`help: true`): one switch per kind of live event. Off, the
// triggers of that kind no longer give help (and the overlay stops showing them); their other actions still work.
// A comment trigger with a keyword ("!aiuto") is the chat's kind.
const HELP_FROM: Record<LiveEvent['type'], { id: string; label: string }> = {
  gift: { id: 'helpFromGifts', label: 'Aiuti dai regali' },
  like: { id: 'helpFromLikes', label: 'Aiuti dai like' },
  follow: { id: 'helpFromFollows', label: 'Aiuti dai follow' },
  share: { id: 'helpFromShares', label: 'Aiuti dalle condivisioni' },
  join: { id: 'helpFromJoins', label: 'Aiuti da chi entra in diretta' },
  comment: { id: 'helpFromComments', label: 'Aiuti dai comandi in chat' },
}
const HELP_SETTINGS: GameSetting[] = Object.values(HELP_FROM).map(({ id, label }) => ({
  id,
  label,
  group: 'Aiuti dal pubblico',
  kind: 'toggle',
  default: true,
  hint: 'Spento: questi eventi non danno più aiuti ai giocatori (lettere, parole più vicine, 50:50, tempo extra…). Gli altri trigger continuano a funzionare.',
}))

// Whether a trigger is in force: an action that helps the players only while its kind's "Aiuti dal pubblico" switch
// is on (a setting not saved yet counts as on, its default).
export function triggerEnabled(game: Pick<GameDef, 'actions'> | undefined, settings: GameSettings, trigger: Trigger): boolean {
  const help = game?.actions.find((a) => a.id === trigger.action)?.help === true
  return !help || (settings.disableAllHints !== true && settings[HELP_FROM[trigger.source.type].id] !== false)
}

// The session's triggers that are in force, for the game it plays.
export const activeTriggers = (session: Pick<SessionState, 'gameId' | 'triggers' | 'settings'>) => {
  const game = GAMES.find((g) => g.id === session.gameId)
  return session.triggers.filter((t) => triggerEnabled(game, session.settings, t))
}

export const GAMES: GameDef[] = GAME_DEFS.map((g) => ({
  ...g,
  settings: [
    ...g.settings,
    ...(g.actions.some((a) => a.help) ? HELP_SETTINGS : []),
    ...COMMON_SETTINGS.filter((c) => !g.settings.some((x) => x.id === c.id)).map((c): GameSetting => (c.id === 'voiceSkipAnswers' && c.kind === 'toggle' && VOICE_SKIPS_ANSWERS.has(g.id) ? { ...c, default: true } : c)),
    ...(OWN_BACKGROUND.has(g.id) ? [] : PHOTO_BACKGROUND.filter((c) => !g.settings.some((x) => x.id === c.id))),
    ...(WITHOUT_ROUNDS.has(g.id) ? [] : [ROUND_CHEER]),
  ],
}))

// Whether a viewer's comment reaches the game, by the game's "Chi può giocare" setting.
export function allowedToPlay(settings: GameSettings, user: Viewer): boolean {
  if (user.host === true) return true // the streamer, to try the game whatever the setting
  if (settings.audience === 'followers') return user.follower === true || user.fan === true
  if (settings.audience === 'fans') return user.fan === true
  return true
}


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
  avatar?: string
  coins: number
}

export function addToRanking(ranking: Gifter[], event: GiftEvent): Gifter[] {
  const coins = (giftById(event.giftId)?.coins ?? 0) * event.count
  const existing = ranking.find((g) => g.id === event.user.id)
  const next = existing
    ? ranking.map((g) => (g === existing ? { ...g, avatar: event.user.avatar ?? g.avatar, coins: g.coins + coins } : g))
    : [...ranking, { id: event.user.id, nickname: event.user.nickname, avatar: event.user.avatar, coins }]
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
  // 0–1, the pad board's volume; set by the server.
  volume?: number
}

// --- Pads: the Sounds and GIFs boards in the dashboard's right column ---

export type PadKind = 'sound' | 'gif'

export const PAD_SLOTS = 12

export const PAD_COLORS = ['#f43f5e', '#6366f1', '#06b6d4', '#d946ef', '#22c55e', '#10b981', '#eab308', '#f97316']

export interface Pad {
  id: string
  kind: PadKind
  slot: number
  label: string
  color: string
  // A sound pad plays a built-in DJ sound or an uploaded file; a GIF pad always has a file.
  soundId?: string
  file?: string
}

export interface PadBoard {
  volume: number
  pads: Pad[]
}

// Sent to POST /api/pads/:key. `upload` is the file as base64; without `id` a new pad is made.
export interface PadInput {
  id?: string
  kind: PadKind
  slot: number
  label: string
  color: string
  soundId?: string
  upload?: { type: string; data: string }
}

export const padFilePath = (file: string) => `/api/pads/file/${file}`

export interface GifShow {
  url: string
  label: string
}

// --- Feed: creators live on this Zerocade and the gifts they received ---

export interface FeedCreator {
  kind: SourceKind
  username: string
  gameId: string
  viewers?: number
  // ms epoch: when the live started (live list) or ended (recent list).
  at: number
}

export interface FeedGift {
  id: number
  // 'tiktok:<username>', or '' for a gift sent from the simulator.
  creator: string
  gameId: string
  nickname: string
  giftId: string
  count: number
  coins: number
  at: number
  // The gifter's picture, when the live sent one.
  avatar?: string
}

export interface Feed {
  live: FeedCreator[]
  recent: FeedCreator[]
  // Every creator the gift list can be filtered by.
  creators: string[]
  top: FeedGift | null
  gifts: FeedGift[]
}

// --- Socket.IO contract ---

// What the creator can do to the game in play, from the dashboard.
export type GameControl = 'pause' | 'resume' | 'restart' | 'end' | 'start'

// A command of the creator to the game in play, apart from the chat's actions: the overlays that run the game carry
// it out. next-round: end the round in progress and go on to the next (ZeroContext: the word is shown, then a new
// one after the pause).
export const GAME_COMMANDS = ['next-round'] as const
export type GameCommand = (typeof GAME_COMMANDS)[number]
export const isGameCommand = (value: unknown): value is GameCommand =>
  typeof value === 'string' && (GAME_COMMANDS as readonly string[]).includes(value)

export interface SessionState {
  gameId: string
  triggers: Trigger[]
  settings: GameSettings
  widgets: Record<WidgetId, boolean>
  goal: number
  ticker: TickerConfig
  // Not saved: the game's run state. `run` goes up at each restart; a paused game stops, an ended session
  // shows nothing until it is started again.
  paused?: boolean
  ended?: boolean
  run?: number
}

// The live's counters since this Zerocade started (dashboards only): who is watching now and
// what came in. Likes are TikTok's (and the simulator's); Twitch sends bits, not counted here.
export interface LiveStats {
  // Watching now, summed over the connected lives; null when none of them says.
  viewers: number | null
  comments: number
  likes: number
  gifts: number
  coins: number
  follows: number
}

export const EMPTY_LIVE_STATS: LiveStats = { viewers: null, comments: 0, likes: 0, gifts: 0, coins: 0, follows: 0 }

export interface ServerToClientEvents {
  'runtime:issue': (issue: { component: 'persistence' | 'transport' | 'game'; message: string; at: number }) => void
  // Dashboards only: the live's counters, on connecting and as they change.
  'stats:update': (stats: LiveStats) => void
  'session:state': (state: SessionState) => void
  'live:event': (event: LiveEvent) => void
  'dj:play': (play: DjPlay) => void
  'source:status': (status: SourceStatus) => void
  // Dashboards only.
  'source:saved': (saved: SavedSources) => void
  // Dashboards only: the latest live events on connecting, then each new one.
  'feed:events': (items: FeedEvent[]) => void
  // Dashboards only.
  'bridge:status': (status: BridgeStatus) => void
  'ranking:update': (ranking: Gifter[]) => void
  'bivio:state': (state: BivioState) => void
  'incastro:state': (state: IncastroState) => void
  // Dashboards only.
  'incastro:solution': (solution: IncastroSolution) => void
  'quizzland:state': (state: QuizzlandState) => void
  // Dashboards only.
  'quizzland:solution': (solution: QuizzlandSolution) => void
  // ZeroTaboo (taboo.ts): the public state for every client of the room; the card in play, the reports and the deck's
  // warnings to dashboards only. Never a target, a Taboo word or an alias in the public one before the card is closed.
  'taboo:state': (state: TabooPublicState | null) => void
  'taboo:admin': (admin: TabooAdminState | null) => void
  // ZeroWordHunt (wordhunt.ts): the public state (letters, found words, avatars) for every client; targets and paths to dashboards only.
  'wordhunt:state': (state: WordHuntPublicState | null) => void
  'wordhunt:admin': (admin: WordHuntAdminState | null) => void
  // ZeroContext's secret word of the room: dashboards show it to the creator, and every overlay
  // (the preview too) plays the same one.
  'secret:word': (secret: { word: string }) => void
  // A short text the creator shows on the overlay ("Invia messaggio").
  'overlay:message': (text: string) => void
  // A command of the creator to the game in play, sent on to every overlay of the room.
  'game:command': (command: GameCommand) => void
  'pads:state': (board: PadBoard) => void
  'gif:show': (gif: GifShow) => void
  // Stops every sound and GIF the pads started.
  'dj:stop': () => void
  // ZeroContext's tournament (contextTournament.ts): the public state for every client of the room, null when the room
  // has none to show; the organiser's view (secret, full standings) and command errors to dashboards only.
  'context:tournament': (state: ContextTournamentState | null) => void
  'context:semantic': (state: ContextSemanticState | null) => void
  'context:tournament-admin': (admin: ContextTournamentAdmin | null) => void
  'context:tournament-error': (error: { message: string }) => void
  // ZeroContext: how many times each secret word has come out (classic games and tournaments), all of them on
  // connecting and one at each new round, so a new round picks a word never played.
  'context:secret-uses': (uses: Record<string, number>) => void
  'context:secret-used': (used: { word: string; uses: number; at: number }) => void
  // When each secret word last came out (ms epoch), on connecting: with no word left that never came out, a new round
  // takes the one that came out the longest ago.
  'context:secret-last': (last: Record<string, number>) => void
}

export interface ClientToServerEvents {
  'sim:event': (event: LiveEvent) => void
  'game:select': (gameId: string) => void
  'triggers:set': (triggers: Trigger[]) => void
  'settings:set': (settings: GameSettings) => void
  'dj:play': (play: DjPlay) => void
  'source:connect': (config: SourceConfig) => void
  'source:disconnect': (kind: SourceKind) => void
  'bridge:set': (config: BridgeConfig) => void
  'bridge:retry': () => void
  'scene:set': (scene: Partial<WidgetConfig>) => void
  'bivio:control': (command: BivioCommand) => void
  'incastro:control': (command: IncastroCommand) => void
  'incastro:goto': (level: number) => void
  'quizzland:control': (command: QuizzlandCommand) => void
  // The only ones an overlay may send: a click on the wheel, and the end of a Word
  // Association round (its telemetry).
  'incastro:shuffle': () => void
  'wordassoc:round': (report: WordAssociationRoundReport) => void
  // ZeroContext: an overlay starts a round with this secret word; `prev` is the word of the round
  // it replaces (null at the start). The server keeps one secret per room.
  'secret:round': (round: { word: string; prev: string | null }) => void
  // ZeroContext: an overlay shows the word of the round (found, or "Termina round"); until the next round the
  // server asks ZeroFollowerBot's voice not to read the chat's single words.
  'secret:revealed': (revealed: { word: string }) => void
  // Pause, restart or end (and start again) the game in play.
  'game:control': (command: GameControl) => void
  // The dashboard: a command to the game in play ("Termina round").
  'game:command': (command: GameCommand) => void
  // An overlay: points a viewer has just earned in the game in play, for the leaderboards.
  'score:add': (score: { game: string; user: Viewer; points: number }) => void
  // The dashboard: reset one leaderboard (a game and a period: sessione, giorno, settimana, mese, sempre). The reply
  // carries the moment of the reset.
  'leaderboard:reset': (reset: { game: string; period: string }, ack: (result: { at: number }) => void) => void
  'message:send': (text: string) => void
  'pad:play': (id: string) => void
  'pad:stop': () => void
  'pad:volume': (volume: number) => void
  'pad:remove': (id: string) => void
  // The dashboard: ZeroContext's tournament commands (checked on the server), its history and a tournament's standings.
  'context:tournament': (command: TournamentCommand, ack: (reply: TournamentReply) => void) => void
  // The dashboard: ZeroTaboo's commands (checked on the server; each carries the version the director saw).
  'taboo:control': (command: TabooCommand, ack: (reply: TabooReply) => void) => void
  // The dashboard: ZeroWordHunt's commands (checked on the server; each carries the version the director saw).
  'wordhunt:control': (command: WordHuntCommand, ack: (reply: WordHuntReply) => void) => void
  'context:tournament-history': (ack: (history: TournamentSummary[]) => void) => void
  'context:tournament-standings': (id: string, ack: (rows: TournamentRow[] | null) => void) => void
  // The copies of the standings saved after every round in a separate SQLite file (latest first), and the restore
  // from one of them (snapshot id; null = the latest).
  'context:tournament-backups': (ack: (backups: { id: number; event: string; roundNumber: number | null; roundsSettled: number; at: number }[]) => void) => void
  'context:tournament-restore': (snapshotId: number | null, ack: (reply: TournamentReply) => void) => void
  // Deletes the finished tournaments from the history: one (id) or all (null). Answers how many were deleted.
  'context:tournament-history-delete': (id: string | null, ack: (deleted: number) => void) => void
}

export type ClientType = 'dashboard' | 'overlay'

export interface HandshakeAuth {
  clientType: ClientType
  key: string
}

export const isValidKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(key)

// GET /api/room: this Zerocade's room, and the one overlay link to give OBS or TikTok LIVE
// Studio. The link carries no key: the overlay asks for the room the same way.
export interface RoomInfo {
  key: string
  overlayUrl: string
  // Set while this PC's hosts file lacks the overlay link's domain: the line it needs.
  hostsLine?: string
  // Where the leaderboards are published (nginx on the Linux VM), from ZEROCADE_PUBLIC_URL, when set.
  publicUrl?: string
}
