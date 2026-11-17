// ZeroTaboo (gioco-zerotaboo/ZEROTABOO.md v3.0): the rules as numbers, and what server, overlay and dashboard exchange.
// The server alone decides. Overlays only show `TabooPublicState`, which never holds the target, the Taboo words or the
// aliases of a card that is not closed: only `TabooAdminState`, sent to the dashboard alone, has them.
// The numbers come from ZEROTABOO.md; the section is next to each one. The choices of the organiser (16/11/2026) are marked "D<n>".

import type { Viewer } from './index.js'

export const TABOO_RULES = Object.freeze({
  version: 'taboo-3.0',
  rounds: 5, // §1.1, §5
  roundMs: 90_000, // §1.1
  thresholdDefault: 25, // §1.3, §4: fixed before the match starts
  thresholdMin: 5,
  thresholdMax: 100,
  skipsPerRound: 2, // §2, §3.4
  guessCooldownMs: 2_000, // §2: one attempt per user every 2 s, counted from the reception (D5: every comment on an active card)
  basePoints: Object.freeze({ 1: 1, 2: 2, 3: 3 } as const), // §4: easy +1, medium +2, hard +3
  tabooPenalty: 1, // §3.5, §4: never below 0
  streakEvery: 3, // §4: +1 at 3, 6, 9... consecutive correct cards in the same round
  streakBonus: 1,
  doubleMultiplier: 2, // §4: Jackpot or sung card, on the base points only
  sungWindowMs: 20_000, // §6: only in the last 20 s of a round
  intermissionMinMs: 15_000, // §5
  intermissionMaxMs: 30_000, // §5
  intermissionDefaultMs: 20_000, // D9: fixed 20 s, the round starts on the button
  cardTransitionMs: Object.freeze([1_000, 2_000] as const), // §5: graphics only, the timer keeps running
  excludeNextMatches: 2, // §5: a played card stays out of the next two matches, only if the deck allows it
  maxMessageChars: 140, // the bridge already cuts at 140 (zfb.ts MAX_TEXT)
  maxMessageTokens: 40, // defence in depth against a flood of tokens
  maxExtraTokens: 8, // D4: tokens beyond the answer; more than this and the message is taken as a list of hypotheses
  maxModerationPending: 50, // reports waiting for the interval, per match
  maxSeenMessageKeys: 50_000, // message keys remembered per match
  maxWrongAnswerTexts: 200, // wrong answers kept (aggregated) per card exposure, if the telemetry keeps them
  wrongAnswerChars: 40,
  maxReasonChars: 300,
  emitEveryMs: 200, // the public state is sent at most this often (immediately on a change of phase)
  topGuessers: 3, // §10: the three best guessers shown in the intervals
  telemetryRetentionDays: 90, // D16
})

export type TabooDifficulty = 1 | 2 | 3
export type TabooOutcome = 'solved' | 'skipped' | 'taboo' | 'round_timeout'
export type TabooPlatform = 'tiktok' | 'twitch'
export type TabooCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type TabooCardCode = string // [A-F][0-9][0-9], stable

export const TABOO_CATEGORIES: readonly { code: TabooCategory; name: string; cards: number }[] = Object.freeze([
  { code: 'A', name: 'Disastri & Figuracce Quotidiane', cards: 12 },
  { code: 'B', name: 'Internet Culture & Meme', cards: 10 },
  { code: 'C', name: 'Vita da Streamer', cards: 10 },
  { code: 'D', name: 'Oggetti Buffi o Fraintendibili', cards: 10 },
  { code: 'E', name: 'Stereotipi & Personaggi Imbarazzanti', cards: 10 },
  { code: 'F', name: 'Italianità Estrema', cards: 10 },
])

export const TABOO_DIFFICULTY_LABEL: Readonly<Record<TabooDifficulty, string>> = Object.freeze({ 1: 'Facile', 2: 'Media', 3: 'Difficile' })

// §5: the narrative constraints of round 4, chosen by the bot at random (D12).
export const TABOO_NARRATIVES = Object.freeze(['telecronista', 'thriller', 'venditore disperato'] as const)
export type TabooNarrative = (typeof TABOO_NARRATIVES)[number]

export type TabooRoundKind = 'warmup' | 'classic' | 'chat-choice' | 'chaos' | 'finale'
export interface TabooRoundPlan {
  number: 1 | 2 | 3 | 4 | 5
  kind: TabooRoundKind
  // Weights of the extraction by difficulty (§5, "indicative"): configurable data, not conditions spread in the code.
  mix: Readonly<Record<TabooDifficulty, number>>
  votesCategory: boolean // round 3: the chat votes the category in the interval (D11)
  narrative: boolean // round 4: one narrative constraint, chosen before the round (D12)
  jackpotFirst: boolean // round 5: the first card is the Jackpot
}
export const TABOO_ROUND_PLANS: readonly TabooRoundPlan[] = Object.freeze([
  { number: 1, kind: 'warmup', mix: { 1: 0.7, 2: 0.3, 3: 0 }, votesCategory: false, narrative: false, jackpotFirst: false },
  { number: 2, kind: 'classic', mix: { 1: 0.3, 2: 0.5, 3: 0.2 }, votesCategory: false, narrative: false, jackpotFirst: false },
  { number: 3, kind: 'chat-choice', mix: { 1: 0.3, 2: 0.5, 3: 0.2 }, votesCategory: true, narrative: false, jackpotFirst: false },
  { number: 4, kind: 'chaos', mix: { 1: 0.3, 2: 0.5, 3: 0.2 }, votesCategory: false, narrative: true, jackpotFirst: false },
  { number: 5, kind: 'finale', mix: { 1: 0.2, 2: 0.5, 3: 0.3 }, votesCategory: false, narrative: false, jackpotFirst: true },
] as TabooRoundPlan[])

