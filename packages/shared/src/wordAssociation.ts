// Word Association v3.6.0: the prompt is shown, the chat guesses its 7 or 8 hidden words.
// The server reads the verified pools from gioco-zeroassociations/prompt.sqlite3 (the reviewed
// associations of each prompt's familiar sense); every round draws 7 or 8 words from one pool,
// respecting the pool's groups of equivalent words and its incompatible pairs.

export const WORD_ASSOCIATION_MIN_WORDS = 7
export const WORD_ASSOCIATION_MAX_WORDS = 8

export type WordAssociationPos = 'NOUN' | 'VERB' | 'ADJ'

export interface WordAssociationAnswer {
  word: string
  // Answers of the same meaning group are near-equivalents: at most group_limits[group] per round.
  group: string
  difficulty: 'easy' | 'medium' | 'hard' | 'unrated'
}

// A verified pool: one prompt in its familiar sense and every reviewed answer for it.
export interface WordAssociationPool {
  // 'c' + 24 hex digits, stable for the pool's sense: telemetry rows point back to it.
  ref: string
  prompt: string
  pos: WordAssociationPos
  // The familiar sense the answers belong to.
  sense: string
  category_id: string | null
  answers: WordAssociationAnswer[]
  group_limits: Record<string, number>
  // Pairs never drawn together.
  conflicts: [string, string][]
}

// One round: the words drawn from a pool.
export interface WordAssociationPuzzle {
  ref: string
  // The visible context, lower case.
  prompt: string
  // The hidden answers (lemmas, lower case), 7 or 8.
  words: string[]
  // Inflected forms also accepted for an answer ("pomodori" for "pomodoro"). May be empty.
  variants: Record<string, string[]>
  // Inflected forms also accepted for the prompt, in the special round where the chat guesses it.
  prompt_variants?: string[]
  pos: WordAssociationPos
  // The pool's familiar sense, safe to show (it names none of the answers), or null.
  hint: string | null
  category_id: string | null
}

const canonical = (word: unknown): word is string =>
  typeof word === 'string' && /^[a-zàèéìòù]+$/.test(word) && word.normalize('NFC') === word
const isPos = (pos: unknown): pos is WordAssociationPos => pos === 'NOUN' || pos === 'VERB' || pos === 'ADJ'
const isCategory = (id: unknown) =>
  id === null || (typeof id === 'string' && /^\d{3}$/.test(id) && Number(id) >= 1)

// A word folded for comparison: lower case, accents dropped, letters only (CAFFÈ -> caffe).
export const answerKey = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it').replace(/[^a-z]/g, '')

