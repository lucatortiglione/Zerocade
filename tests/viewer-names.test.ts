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
