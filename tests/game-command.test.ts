import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GAMES, isGameCommand } from '../packages/shared/src/index.ts'

// The dashboard's commands to the game in play: the server sends on only the ones it knows.
test('a game command is one of the known ones, nothing else', () => {
  assert.equal(isGameCommand('next-round'), true)
  for (const other of ['next', 'restart', '', null, undefined, 1, { command: 'next-round' }]) assert.equal(isGameCommand(other), false)
})

// ZeroContext has no time limit any more: a round ends when the chat finds the word, or with "Termina round".
test('ZeroContext has no setting for the length of a round', () => {
  const context = GAMES.find((g) => g.id === 'context')
  assert.ok(context)
  assert.equal(context.settings.some((s) => s.id === 'roundSeconds'), false)
})
