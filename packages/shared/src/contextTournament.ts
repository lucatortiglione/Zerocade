// ZeroContext's tournament (gioco-zerocontext/REGOLAMENTO_CONTEXT_TORNEO_v2_3.md, implementation:
// ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md): the rules as numbers, the official bands, and what server, overlays and
// dashboard exchange. The server alone decides: overlays and the dashboard's preview only show its state.
//
// Positions are the public ones, 1-based: the secret is 1, the closest word 2 (the ranking's rank + 1).

export const TOURNAMENT_RULES = Object.freeze({
  version: 'context-torneo-2.3',
  // One global window to send a word: 6 s, at most one valid word per player.
  windowMs: 6000,
  // After a window, results are shown before the next one opens ("ELABORAZIONE", "NUOVA FINESTRA").
  processingMs: 1000,
  // Before each window of 6 s, a countdown of 3 s (3, 2, 1) tells the players it is about to open (decided 15/11/2026).
  countdownMs: 3000,
  windowsPerRound: 70,
  // The rounds of a tournament: 5 or 7, or no limit (totalRounds null: the organiser ends it with «Concludi torneo»,
  // decided 15/11/2026).
  rounds: [5, 7] as readonly number[],
  // The Top 10 between rounds stays at least this long (configurable upwards); the next round starts only on command.
  intermissionMinMs: 15_000,
  intermissionMaxMs: 10 * 60_000,
  // Lifeline (§7): after window 30, when no player reached position 7500 or closer, a word ranked 4000-5000.
  buoyAfterWindow: 30,
  buoyFrom: 4000,
  buoyTo: 5000,
  // Points (§§4-6).
  jackpotTotal: 100,
  blueFree: 2,
  bluePenaltyMax: 4,
  // The guesses accepted in one window: beyond this the window refuses more, and the organiser is told (spec §4.8).
  maxPerWindow: 2000,
  // Board shown to the audience: the closest words of the round.
  boardSize: 40,
})

export type TournamentBand = 'target' | 'red' | 'orange' | 'yellow' | 'cyan' | 'blue'

// The official scale (§2): exclusive bands, with their Pioneer points and colours.
export const TOURNAMENT_BANDS: readonly { band: TournamentBand; until: number; pioneer: number; background: string; text: string; label: string }[] =
  Object.freeze([
    { band: 'target', until: 1, pioneer: 0, background: '#2E7D32', text: '#FFFFFF', label: 'Target' },
    { band: 'red', until: 100, pioneer: 15, background: '#C62828', text: '#FFFFFF', label: 'Rosso' },
    { band: 'orange', until: 600, pioneer: 10, background: '#FB8C00', text: '#212121', label: 'Arancione' },
    { band: 'yellow', until: 2500, pioneer: 10, background: '#FDD835', text: '#212121', label: 'Giallo' },
    { band: 'cyan', until: 7500, pioneer: 5, background: '#00ACC1', text: '#212121', label: 'Ciano' },
    { band: 'blue', until: Infinity, pioneer: 0, background: '#1565C0', text: '#FFFFFF', label: 'Blu' },
  ])

export function tournamentBand(position: number): TournamentBand {
  for (const b of TOURNAMENT_BANDS) if (position <= b.until) return b.band
  return 'blue'
}

export const bandInfo = (band: TournamentBand) => TOURNAMENT_BANDS.find((b) => b.band === band) ?? TOURNAMENT_BANDS[5]

// How close a band is: the high-water mark of the Pioneer bonus compares these.
export const BAND_STRENGTH: Readonly<Record<TournamentBand, number>> = Object.freeze({
  blue: 0, cyan: 1, yellow: 2, orange: 3, red: 4, target: 5,
})

// Tournament record states (spec §8) and the phase the audience sees (spec §3.2).
export type TournamentStatus = 'active' | 'intermission' | 'suspended' | 'completed' | 'cancelled'
export type TournamentPhase =
  | 'ready' // created, before the first round
  | 'window-open'
  | 'window-processing'
  | 'intermission'
  | 'suspended'
  | 'completed'
  | 'cancelled'

