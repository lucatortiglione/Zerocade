import { fold } from './contextRanking'

// ZeroReazioniACatena's rules, apart from any drawing: cutting a chain of the wanted length out of the
// server's walks, reading a chat guess, how a word is shown and what finding it is worth. A chain travels
// between overlays as one string, its words joined by "-" (apps/server: secret:round).

export const chainId = (words: string[]) => words.join('-')
export const parseChainId = (id: string) => id.split('-').filter(Boolean)

// A window of `length` neighbouring words of a random walk long enough for it, or null.
export function pickChain(walks: string[][], length: number, rand: () => number = Math.random): string[] | null {
  const fit = walks.filter((w) => w.length >= length)
  if (!fit.length) return null
  const walk = fit[Math.floor(rand() * fit.length)]
  const start = Math.floor(rand() * (walk.length - length + 1))
  return walk.slice(start, start + length)
}

// The word a comment names, without accents and in lower case, or null: one word only.
export function readWord(text: string): string | null {
  const word = fold(text.trim().toLowerCase())
  return /^[a-z]{2,16}$/.test(word) ? word : null
}

// "c _ _ _ _": the first `shown` letters of a word, the others as underscores.
export const maskWord = (word: string, shown: number) => [...word].map((c, i) => (i < shown ? c : '_')).join(' ')

// What a word is worth when found: the base, less `penalty` for each letter shown beyond the first.
export const wordValue = (base: number, shown: number, penalty: number) => Math.max(base > 0 ? 1 : 0, base - penalty * Math.max(0, shown - 1))

// The hidden word with the fewest letters shown (the leftmost on a tie), for the next hint; -1 when none
// can show another letter (one letter always stays hidden).
export function nextHint(words: string[], shown: number[], open: boolean[]): number {
  let best = -1
  for (let i = 0; i < words.length; i++) {
    if (!open[i] || shown[i] >= words[i].length - 1) continue
    if (best < 0 || shown[i] < shown[best]) best = i
  }
  return best
}