const ARTICLE = /^(?:il|lo|la|i|gli|le|un|uno|una)\s+|^(?:l|un|dell|all|nell)['’]\s*/

// A chat comment as one guess: a single word, optionally after an article ("la mozzarella!").
// A comment listing several words is not a guess, so the chat cannot spray answers.
export function guessKey(text: string): string | null {
  const t = text.normalize('NFC').toLocaleLowerCase('it').trim().replace(ARTICLE, '')
  const tokens = t.split(/[^\p{L}]+/u).filter(Boolean)
  if (tokens.length !== 1) return null
  const key = answerKey(tokens[0])
  return key.length >= 2 && key.length <= 30 ? key : null
}

// The regular Italian inflections of a noun or adjective (plural, and for adjectives the other
// gender): what a viewer may write instead of the lemma. A guess, not a dictionary: irregular
// plurals are missed and an odd form may be accepted, which in a guessing game is harmless.
// Verbs stay in the infinitive; words ending in an accented vowel or a consonant do not change.
export function inflections(word: string, pos: WordAssociationPos): string[] {
  if (pos === 'VERB' || word.length < 3 || !/[aeio]$/.test(word)) return []
  // An answer's part of speech is not stored: a long word in -are/-ere/-ire/-rsi is most likely
  // a verb, and stays as it is.
  if (pos !== 'ADJ' && word.length > 5 && /(?:are|ere|ire|rsi)$/.test(word)) return []
  const stem = (n: number) => word.slice(0, -n)
  const out = new Set<string>()
  if (/[cg]o$/.test(word)) out.add(stem(1) + 'hi').add(stem(1) + 'i') // fuoco -> fuochi; amico -> amici
  else if (/[cg]ia$/.test(word)) out.add(stem(2) + 'e').add(stem(1) + 'e') // arancia -> arance; camicia -> camicie
  else if (/[cg]a$/.test(word)) out.add(stem(1) + 'he') // barca -> barche
  else if (/io$/.test(word)) out.add(stem(1)) // bacio -> baci
  else if (word.endsWith('o')) out.add(stem(1) + 'i')
  else if (word.endsWith('a')) {
    out.add(stem(1) + 'e') // casa -> case
    if (/(?:ma|ista)$/.test(word)) out.add(stem(1) + 'i') // problema -> problemi; artista -> artisti
  } else if (word.endsWith('e')) out.add(stem(1) + 'i')
  if (pos === 'ADJ' && word.endsWith('o')) {
    out.add(stem(1) + 'a')
    out.add(/[cg]o$/.test(word) ? stem(1) + 'he' : stem(1) + 'e')
  }
  out.delete(word)
  return [...out].filter(canonical)
}

export function isWordAssociationPool(value: unknown): value is WordAssociationPool {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  if (typeof p.ref !== 'string' || !/^c[a-z0-9]{24}$/.test(p.ref) || !canonical(p.prompt) || !isPos(p.pos)
    || typeof p.sense !== 'string' || !isCategory(p.category_id)) return false
  if (!Array.isArray(p.answers) || !p.group_limits || typeof p.group_limits !== 'object' || !Array.isArray(p.conflicts))
    return false
  const limits = p.group_limits as Record<string, unknown>
  const words = new Set<string>()
  for (const a of p.answers as unknown[]) {
    const answer = a as Record<string, unknown> | null
    if (!answer || !canonical(answer.word) || answer.word === p.prompt || words.has(answer.word)
      || typeof answer.group !== 'string' || !['easy', 'medium', 'hard', 'unrated'].includes(answer.difficulty as string))
      return false
    words.add(answer.word)
    const limit = limits[answer.group]
    if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1)) return false
  }
  return (p.conflicts as unknown[]).every((c) => Array.isArray(c) && c.length === 2 && c.every((w) => words.has(w as string)))
}

export function isWordAssociationPuzzle(value: unknown): value is WordAssociationPuzzle {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.ref !== 'string' || !/^c[a-z0-9]{24}$/.test(item.ref) || !canonical(item.prompt)) return false
  const words = item.words
  if (!Array.isArray(words) || words.length < WORD_ASSOCIATION_MIN_WORDS || words.length > WORD_ASSOCIATION_MAX_WORDS
    || !words.every(canonical) || new Set(words).size !== words.length || words.includes(item.prompt)) return false
  const variants = item.variants
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) return false
  for (const [word, forms] of Object.entries(variants)) {
    if (!words.includes(word) || !Array.isArray(forms) || !forms.every(canonical)) return false
  }
  // Two answers (or an answer and the prompt) a guess could not tell apart.
  const owners = new Map<string, string>()
  for (const word of words) for (const form of [word, ...((variants as Record<string, string[]>)[word] ?? [])]) {
    const key = answerKey(form)
    if (owners.has(key) && owners.get(key) !== word) return false
    owners.set(key, word)
  }
  if (owners.has(answerKey(item.prompt))) return false
  if (item.prompt_variants !== undefined && (!Array.isArray(item.prompt_variants)
    || !item.prompt_variants.every(canonical) || item.prompt_variants.some((form) => owners.has(answerKey(form))))) return false
  return isPos(item.pos)
    && (item.hint === null || (typeof item.hint === 'string' && item.hint.trim().length > 0))
    && isCategory(item.category_id)
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// `count` answers of the pool, in random order, with at most group_limits[group] (1 when not
// set) of each meaning group and no incompatible pair. Null when the pool cannot give that many.
export function drawAnswers(pool: WordAssociationPool, count: number, random: () => number = Math.random): string[] | null {
  const order = shuffle(pool.answers, random)
  const conflicts = new Set(pool.conflicts.map(([a, b]) => pairKey(a, b)))
  const used = new Map<string, number>()
  const chosen: WordAssociationAnswer[] = []
  let nodes = 0
  const search = (start: number): boolean => {
    if (chosen.length === count) return true
    if (++nodes > 20_000) return false
    for (let i = start; i <= order.length - (count - chosen.length); i++) {
      const a = order[i]
      if ((used.get(a.group) ?? 0) >= (pool.group_limits[a.group] ?? 1)) continue
      if (chosen.some((c) => conflicts.has(pairKey(a.word, c.word)))) continue
      chosen.push(a)
      used.set(a.group, (used.get(a.group) ?? 0) + 1)
      if (search(i + 1)) return true
      chosen.pop()
      used.set(a.group, (used.get(a.group) ?? 1) - 1)
    }
    return false
  }
  return search(0) ? chosen.map((a) => a.word) : null
}

