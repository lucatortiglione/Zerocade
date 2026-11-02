import { Board, OTHER, STEP, connected, crop, linksOf, rebuild, type Crossing, type Dir, type Placed } from './board.js'
import { CURVE, clamp, lerp, matrix, size, target, type Archetype, type ArchetypeId } from './curve.js'
import { Lexicon, MIN_LEN, signature } from './lexicon.js'

// ZeroWords' level generator: from the target T(c, i) of the sawtooth curve to a grid, in the
// six stages of gioco-parole/ALGORITMO.md. Level n depends on n alone (and on the lexicon
// and the curve), so any level can be made at any time, in any order, for ever.

// Changes whenever the same n would give another level: kept with every level played.
export const GENERATOR_VERSION = 'zw-2'

const WINDOW: Record<ArchetypeId, number> = { A: 6, B: 6, C: 6, D: 40 } // words weighed per fill step
const BRANCH = 3 // slots tried at each step before backing up
const NODE_LIMIT = 250
const SEEDS_PER_ATTEMPT = 10 // seeds that reach the board; the cheap checks before it do not count
const SEEDS_SCANNED = 400
const SEED_BAND = 300 // seeds closest to the aimed familiarity, where each level starts at its own place
// Seeds (wheels) fall into this many fixed groups by their letters and level n draws from
// group n mod REPEAT_GAP only, so levels less than REPEAT_GAP apart never share a wheel.
const REPEAT_GAP = 50
const LEAVES = 30 // leaf words tried per expert swap, longest and rarest first
const PHI = (Math.sqrt(5) - 1) / 2
const VOWELS = new Set('AEIOU')
const RARE_CONSONANTS = new Set('ZGBFVPM')

export type Rng = () => number

