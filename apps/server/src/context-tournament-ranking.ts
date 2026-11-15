import { createHash } from 'node:crypto'
import { TOURNAMENT_RULES, pickSecret } from '@zerocade/shared'
import { lookup, parseContextData, rankAgainst, type ContextData, type Ranking } from '@zerocade/shared/contextRanking'
import { contextFile, type ContextFile } from './context.js'

// ZeroContext tournament: the official ranking, on the server (specifica §5). The same code the overlay runs
// (@zerocade/shared/contextRanking): the same reading of a guess, the same order, ties and link boost included. The
// corpus is identified by a hash of its files, saved with the tournament: if it changes, a tournament in progress is
// suspended rather than played on other words.
//
// Ranking a secret takes about 150 ms (89 380 words, 768 dimensions, measured 15/11/2026): it runs when a round is
// prepared, while no window is open, so it never delays a guess. Reading, hashing and parsing the corpus takes a few
// hundred ms more: the server does it at start-up when ZeroContext is selected (index.ts), not at the first tournament.

export interface Corpus {
  data: ContextData
  hash: string
}

export interface RoundPlan {
  secret: number
  ranking: Ranking
  // The lifeline word (rank 4000-5000), chosen before the round; null when the corpus has none.
  buoy: number | null
}

const FILES: ContextFile[] = ['vocab.txt', 'vectors.bin', 'secrets.txt', 'links.json']

export function corpusFromBuffers(files: Record<'vocab.txt' | 'vectors.bin' | 'secrets.txt' | 'links.json', Buffer | null>): Corpus | null {
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

let cached: Corpus | null | undefined
// The server's corpus, read once (on the first tournament).
export function serverCorpus(): Corpus | null {
  if (cached === undefined) {
    try {
      cached = corpusFromBuffers({ 'vocab.txt': contextFile('vocab.txt'), 'vectors.bin': contextFile('vectors.bin'),
        'secrets.txt': contextFile('secrets.txt'), 'links.json': contextFile('links.json') })
    } catch (error) {
      console.error('[torneo] corpus di ZeroContext non leggibile:', error instanceof Error ? error.message : error)
      cached = null
    }
  }
  return cached
}

// A secret not yet played in this tournament, its ranking and the lifeline word. Among those, a word that never came
// out in any ZeroContext game (`uses`, by word); with none left, the one that came out the longest ago (`lastAt`).
export function planRound(corpus: Corpus, used: ReadonlySet<number>, random: () => number = Math.random,
  uses: (word: string) => number = () => 0, lastAt: (word: string) => number = () => 0): RoundPlan | null {
  const free = corpus.data.secrets.filter((s) => !used.has(s))
  if (!free.length) return null
  const secret = pickSecret(free, (s) => uses(corpus.data.words[s]), (s) => lastAt(corpus.data.words[s]), random)
  const ranking = rankAgainst(corpus.data, secret)
  return { secret, ranking, buoy: buoyOf(ranking, random) }
}

// The ranking of a secret already chosen (a round resumed after a restart).
export function planOf(corpus: Corpus, secret: number, buoy: number | null): RoundPlan {
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
