// ZeroContext's ranking, apart from any drawing: the words and vectors the server serves
// (gioco-zerocontext/data), the reading of a chat guess, and the order of every word by
// closeness to a secret. Rank 0 is the secret, 1 the closest word, and so on.

import nounPlurals from './contextPlurals.json'
import { CONTEXT_LIMITS, CONTEXT_COLORS, CONTEXT_COLOR_STOPS, ContextError } from '@zerocade/shared'

// Attested noun forms from Morph-it!, including irregular plurals. Only the
// current secret uses these aliases; other words keep their original rankings.
// Pure immutable initialization: bundlers can omit the plural dictionary from
// the ranking worker, whose only consumer here is the parser/math, not lookup.
const plurals = /* @__PURE__ */ (() => new Map<string, readonly string[]>(Object.entries(nounPlurals.plurals)))()

export interface ContextVocabulary {
  words: string[]
  secrets: number[]
  index: Map<string, number>
  folded: Map<string, number>
}
export interface ContextRankSource {
  wordCount: number
  dim: number
  // One row of `dim` integers per word, normalised: the dot product orders like the cosine (of two sources, side by
  // side in the row: gioco-zerocontext/script/build_context_data.py).
  vectors: Int8Array
  // The words ZeroAssociazioni ties to a secret (secret's index -> words' indices): in that secret's ranking they
  // rise by `linkBoost`, in the scale of the vectors' dot product. Empty when the server has no links.
  links: Map<number, number[]>
  linkBoost: number
}
export interface ContextData extends ContextVocabulary, Omit<ContextRankSource, 'wordCount'> {}

// What /api/context/links.json holds.
export interface ContextLinks {
  boost: number
  links: Record<string, number[]>
}

export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const lines = (text: string): string[] => {
  const result: string[] = []
  for (let start = 0; start < text.length;) {
    const next = text.indexOf('\n', start)
    const end = next < 0 ? text.length : next
    const line = text.slice(start, end).trim()
    if (line) {
      if (result.length >= CONTEXT_LIMITS.words) throw new ContextError('data', 'Troppe parole in ZeroContext.')
      result.push(line)
    }
    start = end + 1
  }
  return result
}

export function parseContextData(vocab: string, vectors: ArrayBuffer, secrets: string, linked?: unknown): ContextData {
  if (vocab.length > CONTEXT_LIMITS.vocab || secrets.length > CONTEXT_LIMITS.secrets || vectors.byteLength > CONTEXT_LIMITS.vectors)
    throw new ContextError('data', 'Dati di ZeroContext oltre i limiti consentiti.')
  const words = lines(vocab)
  if (!words.length || words.length > CONTEXT_LIMITS.words || words.some((word) => !/^[a-zàèéìòù]{2,20}$/.test(word)))
    throw new ContextError('data', 'Vocabolario ZeroContext non valido.')
  const flat = new Int8Array(vectors)
  const dim = words.length ? flat.length / words.length : 0
  if (!Number.isInteger(dim) || dim < 1 || dim > CONTEXT_LIMITS.dimensions) throw new ContextError('data', 'vectors.bin does not match vocab.txt')
  const index = new Map<string, number>()
  const folded = new Map<string, number>()
  words.forEach((w, i) => {
    if (index.has(w)) throw new ContextError('data', 'Vocabolario ZeroContext con parole duplicate.')
    index.set(w, i)
    const key = fold(w)
    folded.set(key, folded.has(key) ? -1 : i)
  })
  const candidates = new Set<number>()
  for (const word of lines(secrets)) { const i = index.get(word); if (i !== undefined) candidates.add(i) }
  const secretIdx = [...candidates]
  if (!secretIdx.length) throw new ContextError('data', 'Nessuna soluzione giocabile in ZeroContext.')
  // Links that name a word outside the vocabulary (data of two different builds) are dropped, not trusted.
  const inside = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < words.length
  const links = new Map<number, number[]>()
  let linkBoost = 0
  if (linked !== undefined && linked !== null) {
    if (typeof linked !== 'object' || Array.isArray(linked) || !('boost' in linked) || typeof linked.boost !== 'number' ||
        !Number.isFinite(linked.boost) || linked.boost < 0 || linked.boost > CONTEXT_LIMITS.maxBoost || !('links' in linked) ||
        !linked.links || typeof linked.links !== 'object' || Array.isArray(linked.links))
      throw new ContextError('data', 'Collegamenti ZeroContext non validi.')
    linkBoost = linked.boost
    let count = 0
    let sources = 0
    for (const secret in linked.links) {
      if (!Object.hasOwn(linked.links, secret)) continue
      if (++sources > CONTEXT_LIMITS.words) throw new ContextError('data', 'Troppi gruppi di collegamenti in ZeroContext.')
      const list: unknown = Reflect.get(linked.links, secret)
      if (!Array.isArray(list) || list.length > CONTEXT_LIMITS.linksPerSecret || (count += list.length) > CONTEXT_LIMITS.linkCount)
        throw new ContextError('data', 'Troppi collegamenti in ZeroContext.')
      const s = Number(secret)
      if (linkBoost && inside(s)) links.set(s, [...new Set(list.filter((i): i is number => inside(i) && i !== s))])
    }
  }
  return { words, dim, vectors: flat, secrets: secretIdx, index, folded, links, linkBoost }
}