// mulberry32 seeded from a string hash: a level always draws the same numbers.
export function rngFrom(seed: string): Rng {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type Variant = 'easy' | 'standard' | 'expert'

export interface Metrics {
  target: number
  dsim: number
  letters: number
  words: number
  crossings: number
  cycles: number
  startFriction: number
  meanEffort: number
  peakEffort: number
  bait: number
  medianRank: number
}

export interface Grid {
  rows: number
  cols: number
  words: Placed[]
  extras: string[]
  metrics: Metrics
}

export interface GeneratedLevel extends Grid {
  id: number
  version: string
  letters: string
  // The word the wheel is an anagram of: its full word, on every grid.
  seed: string
  archetype: ArchetypeId
  // A word of the wheel in none of the three grids, its length new each level: the chat's
  // secret word. Null only when the grids hold every word of the wheel.
  secret: string | null
  // Null when no grid on this wheel is far enough from the standard one: the standard
  // grid is played instead.
  variants: { easy: Grid | null; expert: Grid | null }
}

interface Sim {
  dsim: number
  score: number // not clamped: what the comparisons use, so a grid past the scale can still improve
  raw: number
  start: number
  mean: number
  peak: number
  hardest: string[] // the bottleneck (peak effort) first, then the next ones
}

interface Got {
  seed: string
  letters: string
  placed: Placed[]
  made: string[]
  share?: number
  sim?: Sim
}

// --- 1. Wheels ---

// A wheel is the anagram of a real word as long as the wheel (its seed and full word): no
// letter on it is there by chance, and every level has a word that takes all of them. Seeds
// of 6 to 9 letters, one per letter set (its most common word), most familiar first, none
// below CURVE.rarity.seedZipf.
class Seeds {
  private byLen = new Map<number, string[]>()
  // Place among the seeds of its length: 0 the most familiar, 1 the least.
  private place = new Map<string, number>()
  private group = new Map<string, number>()

  constructor(lex: Lexicon) {
    const [lo, hi] = CURVE.wheel
    for (let n = lo; n <= hi; n++) {
      const seen = new Set<string>()
      const out: string[] = []
      const words = lex.mainWords().filter((w) => w.length === n && lex.zipf.get(w)! >= CURVE.rarity.seedZipf)
      words.sort((a, b) => lex.rank.get(a)! - lex.rank.get(b)!)
      for (const w of words) {
        const sig = signature(w)
        if (seen.has(sig)) continue
        seen.add(sig)
        out.push(w)
        // By its letters: the group of the wheel itself.
        this.group.set(w, Math.floor(rngFrom(sig)() * REPEAT_GAP))
      }
      out.forEach((w, i) => this.place.set(w, i / Math.max(1, out.length - 1)))
      this.byLen.set(n, out)
    }
  }

  // Seeds of n letters from the level's group, around the place rarity r aims at: the
  // SEED_BAND closest first, each level starting at its own place among them (golden-ratio
  // steps, so levels of one group aiming alike still start far apart), then the rest.
  near(n: number, r: number, level: number): string[] {
    const gap = (w: string) => Math.abs(this.place.get(w)! - r)
    const group = level % REPEAT_GAP
    const sorted = (this.byLen.get(n) ?? []).filter((w) => this.group.get(w) === group).sort((a, b) => gap(a) - gap(b))
    const band = sorted.slice(0, SEED_BAND)
    const start = Math.floor(((level * PHI) % 1) * band.length)
    return [...band.slice(start), ...band.slice(0, start), ...sorted.slice(SEED_BAND)]
  }
}

// --- 2-3. Skeletons and the CSP fill ---

interface Context {
  lex: Lexicon
  arche: ArchetypeId
  a: Archetype
  words: number
  rng: Rng
  // Start of a tooth: at least longShare of the grid words have 5+ letters.
  shortCap: number
  // Wheel letters: a word this long (the full word) is on every grid.
  full: number
}

interface Option {
  cost: number
  tie: number
  word: string
  r: number
  c: number
  d: Dir
  crossings: Crossing[]
}

// J(w, slot) = w1 |CR - CRtarget| + w2 prefix + w3 cycles + w4 aspect.
function cost(board: Board, ctx: Context, word: string, r: number, c: number, d: Dir, crossings: Crossing[]): number {
  const { a } = ctx
  const w = CURVE.cost
  const k = crossings.length
  const crossRatio = (board.crossings + k) / Math.max(1, board.letters + word.length - k)
  let prefix = 0
  for (const [kk, j, q] of crossings) {
    const other = board.placed[j].w
    // The letter given away on the rarer of the two words.
    const at = ctx.lex.rank.get(word)! >= ctx.lex.rank.get(other)! ? kk : q
    prefix += at <= 1 ? 1 : -0.3
  }
  const fresh = Math.max(0, k - 1)
  const cycles = a.cycleReward ? -fresh : fresh * (board.cycles + fresh > a.maxCycles ? 1 : 0.2)
  const [t, b, l, rt] = board.boxWith(word, r, c, d)
  const aspect = Math.abs(Math.log((b - t + 1) / (rt - l + 1) / CURVE.aspect))
  return (
    w.crossRatio * Math.abs(crossRatio - a.crossRatio) + w.prefix * a.prefix * prefix + w.cycles * cycles + w.aspect * aspect
  )
}

// The best slots for the next few words that fit somewhere. While the board has no full
// word (B's bridge may be shorter), only a full word may come next.
function options(board: Board, ctx: Context, remaining: string[]): Option[] {
  const shorts = board.placed.filter((p) => p.w.length === MIN_LEN).length
  const owed = !board.placed.some((p) => p.w.length === ctx.full)
  let found = 0
  let opts: Option[] = []
  for (const word of owed ? remaining.filter((w) => w.length === ctx.full) : remaining) {
    if (word.length === MIN_LEN && shorts >= ctx.shortCap) continue
    const mine: Option[] = []
    for (const [r, c, d] of board.slots(word)) {
      const crossings = board.fits(word, r, c, d)
      if (!crossings?.length) continue
      if (ctx.a.hardCycles && board.cycles + crossings.length - 1 > ctx.a.maxCycles) continue
      mine.push({ cost: cost(board, ctx, word, r, c, d, crossings), tie: ctx.rng(), word, r, c, d, crossings })
    }
    if (mine.length) {
      opts.push(...mine)
      if (++found === WINDOW[ctx.arche]) break
    }
  }
  if (ctx.arche === 'B' && opts.length) {
    // The two lobes grow together: the one with fewer words goes first when it can.
    const counts = [0, 0]
    for (const p of board.placed.slice(1)) counts[board.lobe(p.r)]++
    const lagging = counts[0] <= counts[1] ? 0 : 1
    const theirs = opts.filter((o) => board.lobe(o.r) === lagging)
    if (theirs.length) opts = theirs
  }
  opts.sort((x, y) => x.cost - y.cost || x.tie - y.tie)
  return opts.slice(0, BRANCH)
}

// Backtracking until the grid holds ctx.words words; false when it cannot.
function fill(board: Board, ctx: Context, order: string[]): boolean {
  const on = new Set(board.placed.map((p) => p.w))
  const remaining = order.filter((w) => !on.has(w))
  let nodes = 0
  const go = (): boolean => {
    if (board.placed.length >= ctx.words) return true
    for (const o of options(board, ctx, remaining)) {
      if (++nodes > NODE_LIMIT) return false
      const i = remaining.indexOf(o.word)
      remaining.splice(i, 1)
      board.put(o.word, o.r, o.c, o.d, o.crossings)
      if (go()) return true
      board.take()
      remaining.splice(i, 0, o.word)
    }
    return false
  }
  return go()
}

// The first word of a skeleton, at one of the given starts that fits.
function placeFree(board: Board, word: string, spots: [number, number, Dir][], rng: Rng): boolean {
  for (const [r, c, d] of shuffleInPlace([...spots], rng)) {
    if (board.fits(word, r, c, d)?.length === 0) {
      board.put(word, r, c, d, [])
      return true
    }
  }
  return false
}

// A · asymmetric frame: a blocked rectangle in the middle, the longest word W0 along the
// bottom or right edge, two carriers standing on it with their last letters.
function skeletonA(board: Board, ctx: Context, order: string[]): boolean {
  const { rows, cols } = board
  for (let r = Math.floor(rows * 0.4); r < Math.ceil(rows * 0.6); r++) {
    for (let c = Math.floor(cols * 0.4); c < Math.ceil(cols * 0.6); c++) board.block(r, c)
  }
  const longest = Math.max(...order.map((w) => w.length))
  for (const w0 of order.filter((w) => w.length === longest).slice(0, 3)) {
    const spots: [number, number, Dir][] = []
    for (const r of [rows - 1, rows - 2]) for (let c = 0; c <= cols - w0.length; c++) spots.push([r, c, 'H'])
    for (const c of [cols - 1, cols - 2]) for (let r = 0; r <= rows - w0.length; r++) spots.push([r, c, 'V'])
    for (const [r0, c0, d0] of shuffleInPlace(spots, ctx.rng).slice(0, 8)) {
      if (board.fits(w0, r0, c0, d0)?.length !== 0) continue
      board.put(w0, r0, c0, d0, [])
      if (carriers(board, ctx, order, w0, r0, c0, d0)) return true
      while (board.placed.length) board.take()
    }
  }
  return false
}

// W1 and W2 across W0, each standing on it with letter L - 2 or L - 1 (prefix uncovered),
// as far apart along W0 as they can be, so their prefixes open onto different parts.
function carriers(board: Board, ctx: Context, order: string[], w0: string, r0: number, c0: number, d0: Dir): boolean {
  const d = OTHER[d0]
  const [dr, dc] = STEP[d]
  const need = Math.max(MIN_LEN + 1, w0.length - 2)
  let firstQ: number | null = null
  for (let n = 0; n < 2; n++) {
    let best: { j: number; w: string; r: number; c: number; crossings: Crossing[]; q: number } | null = null
    const on = new Set(board.placed.map((p) => p.w))
    for (const w of order) {
      if (w.length < need || on.has(w)) continue
      for (const p of [w.length - 2, w.length - 1]) {
        for (let q = 0; q < w0.length; q++) {
          if (w0[q] !== w[p]) continue
          const rr = d0 === 'H' ? r0 : r0 + q
          const cc = d0 === 'H' ? c0 + q : c0
          const r = rr - dr * p
          const c = cc - dc * p
          const crossings = board.fits(w, r, c, d)
          if (!crossings || crossings.length !== 1) continue
          let j = cost(board, ctx, w, r, c, d, crossings) + ctx.rng() * 0.2
          if (firstQ !== null) j -= Math.abs(q - firstQ)
          if (!best || j < best.j) best = { j, w, r, c, crossings, q }
        }
      }
    }
    if (!best) return false
    board.put(best.w, best.r, best.c, d, best.crossings)
    firstQ = best.q
  }
  return true
}

// B · two lobes and a bridge: a vertical word of 7-8 letters (rank in bridgeRank) with its
// first two letters in the top lobe and its last two in the bottom one; the rows of its body
// are blocked, so it is the only way across. When it is not a full word, the fill places one
// first, in a lobe.
function skeletonB(board: Board, ctx: Context, order: string[]): boolean {
  const longest = Math.max(...order.map((w) => w.length))
  const lengths = longest >= 7 ? [7, 8] : [longest]
  const [lo, hi] = ctx.a.bridgeRank!
  const gap = (w: string) => {
    const rank = ctx.lex.rank.get(w)!
    return rank >= lo && rank <= hi ? 0 : Math.min(Math.abs(Math.log(rank / lo)), Math.abs(Math.log(rank / hi)))
  }
  const ties = new Map(order.map((w) => [w, ctx.rng()]))
  const bridges = order.filter((w) => lengths.includes(w.length)).sort((a, b) => gap(a) - gap(b) || ties.get(a)! - ties.get(b)!)
  if (!bridges.length) return false
  const bridge = bridges[0]
  const n = bridge.length
  const { rows, cols } = board
  const top = Math.floor((rows - n) / 2)
  const spots: [number, number, Dir][] = []
  for (let c = Math.floor(cols / 3); c < cols - Math.floor(cols / 3); c++) spots.push([top, c, 'V'])
  if (!placeFree(board, bridge, spots, ctx.rng)) return false
  const { r: r0, c: cb } = board.placed[0]
  for (let r = r0 + 2; r < r0 + n - 2; r++) for (let c = 0; c < cols; c++) if (c !== cb) board.block(r, c)
  board.lobes = [r0 + 1, r0 + n - 2]
  return true
}

// C and D start from the longest word across the middle of the board.
function skeletonCenter(board: Board, ctx: Context, order: string[]): boolean {
  const w0 = order.reduce((a, b) => (b.length > a.length ? b : a))
  const spots: [number, number, Dir][] =
    board.cols >= w0.length
      ? [[Math.floor(board.rows / 2), Math.floor((board.cols - w0.length) / 2), 'H']]
      : [[Math.floor((board.rows - w0.length) / 2), Math.floor(board.cols / 2), 'V']]
  return placeFree(board, w0, spots, ctx.rng)
}

const SKELETONS: Record<ArchetypeId, (board: Board, ctx: Context, order: string[]) => boolean> = {
  A: skeletonA,
  B: skeletonB,
  C: skeletonCenter,
  D: skeletonCenter,
}

// --- 4. Simulated solver ---

// How much a revealed letter at position p (of n) helps: the start most, the ending least.
function eta(p: number, ch: string, n: number): number {
  const e = CURVE.solver.eta
  if (p === 0) return e.first
  if (p === 1) return e.second
  if (p === n - 1) return e.last
  if (VOWELS.has(ch)) return e.vowel
  return RARE_CONSONANTS.has(ch) ? e.rareConsonant : e.consonant
}

// The words of the wheel a slot of `word`'s length could hold, with their weight
// 10^(gamma Zipf): what a player weighs it against.
export type Rivals = [string, number][]

export function rivalsOf(word: string, made: string[], lex: Lexicon): Rivals {
  const gamma = CURVE.solver.gamma
  return made.filter((v) => v.length === word.length).map((v) => [v, 10 ** (gamma * (lex.zipf.get(v) ?? 0))])
}

// Effort of `word` with the letters at `shown` on the board, rivals already on it (solved)
// left out. Cold = alpha L^1.4 + beta ln(1 + rank) with nothing shown; each shown letter
// takes off its share eta, normalized so that the whole word shown costs exactly the input
// (reading and typing it): d = input + (cold - input) (P - P_all) / (1 - P_all), with P the
// product of (1 - eta) over the shown letters, worked out with log1p / expm1 so that it stays
// exact near the ends. On top, lambda times the ambiguity log2(sum of the weights of the
// rivals that still fit / the word's own), 0 once nothing else fits. Never grows as letters
// show: `--selftest` checks it.
export function wordEffort(word: string, rank: number, shown: Set<number>, rivals: Rivals, solved?: Set<string>): number {
  const s = CURVE.solver
  const n = word.length
  const cold = s.alpha * n ** 1.4 + s.beta * Math.log(1 + rank)
  const input = Math.min(s.input, cold)
  if (shown.size >= n) return input
  let logP = 0
  let logAll = 0
  for (let p = 0; p < n; p++) {
    const l = Math.log1p(-eta(p, word[p], n))
    logAll += l
    if (shown.has(p)) logP += l
  }
  const den = -Math.expm1(logAll)
  // Every eta 0 (a degenerate curve.json): the share of letters still hidden.
  const g = den > 1e-12 ? (Math.exp(logP) * -Math.expm1(logAll - logP)) / den : (n - shown.size) / n
  let own = 1
  let fit = 0
  for (const [v, q] of rivals) {
    if (v === word) own = q
    else if (solved?.has(v)) continue
    let ok = true
    for (const p of shown) {
      if (v[p] !== word[p]) {
        ok = false
        break
      }
    }
    if (ok) fit += q
  }
  return input + (cold - input) * clamp(g, 0, 1) + s.lambda * Math.log2(Math.max(1, fit / own))
}

// Solve the grid like a player: always the word that is easiest right now, whose letters
// then show on the words crossing it (ties: the word placed first).
function simulate(placed: Placed[], lex: Lexicon, made: string[]): Sim {
  const s = CURVE.solver
  const n = placed.length
  const words = placed.map((p) => p.w)
  const ranks = words.map((w) => lex.rank.get(w)!)
  const rivals = new Map<number, Rivals>()
  for (const w of words) if (!rivals.has(w.length)) rivals.set(w.length, rivalsOf(w, made, lex))
  const links = linksOf(placed)
  const shown = placed.map(() => new Set<number>())
  const solved = placed.map(() => false)
  const taken = new Set<string>()
  const efforts: number[] = []
  const order: number[] = []
  for (let step = 0; step < n; step++) {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      if (solved[i]) continue
      const d = wordEffort(words[i], ranks[i], shown[i], rivals.get(words[i].length)!, taken)
      if (d < bestD) {
        best = i
        bestD = d
      }
    }
    efforts.push(bestD)
    order.push(best)
    solved[best] = true
    taken.add(words[best])
    for (const [, j, q] of links[best]) if (!solved[j]) shown[j].add(q)
  }
  const [k1, k2, k3] = s.k
  const start = efforts[0]
  const mean = efforts.reduce((a, b) => a + b, 0) / n
  const peak = Math.max(...efforts)
  const raw = k1 * start + k2 * mean + k3 * peak
  const [lo, hi] = s.scale
  const score = (100 * (raw - lo)) / (hi - lo)
  const hardest = efforts
    .map((e, i) => [e, order[i]] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => words[i])
  return { dsim: clamp(score, 0, 100), score, raw, start, mean, peak, hardest }
}

