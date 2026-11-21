// ZeroWordHunt's pure domain (spec §2.3, §4, §6, §7.2): coordinates, the normalisation of a guess, the generator of the board
// with the cell of each avatar next to its word, the audit of every invariant, the fixture of the reference screenshot and
// the choice of the colour of a word. Nothing here has a clock, a socket or a database: the room (wordhunt.ts) owns those.
import { createHash } from 'node:crypto'
import {
  WORDHUNT_BASE_COLORS, WORDHUNT_DIRECTIONS, WORDHUNT_PALETTE, WORDHUNT_RULES, parseWordHuntCell, wordHuntCell,
  type WordHuntDirection,
} from '@zerocade/shared'

export interface Cell { row: number; col: number }
export type AvatarSide = 'before' | 'after'

export interface BoardTarget {
  id: number // 1-based, stable inside the round
  word: string
  start: Cell
  direction: WordHuntDirection
  cells: Cell[] // reading order, the first is `start`
  anchor: Cell // the cell of the avatar, one step beyond an end of the word along its axis (§4.1)
  side: AvatarSide
  color: string | null // fixed only by the fixture; a generated board gets it when the word is found (§6.5)
}

// A real word in the grid that is not an answer: it has no avatar, no colour and nobody can find it.
export interface BoardDecoy { word: string; start: Cell; direction: WordHuntDirection; cells: Cell[] }

export interface Board {
  rows: number
  cols: number
  letters: string[][] // the filler letter sits in every avatar cell, as §4.3 asks
  targets: BoardTarget[]
  decoys: BoardDecoy[]
  seed: string
  checksum: string
}

export class WordHuntGenerationError extends Error {
  override readonly name = 'WordHuntGenerationError'
}

export const cellName = (c: Cell): string => wordHuntCell(c.row, c.col)
export const cellNameFor = (rows: number) => (c: Cell): string => wordHuntCell(c.row, c.col, rows)
const key = (c: Cell): string => `${c.row},${c.col}`

// §7.2: the same function for the guesses and for the targets. Accents are kept, there is no stemming and no plural.
export function normalizeGuess(input: string): string | null {
  if (typeof input !== 'string' || input.length > WORDHUNT_RULES.maxMessageChars) return null
  const s = input
    .normalize('NFC')
    .trim()
    .toLocaleUpperCase('it-IT')
    .replace(/^[\s.,!?;:«»"'()[\]]+|[\s.,!?;:«»"'()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
  if (!/^[A-ZÀ-ÖØ-Ý]+$/u.test(s)) return null
  if (s.length < 2 || s.length > 32) return null
  return s
}

// ---- A seeded generator: the same seed and dictionary give the same board (§13.4) ----

function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

// §6.2 step 9: the filler letters, weighted for Italian.
const FILLER: readonly (readonly [string, number])[] = [
  ['A', 117], ['E', 118], ['I', 101], ['O', 98], ['N', 69], ['L', 65], ['R', 64], ['T', 56], ['S', 49], ['C', 45], ['D', 37],
  ['P', 30], ['U', 30], ['M', 25], ['V', 21], ['G', 16], ['H', 16], ['F', 12], ['B', 9], ['Q', 5], ['Z', 5],
]
const FILLER_TOTAL = FILLER.reduce((sum, [, w]) => sum + w, 0)
function fillerLetter(random: () => number): string {
  let r = random() * FILLER_TOTAL
  for (const [letter, weight] of FILLER) {
    r -= weight
    if (r < 0) return letter
  }
  return 'E'
}

// ---- The audit: every invariant of §6.2 step 10 and §2.4 ----

const readPath = (letters: string[][], cells: Cell[]): string => cells.map((c) => letters[c.row]?.[c.col] ?? '?').join('')
const inside = (rows: number, cols: number, c: Cell): boolean => c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols

// How many different places of the grid read `word`, along any of the eight directions. A reversed reading of the same cells is
// the same place; a palindrome is read once.
function occurrences(letters: string[][], word: string): number {
  const rows = letters.length
  const cols = letters[0]?.length ?? 0
  const places = new Set<string>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of Object.values(WORDHUNT_DIRECTIONS)) {
        const cells: string[] = []
        let ok = true
        for (let i = 0; i < word.length; i++) {
          const rr = r + dr * i
          const cc = c + dc * i
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || letters[rr]![cc] !== word[i]) { ok = false; break }
          cells.push(`${rr},${cc}`)
        }
        if (ok) places.add([...cells].sort().join('|'))
      }
    }
  }
  return places.size
}

