// ZeroTaboo's deck: loaded from database/ZeroTaboo.sqlite3 (read only, written by gioco-zerotaboo/script/mazzo.py) and
// validated again here (DIRETTIVE §10 "Validazione lato trusted boundary": a card that is not valid stays out, with a
// warning, as quizzland's loadQuestions does). The extraction is a pure function with `random` injected.
// Cards are data, never code: no target, Taboo word or alias lives in the TypeScript source.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { TABOO_CATEGORIES, type TabooCategory, type TabooDifficulty, type TabooRoundPlan } from '@zerocade/shared'
import { answerKey, compileAnswer, sharesRoot, type CompiledAnswer } from './taboo-answer.js'

const here = dirname(fileURLToPath(import.meta.url))
// Next to the server in the Windows package, or in the repository (as ZeroQuizz's).
export const zeroTabooDb = [join(here, 'ZeroTaboo.sqlite3'), join(here, '..', '..', '..', 'database', 'ZeroTaboo.sqlite3')].find((p) => existsSync(p))

export interface TabooCard {
  code: string // [A-F][0-9][0-9], stable
  revision: number
  category: TabooCategory
  difficulty: TabooDifficulty // the current one: what is used at play
  target: string
  taboo: readonly string[] // exactly five
  aliases: readonly string[]
  answer: CompiledAnswer
}

export interface DeckRow {
  card_id: string
  revision: number
  target: string
  category_id: string
  difficulty_current: number
  status: string
  taboo_words: string // JSON array
  accepted_answers: string // JSON array
}

export interface Deck {
  version: string
  cards: TabooCard[]
  rejected: { code: string; reason: string }[] // a card that failed the validation: left out
  warnings: string[] // editorial warnings, shown to the director, never corrected (D18)
}

const CODE = /^[A-F][0-9][0-9]$/
const CATEGORIES: ReadonlySet<string> = new Set(TABOO_CATEGORIES.map((c) => c.code))
const PLAYABLE: ReadonlySet<string> = new Set(['playtest', 'approved'])
const MAX_TEXT = 120

function jsonStrings(text: string): string[] | null {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null
  } catch {
    return null
  }
}

// Validation of the rows, pure: the same checks as the Python tool, repeated at the boundary where the server reads them.
export function validateDeck(rows: readonly DeckRow[], version = 'unknown'): Deck {
  const cards: TabooCard[] = []
  const rejected: { code: string; reason: string }[] = []
  const warnings: string[] = []
  const targets = new Map<string, string>()
  const seen = new Set<string>()
  const drafts: { row: DeckRow; taboo: string[]; aliases: string[] }[] = []
  for (const row of rows) {
    const code = String(row.card_id)
    const reject = (reason: string) => void rejected.push({ code, reason })
    if (!CODE.test(code) || seen.has(code)) { reject('ID non valido o duplicato'); continue }
    seen.add(code)
    if (!CATEGORIES.has(row.category_id) || row.category_id !== code[0]) { reject('categoria non valida'); continue }
    if (![1, 2, 3].includes(row.difficulty_current)) { reject('difficoltà non valida'); continue }
    if (!PLAYABLE.has(row.status)) { reject(`stato «${row.status}» non giocabile`); continue }
    if (!Number.isInteger(row.revision) || row.revision < 1) { reject('revisione non valida'); continue }
    const target = typeof row.target === 'string' ? row.target.trim() : ''
    const key = answerKey(target)
    if (!key || target.length > MAX_TEXT) { reject('bersaglio vuoto o troppo lungo'); continue }
    if (/\(.*\)/.test(target)) { reject('bersaglio nel formato «A (B)»'); continue }
    if (targets.has(key)) { reject(`bersaglio uguale a quello di ${targets.get(key)}`); continue }
    const taboo = jsonStrings(row.taboo_words)
    const aliases = jsonStrings(row.accepted_answers)
    if (!taboo || !aliases) { reject('Taboo o alias non leggibili'); continue }
    const keys = taboo.map(answerKey)
    if (taboo.length !== 5 || new Set(keys).size !== 5 || keys.includes('') || taboo.some((w) => w.length > MAX_TEXT)) { reject('servono esattamente cinque Taboo distinti'); continue }
    if (aliases.some((a) => !answerKey(a) || a.length > MAX_TEXT)) { reject('alias vuoto o troppo lungo'); continue }
    targets.set(key, code)
    drafts.push({ row, taboo, aliases })
  }
  // An alias must never be another card's target.
  for (const { row, taboo, aliases } of drafts) {
    const own = answerKey(row.target)
    const clash = aliases.find((a) => answerKey(a) !== own && targets.has(answerKey(a)))
    if (clash !== undefined) { rejected.push({ code: row.card_id, reason: `l'alias «${clash}» è il bersaglio di ${targets.get(answerKey(clash))}` }); continue }
    cards.push({
      code: row.card_id, revision: row.revision, category: row.category_id as TabooCategory, difficulty: row.difficulty_current as TabooDifficulty,
      target: row.target.trim(), taboo, aliases, answer: compileAnswer({ target: row.target, aliases }),
    })
    for (const w of taboo) if (sharesRoot(w, row.target)) warnings.push(`${row.card_id}: il Taboo «${w}» ha la stessa radice di una parola del bersaglio`)
  }
  for (const r of rejected) warnings.push(`${r.code}: carta esclusa (${r.reason})`)
  return { version, cards, rejected, warnings }
}