// Share of words in a closed rectangle: two parallel words crossing the same two others.
function cycleShare(placed: Placed[]): number {
  const links = linksOf(placed)
  const near = links.map((l) => new Set(l.map(([, j]) => j)))
  const inside = new Set<number>()
  for (let a = 0; a < placed.length; a++) {
    for (let b = a + 1; b < placed.length; b++) {
      if (placed[a].d !== placed[b].d) continue
      const common = [...near[a]].filter((j) => near[b].has(j))
      if (common.length >= 2) for (const i of [a, b, ...common]) inside.add(i)
    }
  }
  return inside.size / placed.length
}

// --- One level ---

// Grid candidates (main words), the seed first, then the most wanted: frequency rank close
// to what rarity r asks, longer words a little earlier. Short words beyond the archetype's
// cap stay out: they are bonus words.
function gridPool(lex: Lexicon, made: string[], seed: string, r: number, ctx: Context): string[] {
  const [lo, hi] = CURVE.rarity.wordRank
  const aim = lerp(Math.log(lo), Math.log(hi), r)
  const score = new Map<string, number>()
  for (const w of made) {
    if (!lex.isMain(w) || w === seed) continue
    score.set(w, -Math.abs(Math.log(lex.rank.get(w)!) - aim) + 0.25 * w.length + ctx.rng() * 0.7)
  }
  const ranked = [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)!)
  const shorts = new Set(ranked.filter((w) => w.length === MIN_LEN).slice(0, ctx.shortCap + 2))
  const pool = ranked.filter((w) => w.length > MIN_LEN || shorts.has(w))
  return [seed, ...pool.slice(0, Math.max(3 * ctx.words, ctx.words + 12) - 1)]
}