// The problems found, empty when the board is sound. Used by the generator before it publishes and by the tests on the fixture.
export function auditBoard(board: Board): string[] {
  const problems: string[] = []
  const { rows, cols, letters, targets } = board
  const cellName = cellNameFor(rows)
  if (letters.length !== rows || letters.some((line) => line.length !== cols)) problems.push(`la griglia non è ${rows}×${cols}`)
  const words = new Set<string>()
  const wordCells = new Map<string, number>()
  const anchors = new Map<string, number>()
  for (const t of targets) {
    if (words.has(t.word)) problems.push(`${t.word}: parola duplicata`)
    words.add(t.word)
    const d = WORDHUNT_DIRECTIONS[t.direction]
    if (t.cells.length !== t.word.length) problems.push(`${t.word}: il percorso non ha ${t.word.length} celle`)
    t.cells.forEach((c, i) => {
      if (!inside(rows, cols, c)) problems.push(`${t.word}: cella fuori griglia ${cellName(c)}`)
      if (i > 0 && (c.row - t.cells[i - 1]!.row !== d[0] || c.col - t.cells[i - 1]!.col !== d[1])) problems.push(`${t.word}: percorso non lineare`)
      if (wordCells.has(key(c))) problems.push(`${t.word}: la cella ${cellName(c)} è anche di un'altra parola`)
      wordCells.set(key(c), t.id)
    })
    if (readPath(letters, t.cells) !== t.word) problems.push(`${t.word}: le lettere lungo il percorso non la formano`)
    const first = t.cells[0]!
    const last = t.cells[t.cells.length - 1]!
    const expected = t.side === 'before' ? { row: first.row - d[0], col: first.col - d[1] } : { row: last.row + d[0], col: last.col + d[1] }
    if (t.anchor.row !== expected.row || t.anchor.col !== expected.col) problems.push(`${t.word}: l'avatar non è adiacente all'estremo ${t.side === 'before' ? 'iniziale' : 'finale'}`)
    if (!inside(rows, cols, t.anchor)) problems.push(`${t.word}: avatar fuori griglia`)
    if (anchors.has(key(t.anchor))) problems.push(`${t.word}: la cella dell'avatar ${cellName(t.anchor)} è già riservata`)
    anchors.set(key(t.anchor), t.id)
  }
  for (const t of targets) {
    if (wordCells.has(key(t.anchor))) problems.push(`${t.word}: l'avatar ${cellName(t.anchor)} copre una lettera di una parola`)
  }
  // The decoys: they read along their path and touch neither a target, another decoy nor an avatar cell.
  for (const d of board.decoys) {
    if (words.has(d.word)) problems.push(`${d.word}: l'esca è anche un bersaglio`)
    if (readPath(letters, d.cells) !== d.word) problems.push(`${d.word}: l'esca non si legge lungo il suo percorso`)
    for (const c of d.cells) {
      if (!inside(rows, cols, c)) problems.push(`${d.word}: esca fuori griglia`)
      if (wordCells.has(key(c))) problems.push(`${d.word}: l'esca usa la cella ${cellName(c)} di un'altra parola`)
      if (anchors.has(key(c))) problems.push(`${d.word}: l'esca copre l'avatar ${cellName(c)}`)
      wordCells.set(key(c), -1)
    }
  }
  for (const t of targets) {
    const n = occurrences(letters, t.word)
    if (n !== 1) problems.push(`${t.word}: compare in ${n} posizioni della griglia`)
  }
  return problems
}

const checksumOf = (rows: number, cols: number, letters: string[][], targets: BoardTarget[], decoys: BoardDecoy[]): string => {
  const cellName = cellNameFor(rows)
  return createHash('sha256')
    .update(JSON.stringify({
      rows, cols, letters: letters.map((l) => l.join('')),
      targets: targets.map((t) => [t.word, cellName(t.start), t.direction, cellName(t.anchor)]),
      decoys: decoys.map((d) => [d.word, cellName(d.start), d.direction]),
    }))
    .digest('hex')
}

// How many decoys a board with this many targets gets (WORDHUNT_RULES.decoyRatio, capped).
export const decoyCountFor = (targetCount: number): number => Math.min(WORDHUNT_RULES.decoyMax, Math.round(targetCount * WORDHUNT_RULES.decoyRatio))

// ---- The generator (§6.2, §6.3) ----

export interface GeneratorOptions {
  seed: string
  targetCount: number
  minWordLength: number
  maxWordLength: number
  directions: readonly WordHuntDirection[]
  decoyCount?: number // default: decoyCountFor(targetCount)
  rows?: number
  cols?: number
  maxAttempts?: number
}

export const DEFAULT_DIRECTIONS: readonly WordHuntDirection[] = Object.freeze(['RIGHT', 'DOWN'] as const)

interface Placement { start: Cell; direction: WordHuntDirection; cells: Cell[]; anchors: { side: AvatarSide; cell: Cell }[] }

