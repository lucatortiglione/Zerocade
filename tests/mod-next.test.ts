import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LiveEvent, Viewer } from '@zerocade/shared'
import { isEndRoundCommand } from '../apps/server/src/mod-commands.ts'
import { bridgeEvent } from '../apps/server/src/zfb.ts'

const say = (text: string, user: Partial<Viewer> = {}): LiveEvent => ({ type: 'comment', text, user: { id: 'tiktok:1', nickname: 'luna', ...user } })

test('!next: only a moderator or the streamer, only the exact command', () => {
  assert.equal(isEndRoundCommand(say('!next', { moderator: true })), true)
  assert.equal(isEndRoundCommand(say('  !NEXT ', { moderator: true })), true)
  assert.equal(isEndRoundCommand(say('!next', { host: true })), true)
  assert.equal(isEndRoundCommand(say('!next')), false)
  assert.equal(isEndRoundCommand(say('!next', { follower: true, fan: true })), false)
  assert.equal(isEndRoundCommand(say('!next ora', { moderator: true })), false)
  assert.equal(isEndRoundCommand(say('next', { moderator: true })), false)
  assert.equal(isEndRoundCommand({ type: 'like', count: 1, user: { id: 'tiktok:1', nickname: 'luna', moderator: true } }), false)
})

test('the bridge tells who is a moderator (only when true)', () => {
  const read = (user: Record<string, unknown>) => bridgeEvent({ type: 'comment', platform: 'tiktok', id: '1', text: '!next', user: { id: '1', name: 'luna', ...user } })!.event
  assert.equal((read({ moderator: true }) as { user: Viewer }).user.moderator, true)
  assert.equal((read({ isModerator: true }) as { user: Viewer }).user.moderator, true)
  assert.equal((read({ moderator: false }) as { user: Viewer }).user.moderator, undefined)
  assert.equal((read({}) as { user: Viewer }).user.moderator, undefined)
})