// A round from a pool: `count` words (7, 8, or 'random' for either when the pool allows 8),
// their inflections that no other answer or the prompt shares, and the sense as a hint when it
// names none of them. Null when the pool cannot give 7.
export function drawPuzzle(
  pool: WordAssociationPool,
  count: 7 | 8 | 'random' = 'random',
  random: () => number = Math.random,
): WordAssociationPuzzle | null {
  const wanted = count === 'random' ? (random() < 0.5 ? 7 : 8) : count
  const words = drawAnswers(pool, wanted, random) ?? (wanted === 8 && count === 'random' ? drawAnswers(pool, 7, random) : null)
  if (!words) return null
  const forms = new Map(words.map((w) => [w, inflections(w, pool.pos)]))
  const promptForms = inflections(pool.prompt, pool.pos)
  // A key owned by two answers, or by an answer and the prompt, is dropped from the forms.
  const owners = new Map<string, Set<string>>()
  const own = (key: string, owner: string) => owners.set(key, (owners.get(key) ?? new Set()).add(owner))
  own(answerKey(pool.prompt), '')
  for (const f of promptForms) own(answerKey(f), '')
  for (const [word, list] of forms) for (const f of [word, ...list]) own(answerKey(f), word)
  const shared = (key: string) => (owners.get(key)?.size ?? 0) > 1
  const variants: Record<string, string[]> = {}
  for (const [word, list] of forms) {
    const kept = list.filter((f) => !shared(answerKey(f)))
    if (kept.length) variants[word] = kept
  }
  const answerKeys = new Set([...forms].flatMap(([w, list]) => [w, ...list]).map(answerKey))
  const senseNames = pool.sense.split(/[^\p{L}]+/u).filter(Boolean).some((t) => answerKeys.has(answerKey(t)))
  return {
    ref: pool.ref,
    prompt: pool.prompt,
    words,
    variants,
    prompt_variants: promptForms.filter((f) => !shared(answerKey(f))),
    pos: pool.pos,
    hint: pool.sense.trim() && !senseNames ? pool.sense.trim() : null,
    category_id: pool.category_id,
  }
}

// What one overlay sends at the end of a round (not from the dashboard's preview).
export interface WordAssociationRoundReport {
  ref: string
  // The hidden words drawn for the round, in their order on screen.
  words: string[]
  found: { word: string; ms: number; hinted: boolean }[]
  // The most frequent wrong single-word guesses, folded with guessKey.
  wrong: { guess: string; count: number }[]
  durationMs: number
  hints: number
  players: number
  guesses: number
}

export const WORD_ASSOCIATION_WRONG_SENT = 40
