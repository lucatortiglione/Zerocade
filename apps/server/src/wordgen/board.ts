import { CURVE } from './curve.js'

// The board the generator lays words on, with the hard rules of the CSP (ALGORITMO.md,
// stage 3): letters agree, both ends free, no letter side by side with another word.

export type Dir = 'H' | 'V'
export const STEP: Record<Dir, [number, number]> = { H: [0, 1], V: [1, 0] }
export const OTHER: Record<Dir, Dir> = { H: 'V', V: 'H' }

export interface Placed {
  w: string
  r: number
  c: number
  d: Dir
}

// Letter k of the new word lies on letter q of placed word j.
export type Crossing = [k: number, j: number, q: number]

// Cells as numbers; the offset keeps starts a little off the board (negative) apart too.
const key = (r: number, c: number) => (r + 32) * 128 + (c + 32)
const rowOf = (k: number) => Math.floor(k / 128) - 32
const colOf = (k: number) => (k % 128) - 32

interface Cell {
  ch: string
  // Index of the word through the cell in each direction, -1 for none.
  H: number
  V: number
}

type Box = [top: number, bottom: number, left: number, right: number]

export class Board {
  readonly blocked = new Set<number>()
  readonly placed: Placed[] = []
  crossings = 0
  letters = 0
  cycles = 0 // E - V + 1 of the crossing graph
  box: Box | null = null
  // Archetype B: last row of the top lobe, first row of the bottom one.
  lobes: [number, number] = [0, 0]
  private cells = new Map<number, Cell>()
  // Letter -> cells holding it in one direction only, where a word can still cross.
  private open = new Map<string, Set<number>>()
  private undo: { added: number[]; crossings: number; cycles: number; box: Box | null }[] = []

  constructor(
    readonly rows: number,
    readonly cols: number,
  ) {}

  has(r: number, c: number): boolean {
    return this.cells.has(key(r, c))
  }

  cellAt(r: number, c: number): Readonly<Cell> | undefined {
    return this.cells.get(key(r, c))
  }

  block(r: number, c: number): void {
    this.blocked.add(key(r, c))
  }

  indexIn(j: number, r: number, c: number): number {
    const p = this.placed[j]
    return r - p.r + (c - p.c)
  }

  // The crossings if the word can go here, null if it breaks a rule: off the board, on a
  // blocked cell, a different letter, running on along a word of its own direction, or a
  // letter touching another side by side.
  fits(word: string, r: number, c: number, d: Dir): Crossing[] | null {
    const [dr, dc] = STEP[d]
    const n = word.length
    const er = r + dr * (n - 1)
    const ec = c + dc * (n - 1)
    if (r < 0 || c < 0 || er >= this.rows || ec >= this.cols) return null
    if (this.cells.has(key(r - dr, c - dc)) || this.cells.has(key(er + dr, ec + dc))) return null
    const crossings: Crossing[] = []
    for (let k = 0; k < n; k++) {
      const rr = r + dr * k
      const cc = c + dc * k
      const cell = this.cells.get(key(rr, cc))
      if (cell) {
        if (cell.ch !== word[k] || cell[d] >= 0) return null
        const j = cell[OTHER[d]]
        crossings.push([k, j, this.indexIn(j, rr, cc)])
      } else if (
        this.blocked.has(key(rr, cc)) ||
        this.cells.has(key(rr + dc, cc + dr)) ||
        this.cells.has(key(rr - dc, cc - dr))
      ) {
        return null
      }
    }
    return crossings
  }