export type TabooMode = 'standard' | 'practice' // practice: simulator, outside the standings and the calibration (D7)

// What is fixed when the match starts and never changes during it (§1.3; DIRETTIVE §2 "Fotografie coerenti").
export interface TabooConfig {
  threshold: number
  platform: TabooPlatform // D6: the competitive platform; the other one closes the card with no individual winner
  intermissionMs: number
  mode: TabooMode
  rulesVersion: string
}

export type TabooPhase = 'setup' | 'intermission' | 'round' | 'suspended' | 'finished' | 'cancelled'

export type TabooErrorCode =
  | 'stale-version'
  | 'wrong-phase'
  | 'no-active-card'
  | 'no-skips-left'
  | 'already-penalized'
  | 'bridge-missing'
  | 'bad-input'
  | 'too-many-reports'
  | 'unavailable'
export type TabooReply = { ok: true } | { ok: false; error: TabooErrorCode; message: string }

// Commands of the dashboard. Each carries the version the clicker saw; a card command also the exposure (DIRETTIVE §13).
export type TabooCommand =
  | { type: 'start-match'; expectedVersion: number; threshold?: number; platform?: TabooPlatform; mode?: TabooMode }
  | { type: 'start-round'; expectedVersion: number }
  | { type: 'skip'; expectedVersion: number; exposure: number }
  | { type: 'taboo'; expectedVersion: number; exposure: number }
  | { type: 'report'; expectedVersion: number; exposure: number; reason: string; violationAfterMs?: number } // late or contested (§3.5)
  | { type: 'decide'; expectedVersion: number; report: number; verifiable: boolean; reason: string }
  | { type: 'sing'; expectedVersion: number; exposure: number }
  | { type: 'category'; expectedVersion: number; category: TabooCategory }
  | { type: 'pause'; expectedVersion: number }
  | { type: 'resume'; expectedVersion: number }
  | { type: 'cancel'; expectedVersion: number }
  | { type: 'dismiss'; expectedVersion: number }

export interface TabooLeader {
  id: string // Viewer.id: `${platform}:${id}`, never the nickname (§4)
  nickname: string
  avatar?: string // every name goes with its picture
  solved: number
  hard: number
  medium: number
  place: number // ex aequo: 1, 1, 3
}

export interface TabooLastWinner {
  user: Pick<Viewer, 'id' | 'nickname' | 'avatar'> | null // null: closed with no individual winner (D6)
  difficulty: TabooDifficulty
  points: number
}

// What overlays and the dashboard's preview receive. Never the target and never an alias of a card still open.
// D26 (17/11/2026, the organiser): the five Taboo words of the open card ARE shown to the audience ("le parole che non posso
// dire"), which departs from ZEROTABOO.md §3.2 and §12.2 for those words only. The target, its significant words and the
// aliases stay secret until the card is closed (§12.2).
export interface TabooPublicState {
  version: number
  matchId: string | null
  phase: TabooPhase
  round: number
  rounds: number
  roundKind: TabooRoundKind | null
  narrative: TabooNarrative | null
  category: TabooCategory | null // the category of the open card, or the voted one in the interval
  difficulty: TabooDifficulty | null // of the open card
  team: number
  threshold: number
  reachedThreshold: boolean
  streak: number
  skipsLeft: number
  remainingMs: number // at `serverNow`; the overlay counts down from here
  serverNow: number
  // The five words the streamer cannot say, for the open card only: empty in the intervals and when no card is open.
  forbidden: string[]
  jackpot: boolean // the open card is the Jackpot
  sung: boolean
  interrupted: boolean // the exposure is suspended for a technical reason (§9.1)
  lastWinner: TabooLastWinner | null
  // Only the cards that are closed: the answer is shown after the closure, never before (§10).
  revealed: { target: string; outcome: TabooOutcome } | null
  leaders: TabooLeader[]
  roundSummary: TabooRoundSummary | null // in the intervals
  correction: string | null // the reason of a rectification, shown between the rounds (§3.5)
  notice: string | null // a short note for the audience: the voted category is over, the deck is over, a technical pause
  platform: TabooPlatform
  mode: TabooMode
}

export interface TabooRoundSummary {
  round: number
  solved: number
  skipped: number
  taboo: number
  timeout: number
  points: number
  topGuessers: TabooLeader[]
}

export interface TabooAdminCard {
  exposure: number
  code: TabooCardCode
  revision: number
  target: string
  taboo: string[] // exactly five
  aliases: string[]
  difficulty: TabooDifficulty
  category: TabooCategory
}

// The latest closed cards, so the director can report one that was late or contested (§3.5): the answer is no secret any more.
export interface TabooRecentCard {
  round: number
  exposure: number
  target: string
  outcome: TabooOutcome
  winner: string | null // nickname, for the director's eyes
}

export interface TabooReport {
  id: number
  exposure: number
  reason: string
  at: number
  status: 'pending' | 'applied' | 'rejected'
}

// Only for the dashboard (its own Socket.IO room): the card in play and what the director can still do.
export interface TabooAdminState {
  state: TabooPublicState
  card: TabooAdminCard | null
  reports: TabooReport[]
  recent: TabooRecentCard[] // the last ten closed cards, newest first
  warnings: string[] // editorial warnings of the deck, never corrected silently (D18)
  bridgeReady: boolean
  canStartRound: boolean
  canSing: boolean
  metrics: { received: number; ignored: Record<string, number>; closed: Record<TabooOutcome, number>; overflow: number }
}
