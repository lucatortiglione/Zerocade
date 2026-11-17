// ZeroTaboo: does a chat message answer the card? Pure functions: no clock, no randomness, no I/O.
//
// ZEROTABOO.md §2: the bot accepts the exact target and the *approved* variants only, after normalising case, accents,
// apostrophes, spaces and punctuation. A message may carry a full answer plus accessory text, a generic word of a compound
// target is not enough, and a message with several distinct hypotheses is ignored.
// Decisions of the organiser (16/11/2026): D1 only approved aliases (no automatic plurals); D3 a window of consecutive
// tokens whose concatenation equals the target ("rage quit" = RAGEQUIT); D4 hypotheses are told by list separators, with a
// cap on the tokens beyond the answer.
import { TABOO_RULES } from '@zerocade/shared'

export type AnswerVerdict =
  | { kind: 'match'; via: string } // `via`: the normalised key of the target or alias that matched
  | { kind: 'multiple' } // a match, but the message carries several hypotheses (D4): ignored
  | { kind: 'none' }
  | { kind: 'invalid' } // empty, too long or too many tokens: ignored

export interface AnswerCard {
  target: string
  aliases: readonly string[]
}

export interface CompiledAnswer {
  phrases: readonly { key: string; tokens: readonly string[] }[]
  // "o" / "oppure" tell two hypotheses apart, unless the target itself has them.
  wordSeparators: boolean
}

const MARKS = /\p{M}/gu
const APOSTROPHES = /['’‘ʼ＇`´]/g
const LIST_SEPARATORS = /[,;/|\n\r]+/
const WORD_SEPARATORS: ReadonlySet<string> = new Set(['o', 'oppure'])

// Lower case (Italian), no diacritics, apostrophes as spaces, split on everything that is not a letter or a digit.
// Digits stay: "MAMMA CHE CHIAMA 10 VOLTE" has one. Idempotent: tokenize(tokens.join(' ')) gives the same tokens.
export function tokenize(text: string): string[] {
  return text.normalize('NFD').replace(MARKS, '').toLocaleLowerCase('it').replace(APOSTROPHES, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

// The comparison key of a phrase: its tokens joined. Two targets with the same key are the same target.
export const answerKey = (text: string): string => tokenize(text).join('')

export function compileAnswer(card: AnswerCard): CompiledAnswer {
  const seen = new Set<string>()
  const phrases: { key: string; tokens: readonly string[] }[] = []
  for (const text of [card.target, ...card.aliases]) {
    const tokens = tokenize(text)
    const key = tokens.join('')
    if (!key || seen.has(key)) continue
    seen.add(key)
    phrases.push({ key, tokens })
  }
  return { phrases, wordSeparators: !phrases.some((p) => p.tokens.some((t) => WORD_SEPARATORS.has(t))) }
}

// The number of message tokens used by a window of consecutive tokens whose concatenation equals the phrase's, or null.
// "brutto" does not solve RUTTO, "simpatico" does not solve SIMP, "banana" does not solve BAN: whole tokens only.
export function findPhrase(message: readonly string[], phrase: readonly string[]): number | null {
  const target = phrase.join('')
  if (!target) return null
  for (let start = 0; start < message.length; start++) {
    let joined = ''
    for (let end = start; end < message.length && joined.length < target.length; end++) {
      joined += message[end]
      if (joined === target) return end - start + 1
      if (!target.startsWith(joined)) break
    }
  }
  return null
}

export const containsPhrase = (message: readonly string[], phrase: readonly string[]): boolean => findPhrase(message, phrase) !== null

// The hypotheses of a message: its parts between list separators (and "o"/"oppure"), each with at least one token.
export function hypotheses(text: string, wordSeparators = true): string[][] {
  const out: string[][] = []
  for (const part of text.split(LIST_SEPARATORS)) {
    let current: string[] = []
    for (const token of tokenize(part)) {
      if (wordSeparators && WORD_SEPARATORS.has(token)) {
        if (current.length) out.push(current)
        current = []
      } else current.push(token)
    }
    if (current.length) out.push(current)
  }
  return out
}

export function matchAnswer(text: string, card: CompiledAnswer): AnswerVerdict {
  if (text.length === 0 || text.length > TABOO_RULES.maxMessageChars) return { kind: 'invalid' }
  const tokens = tokenize(text)
  if (tokens.length === 0 || tokens.length > TABOO_RULES.maxMessageTokens) return { kind: 'invalid' }
  let best: { key: string; used: number } | null = null
  for (const phrase of card.phrases) {
    const used = findPhrase(tokens, phrase.tokens)
    if (used !== null && (best === null || used > best.used)) best = { key: phrase.key, used }
  }
  if (!best) return { kind: 'none' }
  // D4: a list of guesses ("pizza, pasta, sushi") or a long tail around the answer is not one answer.
  if (hypotheses(text, card.wordSeparators).length >= 2) return { kind: 'multiple' }
  if (tokens.length - best.used > TABOO_RULES.maxExtraTokens) return { kind: 'multiple' }
  return { kind: 'match', via: best.key }
}

// ---- Editorial checks of the deck (used by the loader and the tests; the Python tool has the same cases) ----

// A Taboo word that shares its root with a word of the target (§7: it must not repeat a constituent word of the target).
// An identical word of three or more letters, or a common prefix of at least four letters covering 60 % of the shorter word.
export function sharesRoot(taboo: string, target: string): boolean {
  for (const a of tokenize(taboo)) {
    for (const b of tokenize(target)) {
      if (a.length >= 3 && a === b) return true
      let p = 0
      while (p < a.length && p < b.length && a[p] === b[p]) p++
      if (p >= 4 && p >= 0.6 * Math.min(a.length, b.length)) return true
    }
  }
  return false
}
