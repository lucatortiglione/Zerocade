import { fold } from './contextRanking'

// ZeroReazioniACatena's rules, apart from any drawing: cutting a chain of the wanted length out of the
// server's walks, drawing a "Parola chiave" puzzle, reading a chat guess, which words are open, how a word
// is shown and what finding it is worth. A round travels between overlays as one string, its mode and
// number first (chainSecret in @zerocade/shared; apps/server: secret:round).

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

// "Parola chiave": the clues shown when the round starts, and a random puzzle ([hidden, ...clues]).
export const KEY_START_CLUES = 2

export function pickKey(keys: string[][], rand: () => number = Math.random): string[] | null {
  const fit = keys.filter((k) => k.length >= KEY_START_CLUES + 1)
  return fit.length ? [...fit[Math.floor(rand() * fit.length)]] : null
}

// What the hidden word is worth: the base with the starting clues and its first letter, less `penalty`
// for each clue and each letter shown beyond those.
export const keyValue = (base: number, penalty: number, cluesShown: number, lettersShown: number) =>
  wordValue(base, 1 + Math.max(0, cluesShown - KEY_START_CLUES) + Math.max(0, lettersShown - 1), penalty)

// "Effetto domino": only the first word not yet known can be guessed or get a letter.
export function dominoOpen(given: boolean[], solved: boolean[]): boolean[] {
  const next = given.findIndex((g, i) => !g && !solved[i])
  return given.map((_, i) => i === next)
}

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
