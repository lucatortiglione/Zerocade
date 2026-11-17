import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABOO_RULES, type TabooPublicState } from '../packages/shared/src/taboo.ts'
import { answerKey } from '../apps/server/src/taboo-answer.ts'
import { deck, seeded, setup, viewer, type Harness } from './helpers/tabooHarness.ts'

// What may be said to the audience (criterion 2, with the decision D26): the five Taboo words of the OPEN card, the answer of a
// card only once it is closed. Never the target or an alias of a card still open, and never anything about a card not drawn yet.
const publicText = (s: TabooPublicState): string => JSON.stringify({ ...s, revealed: null, forbidden: null })
const hasWord = (text: string, word: string): boolean => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(text)

function playAMatch(h: Harness) {
  const random = seeded(11)
  assert.deepEqual(h.startMatch({ threshold: 40 }), { ok: true })
  for (let round = 1; round <= TABOO_RULES.rounds; round++) {
    if (round > 1) h.clock.advance(TABOO_RULES.intermissionDefaultMs)
    if (round === 3) { h.say(viewer('v1'), 'B'); h.say(viewer('v2'), 'B') }
    assert.deepEqual(h.startRound(), { ok: true })
    for (let step = 0; step < 14 && h.state().phase === 'round'; step++) {
      const n = Math.floor(random() * 6)
      const who = viewer(`p${Math.floor(random() * 9)}`)
      if (n === 0) h.cmd({ type: 'skip', exposure: h.exposure() })
      else if (n === 1) h.cmd({ type: 'taboo', exposure: h.exposure() })
      else if (n === 2) h.say(who, 'una risposta a caso')
      else h.say(who, h.target())
      h.clock.advance(2_500)
    }
    h.clock.advance(TABOO_RULES.roundMs) // the round ends with its card open
  }
}

test('across a whole match no public state carries the target or an alias of an open card, nor anything of a card not drawn yet', () => {
  const h = setup()
  playAMatch(h)
  assert.equal(h.state().phase, 'finished')
  assert.equal(h.publics.length, h.admins.length)
  assert.ok(h.publics.length > 40, `${h.publics.length} states`)
  const played = new Set<string>()
  h.publics.forEach((state, i) => {
    const admin = h.admins[i]
    const open = admin.card
    if (open) played.add(open.code)
    const text = publicText(state)
    if (open) {
      assert.ok(!hasWord(text, open.target), `state ${i}: the target ${open.target} of the open card ${open.code} is public`)
      for (const alias of open.aliases) assert.ok(!hasWord(text, alias), `state ${i}: alias "${alias}" of ${open.code} is public`)
      // D26: exactly its five Taboo words in the public field (they are public by decision, so only the list is checked)
      assert.deepEqual(state.forbidden, open.taboo, `state ${i}`)
    } else {
      assert.deepEqual(state.forbidden, [], `state ${i}: Taboo words shown with no open card`)
    }
    // Any other card's alias or target is never in the public state, apart from the one the closed-card field reveals.
    for (const card of deck.cards) {
      if (open && card.code === open.code) continue
      const closedNow = state.revealed && answerKey(state.revealed.target) === answerKey(card.target)
      if (closedNow) continue
      for (const alias of card.aliases) assert.ok(!hasWord(text, alias), `state ${i}: alias "${alias}" of ${card.code} is public`)
      assert.ok(!hasWord(text, card.target), `state ${i}: the target ${card.target} of ${card.code} is public`)
    }
  })
  assert.ok(played.size >= 15, `${played.size} cards played`)
})

test('the answer of a card appears only after its closure, and it is the card that was closed', () => {
  const h = setup()
  playAMatch(h)
  const open = new Map<number, string>() // exposure -> target of the card while it is open
  h.admins.forEach((a) => { if (a.card) open.set(a.card.exposure, a.card.target) })
  const closedTargets = new Set<string>()
  h.publics.forEach((state, i) => {
    if (!state.revealed) return
    const admin = h.admins[i]
    // the revealed card is never the one that is open right now (I2: a closed card does not reopen; I9: no repeats)
    if (admin.card) assert.notEqual(answerKey(state.revealed.target), answerKey(admin.card.target))
    closedTargets.add(state.revealed.target)
  })
  // every revealed target is one that was open before, and only then
  const everOpen = new Set([...open.values()])
  for (const t of closedTargets) assert.ok(everOpen.has(t), `${t} was revealed without having been open`)
})

test('a dashboard-only field never reaches the public state: no card, no reports, no warnings', () => {
  const h = setup()
  playAMatch(h)
  for (const state of h.publics) {
    const keys = Object.keys(state)
    for (const forbidden of ['card', 'reports', 'warnings', 'aliases', 'target', 'taboo', 'bridgeReady', 'metrics']) assert.ok(!keys.includes(forbidden), forbidden)
  }
})

test('the open card shown at the start of a round is for the dashboard only', () => {
  const h = setup()
  h.startMatch()
  h.startRound()
  const publicNow = JSON.stringify(h.state())
  const adminNow = h.room.admin()
  assert.ok(adminNow.card)
  assert.ok(!publicNow.toLowerCase().includes(adminNow.card.target.toLowerCase().replace(/[^a-z0-9àèéìòù ]/g, '')) || adminNow.card.target.length < 4)
  assert.ok(!JSON.stringify(h.state()).includes('"target"') || h.state().revealed === null)
})
