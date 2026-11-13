// ZeroContext's ranking, apart from any drawing: the words and vectors the server serves
// (gioco-zerocontext/data), the reading of a chat guess, and the order of every word by
// closeness to a secret. Rank 0 is the secret, 1 the closest word, and so on.

export interface ContextData {
  words: string[]
  dim: number
  // One row of `dim` integers per word, centred and normalised: the dot product orders like the cosine.
  vectors: Int8Array
  secrets: number[] // indices into `words`
  index: Map<string, number>
  // Without accents ("citta" for "città"): the index, or -1 when two words fold to the same letters.
  folded: Map<string, number>
}

export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean)

export function parseContextData(vocab: string, vectors: ArrayBuffer, secrets: string): ContextData {
  const words = lines(vocab)
  const flat = new Int8Array(vectors)
  const dim = words.length ? flat.length / words.length : 0
  if (!Number.isInteger(dim) || dim === 0) throw new Error('vectors.bin does not match vocab.txt')
  const index = new Map(words.map((w, i) => [w, i]))
  const folded = new Map<string, number>()
  words.forEach((w, i) => {
    const key = fold(w)
    folded.set(key, folded.has(key) ? -1 : i)
  })
  const secretIdx = lines(secrets).flatMap((w) => (index.has(w) ? [index.get(w)!] : []))
  return { words, dim, vectors: flat, secrets: secretIdx, index, folded }
}

// The word a chat comment names, or -1: one word only, in any case, with or without accents.
export function lookup(data: ContextData, text: string): number {
  const word = text.toLowerCase().normalize('NFC').replace(/[^a-zàèéìòù]/g, '')
  if (word.length < 2 || word.length > 20) return -1
  const exact = data.index.get(word)
  if (exact !== undefined) return exact
  return data.folded.get(fold(word)) ?? -1
}

export interface Ranking {
  secret: number
  // order[r] is the word at rank r (order[0] is the secret); rankOf[i] is word i's rank.
  order: Uint32Array
  rankOf: Uint32Array
}

export function rankAgainst(data: ContextData, secret: number): Ranking {
  const { vectors, dim } = data
  const n = data.words.length
  const sims = new Float32Array(n)
  const s0 = secret * dim
  for (let i = 0; i < n; i++) {
    let dot = 0
    const o = i * dim
    for (let d = 0; d < dim; d++) dot += vectors[o + d] * vectors[s0 + d]
    sims[i] = dot
  }
  sims[secret] = Infinity
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((a, b) => sims[b] - sims[a] || a - b)
  const rankOf = new Uint32Array(n)
  for (let r = 0; r < n; r++) rankOf[order[r]] = r
  return { secret, order, rankOf }
}

// How close a rank looks, 0 (far) to 1 (the secret): the logarithm, so the first hundred
// ranks take as much of the bar as the last tens of thousands.
export const closeness = (rank: number, total: number) =>
  rank <= 0 ? 1 : Math.max(0.02, 1 - Math.log(rank) / Math.log(Math.max(total, 3)))

// Green up to the `green` rank, orange up to the `orange` one, red beyond (the bar's colour).
export const bandColor = (rank: number, green = 100, orange = 1000) =>
  rank === 0 ? '#1FA35B' : rank <= green ? '#2fbf6c' : rank <= orange ? '#E0A022' : '#D9435E'

// A hint closer than the best guess so far: the word half way to the secret, or the closest
// not yet guessed one when that is taken. `taken` holds the words already on the board.
// `floor` is the closest rank a hint may give away (1 = the very closest word).
export function closerHint(ranking: Ranking, best: number, taken: Set<number>, floor = 1): number {
  const total = ranking.order.length
  let target = Number.isFinite(best) ? Math.floor(best / 2) : Math.min(1000, Math.floor(total / 60))
  // Never a word as far as the best guess or farther: a hint must get closer.
  const limit = Number.isFinite(best) ? Math.min(best - 1, total - 1) : total - 1
  if (limit < floor) return -1
  target = Math.min(Math.max(floor, target), limit)
  for (let r = target; r >= floor; r--) if (!taken.has(ranking.order[r])) return r
  for (let r = target + 1; r <= limit && r < target + 50; r++) if (!taken.has(ranking.order[r])) return r
  return -1
}

// The secret with its first `shown` letters, the rest as underscores: "p _ _ _ _".
export function maskedWord(word: string, shown: number): string {
  return [...word].map((c, i) => (i < shown ? c : '_')).join(' ')
}
