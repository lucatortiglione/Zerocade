import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerKey, compileAnswer, containsPhrase, findPhrase, hypotheses, matchAnswer, sharesRoot, tokenize } from '../apps/server/src/taboo-answer.ts'

const card = (target: string, ...aliases: string[]) => compileAnswer({ target, aliases })
const verdict = (text: string, c: ReturnType<typeof card>) => matchAnswer(text, c).kind

test('tokenize: case, accents, apostrophes and punctuation are normalised; digits stay', () => {
  assert.deepEqual(tokenize('PIÙ  Città!'), ['piu', 'citta'])
  assert.deepEqual(tokenize("pizza con l’ananas"), ['pizza', 'con', 'l', 'ananas'])
  assert.deepEqual(tokenize("pizza con l'ananas"), ['pizza', 'con', 'l', 'ananas'])
  assert.deepEqual(tokenize('MAMMA CHE CHIAMA 10 VOLTE'), ['mamma', 'che', 'chiama', '10', 'volte'])
  assert.deepEqual(tokenize('😀 !!'), [])
  assert.deepEqual(tokenize('é'), ['e']) // a combining mark
})

test('tokenize is idempotent', () => {
  for (const s of ["L'Àcqua", 'ALT+F4', 'a  b\tc', 'ragequit', '10 volte', 'ÀÈÌÒÙ']) {
    const once = tokenize(s)
    assert.deepEqual(tokenize(once.join(' ')), once, s)
  }
})

test('whole tokens only: "brutto" is not RUTTO, "simpatico" is not SIMP, "banana" is not BAN', () => {
  assert.equal(verdict('brutto', card('RUTTO')), 'none')
  assert.equal(verdict('simpatico', card('SIMP')), 'none')
  assert.equal(verdict('banana', card('BAN')), 'none')
  assert.equal(verdict('rutto', card('RUTTO')), 'match')
})

test('D3: a window of consecutive tokens joined equals the target ("rage quit" is RAGEQUIT)', () => {
  assert.equal(verdict('rage quit', card('RAGEQUIT')), 'match')
  assert.equal(verdict("pizza con l'ananas", card("PIZZA CON L'ANANAS")), 'match')
  assert.equal(verdict('pizza con l’ananas', card("PIZZA CON L'ANANAS")), 'match')
  assert.equal(verdict('ba n', card('BAN')), 'match') // accepted by the rule, as decided
  assert.equal(findPhrase(['a', 'ba', 'n', 'b'], ['ban']), 2)
  assert.equal(containsPhrase(['calzino'], ['calzino', 'bucato']), false) // a generic word of a compound is not enough
})

test('accessory text around a full answer is fine', () => {
  assert.equal(verdict('secondo me è un peto ahah', card('PETO')), 'match')
  assert.equal(verdict('PETO!!!', card('PETO')), 'match')
  assert.equal(verdict('è un Peto', card('PETO')), 'match')
})

test('D1: only the target and the approved aliases count, no automatic plurals', () => {
  const a10 = card('RIPORTO', 'capelli a riporto')
  assert.equal(verdict('capelli a riporto', a10), 'match')
  assert.equal(verdict('riporto', a10), 'match')
  assert.equal(verdict('riporti', a10), 'none')
  assert.equal(verdict('calvizie', a10), 'none') // from §8: "da non accettare"
  assert.equal(verdict('pelata', a10), 'none')
  assert.equal(verdict('audio', card('VOCALE INTERMINABILE', 'audio vocale lunghissimo')), 'none')
  assert.equal(verdict('muto', card('MICROFONO SPENTO', 'mic spento')), 'none')
  assert.equal(verdict('mic spento', card('MICROFONO SPENTO', 'mic spento')), 'match')
})

test('digits are kept', () => {
  assert.equal(verdict('mamma che chiama 10 volte', card('MAMMA CHE CHIAMA 10 VOLTE')), 'match')
  assert.equal(verdict('mamma che chiama volte', card('MAMMA CHE CHIAMA 10 VOLTE')), 'none')
})