export class Generator {
  readonly lex = new Lexicon()
  private seeds = new Seeds(this.lex)

  // One grid for the level at rarity r, or null when no seed gives one.
  attempt(level: number, arche: ArchetypeId, wheel: number, words: number, r: number, rng: Rng): Got | null {
    const a = CURVE.archetypes[arche]
    const ctx: Context = {
      lex: this.lex,
      arche,
      a,
      words,
      rng,
      shortCap: a.longShare !== undefined ? Math.floor(words * (1 - a.longShare)) : words,
      full: wheel,
    }
    let tried = 0
    let found: Got | null = null
    let fallback: Got | null = null // D: the grid closest to the rectangle share, if none reaches it
    for (const seed of this.seeds.near(wheel, r, level).slice(0, SEEDS_SCANNED)) {
      if (tried === SEEDS_PER_ATTEMPT) break
      const made = this.lex.madeFrom(seed)
      if (made.length / words < a.baitRatio) continue
      const order = gridPool(this.lex, made, seed, r, ctx)
      if (order.length < words || order.filter((w) => w.length > MIN_LEN).length < words - ctx.shortCap) continue
      tried++
      const longest = Math.max(...order.map((w) => w.length))
      const { rows, cols } = matrix(words, longest, arche)
      const board = new Board(rows, cols)
      if (!SKELETONS[arche](board, ctx, order) || !fill(board, ctx, order)) continue
      const got: Got = { seed, letters: seed, placed: board.placed.map((p) => ({ ...p })), made }
      if (arche === 'D') {
        got.share = cycleShare(got.placed)
        if (got.share < a.cycleShare!) {
          if (!fallback || got.share > fallback.share!) fallback = got
          continue
        }
      }
      found = got
      break
    }
    found ??= fallback
    if (!found) return null
    found.sim = simulate(found.placed, this.lex, found.made)
    return found
  }

