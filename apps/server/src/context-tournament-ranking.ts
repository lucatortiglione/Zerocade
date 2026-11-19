import { createHash } from 'node:crypto'
import { TOURNAMENT_RULES, pickSecret, type ContextProfile } from '@zerocade/shared'
import { lookup, parseContextData, rankAgainst, type ContextData, type ContextVocabulary, type Ranking } from '@zerocade/shared/contextRanking'
import { contextFile, contextPinned, type ContextFile } from './context.js'

// ZeroContext tournament: the official ranking, on the server (specifica §5). The same code the overlay runs
// (@zerocade/shared/contextRanking): the same reading of a guess, the same order, ties and link boost included. The
// corpus is identified by a hash of its files, saved with the tournament: if it changes, a tournament in progress is
// suspended rather than played on other words.
//
// Ranking a secret takes 120-270 ms (93 928 words, measured 19/11/2026), loading a corpus 0.5-1.8 s: on the server both run
// in the ranking thread (context-worker.ts, context-corpora.ts), never on the thread that serves overlays and dashboards. That
// thread keeps only the vocabulary (`Corpus`); the vectors are in the ranking thread (`LoadedCorpus`).

export interface Corpus {
  data: ContextVocabulary
  hash: string
}
export interface LoadedCorpus extends Corpus {
  data: ContextData
}

// A secret's ranking: computed here when the corpus has its vectors (tests, tools), asked of the ranking thread otherwise.
export type Ranker = (corpus: Corpus, secret: number) => Ranking | Promise<Ranking>
export const rankLocally: Ranker = (corpus, secret) => {
  if (!('vectors' in corpus.data)) throw new Error('Questo corpus non ha i vettori: la classifica si calcola nel thread dedicato')
  return rankAgainst(corpus.data as ContextData, secret)
}

export interface RoundPlan {
  secret: number
  ranking: Ranking
  // The lifeline word (rank 4000-5000), chosen before the round; null when the corpus has none.
  buoy: number | null
}

const FILES: ContextFile[] = ['vocab.txt', 'vectors.bin', 'secrets.txt', 'links.json']

export function corpusFromBuffers(files: Record<'vocab.txt' | 'vectors.bin' | 'secrets.txt' | 'links.json', Buffer | null>): LoadedCorpus | null {
  const { 'vocab.txt': vocab, 'vectors.bin': vectors, 'secrets.txt': secrets, 'links.json': links } = files
  if (!vocab || !vectors || !secrets) return null
  const hash = createHash('sha256')
  for (const name of FILES) {
    const b = files[name as keyof typeof files]
    hash.update(`${name}:${b?.byteLength ?? -1}\n`)
    if (b) hash.update(b)
  }
  const data = parseContextData(vocab.toString('utf-8'), vectors.buffer.slice(vectors.byteOffset, vectors.byteOffset + vectors.byteLength) as ArrayBuffer,
    secrets.toString('utf-8'), links ? JSON.parse(links.toString('utf-8')) : undefined)
  return { data, hash: hash.digest('hex') }
}

const cache = new Map<ContextProfile, LoadedCorpus | null>()
export const invalidateContextCorpus = (profile?: ContextProfile) => { if (profile) cache.delete(profile); else cache.clear() }
// The corpus with its vectors, read once: in the server's ranking thread (context-worker.ts), and in tests and tools.
export function serverCorpus(profile: ContextProfile = 'original'): LoadedCorpus | null {
  if (!cache.has(profile)) {
    try {
      const corpus = corpusFromBuffers({ 'vocab.txt': contextFile('vocab.txt', profile), 'vectors.bin': contextFile('vectors.bin', profile),
        'secrets.txt': contextFile('secrets.txt', profile), 'links.json': contextFile('links.json', profile) })
      // The associations of an external ranking (Pipeline B) go first in each secret's ranking; they are part of the corpus'
      // identity through its revision, which the secrets and links files already carry.
      const pinned = corpus ? contextPinned(profile) : undefined
      if (corpus && pinned) corpus.data.pinned = pinned
      // A derived profile that cannot be built yet (no export) is tried again at the next request, not remembered as missing.
      if (!corpus && profile === 'pipeline_b') return null
      cache.set(profile, corpus)
    } catch (error) {
      console.error('[torneo] corpus di ZeroContext non leggibile:', error instanceof Error ? error.message : error)
      cache.set(profile, null)
    }
  }
  return cache.get(profile) ?? null
}

// A secret not yet played in this tournament. Among those, a word that never came out in any ZeroContext game (`uses`, by
// word); with none left, the one that came out the longest ago (`lastAt`). null: every secret has been played.
export function pickRound(corpus: Corpus, used: ReadonlySet<number>, random: () => number = Math.random,
  uses: (word: string) => number = () => 0, lastAt: (word: string) => number = () => 0): number | null {
  const free = corpus.data.secrets.filter((s) => !used.has(s))
  if (!free.length) return null
  return pickSecret(free, (s) => uses(corpus.data.words[s]), (s) => lastAt(corpus.data.words[s]), random)
}

// The plan of a round from the secret's ranking: the lifeline word is drawn here.
export const planFrom = (secret: number, ranking: Ranking, random: () => number = Math.random): RoundPlan =>
  ({ secret, ranking, buoy: buoyOf(ranking, random) })

// A secret not yet played in this tournament, its ranking and the lifeline word (all at once: tests and tools).
export function planRound(corpus: LoadedCorpus, used: ReadonlySet<number>, random: () => number = Math.random,
  uses: (word: string) => number = () => 0, lastAt: (word: string) => number = () => 0): RoundPlan | null {
  const secret = pickRound(corpus, used, random, uses, lastAt)
  return secret === null ? null : planFrom(secret, rankAgainst(corpus.data, secret), random)
}

// The ranking of a secret already chosen (a round resumed after a restart).
export function planOf(corpus: LoadedCorpus, secret: number, buoy: number | null): RoundPlan {
  return { secret, ranking: rankAgainst(corpus.data, secret), buoy }
}

function buoyOf(ranking: Ranking, random: () => number): number | null {
  const from = TOURNAMENT_RULES.buoyFrom - 1
  const to = Math.min(TOURNAMENT_RULES.buoyTo - 1, ranking.order.length - 1)
  if (to < from) return null
  return ranking.order[from + Math.floor(random() * (to - from + 1))]
}

// The word a chat comment names (one word, any case, accents as in the game, the secret's plurals), or -1.
export const readGuess = (corpus: Corpus, text: string, secret: number) => lookup(corpus.data, text, secret)

export const positionOf = (plan: RoundPlan, word: number) => plan.ranking.rankOf[word] + 1
