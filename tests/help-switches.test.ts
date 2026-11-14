import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GAMES, activeTriggers, defaultSettings, triggerEnabled, triggersFor, type LiveEvent, type Trigger } from '../packages/shared/src/index.ts'

const game = (id: string) => GAMES.find((g) => g.id === id)!
const viewer = { id: 'u1', nickname: 'ugo' }
const gift: LiveEvent = { type: 'gift', user: viewer, giftId: 'rose', count: 1 }
const like: LiveEvent = { type: 'like', user: viewer, count: 5 }
const comment: LiveEvent = { type: 'comment', user: viewer, text: 'mare' }

const SWITCHES = ['helpFromGifts', 'helpFromLikes', 'helpFromFollows', 'helpFromShares', 'helpFromJoins', 'helpFromComments']

test('every game with help actions has the "Aiuti dal pubblico" switches, on by default; the others do not', () => {
  for (const g of GAMES) {
    const ids = g.settings.map((s) => s.id)
    if (g.actions.some((a) => a.help)) {
      for (const id of SWITCHES) assert.ok(ids.includes(id), `${g.id} lacks ${id}`)
      for (const id of SWITCHES) assert.equal(g.settings.find((s) => s.id === id)?.default, true)
    } else {
      assert.ok(!ids.some((id) => SWITCHES.includes(id)), `${g.id} has help switches without help actions`)
    }
  }
  assert.ok(game('context').actions.find((a) => a.id === 'reveal_closer')?.help)
  assert.ok(!game('context').actions.find((a) => a.id === 'guess')?.help)
  assert.ok(!game('gift-drop').actions.some((a) => a.help))
})

test('with the defaults every trigger is in force', () => {
  for (const g of GAMES) {
    const session = { gameId: g.id, triggers: g.defaultTriggers, settings: defaultSettings(g.settings) }
    assert.deepEqual(activeTriggers(session), g.defaultTriggers, g.id)
  }
  // A session saved before the switches existed has none of them: still on.
  const context = game('context')
  assert.deepEqual(activeTriggers({ gameId: 'context', triggers: context.defaultTriggers, settings: {} }), context.defaultTriggers)
})

test('"Aiuti dai regali" off: a gift gives no help, the chat still guesses', () => {
  const session = { gameId: 'context', triggers: game('context').defaultTriggers, settings: { helpFromGifts: false } }
  assert.deepEqual(triggersFor(activeTriggers(session), gift), [])
  assert.deepEqual(
    triggersFor(activeTriggers(session), comment).map((t) => t.action),
    ['guess'],
  )
})

test('ZeroContext master switch blocks all help triggers, including a rose, while guesses still work', () => {
  const context = game('context')
  assert.equal(defaultSettings(context.settings).disableAllHints, false)
  const triggers: Trigger[] = [
    ...context.defaultTriggers,
    { source: { type: 'comment', match: '!aiuto' }, action: 'small_hint' },
    { source: { type: 'like' }, action: 'reveal_closer' },
    { source: { type: 'follow' }, action: 'small_hint' },
    { source: { type: 'share' }, action: 'small_hint' },
    { source: { type: 'join' }, action: 'small_hint' },
  ]
  const settings = { disableAllHints: true, ...Object.fromEntries(SWITCHES.map((id) => [id, true])) }
  const active = activeTriggers({ gameId: 'context', triggers, settings })
  assert.deepEqual(active, [context.defaultTriggers[0]])
  assert.deepEqual(triggersFor(active, gift), [])
  assert.deepEqual(triggersFor(active, comment).map((t) => t.action), ['guess'])
  assert.deepEqual(activeTriggers({ gameId: 'context', triggers, settings: { disableAllHints: false } }), triggers)
})

test('each switch stops only its own kind of event', () => {
  const triggers: Trigger[] = [
    { source: { type: 'gift' }, action: 'reveal_letter' },
    { source: { type: 'like' }, action: 'show_continent' },
    { source: { type: 'share' }, action: 'add_time' },
  ]
  const actions = (settings: Record<string, boolean>, event: LiveEvent) =>
    triggersFor(activeTriggers({ gameId: 'guess-location', triggers, settings }), event).map((t) => t.action)
  assert.deepEqual(actions({ helpFromLikes: false }, gift), ['reveal_letter'])
  assert.deepEqual(actions({ helpFromLikes: false }, like), [])
  assert.deepEqual(actions({ helpFromGifts: false }, like), ['show_continent'])
})

test('a trigger that does not help (Gift Drop, a guess) is never switched off', () => {
  const settings = Object.fromEntries(SWITCHES.map((id) => [id, false]))
  assert.ok(triggerEnabled(game('gift-drop'), settings, { source: { type: 'gift' }, action: 'drop' }))
  assert.ok(triggerEnabled(game('context'), settings, { source: { type: 'comment' }, action: 'guess' }))
  assert.ok(!triggerEnabled(game('context'), settings, { source: { type: 'comment', match: '!aiuto' }, action: 'small_hint' }))
})