  // Level n (1-based), with its easy and expert variants; null when no grid can be made.
  level(n: number): GeneratedLevel | null {
    const { T, arche } = target(n)
    const { wheel, words } = size(n, arche)
    const rng = rngFrom(`zerowords:${n}`)
    let r = T / 100
    let best: Got | null = null
    for (let i = 0; i < CURVE.attempts; i++) {
      const got = this.attempt(n, arche, wheel, words, r, rng)
      if (!got) {
        r = clamp(r + rng() * 0.3 - 0.15, 0, 1)
        continue
      }
      const miss = got.sim!.score - T
      if (!best || Math.abs(miss) < Math.abs(best.sim!.score - T)) best = got
      if (Math.abs(miss) <= CURVE.tolerance) break
      r = clamp(r - CURVE.rarity.gain * miss, 0, 1)
    }
    if (!best) return null
    const grid = this.grid(T, best.letters, best.placed, best.made, best.sim!)
    const variants = this.variants(T, best, arche)
    const grids = [grid, variants.easy, variants.expert].filter((g): g is Grid => g !== null)
    // The words of every grid that may be played on this wheel.
    const gridWords = new Set(grids.flatMap((g) => g.words.map((w) => w.w)))
    let letters = wheelOrder(best.letters, gridWords, rng)
    // From a stream of its own, so the wheel and the grids stay what they were before there was a secret.
    const secretRng = rngFrom(`zerowords:${n}:secret`)
    const secret = this.secret(best.made, grids, secretRng)
    // Never readable around the wheel: the wheel is shuffled again when it would be.
    if (secret && reads(letters, secret)) letters = wheelOrder(best.letters, gridWords, secretRng, secret)
    return { id: n, version: GENERATOR_VERSION, letters, seed: best.seed, archetype: arche, ...grid, secret, variants }
  }

