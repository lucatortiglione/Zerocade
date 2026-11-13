import { readBlocklist, readWords } from './files.js'

// The Italian lexicon (schema parole of database/giochi.sqlite3, from gioco-parole/lexicon/it/words.tsv:
// word, Zipf frequency, tier) with
// each word's Zipf frequency and rank (1 = most common) and the multiset index: signature (letters in
// order, CARTE -> ACERT) -> words, so every word a wheel makes is a few hundred lookups away.

export const MIN_LEN = 4

export const signature = (word: string) => [...word].sort().join('')

function loadBlocklist(): (word: string) => boolean {
  const exact = new Set<string>()
  const prefixes: string[] = []
  for (const raw of readBlocklist()) {
    const line = raw.trim().toUpperCase()
    if (!line || line.startsWith('#')) continue
    if (line.endsWith('*')) prefixes.push(line.slice(0, -1))
    else exact.add(line)
  }
  return (word) => exact.has(word) || prefixes.some((p) => word.startsWith(p))
}

const MADE_CACHE = 4000

export class Lexicon {
  readonly rank = new Map<string, number>()
  readonly zipf = new Map<string, number>()
  private main = new Set<string>()
  private bySig = new Map<string, string[]>()
  private made = new Map<string, string[]>()

  constructor() {
    const blocked = loadBlocklist()
    const rows: [string, number][] = []
    for (const { word, zipf, tier } of readWords()) {
      if (!word || blocked(word)) continue
      rows.push([word, zipf])
      this.zipf.set(word, zipf)
      if (tier === 'main') this.main.add(word)
    }
    rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    rows.forEach(([word], i) => this.rank.set(word, i + 1))
    for (const word of rows.map(([w]) => w).sort()) {
      const sig = signature(word)
      const list = this.bySig.get(sig)
      if (list) list.push(word)
      else this.bySig.set(sig, [word])
    }
  }

  isMain(word: string): boolean {
    return this.main.has(word)
  }

  mainWords(): string[] {
    return [...this.main]
  }

  // Every word that can be built from this multiset of letters, sorted. Each sub-multiset
  // is visited once: at each depth a letter equal to the one before it is skipped.
  madeFrom(letters: string): string[] {
    const key = signature(letters)
    const cached = this.made.get(key)
    if (cached) return cached
    const chars = [...key]
    const found = new Set<string>()
    const walk = (start: number, acc: string) => {
      if (acc.length >= MIN_LEN) for (const w of this.bySig.get(acc) ?? []) found.add(w)
      for (let i = start; i < chars.length; i++) {
        if (i > start && chars[i] === chars[i - 1]) continue
        walk(i + 1, acc + chars[i])
      }
    }
    walk(0, '')
    const out = [...found].sort()
    if (this.made.size >= MADE_CACHE) this.made.clear()
    this.made.set(key, out)
    return out
  }
}