// The word a chat comment names, or -1: one word only, in any case, with or without accents.
export function lookup(data: ContextVocabulary, text: string, secret?: number): number {
  if (text.length > 256) return -1
  const word = text.toLowerCase().normalize('NFC').replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
  if (!/^[a-zàèéìòù]{2,20}$/.test(word)) return -1
  // A winning spelling or plural takes precedence over its own vocabulary entry
  // and vector (e.g. "proprieta" / "proprietà", or "gatti" / "gatto").
  if (secret !== undefined && data.words[secret]) {
    const solution = data.words[secret]
    const key = fold(word)
    if (key === fold(solution) || (plurals.get(solution) ?? []).some((form) => fold(form) === key)) return secret
  }
  const exact = data.index.get(word)
  if (exact !== undefined) return exact
  return data.folded.get(fold(word)) ?? -1
}

export interface Ranking {
  secret: number
  // order[r] is the word at rank r (order[0] is the secret); rankOf[i] is word i's rank.
  order: Uint32Array<ArrayBuffer>
  rankOf: Uint32Array<ArrayBuffer>
}

export function rankAgainst(data: ContextData | ContextRankSource, secret: number): Ranking {
  const { vectors, dim } = data
  const n = 'wordCount' in data ? data.wordCount : data.words.length
  if (!Number.isSafeInteger(n) || n < 1 || n > CONTEXT_LIMITS.words || !Number.isInteger(dim) || dim < 1 ||
      dim > CONTEXT_LIMITS.dimensions || vectors.byteLength !== n * dim || vectors.byteLength > CONTEXT_LIMITS.vectors)
    throw new ContextError('data', 'Dimensioni dei vettori ZeroContext non valide.')
  if (!Number.isInteger(secret) || secret < 0 || secret >= n) throw new ContextError('data', 'Soluzione ZeroContext fuori dal vocabolario.')
  const sims = new Float32Array(n)
  const s0 = secret * dim
  for (let i = 0; i < n; i++) {
    let dot = 0
    const o = i * dim
    for (let d = 0; d < dim; d++) dot += vectors[o + d] * vectors[s0 + d]
    sims[i] = dot
  }
  // The words people associate with the secret count as closer than their vectors alone say.
  for (const i of data.links.get(secret) ?? []) sims[i] += data.linkBoost
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

// The position a player sees for a rank: the secret is always 1, the closest word 2, and so on. Inside, ranks start
// from 0 (order[0] is the secret); every number on screen and in the settings is a position.
export const position = (rank: number) => rank + 1

// Settings and colors use displayed positions, including position 1 (the secret).
export const bandColor = (rank: number, red: number = CONTEXT_COLOR_STOPS.red, orange: number = CONTEXT_COLOR_STOPS.orange,
  yellow: number = CONTEXT_COLOR_STOPS.yellow, cyan: number = CONTEXT_COLOR_STOPS.cyan) => {
  const p = position(rank)
  return p <= red ? CONTEXT_COLORS.red : p <= orange ? CONTEXT_COLORS.orange :
    p <= yellow ? CONTEXT_COLORS.yellow : p <= cyan ? CONTEXT_COLORS.cyan : CONTEXT_COLORS.blue
}

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

// The hint every round starts with: the word at the position `at` (2 is the closest word), so a little way from
// the closest one. Never closer than `floor` (a rank, as in closerHint), never the secret; -1 when there is no such word.
export function startHint(ranking: Ranking, at: number, floor = 1): number {
  const r = Math.min(Math.max(at - 1, floor, 1), ranking.order.length - 1)
  return r >= Math.max(1, floor) ? r : -1
}

// The secret with its first `shown` letters, the rest as underscores: "p _ _ _ _".
export function maskedWord(word: string, shown: number): string {
  return [...word].map((c, i) => (i < shown ? c : '_')).join(' ')
}
