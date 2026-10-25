// Shared crossword builder used by the crossword-style games (Cross World,
// Crucintarsio). It places words so they intersect on shared letters.

export interface CrosswordEntry {
  word: string
  clue: string
}

export interface PlacedWord {
  word: string
  clue: string
  r: number
  c: number
  dir: 'across' | 'down'
  number: number
}

export interface CrosswordBoard {
  letters: Map<string, string>
  placed: PlacedWord[]
  minR: number
  maxR: number
  minC: number
  maxC: number
}

const key = (r: number, c: number) => `${r},${c}`

export function buildCrossword(entries: CrosswordEntry[]): CrosswordBoard {
  const letters = new Map<string, string>()
  const placed: PlacedWord[] = []
  const sorted = [...entries].sort((a, b) => b.word.length - a.word.length)

  const placeWord = (word: string, r: number, c: number, dir: 'across' | 'down'): boolean => {
    const cells: [number, number][] = []
    for (let i = 0; i < word.length; i++) {
      const rr = dir === 'across' ? r : r + i
      const cc = dir === 'across' ? c + i : c
      const existing = letters.get(key(rr, cc))
      if (existing !== undefined && existing !== word[i]) return false
      cells.push([rr, cc])
    }
    cells.forEach(([rr, cc], i) => letters.set(key(rr, cc), word[i]))
    return true
  }

  sorted.forEach((entry, idx) => {
    if (idx === 0) {
      placeWord(entry.word, 0, 0, 'across')
      placed.push({ word: entry.word, clue: entry.clue, r: 0, c: 0, dir: 'across', number: 1 })
      return
    }
    for (const p of placed) {
      let done = false
      for (let j = 0; j < p.word.length && !done; j++) {
        const pr = p.dir === 'across' ? p.r : p.r + j
        const pc = p.dir === 'across' ? p.c + j : p.c
        for (let i = 0; i < entry.word.length && !done; i++) {
          if (entry.word[i] !== p.word[j]) continue
          const dir: 'across' | 'down' = p.dir === 'across' ? 'down' : 'across'
          const r = dir === 'across' ? pr : pr - i
          const c = dir === 'across' ? pc - i : pc
          if (placeWord(entry.word, r, c, dir)) {
            placed.push({ word: entry.word, clue: entry.clue, r, c, dir, number: 0 })
            done = true
          }
        }
      }
      if (done) break
    }
  })

  const coords = [...letters.keys()].map((k) => k.split(',').map(Number))
  const minR = Math.min(...coords.map(([r]) => r))
  const maxR = Math.max(...coords.map(([r]) => r))
  const minC = Math.min(...coords.map(([, c]) => c))
  const maxC = Math.max(...coords.map(([, c]) => c))

  let n = 0
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const starts = placed.some((p) => (p.dir === 'across' && p.r === r && p.c === c) || (p.dir === 'down' && p.r === r && p.c === c))
      if (starts) {
        n++
        placed.forEach((p) => {
          if (p.dir === 'across' && p.r === r && p.c === c) p.number = n
          if (p.dir === 'down' && p.r === r && p.c === c) p.number = n
        })
      }
    }
  }

  return { letters, placed, minR, maxR, minC, maxC }
}

export const cellKey = key

export function cellSolved(board: CrosswordBoard, found: Set<string>, r: number, c: number): boolean {
  return board.placed.some(
    (p) =>
      found.has(p.word) &&
      ((p.dir === 'across' && p.r === r && p.c <= c && c < p.c + p.word.length) ||
        (p.dir === 'down' && p.c === c && p.r <= r && r < p.r + p.word.length)),
  )
}