// Opens the deck in read only mode and validates it. Throws when the file is missing or unreadable; the caller decides.
export function loadDeck(file: string | undefined = zeroTabooDb): Deck {
  if (!file) throw new Error('database/ZeroTaboo.sqlite3 non trovato')
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    db.pragma('busy_timeout = 5000')
    const rows = db.prepare(
      'SELECT card_id, revision, target, category_id, difficulty_current, status, taboo_words, accepted_answers FROM mazzo_corrente ORDER BY card_id',
    ).all() as DeckRow[]
    const version = (db.prepare("SELECT value FROM meta WHERE name = 'deck_version'").pluck().get() as string | undefined) ?? 'unknown'
    const verified = db.prepare("SELECT value FROM meta WHERE name = 'verified'").pluck().get()
    const deck = validateDeck(rows, version)
    if (verified !== 'true') deck.warnings.push('Il mazzo non risulta verificato dallo strumento mazzo.py')
    // The editorial warnings the tool stored are shown as they are (the Python tool and this loader find the same ones).
    for (const w of db.prepare('SELECT dettaglio FROM avvisi ORDER BY n').pluck().all() as string[]) if (!deck.warnings.includes(w)) deck.warnings.push(w)
    return deck
  } finally {
    db.close()
  }
}

// ---- Extraction ----

export interface DrawRequest {
  mix: TabooRoundPlan['mix'] // weights by difficulty
  category: TabooCategory | null // the voted category (round 3)
  used: ReadonlySet<string> // codes already played in this match: never repeated (I9)
  recent: ReadonlySet<string> // codes played in the previous two matches: avoided only if the deck allows it (§5)
}

export interface DrawResult {
  card: TabooCard
  // What had to be relaxed to find a card: 'recent' (the two-matches exclusion), 'category' (the voted category had no card:
  // an alternative is proposed and the reason is told before the round, §5), 'mix' (a difficulty with no card left).
  relaxed: ('recent' | 'category' | 'mix')[]
}

function pickDifficulty(pool: readonly TabooCard[], mix: DrawRequest['mix'], random: () => number): { difficulty: TabooDifficulty; relaxed: boolean } {
  const available = ([1, 2, 3] as const).filter((d) => pool.some((c) => c.difficulty === d))
  const weighted = available.filter((d) => mix[d] > 0)
  const among = weighted.length ? weighted : available // all the weighted strata are empty: the mix is relaxed
  const total = among.reduce((sum, d) => sum + (mix[d] > 0 ? mix[d] : 1), 0)
  let roll = random() * total
  for (const d of among) {
    roll -= mix[d] > 0 ? mix[d] : 1
    if (roll < 0) return { difficulty: d, relaxed: !weighted.length || ([1, 2, 3] as const).some((x) => mix[x] > 0 && !available.includes(x)) }
  }
  const last = among[among.length - 1]
  return { difficulty: last, relaxed: !weighted.length }
}

// A stratified draw: the difficulty by the weights of the round, then a card of that difficulty at random. Null when no card
// is left in the match.
export function drawCard(deck: readonly TabooCard[], request: DrawRequest, random: () => number): DrawResult | null {
  const left = deck.filter((c) => !request.used.has(c.code))
  if (!left.length) return null
  const relaxed: DrawResult['relaxed'] = []
  const fresh = (pool: readonly TabooCard[]) => pool.filter((c) => !request.recent.has(c.code))
  let pool: readonly TabooCard[]
  if (request.category) {
    const inCategory = left.filter((c) => c.category === request.category)
    if (fresh(inCategory).length) pool = fresh(inCategory)
    else if (inCategory.length) { pool = inCategory; relaxed.push('recent') }
    else {
      // The voted category is exhausted: an alternative, the one with the most cards left.
      relaxed.push('category')
      const counts = new Map<TabooCategory, number>()
      for (const c of fresh(left).length ? fresh(left) : left) counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
      const alternative = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]
      pool = (fresh(left).length ? fresh(left) : left).filter((c) => c.category === alternative)
    }
  } else if (fresh(left).length) pool = fresh(left)
  else { pool = left; relaxed.push('recent') }
  const { difficulty, relaxed: mixRelaxed } = pickDifficulty(pool, request.mix, random)
  if (mixRelaxed) relaxed.push('mix')
  const stratum = pool.filter((c) => c.difficulty === difficulty)
  const card = stratum[Math.min(stratum.length - 1, Math.floor(random() * stratum.length))]
  return { card, relaxed }
}

// The categories the chat can vote for: those with at least one card left in the match (round 3).
export function availableCategories(deck: readonly TabooCard[], used: ReadonlySet<string>): TabooCategory[] {
  const have = new Set(deck.filter((c) => !used.has(c.code)).map((c) => c.category))
  return TABOO_CATEGORIES.map((c) => c.code).filter((c) => have.has(c))
}
