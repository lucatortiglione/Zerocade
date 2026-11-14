import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LiveEvent } from '../packages/shared/src/index.ts'
import { FOLLOW_TTL_MS, MAX_FOLLOWS, RecentFollows } from '../apps/server/src/follows.ts'

const comment = (id: string, follower?: boolean): LiveEvent => ({
  type: 'comment',
  user: { id, nickname: id, ...(follower !== undefined && { follower }) },
  text: 'casa',
})
const follow = (id: string): LiveEvent => ({ type: 'follow', user: { id, nickname: id } })

test('who follows during the live is a follower at once, even if TikTok still says no', () => {
  const follows = new RecentFollows(() => 0)
  assert.equal(follows.apply('room', comment('luca', false)).user.follower, false)
  assert.equal(follows.apply('room', follow('luca')).user.follower, true)
  assert.equal(follows.apply('room', comment('luca', false)).user.follower, true)
  assert.equal(follows.apply('room', comment('luca')).user.follower, true)
  // another viewer, and the same viewer in another room, are left as they come
  assert.equal(follows.apply('room', comment('anna')).user.follower, undefined)
  assert.equal(follows.apply('other', comment('luca', false)).user.follower, false)
})

test('a follow counts for a while, and a room keeps only the latest ones', () => {
  let now = 0
  const follows = new RecentFollows(() => now)
  follows.apply('room', follow('luca'))
  now = FOLLOW_TTL_MS - 1
  assert.equal(follows.apply('room', comment('luca', false)).user.follower, true)
  now = FOLLOW_TTL_MS
  assert.equal(follows.apply('room', comment('luca', false)).user.follower, false)

  now = 0
  for (let i = 0; i <= MAX_FOLLOWS; i++) follows.apply('room', follow(`v${i}`))
  assert.equal(follows.apply('room', comment('v0')).user.follower, undefined) // the oldest went first
  assert.equal(follows.apply('room', comment(`v${MAX_FOLLOWS}`)).user.follower, true)
})