function placements(word: string, rows: number, cols: number, directions: readonly WordHuntDirection[], needAnchor = true): Placement[] {
  const out: Placement[] = []
  for (const direction of directions) {
    const [dr, dc] = WORDHUNT_DIRECTIONS[direction]
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const endRow = row + dr * (word.length - 1)
        const endCol = col + dc * (word.length - 1)
        if (endRow < 0 || endRow >= rows || endCol < 0 || endCol >= cols) continue
        const cells = Array.from({ length: word.length }, (_, i) => ({ row: row + dr * i, col: col + dc * i }))
        const anchors: Placement['anchors'] = []
        const before = { row: row - dr, col: col - dc }
        const after = { row: endRow + dr, col: endCol + dc }
        if (inside(rows, cols, before)) anchors.push({ side: 'before', cell: before })
        if (inside(rows, cols, after)) anchors.push({ side: 'after', cell: after })
        if (anchors.length || !needAnchor) out.push({ start: { row, col }, direction, cells, anchors })
      }
    }
  }
  return out
}

// The target words are chosen with a mix of lengths; a word that is part of another one would read twice and is left out.
// The decoys come from the same pool, after the targets, with the same rule: none is part of another word of the grid.
function chooseWords(dictionary: readonly string[], opts: GeneratorOptions, random: () => number): { targets: string[]; decoys: string[] } {
  const pool = shuffle([...new Set(dictionary.map(normalizeGuess).filter((w): w is string => w !== null && w.length >= opts.minWordLength && w.length <= opts.maxWordLength))].sort(), random)
  const chosen: string[] = []
  const wanted = opts.targetCount + (opts.decoyCount ?? decoyCountFor(opts.targetCount))
  for (const word of pool) {
    if (chosen.length >= wanted) break
    if (chosen.some((c) => c.includes(word) || word.includes(c))) continue
    chosen.push(word)
  }
  return { targets: chosen.slice(0, opts.targetCount), decoys: chosen.slice(opts.targetCount) }
}

export function generateBoard(dictionary: readonly string[], options: GeneratorOptions): Board {
  const rows = options.rows ?? WORDHUNT_RULES.rows
  const cols = options.cols ?? WORDHUNT_RULES.cols
  const attempts = Math.min(options.maxAttempts ?? WORDHUNT_RULES.maxGenerationAttempts, WORDHUNT_RULES.maxGenerationAttempts)
  let lastProblem = 'nessun tentativo'
  for (let attempt = 0; attempt < attempts; attempt++) {
    const random = seededRandom(`${options.seed}#${attempt}`)
    const chosen = chooseWords(dictionary, options, random)
    const words = chosen.targets
    if (words.length < options.targetCount) { lastProblem = `il dizionario offre solo ${words.length} parole utili`; break }
    // The longest words first: they have the fewest places (§6.2 step 4).
    words.sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
    const occupied = new Set<string>()
    const reserved = new Set<string>()
    const placed: { word: string; p: Placement; anchor: { side: AvatarSide; cell: Cell } }[] = []
    let failed = false
    for (const word of words) {
      const options_ = shuffle(placements(word, rows, cols, options.directions), random)
      let done = false
      for (const p of options_) {
        if (p.cells.some((c) => occupied.has(key(c)) || reserved.has(key(c)))) continue
        const anchors = p.anchors.filter((a) => !occupied.has(key(a.cell)) && !reserved.has(key(a.cell)))
        if (!anchors.length) continue
        const anchor = anchors[Math.floor(random() * anchors.length)]!
        for (const c of p.cells) occupied.add(key(c))
        reserved.add(key(anchor.cell))
        placed.push({ word, p, anchor })
        done = true
        break
      }
      if (!done) { failed = true; lastProblem = `${word}: nessuna posizione libera`; break }
    }
    if (failed) continue
    // The decoys go in what is left, never on a word and never on an avatar cell; one that finds no room is left out (the grid is not
    // published with fewer targets, only with fewer decoys).
    const decoys: BoardDecoy[] = []
    for (const word of chosen.decoys) {
      const spot = shuffle(placements(word, rows, cols, options.directions, false), random).find((p) => p.cells.every((c) => !occupied.has(key(c)) && !reserved.has(key(c))))
      if (!spot) continue
      for (const c of spot.cells) occupied.add(key(c))
      decoys.push({ word, start: spot.start, direction: spot.direction, cells: spot.cells })
    }
    const letters: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
    for (const { word, p } of placed) p.cells.forEach((c, i) => { letters[c.row]![c.col] = word[i]! })
    for (const d of decoys) d.cells.forEach((c, i) => { letters[c.row]![c.col] = d.word[i]! })
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!letters[r]![c]) letters[r]![c] = fillerLetter(random)
    placed.sort((a, b) => a.p.start.row - b.p.start.row || a.p.start.col - b.p.start.col)
    const targets: BoardTarget[] = placed.map(({ word, p, anchor }, i) => ({
      id: i + 1, word, start: p.start, direction: p.direction, cells: p.cells, anchor: anchor.cell, side: anchor.side, color: null,
    }))
    const board: Board = { rows, cols, letters, targets, decoys, seed: options.seed, checksum: checksumOf(rows, cols, letters, targets, decoys) }
    const problems = auditBoard(board)
    if (!problems.length) return board
    lastProblem = problems[0]!
  }
  throw new WordHuntGenerationError(`Tabellone non generato: ${lastProblem}.`)
}

