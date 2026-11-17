import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { TABOO_ROUND_PLANS } from '../packages/shared/src/taboo.ts'
import { answerKey, matchAnswer, sharesRoot, tokenize } from '../apps/server/src/taboo-answer.ts'
import { availableCategories, drawCard, loadDeck, validateDeck, zeroTabooDb, type DeckRow, type TabooCard } from '../apps/server/src/taboo-deck.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shared = JSON.parse(readFileSync(join(root, 'gioco-zerotaboo', 'data', 'normalizzazione-casi.json'), 'utf8')) as {
  tokenize: { input: string; tokens: string[] }[]
  answerKey: { input: string; key: string }[]
  sharesRoot: { taboo: string; target: string; result: boolean }[]
}

const deck = loadDeck()
const byCode = new Map(deck.cards.map((c) => [c.code, c]))

test('the shared normalisation cases hold in TypeScript (the Python tool reads the same file)', () => {
  for (const c of shared.tokenize) assert.deepEqual(tokenize(c.input), c.tokens, c.input)
  for (const c of shared.answerKey) assert.equal(answerKey(c.input), c.key, c.input)
  for (const c of shared.sharesRoot) assert.equal(sharesRoot(c.taboo, c.target), c.result, c.taboo)
})

test('the deck of the repository: 62 valid cards, the expected split, five distinct Taboo words each (criterion 1)', () => {
  assert.ok(zeroTabooDb, 'database/ZeroTaboo.sqlite3 must exist: run gioco-zerotaboo/script/mazzo.py import')
  assert.equal(deck.cards.length, 62)
  assert.deepEqual(deck.rejected, [])
  assert.equal(deck.version, 'v3.0')
  const per = (f: (c: TabooCard) => unknown) => (v: unknown) => deck.cards.filter((c) => f(c) === v).length
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F'].map(per((c) => c.category)), [12, 10, 10, 10, 10, 10])
  assert.deepEqual([1, 2, 3].map(per((c) => c.difficulty)), [18, 29, 15])
  for (const c of deck.cards) {
    assert.equal(c.taboo.length, 5, c.code)
    assert.equal(new Set(c.taboo.map(answerKey)).size, 5, c.code)
  }
  assert.equal(new Set(deck.cards.map((c) => answerKey(c.target))).size, 62)
})

test('the editorial warnings are shown and nothing is corrected: D03, D06, F07, D09, E08 (D18)', () => {
  const codes = new Set(deck.warnings.map((w) => w.slice(0, 3)))
  for (const c of ['D03', 'D06', 'F07', 'D09', 'E08']) assert.ok(codes.has(c), c)
  assert.deepEqual(byCode.get('D03')!.taboo.slice(0, 1), ['Denti'])
  assert.equal(byCode.get('D09')!.aliases.length, 0)
})

test('every approved alias is accepted and every «da non accettare» of §8 is not (Appendix A)', () => {
  const db = new Database(zeroTabooDb!, { readonly: true, fileMustExist: true })
  try {
    const excluded = db.prepare(
      'SELECT k.codice AS code, e.testo AS text FROM risposte_escluse e JOIN revisioni r ON r.n = e.revisione JOIN carte k ON k.n = r.carta',
    ).all() as { code: string; text: string }[]
    assert.equal(excluded.length, 16) // the table of §8: 14 cards, 16 answers not to be accepted
    for (const e of excluded) assert.equal(matchAnswer(e.text, byCode.get(e.code)!.answer).kind, 'none', `${e.code} ${e.text}`)
  } finally {
    db.close()
  }
  for (const c of deck.cards) {
    assert.equal(matchAnswer(c.target, c.answer).kind, 'match', c.code)
    for (const a of c.aliases) assert.equal(matchAnswer(a, c.answer).kind, 'match', `${c.code} ${a}`)
  }
})

test('words the rules name as examples: "brutto" is not RUTTO, "simpatico" is not SIMP, "banana" is not BAN, a bare "ciao" does not solve A12', () => {
  assert.equal(matchAnswer('brutto', byCode.get('A02')!.answer).kind, 'none')
  assert.equal(matchAnswer('simpatico', byCode.get('B06')!.answer).kind, 'none')
  assert.equal(matchAnswer('banana', byCode.get('C02')!.answer).kind, 'none')
  assert.equal(matchAnswer('rage quit', byCode.get('B07')!.answer).kind, 'match')
  assert.equal(matchAnswer("pizza con l’ananas", byCode.get('F03')!.answer).kind, 'match')
  assert.equal(matchAnswer('mamma che chiama 10 volte', byCode.get('F07')!.answer).kind, 'match')
  assert.equal(matchAnswer('calzino', byCode.get('A06')!.answer).kind, 'none') // a generic word of a compound
  assert.equal(matchAnswer('un altro compagno fantasma, o no?', byCode.get('E08')!.answer).kind, 'multiple')
})

const row = (over: Partial<DeckRow> = {}): DeckRow => ({
  card_id: 'A01', revision: 1, target: 'PETO', category_id: 'A', difficulty_current: 1, status: 'playtest',
  taboo_words: JSON.stringify(['Scoreggia', 'Aria', 'Puzza', 'Rumore', 'Sedere']), accepted_answers: '[]', ...over,
})

