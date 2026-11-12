import { fold } from './contextRanking'

// ZeroWordle's rules, apart from any drawing: reading a chat guess, the green / gold / grey feedback
// with repeated letters handled, the best state of every key, and what a guess newly teaches.

export type Tile = 'green' | 'gold' | 'grey'

export interface Row {
  word: string
  tiles: Tile[]
}

export interface WordleData {
  solutions: string[]
  // Every word accepted as a guess (the solutions included).
  words: Set<string>
}

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)

export function parseWordleData(solutions: string, words: string): WordleData {
  const list = lines(solutions)
  return { solutions: list, words: new Set([...lines(words), ...list]) }
}

// The `length` letters a comment names, without accents ("città" is "citta"), or null: one word only.
export function readGuess(text: string, length = 5): string | null {
  const word = fold(text.trim().toLowerCase())
  return word.length === length && /^[a-z]+$/.test(word) ? word : null
}

export function feedback(guess: string, target: string): Tile[] {
  const tiles: Tile[] = Array(guess.length).fill('grey')
  const left: (string | null)[] = target.split('')
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) {
      tiles[i] = 'green'
      left[i] = null
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (tiles[i] === 'green') continue
    const at = left.indexOf(guess[i])
    if (at >= 0) {
      tiles[i] = 'gold'
      left[at] = null
    }
  }
  return tiles
}

const RANK: Record<Tile, number> = { grey: 0, gold: 1, green: 2 }

// The best thing each letter has shown so far: green over gold over grey.
export function keyStates(rows: Row[]): Map<string, Tile> {
  const out = new Map<string, Tile>()
  for (const row of rows) {
    row.tiles.forEach((tile, i) => {
      const cur = out.get(row.word[i])
      if (!cur || RANK[tile] > RANK[cur]) out.set(row.word[i], tile)
    })
  }
  return out
}

// What `row` adds to the earlier rows: positions that turn green for the first time, and letters
// found (gold) that no earlier row had found, so repeating known letters earns nothing.
export function newInfo(before: Row[], row: Row): { greens: number; golds: number } {
  const green = new Set<string>()
  const found = new Set<string>()
  for (const r of before) {
    r.tiles.forEach((tile, i) => {
      if (tile === 'green') green.add(`${i}${r.word[i]}`)
      if (tile !== 'grey') found.add(r.word[i])
    })
  }
  let greens = 0
  let golds = 0
  row.tiles.forEach((tile, i) => {
    const letter = row.word[i]
    if (tile === 'green' && !green.has(`${i}${letter}`)) greens++
    else if (tile === 'gold' && !found.has(letter)) {
      golds++
      found.add(letter)
    }
  })
  return { greens, golds }
}
