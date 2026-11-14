import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tiktokViewer } from '../apps/server/src/sources.ts'
import { bridgeEvent } from '../apps/server/src/zfb.ts'

test('TikTok shows the profile name while keeping its user ID', () => {
  const viewer = tiktokViewer({ userId: '42', uniqueId: 'anna_123', nickname: 'Anna 🌷' })
  assert.equal(viewer.nickname, 'Anna 🌷')
  assert.equal(viewer.id, '42')
  assert.equal(tiktokViewer({ userId: '', uniqueId: 'anna_123', nickname: 'Anna' }).id, 'anna_123')
  assert.equal(tiktokViewer({ uniqueId: 'anna_123', nickname: 'Nome nuovo' }).id, 'anna_123')
})

test('TikTok falls back to the account name when the display name is missing', () => {
  for (const nickname of [undefined, '', '   ']) {
    assert.equal(tiktokViewer({ userId: '42', uniqueId: 'anna_123', nickname }).nickname, 'anna_123')
  }
})

test('a TikTok comment says who follows the host and who is in the fan club through userIdentity', () => {
  const comment = (identity: Record<string, boolean>) => tiktokViewer({ userId: '42', uniqueId: 'anna', userIdentity: identity })
  assert.equal(comment({ isFollowerOfAnchor: true }).follower, true)
  assert.equal(comment({ isMutualFollowingWithAnchor: true }).follower, true)
  assert.equal(comment({ isSubscriberOfAnchor: true }).fan, true)
  // TikTok sends false for both "does not follow" and "not said": the viewer stays unknown.
  const nobody = comment({ isFollowerOfAnchor: false, isSubscriberOfAnchor: false })
  assert.equal(nobody.follower, undefined)
  assert.equal(nobody.fan, undefined)
  assert.equal(tiktokViewer({ userId: '42', uniqueId: 'anna', followRole: 1 }).follower, true)
  assert.equal(comment({ isAnchor: true }).host, true)
  assert.equal(nobody.host, undefined)
})

test('the bridge says who follows and who is in the fan club, as ZeroFollowerBot sends it', () => {
  const user = (fields: Record<string, unknown>) => {
    const converted = bridgeEvent({ type: 'comment', platform: 'tiktok', text: 'casa', id: 'm1',
      user: { id: '42', name: 'anna', nickname: 'Anna', ...fields } })
    assert.ok(converted && 'user' in converted.event)
    return converted.event.user
  }
  const fan = user({ follower: true, fan: true, moderator: true })
  assert.equal(fan.follower, true)
  assert.equal(fan.fan, true)
  assert.equal(user({ follower: false }).follower, false)
  // not said: unknown, not "does not follow"
  assert.equal(user({}).follower, undefined)
  assert.equal(user({ host: true }).host, true)
  assert.equal(user({}).host, undefined)
})

test('the bridge shows profile names on both platforms without merging identities', () => {
  for (const platform of ['tiktok', 'twitch']) {
    const converted = bridgeEvent({ type: 'comment', platform, text: 'ciao',
      user: { id: '42', name: 'anna_123', nickname: 'Anna 🌷' } })
    assert.ok(converted && 'user' in converted.event)
    assert.equal(converted.event.user.nickname, 'Anna 🌷')
    assert.equal(converted.event.user.id, `${platform}:42`)
    const fallback = bridgeEvent({ type: 'comment', platform, text: 'ciao',
      user: { name: 'anna_123', nickname: '' } })
    assert.ok(fallback && 'user' in fallback.event)
    assert.equal(fallback.event.user.nickname, 'anna_123')
    assert.equal(fallback.event.user.id, `${platform}:anna_123`)
  }
})