test('D4: a list of hypotheses is ignored, and so is a long tail of text', () => {
  const peto = card('PETO')
  assert.equal(verdict('peto, rutto', peto), 'multiple')
  assert.equal(verdict('peto; rutto; brufolo', peto), 'multiple')
  assert.equal(verdict('peto / rutto', peto), 'multiple')
  assert.equal(verdict('peto | rutto', peto), 'multiple')
  assert.equal(verdict('peto\nrutto', peto), 'multiple')
  assert.equal(verdict('peto o rutto', peto), 'multiple')
  assert.equal(verdict('peto oppure rutto', peto), 'multiple')
  assert.equal(verdict('peto uno due tre quattro cinque sei sette otto nove dieci', peto), 'multiple') // over the cap of extra tokens
  assert.equal(verdict('rutto, brufolo', peto), 'none') // no match at all: nothing to ignore
  assert.equal(verdict('peto uno due tre quattro cinque sei sette otto', peto), 'match') // 8 extra tokens: the cap
})

test('D4: "o" is not a separator when the target has it', () => {
  assert.equal(verdict('si o no', card('SI O NO')), 'match')
})

test('invalid: empty, only emoji or punctuation, too long, too many tokens', () => {
  const peto = card('PETO')
  assert.equal(verdict('', peto), 'invalid')
  assert.equal(verdict('😀😀', peto), 'invalid')
  assert.equal(verdict('!!! ???', peto), 'invalid')
  assert.equal(verdict('peto ' + 'a'.repeat(140), peto), 'invalid') // 145 characters
  assert.equal(verdict(Array.from({ length: 41 }, () => 'a').join(' '), peto), 'invalid')
  assert.equal(verdict('a '.repeat(70).trim(), peto), 'invalid') // 139 characters but 70 tokens
})

test('the target repeated in the same message is one answer; an alias of another card is nothing', () => {
  assert.equal(verdict('peto peto', card('PETO')), 'match')
  assert.equal(verdict('rutto', card('PETO')), 'none')
})

test('the longest match wins, and the key says which one matched', () => {
  const c = card('FOLLOW', 'follow back')
  assert.deepEqual(matchAnswer('follow back', c), { kind: 'match', via: 'followback' })
  assert.deepEqual(matchAnswer('follow', c), { kind: 'match', via: 'follow' })
})

test('fuzz: the matcher never throws and the verdict is stable (seeded)', () => {
  let seed = 12345
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
  const alphabet = ['a', 'B', 'ù', ' ', ',', "'", '’', '1', '😀', '\n', '|', 'o', '/', '́', 'ß', '‍']
  const c = card('RAGE QUIT', 'rage quit')
  for (let i = 0; i < 3000; i++) {
    let s = ''
    for (let n = next() % 160; n > 0; n--) s += alphabet[next() % alphabet.length]
    const first = matchAnswer(s, c)
    assert.deepEqual(matchAnswer(s, c), first)
    if (first.kind === 'match') assert.ok(tokenize(s).join('').includes('ragequit'))
  }
})

test('hypotheses splits on list separators and standalone o/oppure', () => {
  assert.deepEqual(hypotheses('a, b o c'), [['a'], ['b'], ['c']])
  assert.deepEqual(hypotheses('a, b o c', false), [['a'], ['b', 'o', 'c']])
  assert.deepEqual(hypotheses('uno due'), [['uno', 'due']])
  assert.equal(answerKey("L'Ananas"), 'lananas')
})

test('sharesRoot flags a Taboo word that repeats a word of the target (§7)', () => {
  assert.equal(sharesRoot('Denti', 'DENTIERA'), true) // D03
  assert.equal(sharesRoot('Cartone', 'CARTA IGIENICA FINITA'), true) // D06
  assert.equal(sharesRoot('Chiamata', 'MAMMA CHE CHIAMA 10 VOLTE'), true) // F07
  assert.equal(sharesRoot('Scoreggia', 'PETO'), false)
  assert.equal(sharesRoot('Emoji', 'EMOTE'), false)
  assert.equal(sharesRoot('Terra piatta', 'COMPLOTTISTA'), false)
})
