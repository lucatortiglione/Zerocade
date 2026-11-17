// ZeroWordHunt (gioco-zerowordhunt/Word_Hunt_Specifica_Tecnica_v1.0.md): the rules as numbers, the geometry of the reference
// screenshot, and what server, overlay and dashboard exchange. The server alone decides who found a word first; overlays only
// show `WordHuntPublicState`, which never holds a target that is not found yet, nor its path, nor its avatar cell (spec §10.3).
// Only `WordHuntAdminState`, sent to the dashboard alone, has them. The section of the specification is next to each number.

import type { Viewer } from './index.js'

export const WORDHUNT_RULES = Object.freeze({
  version: 'wordhunt-1.0',
  rows: 20, // §2.1
  cols: 15, // §2.1
  // The "Tabellone Grande": the 20 x 15 board (rows A-T, columns 1-15) with 24 words to find. The reference screenshot has 8; the
  // generated board has 24, in the same geometry. With that many words the targets are kept to 8 letters so they all fit.
  targetCount: 24,
  targetMin: 1,
  targetMax: 24,
  denseTargets: 12, // above this many targets the words are cut to `denseMaxWordLength`
  denseMaxWordLength: 8,
  pauseSecondsDefault: 20, // between a round and the next one that starts by itself: the finished board stays on show
  pauseSecondsMin: 5,
  pauseSecondsMax: 120,
  autoStartDelayMs: 1_500, // after the game is chosen, before the first round is made
  // Real words hidden in the grid that are NOT targets, so that a word the chat sees is not always an answer. Their number follows the
  // targets: 6 decoys for 8 targets keeps about a third of the 300 cells in words (8 targets of ~7 letters, 8 avatars, 6 decoys of ~7
  // letters: ~106 cells) and leaves the rest as filler; more would crowd the grid and make the targets hard to tell apart by the chat.
  decoyRatio: 0.75,
  decoyMax: 6,
  minWordLength: 5, // §3.4
  maxWordLength: 12, // §3.4
  roundSecondsDefault: 360, // §3.4 says 180 for 8 words; 24 words need longer
  roundSecondsMin: 30,
  roundSecondsMax: 900,
  countdownSecondsDefault: 15, // §3.4 says 5; longer here so NASA's picture, shown whole before each round, can be looked at
  countdownSecondsMax: 30,
  guessesPerWindow: 3, // §7.5: three guesses every two seconds per user
  guessWindowMs: 2_000,
  maxMessageChars: 140,
  maxSeenMessageKeys: 50_000, // message keys remembered per round
  maxParticipants: 10_000,
  maxStoredGuesses: 5_000, // guesses on a target saved per round (the others are only counted)
  maxReasonChars: 300,
  maxSeedChars: 64,
  maxGenerationAttempts: 200, // §6.4: a bounded budget, then a controlled failure
  emitEveryMs: 200,
  retentionDays: 90,
  leaders: 10,
})

// §2.1: the reference canvas. Everything is drawn in these coordinates and scaled by one factor (§5.3).
export const WORDHUNT_REFERENCE = Object.freeze({
  canvasWidth: 570,
  canvasHeight: 769,
  gridX: 24,
  gridY: 45,
  tile: 34,
  gap: 2,
  step: 36,
  radius: 4,
})

// §2.2: the palette of the reference, in the order the words of the fixture use it.
export const WORDHUNT_COLORS = Object.freeze({
  background: '#0E0E16',
  tile: '#16161C',
  border: '#1E1E25',
  letter: '#FFFFFF',
  foundLetter: '#000000',
})