  // The secret word: a main word of the wheel in none of the three grids (an extra one when
  // the grids took every main word). Its length is drawn among the lengths there are, then it
  // is one of the three most common words of that length, so the chat has a fair chance at it.
  private secret(made: string[], grids: Grid[], rng: Rng): string | null {
    const used = new Set(grids.flatMap((g) => g.words.map((w) => w.w)))
    const free = made.filter((w) => !used.has(w))
    const main = free.filter((w) => this.lex.isMain(w))
    const pool = main.length ? main : free
    if (!pool.length) return null
    const lengths = [...new Set(pool.map((w) => w.length))].sort((a, b) => a - b)
    const length = lengths[Math.floor(rng() * lengths.length)]
    const rank = (w: string) => this.lex.rank.get(w)!
    const common = pool
      .filter((w) => w.length === length)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 3)
    return common[Math.floor(rng() * common.length)]
  }

  private grid(T: number, letters: string, placed: Placed[], made: string[], sim: Sim): Grid {
    const { words, rows, cols } = crop(placed)
    // A full word first (B's bridge may come before it).
    const full = words.findIndex((w) => w.w.length === letters.length)
    if (full > 0) words.unshift(...words.splice(full, 1))
    const on = new Set(words.map((w) => w.w))
    const links = linksOf(placed)
    const crossings = links.reduce((s, l) => s + l.length, 0) / 2
    const ranks = placed.map((p) => this.lex.rank.get(p.w)!).sort((a, b) => a - b)
    const round = (x: number, k: number) => Math.round(x * 10 ** k) / 10 ** k
    return {
      rows,
      cols,
      words,
      extras: made.filter((w) => !on.has(w)).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)),
      metrics: {
        target: round(T, 1),
        dsim: round(sim.dsim, 1),
        letters: letters.length,
        words: placed.length,
        crossings,
        cycles: crossings - placed.length + 1,
        startFriction: round(sim.start, 2),
        meanEffort: round(sim.mean, 2),
        peakEffort: round(sim.peak, 2),
        bait: made.length - on.size,
        medianRank: ranks[Math.floor(placed.length / 2)],
      },
    }
  }

  private measure(placed: Placed[], made: string[]): Sim {
    return simulate(placed, this.lex, made)
  }

  // --- 6. DDA variants ---

  // Easy (T - 15) and expert (T + 12) grids on the same wheel, each a few edits away from the
  // standard one, re-measured by the solver after every edit. Their targets stay within the
  // scale (a boss at T 98 has no T + 12 to aim at), and a variant that does not end up
  // minGap points of D_sim away from the standard grid, on its side, is left out (null).
  private variants(T: number, got: Got, arche: ArchetypeId): { easy: Grid | null; expert: Grid | null } {
    const tol = CURVE.tolerance
    const a = CURVE.archetypes[arche]
    // A tree stays a tree.
    const maxCycles = a.hardCycles ? a.maxCycles : Infinity
    const out: { easy: Grid | null; expert: Grid | null } = { easy: null, expert: null }
    for (const name of ['easy', 'expert'] as const) {
      const aim = clamp(T + CURVE.variants[name], tol, 100 - tol)
      let board = rebuild(got.placed)!
      let sim = got.sim!
      for (let step = 0; step < CURVE.variants.steps; step++) {
        if (name === 'easy' ? sim.score <= aim + tol : sim.score >= aim - tol) break
        let moved: Sim | null
        if (name === 'easy') {
          moved = this.easyStep(board, got.made, sim, aim)
          if (!moved) {
            const swapped = this.easySwap(board, got.made, got.letters.length, maxCycles, sim, aim)
            moved = swapped?.sim ?? null
            if (swapped) board = rebuild(swapped.placed)!
          }
        } else {
          const swapped = this.expertStep(board, got.made, got.letters.length, sim, aim)
          moved = swapped?.sim ?? null
          if (swapped) board = rebuild(swapped.placed)!
        }
        if (!moved) break
        sim = moved
      }
      const apart = name === 'easy' ? got.sim!.score - sim.score : sim.score - got.sim!.score
      if (apart >= CURVE.variants.minGap) out[name] = this.grid(aim, got.letters, board.placed, got.made, sim)
    }
    return out
  }

  // Graft a short bonus word across letter 0 or 1 of the hardest word that takes one, the
  // bottleneck first: of its grafts, the one leaving D_sim closest to aim. 4-letter words
  // first, 5 only when none fits. Null when no graft lowers D_sim.
  private easyStep(board: Board, made: string[], sim: Sim, aim: number): Sim | null {
    const on = new Set(board.placed.map((p) => p.w))
    for (const length of [MIN_LEN, MIN_LEN + 1]) {
      const shorts = made.filter((w) => w.length === length && this.lex.isMain(w) && !on.has(w))
      for (const hard of sim.hardest) {
        const { w: word, r: r0, c: c0, d: d0 } = board.placed.find((p) => p.w === hard)!
        const d = OTHER[d0]
        const [dr, dc] = STEP[d]
        let best: { s: Sim; w: string; r: number; c: number; crossings: Crossing[] } | null = null
        for (const w of shorts) {
          for (const q of [0, 1]) {
            const rr = d0 === 'H' ? r0 : r0 + q
            const cc = d0 === 'H' ? c0 + q : c0
            for (let k = 0; k < w.length; k++) {
              if (w[k] !== word[q]) continue
              const r = rr - dr * k
              const c = cc - dc * k
              const crossings = board.fits(w, r, c, d)
              if (!crossings || crossings.length !== 1) continue
              board.put(w, r, c, d, crossings)
              if (board.withinLimits()) {
                const s = this.measure(board.placed, made)
                if (s.score < sim.score && (!best || Math.abs(s.score - aim) < Math.abs(best.s.score - aim))) {
                  best = { s, w, r, c, crossings }
                }
              }
              board.take()
            }
          }
        }
        if (best) {
          board.put(best.w, best.r, best.c, d, best.crossings)
          return best.s
        }
      }
    }
    return null
  }

  // When no graft helps: one of the hardest words (never the last full word) leaves the grid
  // and a more common word takes its place, anywhere it crosses the rest: of the swaps, the
  // one leaving D_sim closest to aim. The grid keeps its number of words. Null when no swap
  // lowers D_sim.
  private easySwap(board: Board, made: string[], full: number, maxCycles: number, sim: Sim, aim: number): { sim: Sim; placed: Placed[] } | null {
    const placed = board.placed
    const on = new Set(placed.map((p) => p.w))
    const fulls = placed.filter((p) => p.w.length === full).length
    const rank = (w: string) => this.lex.rank.get(w)!
    const common = made
      .filter((w) => this.lex.isMain(w) && !on.has(w))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, LEAVES)
    let best: { sim: Sim; placed: Placed[] } | null = null
    for (const hard of sim.hardest.slice(0, 3)) {
      const i = placed.findIndex((p) => p.w === hard)
      if (placed[i].w.length === full && fulls === 1) continue
      const kept = placed.filter((_, n) => n !== i)
      const trial = kept.length >= 2 && connected(kept) ? rebuild(kept) : null
      if (!trial) continue
      for (const w of common) {
        if (rank(w) >= rank(hard)) continue
        for (const [r, c, d] of trial.slots(w)) {
          const crossings = trial.fits(w, r, c, d)
          if (!crossings?.length) continue
          trial.put(w, r, c, d, crossings)
          if (trial.withinLimits() && trial.cycles <= maxCycles) {
            const s = this.measure(trial.placed, made)
            if (s.score < sim.score && (!best || Math.abs(s.score - aim) < Math.abs(best.sim.score - aim))) {
              best = { sim: s, placed: trial.placed.map((p) => ({ ...p })) }
            }
          }
          trial.take()
        }
      }
    }
    return best
  }

  // A short word that gives away letter 0 or 1 of a longer word leaves the grid, and a leaf
  // (crossing one word only) hooked on the last letter of a word takes its place: of the
  // swaps, the one leaving D_sim closest to aim. Only when no such word allows a swap that
  // raises D_sim (J already steers A, B and C away from prefix crossings) do the other words
  // go instead; the last full word never does. Null when no swap raises D_sim.
  private expertStep(board: Board, made: string[], full: number, sim: Sim, aim: number): { sim: Sim; placed: Placed[] } | null {
    const placed = board.placed
    const links = linksOf(placed)
    const on = new Set(placed.map((p) => p.w))
    const fulls = placed.filter((p) => p.w.length === full).length
    const rank = (w: string) => this.lex.rank.get(w)!
    const leaves = made
      .filter((w) => this.lex.isMain(w) && !on.has(w))
      .sort((a, b) => b.length - a.length || rank(b) - rank(a))
      .slice(0, LEAVES)
    const prefix = (i: number) => links[i].some(([, j, q]) => q <= 1 && placed[j].w.length > placed[i].w.length)
    const all = placed.map((_, i) => i)
    for (const helpers of [all.filter(prefix), all.filter((i) => !prefix(i))]) {
      let best: { sim: Sim; placed: Placed[] } | null = null
      for (const i of helpers) {
        if (placed[i].w.length === full && fulls === 1) continue
        const kept = placed.filter((_, n) => n !== i)
        const trial = kept.length >= 2 && connected(kept) ? rebuild(kept) : null
        if (!trial) continue
        for (const leaf of leaves) {
          for (const [r, c, d] of trial.slots(leaf)) {
            const crossings = trial.fits(leaf, r, c, d)
            if (!crossings || crossings.length !== 1) continue
            const [k, j, q] = crossings[0]
            // Hooked on an ending: the last letter of the leaf or of the word it hangs on.
            if (k !== leaf.length - 1 && q !== trial.placed[j].w.length - 1) continue
            trial.put(leaf, r, c, d, crossings)
            if (trial.withinLimits()) {
              const s = this.measure(trial.placed, made)
              if (s.score > sim.score && (!best || Math.abs(s.score - aim) < Math.abs(best.sim.score - aim))) {
                best = { sim: s, placed: trial.placed.map((p) => ({ ...p })) }
              }
            }
            trial.take()
          }
        }
      }
      if (best) return best
    }
    return null
  }
}

// --- 5. Wheel order ---

const reads = (letters: string, word: string) => {
  const ring = letters.repeat(2)
  return ring.includes(word) || [...ring].reverse().join('').includes(word)
}

// Letters around the wheel, reading as few words of the grids as possible (clockwise or
// not), and never a full word, nor the secret one, when there is any way to avoid it.
function wheelOrder(letters: string, gridWords: Set<string>, rng: Rng, secret?: string): string {
  const order = [...letters]
  const sorted = [...gridWords].sort()
  let best: [number, string] | null = null
  for (let i = 0; i < 500; i++) {
    shuffleInPlace(order, rng)
    const ring = order.join('').repeat(2)
    const back = [...ring].reverse().join('')
    let penalty = 0
    for (const w of sorted) if (ring.includes(w) || back.includes(w)) penalty += w.length === letters.length ? 100 : w.length
    if (secret && (ring.includes(secret) || back.includes(secret))) penalty += 100
    if (!best || penalty < best[0]) best = [penalty, order.join('')]
    if (!penalty) break
  }
  return best![1]
}
