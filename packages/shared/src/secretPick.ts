// ZeroContext: which secret word a new round takes, the same rule in classic games (overlay) and in tournaments
// (server), decided 15/11/2026:
//   1. a word that never came out, chosen at random among those;
//   2. when every word came out, the one that came out least recently (the oldest last use).
// `usesOf`: how many times the word came out; `lastAtOf`: when it last did (ms epoch), only read for words that did.
export function pickSecret<T>(candidates: readonly T[], usesOf: (c: T) => number, lastAtOf: (c: T) => number,
  random: () => number = Math.random): T {
  const never = candidates.filter((c) => usesOf(c) === 0)
  if (never.length) return never[Math.floor(random() * never.length)]
  const oldest = candidates.reduce((a, c) => Math.min(a, lastAtOf(c)), Infinity)
  const pool = candidates.filter((c) => lastAtOf(c) === oldest)
  return pool[Math.floor(random() * pool.length)]
}