// §6.5: the colours given to the words as they are found. Pairs that can be confused (the two greens, the two pinks) are
// listed so the next colour is chosen away from the one just given.
export const WORDHUNT_PALETTE: readonly string[] = Object.freeze([
  '#F97316', '#22D3EE', '#F472B6', '#22C55E', '#A855F7', '#FACC15', '#FF2D78', '#4ADE80',
  // With 24 words the eight of the reference would repeat three times: these are six more, apart from them and from each other.
  '#60A5FA', '#F87171', '#A3E635', '#2DD4BF', '#E879F9', '#FDBA74',
])
export const WORDHUNT_SIMILAR: readonly (readonly [string, string])[] = Object.freeze([
  ['#22C55E', '#4ADE80'], ['#F472B6', '#FF2D78'], ['#F97316', '#FACC15'], ['#4ADE80', '#A3E635'], ['#F472B6', '#E879F9'],
  ['#F97316', '#FDBA74'], ['#22D3EE', '#2DD4BF'], ['#22D3EE', '#60A5FA'], ['#FF2D78', '#F87171'], ['#A855F7', '#E879F9'],
])

// The sizes of the generated board, as "cols x rows, words" (the size menu of the games this one is modelled on). The large one is the
// 20 rows (A-T) by 15 columns (1-15) of the reference screenshot; the others are smaller in the same geometry.
export type WordHuntSize = 'quick' | 'standard' | 'large'
export const WORDHUNT_SIZES: Readonly<Record<WordHuntSize, { label: string; cols: number; rows: number; words: number }>> = Object.freeze({
  quick: { label: 'Rapido', cols: 13, rows: 15, words: 14 },
  standard: { label: 'Standard', cols: 15, rows: 17, words: 20 },
  large: { label: 'Grande', cols: 15, rows: 20, words: 24 },
})
export const WORDHUNT_SIZE_DEFAULT: WordHuntSize = 'large'
export const isWordHuntSize = (value: unknown): value is WordHuntSize => typeof value === 'string' && Object.hasOwn(WORDHUNT_SIZES, value)

// The board is drawn on a surface that grows with its cells: 570 x 769 for 15 x 20 (the screenshot), the same margins for the others.
export const wordHuntCanvas = (cols: number, rows: number): { width: number; height: number } => ({
  width: WORDHUNT_REFERENCE.gridX + cols * WORDHUNT_REFERENCE.step + 6,
  height: WORDHUNT_REFERENCE.gridY + rows * WORDHUNT_REFERENCE.step + 4,
})

export type WordHuntDirection = 'RIGHT' | 'DOWN' | 'LEFT' | 'UP' | 'DOWN_RIGHT' | 'DOWN_LEFT' | 'UP_RIGHT' | 'UP_LEFT'
export const WORDHUNT_DIRECTIONS: Readonly<Record<WordHuntDirection, readonly [number, number]>> = Object.freeze({
  RIGHT: [0, 1], DOWN: [1, 0], LEFT: [0, -1], UP: [-1, 0],
  DOWN_RIGHT: [1, 1], DOWN_LEFT: [1, -1], UP_RIGHT: [-1, 1], UP_LEFT: [-1, -1],
})

// The directions a word may take (spec §3.3). Without options: left to right and top to bottom. "Parole al contrario" adds the
// opposite of each; "Parole in diagonale" adds the diagonals. With both, the diagonals too can be written backwards. A direction is
// "forward" when it reads downwards, or rightwards on a row (the order of the text): RIGHT, DOWN and the two diagonals that go down.
export const wordHuntDirections = (reverse: boolean, diagonal: boolean): WordHuntDirection[] => {
  const forward: WordHuntDirection[] = ['RIGHT', 'DOWN', ...(diagonal ? (['DOWN_RIGHT', 'DOWN_LEFT'] as const) : [])]
  const backward: WordHuntDirection[] = ['LEFT', 'UP', ...(diagonal ? (['UP_LEFT', 'UP_RIGHT'] as const) : [])]
  return reverse ? [...forward, ...backward] : forward
}

