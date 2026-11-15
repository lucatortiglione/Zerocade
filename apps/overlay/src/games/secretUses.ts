// ZeroContext: how many times each secret word has come out, and when it last did, in every game of this Zerocade
// (the server counts them: context_secret_uses). A new classic round picks a word that never came out; with none
// left, the one that came out the longest ago (decided 15/11/2026). The overlay's store keeps this up to date (no
// socket here, so the game and its tests do not need one).
import { pickSecret } from '@zerocade/shared'

const uses = new Map<string, number>()
const lastAt = new Map<string, number>()

export function setSecretUses(all: Record<string, number>) {
  uses.clear()
  for (const [word, n] of Object.entries(all)) if (Number.isInteger(n) && n > 0) uses.set(word, n)
}

export function setSecretLast(all: Record<string, number>) {
  lastAt.clear()
  for (const [word, at] of Object.entries(all)) if (Number.isFinite(at)) lastAt.set(word, at)
}

export function noteSecretUse(word: string, n?: number, at: number = Date.now()) {
  uses.set(word, Math.max(n ?? (uses.get(word) ?? 0) + 1, uses.get(word) ?? 0))
  lastAt.set(word, Math.max(at, lastAt.get(word) ?? 0))
}

export const secretUses = (word: string) => uses.get(word) ?? 0
export const secretLastAt = (word: string) => lastAt.get(word) ?? 0

// One of `secrets` (indices into `words`) by that rule; never `last`, the round just played, unless it is the only word.
export function freshSecret(secrets: readonly number[], words: readonly string[], last: string | null,
  random: () => number = Math.random, usesOf: (word: string) => number = secretUses,
  lastAtOf: (word: string) => number = secretLastAt): number {
  const candidates = secrets.length > 1 ? secrets.filter((s) => words[s] !== last) : secrets
  return pickSecret(candidates, (s) => usesOf(words[s]), (s) => lastAtOf(words[s]), random)
}
