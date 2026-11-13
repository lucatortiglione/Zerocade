import type { WordAssociationPool } from '@zerocade/shared'
import { wordAssociation } from './content.js'

// ZeroReazioniACatena's chains: walks through the verified pools of ZeroAssociazioni. Each word is a
// prompt with a verified pool, and the next word is one of that pool's associated words that is a prompt
// too, so every neighbouring pair is a verified association. Built once, on the first request, with a
// fixed seed so a restart does not change them; the overlay cuts a window of the length it needs.

const NODE = /^[a-zàèéìòù]{3,14}$/
export const CHAIN_WALK = 9
export const CHAIN_MIN = 5
export const CHAIN_COUNT = 1500

// Small seeded generator (mulberry32).
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Two words that are the same thing for the chain: equal, one inside the other, or the same stem.
const related = (a: string, b: string) => a === b || a.includes(b) || b.includes(a) || a.slice(0, 5) === b.slice(0, 5)

export function buildChains(pools: WordAssociationPool[], count = CHAIN_COUNT): string[][] {
  const prompts = new Set(pools.map((p) => p.prompt).filter((w) => NODE.test(w)))
  const next = new Map<string, string[]>()
  for (const pool of pools) {
    if (!prompts.has(pool.prompt)) continue
    const outs = [...new Set(pool.answers.map((a) => a.word))].filter((w) => prompts.has(w) && !related(w, pool.prompt))
    if (outs.length) next.set(pool.prompt, outs)
  }
  const rand = seeded(20261112)
  const starts = [...next.keys()].sort()
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[starts[i], starts[j]] = [starts[j], starts[i]]
  }
  const seen = new Set<string>()
  const chains: string[][] = []
  for (let attempt = 0; chains.length < count && attempt < count * 20 && starts.length; attempt++) {
    const walk = [starts[attempt % starts.length]]
    while (walk.length < CHAIN_WALK) {
      const options = (next.get(walk[walk.length - 1]) ?? []).filter((w) => !walk.some((x) => related(x, w)))
      if (!options.length) break
      walk.push(options[Math.floor(rand() * options.length)])
    }
    const id = walk.join('-')
    if (walk.length >= CHAIN_MIN && !seen.has(id)) {
      seen.add(id)
      chains.push(walk)
    }
  }
  return chains
}

// The "Parola chiave" mode: a hidden noun and KEY_CLUES of its verified associations as clues, one per
// meaning group (two of a group would say the same thing), never a pair the pool marks as conflicting
// and never a word that gives the hidden one away. Each puzzle is [hidden, ...clues].
export const KEY_CLUES = 6

export function buildKeys(pools: WordAssociationPool[], count = CHAIN_COUNT): string[][] {
  const rand = seeded(20261113)
  const seen = new Set<string>()
  const keys: string[][] = []
  for (const pool of [...pools].sort((a, b) => a.ref.localeCompare(b.ref))) {
    if (pool.pos !== 'NOUN' || !NODE.test(pool.prompt) || seen.has(pool.prompt)) continue
    const answers = [...pool.answers]
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[answers[i], answers[j]] = [answers[j], answers[i]]
    }
    const groups = new Set<string>()
    const clues: string[] = []
    for (const a of answers) {
      if (clues.length >= KEY_CLUES || !NODE.test(a.word) || groups.has(a.group) || related(a.word, pool.prompt)) continue
      if (clues.some((c) => related(c, a.word) || pool.conflicts.some(([x, y]) => (x === c && y === a.word) || (x === a.word && y === c)))) continue
      groups.add(a.group)
      clues.push(a.word)
    }
    if (clues.length < KEY_CLUES) continue
    seen.add(pool.prompt)
    keys.push([pool.prompt, ...clues])
  }
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[keys[i], keys[j]] = [keys[j], keys[i]]
  }
  return keys.slice(0, count)
}

let cached: string[][] | null = null
export const chains = (): string[][] => (cached ??= buildChains(wordAssociation.pools))

let cachedKeys: string[][] | null = null
export const chainKeys = (): string[][] => (cachedKeys ??= buildKeys(wordAssociation.pools))