  // Every start that lays one of the word's letters across an equal letter, in a fixed order.
  slots(word: string): [number, number, Dir][] {
    const out = new Map<string, [number, number, Dir]>()
    for (const ch of new Set(word)) {
      for (const k of this.open.get(ch) ?? []) {
        const cell = this.cells.get(k)!
        const d: Dir = cell.H >= 0 ? 'V' : 'H'
        const [dr, dc] = STEP[d]
        const rr = rowOf(k)
        const cc = colOf(k)
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== ch) continue
          const r = rr - dr * i
          const c = cc - dc * i
          out.set(`${r},${c},${d}`, [r, c, d])
        }
      }
    }
    return [...out.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
  }

  boxWith(word: string, r: number, c: number, d: Dir): Box {
    const [dr, dc] = STEP[d]
    const er = r + dr * (word.length - 1)
    const ec = c + dc * (word.length - 1)
    if (!this.box) return [r, er, c, ec]
    const [t, b, l, rt] = this.box
    return [Math.min(t, r), Math.max(b, er), Math.min(l, c), Math.max(rt, ec)]
  }

  put(word: string, r: number, c: number, d: Dir, crossings: Crossing[]): void {
    const j = this.placed.length
    const [dr, dc] = STEP[d]
    const added: number[] = []
    for (let k = 0; k < word.length; k++) {
      const at = key(r + dr * k, c + dc * k)
      let cell = this.cells.get(at)
      if (!cell) {
        cell = { ch: word[k], H: -1, V: -1 }
        this.cells.set(at, cell)
        added.push(at)
        this.openSet(word[k]).add(at)
      } else {
        this.openSet(word[k]).delete(at)
      }
      cell[d] = j
    }
    const cycles = Math.max(0, crossings.length - 1)
    this.undo.push({ added, crossings: crossings.length, cycles, box: this.box })
    this.placed.push({ w: word, r, c, d })
    this.crossings += crossings.length
    this.letters += word.length - crossings.length
    this.cycles += cycles
    this.box = this.boxWith(word, r, c, d)
  }

  take(): void {
    const { w, r, c, d } = this.placed.pop()!
    const { added, crossings, cycles, box } = this.undo.pop()!
    const fresh = new Set(added)
    const [dr, dc] = STEP[d]
    for (let k = 0; k < w.length; k++) {
      const at = key(r + dr * k, c + dc * k)
      this.cells.get(at)![d] = -1
      if (fresh.has(at)) {
        this.cells.delete(at)
        this.openSet(w[k]).delete(at)
      } else {
        this.openSet(w[k]).add(at) // back to the other word's direction only
      }
    }
    this.crossings -= crossings
    this.letters -= w.length - crossings
    this.cycles -= cycles
    this.box = box
  }

  lobe(r: number): 0 | 1 {
    return r <= this.lobes[0] ? 0 : 1
  }

  withinLimits(): boolean {
    if (!this.box) return true
    const [t, b, l, rt] = this.box
    return b - t + 1 <= CURVE.maxRows && rt - l + 1 <= CURVE.maxCols
  }

  // True when every run of two or more letters, across or down, is a placed word.
  clean(): boolean {
    const declared = new Set(this.placed.map((p) => `${p.r},${p.c},${p.d},${p.w.length}`))
    for (const at of this.cells.keys()) {
      const r = rowOf(at)
      const c = colOf(at)
      for (const d of ['H', 'V'] as const) {
        const [dr, dc] = STEP[d]
        if (this.cells.has(key(r - dr, c - dc))) continue
        let n = 1
        while (this.cells.has(key(r + dr * n, c + dc * n))) n++
        if (n >= 2 && !declared.has(`${r},${c},${d},${n}`)) return false
      }
    }
    return true
  }

  private openSet(ch: string): Set<number> {
    let set = this.open.get(ch)
    if (!set) this.open.set(ch, (set = new Set()))
    return set
  }
}

// For each word, its crossings: [its letter k, other word j, j's letter q].
export function linksOf(placed: Placed[]): Crossing[][] {
  const at = new Map<number, { H?: [number, number]; V?: [number, number] }>()
  placed.forEach((p, i) => {
    const [dr, dc] = STEP[p.d]
    for (let k = 0; k < p.w.length; k++) {
      const cell = key(p.r + dr * k, p.c + dc * k)
      const entry = at.get(cell) ?? {}
      entry[p.d] = [i, k]
      at.set(cell, entry)
    }
  })
  const links: Crossing[][] = placed.map(() => [])
  for (const cell of at.values()) {
    if (cell.H && cell.V) {
      const [ih, kh] = cell.H
      const [iv, kv] = cell.V
      links[ih].push([kh, iv, kv])
      links[iv].push([kv, ih, kh])
    }
  }
  return links
}

export function connected(placed: Placed[]): boolean {
  const links = linksOf(placed)
  const seen = new Set([0])
  const todo = [0]
  while (todo.length) {
    for (const [, j] of links[todo.pop()!]) {
      if (!seen.has(j)) {
        seen.add(j)
        todo.push(j)
      }
    }
  }
  return seen.size === placed.length
}

// The words moved to the top-left corner, longest first (the server keeps that one from
// reading around the wheel), with the rows and columns they take.
export function crop(placed: Placed[]): { words: Placed[]; rows: number; cols: number } {
  let top = Infinity
  let left = Infinity
  let bottom = -Infinity
  let right = -Infinity
  for (const p of placed) {
    const [dr, dc] = STEP[p.d]
    top = Math.min(top, p.r)
    left = Math.min(left, p.c)
    bottom = Math.max(bottom, p.r + dr * (p.w.length - 1))
    right = Math.max(right, p.c + dc * (p.w.length - 1))
  }
  const words = [...placed].sort((a, b) => b.w.length - a.w.length).map((p) => ({ ...p, r: p.r - top, c: p.c - left }))
  return { words, rows: bottom - top + 1, cols: right - left + 1 }
}

// A board holding these words, centred with room to grow up to the size limits; null when
// they break a rule (taking a word out can leave two of its letters side by side). The
// words go in without the side-by-side check, which a valid grid can fail in some orders,
// and the whole grid is checked at the end.
export function rebuild(placed: Placed[]): Board | null {
  const { words, rows, cols } = crop(placed)
  const board = new Board(CURVE.maxRows, CURVE.maxCols)
  const top = Math.floor((CURVE.maxRows - rows) / 2)
  const left = Math.floor((CURVE.maxCols - cols) / 2)
  for (const p of words) {
    const r = p.r + top
    const c = p.c + left
    const [dr, dc] = STEP[p.d]
    const crossings: Crossing[] = []
    for (let k = 0; k < p.w.length; k++) {
      const cell = board.cellAt(r + dr * k, c + dc * k)
      if (!cell) continue
      if (cell.ch !== p.w[k] || cell[p.d] >= 0) return null
      const j = cell[OTHER[p.d]]
      crossings.push([k, j, board.indexIn(j, r + dr * k, c + dc * k)])
    }
    board.put(p.w, r, c, p.d, crossings)
  }
  return board.clean() ? board : null
}
