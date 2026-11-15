// ZeroContext: how many times each secret word has come out, in every game of this Zerocade (the server counts them:
// context_secret_uses). A new classic round picks one of the words that came out the fewest times: a word never
// played while there is one (decided 15/11/2026). The overlay's store keeps this up to date (no socket here, so the
// game and its tests do not need one).

const uses = new Map<string, number>()

export function setSecretUses(all: Record<string, number>) {
  uses.clear()
  for (const [word, n] of Object.entries(all)) if (Number.isInteger(n) && n > 0) uses.set(word, n)
}

export function noteSecretUse(word: string, n?: number) {
  uses.set(word, Math.max(n ?? (uses.get(word) ?? 0) + 1, uses.get(word) ?? 0))
}

export const secretUses = (word: string) => uses.get(word) ?? 0

// One of `secrets` (indices into `words`) among those that came out the fewest times, at random; never `last`, the
// round just played, unless it is the only word.
export function freshSecret(secrets: readonly number[], words: readonly string[], last: string | null,
  random: () => number = Math.random, usesOf: (word: string) => number = secretUses): number {
  const candidates = secrets.length > 1 ? secrets.filter((s) => words[s] !== last) : secrets
  const counts = candidates.map((s) => usesOf(words[s]))
  const fewest = counts.reduce((a, b) => Math.min(a, b), Infinity)
  const pool = candidates.filter((_, i) => counts[i] === fewest)
  return pool[Math.floor(random() * pool.length)]
}