export const OPEN_STATUSES: readonly TournamentStatus[] = Object.freeze(['active', 'intermission', 'suspended'])

// A guess as the audience sees it, once its window is closed. `author` is null for the lifeline.
export interface TournamentGuessView {
  word: string
  position: number
  band: TournamentBand
  author: string | null
  window: number
  pioneer: number
  buoy?: true
}

// A row of the Classifica Torneo ZeroContext (§13.2): the place is shared by ties (ex aequo).
export interface TournamentRow {
  place: number
  tied: boolean
  nickname: string
  avatar?: string
  points: number
  // Points of the last settled round.
  delta: number
  solved: number
  // Pioneer bonuses won in the orange and red bands.
  redOrange: number
  bluePenalty: number
}

// The public state (spec §9): never the secret word, its index or the ranking before the round is over.
// A word just written in chat, for the "Parole scritte a schermo" setting: its position when it is a word (null: not one).
export interface TournamentTypedView {
  text: string
  nickname: string
  avatar?: string
  position: number | null
}

export interface ContextTournamentState {
  version: number
  tournamentId: string
  status: TournamentStatus
  phase: TournamentPhase
  round: number
  // null: no limit, the tournament goes on until the organiser ends it.
  totalRounds: number | null
  window: number
  windowsPerRound: number
  // Milliseconds left in the open window (or before the next opens), measured at `serverNow`.
  remainingMs: number
  // Of the wait before a window, the last countdownMs are the visible 3-2-1; the rest is the results' time.
  countdownMs: number
  serverNow: number
  // Valid words received in the open window (their ranks stay hidden until it closes).
  submissions: number
  // The secret, only once the round is over.
  solution: string | null
  solvedBy: string | null
  // The corpus size, to draw the closeness bars like the classic game.
  corpusSize: number
  // The secret's length, only while a round is on and the room's "Mostra numero di lettere" is on (else null: never said).
  wordLength: number | null
  // The newest words written, only with that setting on (else empty): as in the classic game, coloured at once.
  typed: TournamentTypedView[]
  board: TournamentGuessView[]
  lastWindow: TournamentGuessView[]
  buoy: TournamentGuessView | null
  best: number | null
  players: number
  top10: TournamentRow[]
  // The 10th place is shared with players below it: the full standings show them all.
  tieAtTen: boolean
  // Milliseconds of Top 10 left before the next round may start (intermission).
  intermissionMs: number
  suspendedReason: string | null
  achievements: string[]
}

// For the dashboard only (its own Socket.IO room): the secret and the full standings.
export interface ContextTournamentAdmin {
  state: ContextTournamentState
  secret: string | null
  standings: TournamentRow[]
  overflow: number
  canStartRound: boolean
  bridgeReady: boolean
}

export interface TournamentSummary {
  id: string
  status: TournamentStatus
  totalRounds: number | null
  roundsPlayed: number
  players: number
  createdAt: number
  finishedAt: number | null
  winners: string[]
}

export type TournamentCommand =
  | { type: 'create'; totalRounds: number | null; intermissionSeconds: number }
  | { type: 'start-round'; expectedVersion: number }
  | { type: 'pause'; expectedVersion: number }
  | { type: 'resume'; expectedVersion: number }
  | { type: 'close-round'; expectedVersion: number; reason: string }
  | { type: 'void-round'; expectedVersion: number; reason: string }
  | { type: 'finish'; expectedVersion: number }
  | { type: 'cancel'; expectedVersion: number; reason: string }
  // Between rounds: the standings back to empty, the rounds played so far voided; the tournament starts again from round 1.
  | { type: 'reset-standings'; expectedVersion: number; reason: string }
  // After the end (completed or cancelled): the overlay leaves the final Top 10 and ZeroContext is classic again.
  | { type: 'dismiss'; expectedVersion: number }

export type TournamentReply = { ok: true } | { ok: false; error: string }