test('validation at the boundary: a card that is not valid stays out with a reason', () => {
  const bad: [string, Partial<DeckRow>][] = [
    ['bad id', { card_id: 'X1' }],
    ['category mismatch', { category_id: 'B' }],
    ['bad difficulty', { difficulty_current: 4 }],
    ['status not playable', { status: 'retired' }],
    ['empty target', { target: '  ' }],
    ['A (B) target', { target: 'CALVIZIE (RIPORTO)' }],
    ['four Taboo', { taboo_words: JSON.stringify(['a', 'b', 'c', 'd']) }],
    ['repeated Taboo', { taboo_words: JSON.stringify(['Gas', 'GAS!', 'c', 'd', 'e']) }],
    ['broken JSON', { taboo_words: '{nope' }],
    ['empty alias', { accepted_answers: JSON.stringify(['!!!']) }],
  ]
  for (const [name, over] of bad) {
    const out = validateDeck([row(over)])
    assert.equal(out.cards.length, 0, name)
    assert.equal(out.rejected.length, 1, name)
  }
  assert.equal(validateDeck([row()]).cards.length, 1)
})

test('validation: duplicate ids, duplicate targets and an alias that is another target', () => {
  assert.equal(validateDeck([row(), row()]).cards.length, 1)
  assert.equal(validateDeck([row(), row({ card_id: 'A02', target: 'peto' })]).cards.length, 1)
  const clash = validateDeck([row(), row({ card_id: 'A02', target: 'RUTTO', accepted_answers: JSON.stringify(['peto']) })])
  assert.deepEqual(clash.cards.map((c) => c.code), ['A01'])
  assert.match(clash.rejected[0].reason, /bersaglio di A01/)
})

// ---- the extraction ----

const seeded = (seed: number) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000
const plan = (n: number) => TABOO_ROUND_PLANS[n - 1].mix
const none = new Set<string>()

test('round 1 (70/30, no hard card): easy and medium only, in about the given proportion (seeded)', () => {
  const random = seeded(1)
  const counts = { 1: 0, 2: 0, 3: 0 }
  for (let i = 0; i < 600; i++) counts[drawCard(deck.cards, { mix: plan(1), category: null, used: none, recent: none }, random)!.card.difficulty]++
  assert.equal(counts[3], 0)
  assert.ok(counts[1] > 380 && counts[1] < 460, String(counts[1])) // about 70 %
})

test('round 2 (30/50/20): the three difficulties come out near the weights', () => {
  const random = seeded(2)
  const counts = { 1: 0, 2: 0, 3: 0 }
  for (let i = 0; i < 1000; i++) counts[drawCard(deck.cards, { mix: plan(2), category: null, used: none, recent: none }, random)!.card.difficulty]++
  assert.ok(counts[1] > 250 && counts[1] < 350 && counts[2] > 440 && counts[2] < 560 && counts[3] > 150 && counts[3] < 250, JSON.stringify(counts))
})

test('I9: no card twice in a match; when the deck is over the draw is null', () => {
  const random = seeded(3)
  const used = new Set<string>()
  for (let i = 0; i < 62; i++) {
    const out = drawCard(deck.cards, { mix: plan(2), category: null, used, recent: none }, random)
    assert.ok(out, `draw ${i}`)
    assert.ok(!used.has(out.card.code))
    used.add(out.card.code)
  }
  assert.equal(drawCard(deck.cards, { mix: plan(2), category: null, used, recent: none }, random), null)
})

test('the same seed gives the same draws', () => {
  const run = () => {
    const random = seeded(99)
    const used = new Set<string>()
    return Array.from({ length: 20 }, () => {
      const c = drawCard(deck.cards, { mix: plan(2), category: null, used, recent: none }, random)!.card.code
      used.add(c)
      return c
    })
  }
  assert.deepEqual(run(), run())
})

test('a voted category gives cards of that category; the two-matches exclusion is relaxed only if the deck needs it (§5)', () => {
  const random = seeded(4)
  const inD = deck.cards.filter((c) => c.category === 'D').map((c) => c.code)
  for (let i = 0; i < 40; i++) assert.equal(drawCard(deck.cards, { mix: plan(3), category: 'D', used: none, recent: none }, random)!.card.category, 'D')
  const recent = new Set(inD.slice(0, 7))
  for (let i = 0; i < 80; i++) {
    const out = drawCard(deck.cards, { mix: plan(3), category: 'D', used: none, recent }, random)!
    assert.ok(!recent.has(out.card.code))
    assert.ok(!out.relaxed.includes('recent')) // the deck allows it: nothing is relaxed on the exclusion
  }
  // all of D was played recently: the exclusion gives way, and it says so
  const out = drawCard(deck.cards, { mix: plan(3), category: 'D', used: none, recent: new Set(inD) }, random)!
  assert.equal(out.card.category, 'D')
  assert.ok(out.relaxed.includes('recent'))
})

test('§5: a voted category with no card left proposes another one, and says why', () => {
  const random = seeded(5)
  const allB = new Set(deck.cards.filter((c) => c.category === 'B').map((c) => c.code))
  const out = drawCard(deck.cards, { mix: plan(3), category: 'B', used: allB, recent: none }, random)!
  assert.notEqual(out.card.category, 'B')
  assert.ok(out.relaxed.includes('category'))
  assert.ok(!availableCategories(deck.cards, allB).includes('B'))
  assert.equal(availableCategories(deck.cards, none).join(''), 'ABCDEF')
})

test('the mix gives way when a stratum has no card left, and it is recorded (the category B has one hard card)', () => {
  const random = seeded(6)
  const hard = deck.cards.filter((c) => c.difficulty === 3).map((c) => c.code)
  const used = new Set(hard)
  const out = drawCard(deck.cards, { mix: { 1: 0, 2: 0, 3: 1 }, category: null, used, recent: none }, random)!
  assert.notEqual(out.card.difficulty, 3)
  assert.ok(out.relaxed.includes('mix'))
  assert.equal(deck.cards.filter((c) => c.category === 'B' && c.difficulty === 3).length, 1)
})