// ---- The fixture of the reference screenshot (§2.3, §2.4) ----

export interface FixtureFile {
  version: number
  rows: number
  cols: number
  grid: string[] // 'X' marks the cell covered by an avatar: its letter is not visible in the screenshot
  words: { word: string; start: string; direction: WordHuntDirection; color: string; avatar: string }[]
}

// The cells under the avatars hold a filler letter, drawn from the fixed seed so that the board is always the same (§4.3).
export function fixtureBoard(file: FixtureFile): Board {
  const random = seededRandom('wordhunt-fixture')
  const letters = file.grid.map((line) => [...line])
  const anchorKeys = new Set(file.words.map((w) => w.avatar))
  const targets: BoardTarget[] = file.words.map((w, i) => {
    const start = parseWordHuntCell(w.start)
    const anchor = parseWordHuntCell(w.avatar)
    if (!start || !anchor) throw new WordHuntGenerationError(`Fixture: coordinate non valide per ${w.word}.`)
    const [dr, dc] = WORDHUNT_DIRECTIONS[w.direction]
    const cells = Array.from({ length: w.word.length }, (_, k) => ({ row: start.row + dr * k, col: start.col + dc * k }))
    const last = cells[cells.length - 1]!
    const side: AvatarSide = anchor.row === start.row - dr && anchor.col === start.col - dc ? 'before' : 'after'
    if (side === 'after' && (anchor.row !== last.row + dr || anchor.col !== last.col + dc)) throw new WordHuntGenerationError(`Fixture: l'avatar di ${w.word} non è adiacente.`)
    return { id: i + 1, word: w.word, start, direction: w.direction, cells, anchor, side, color: w.color }
  })
  for (let r = 0; r < letters.length; r++) {
    for (let c = 0; c < (letters[r]?.length ?? 0); c++) {
      if (letters[r]![c] !== 'X') continue
      if (!anchorKeys.has(wordHuntCell(r, c))) throw new WordHuntGenerationError(`Fixture: la X in ${wordHuntCell(r, c)} non è un avatar.`)
      letters[r]![c] = fillerLetter(random)
    }
  }
  // The screenshot has no decoys: what it shows is only the eight words found.
  const board: Board = { rows: file.rows, cols: file.cols, letters, targets, decoys: [], seed: 'fixture', checksum: '' }
  board.checksum = checksumOf(board.rows, board.cols, board.letters, board.targets, board.decoys)
  const problems = auditBoard(board)
  if (problems.length) throw new WordHuntGenerationError(`Fixture non valida: ${problems[0]}`)
  return board
}

// ---- Colours (§6.5) ----


// Perceptual distance (CIE76 in Lab) between two #RRGGBB colours: the larger, the easier to tell apart on the board.
function lab(hex: string): [number, number, number] {
  const lin = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const [r, g, b] = lin
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const distance = (a: string, b: string): number => {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

// The next colour: the one of the free palette (the first 16 before the others) farthest from the colours already given (the nearest of them counts), so the colours on the
// board are as different as they can be. The first one is the first of the palette. Past the palette the colours start again, away from
// the ones given most recently.
export function nextColor(used: readonly string[], palette: readonly string[] = WORDHUNT_PALETTE): string {
  const recent = used.slice(-(palette.length - 1))
  if (!recent.length) return palette[0]!
  // The first colours of the palette until all are in use, then the others; the palette starts again only when none is free.
  const base = Math.min(WORDHUNT_BASE_COLORS, palette.length)
  const free = (list: readonly string[]) => list.filter((c) => !used.includes(c))
  const pool = free(palette.slice(0, base)).length ? free(palette.slice(0, base)) : free(palette).length ? free(palette) : palette
  let best = pool[0]!
  let bestScore = -1
  for (const c of pool) {
    const score = Math.min(...recent.map((u) => (u === c ? 0 : distance(c, u))))
    if (score > bestScore + 1e-9) { best = c; bestScore = score }
  }
  return best
}