export type WordHuntMode = 'fixture' | 'generated'
// §8.1 without the states the room never rests in: CREATED and READY are one, ARCHIVED is the end of the stored record.
export type WordHuntPhase = 'idle' | 'ready' | 'countdown' | 'active' | 'finished'
export type WordHuntEnd = 'completed' | 'timeout' | 'stopped'

export type WordHuntErrorCode = 'stale-version' | 'wrong-phase' | 'bad-input' | 'no-dictionary' | 'generation-failed' | 'not-found' | 'unavailable'
export type WordHuntReply = { ok: true } | { ok: false; error: WordHuntErrorCode; message: string }

// Commands of the dashboard. Each carries the version the clicker saw (DIRETTIVE §13).
export type WordHuntCommand =
  | { type: 'create-round'; expectedVersion: number; mode: WordHuntMode; size?: WordHuntSize; seed?: string; durationSeconds?: number; targetCount?: number }
  | { type: 'start'; expectedVersion: number }
  | { type: 'finish'; expectedVersion: number }
  | { type: 'reset'; expectedVersion: number }
  // §8.4: the only manual correction, with a reason that stays in the log; it never names a winner.
  | { type: 'revoke'; expectedVersion: number; target: number; reason: string }

export type WordHuntWinner = Pick<Viewer, 'id' | 'nickname' | 'avatar'>

// A word that has been found, as everybody sees it: the path, the colour and the avatar of who found it (§4).
export interface WordHuntClaim {
  target: number // 1-based, stable inside the round
  word: string
  cells: string[] // 'A2'... in reading order
  avatarCell: string // the cell next to the word that carries the winner's picture
  color: string
  winner: WordHuntWinner
  points: number
  seq: number // the order of the claims in the round
}

export interface WordHuntLeader {
  id: string
  nickname: string
  avatar?: string
  words: number
  points: number
  place: number // ex aequo: 1, 1, 3
}

export interface WordHuntPublicState {
  version: number
  eventSeq: number // grows with every claim and every change of phase: a client that sees a jump asks for the snapshot again
  roundId: string | null
  phase: WordHuntPhase
  mode: WordHuntMode | null
  rows: number
  cols: number
  letters: string[] // `rows` strings of `cols` letters; the cells of the avatars hold their filler letter until they are found
  total: number
  found: number
  claims: WordHuntClaim[]
  paused: boolean
  remainingMs: number // at `serverNow`; the overlay counts down from here while the phase is countdown or active
  serverNow: number
  end: WordHuntEnd | null
  leaders: WordHuntLeader[]
  nextRoundMs: number | null // at `serverNow`: when the next round starts by itself (the round is finished), else null
  lastClaim: WordHuntClaim | null
  notice: string | null
}

export interface WordHuntAdminTarget {
  target: number
  word: string
  cells: string[]
  avatarCell: string
  direction: WordHuntDirection
  found: boolean
  winner: string | null // nickname
}

export interface WordHuntAdminState {
  state: WordHuntPublicState
  seed: string | null
  checksum: string | null
  targets: WordHuntAdminTarget[]
  decoys: { word: string; cells: string[] }[] // real words in the grid that are not answers (the chat's guess of one is simply wrong)
  dictionaryReady: boolean
  auto: boolean // rounds start by themselves (the setting is on and "Chiudi" has not stopped them)
  metrics: { received: number; ignored: Record<string, number>; guesses: number; overflow: number }
}

// The coordinates of a cell as the headers show them (§2.1): rows A-T, columns 1-15.
export const wordHuntCell = (row: number, col: number): string => `${String.fromCharCode(65 + row)}${col + 1}`
export const parseWordHuntCell = (cell: string): { row: number; col: number } | null => {
  const m = /^([A-Z])([1-9][0-9]?)$/.exec(cell)
  return m ? { row: m[1]!.charCodeAt(0) - 65, col: Number(m[2]) - 1 } : null
}

// The points of a word (§8.2): longer words are worth more.
export const wordHuntPoints = (length: number): number => 10 + 2 * Math.max(0, length - 4)
