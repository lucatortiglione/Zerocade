import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GAMES, allowedToPlay, defaultSettings } from '../packages/shared/src/index.ts'

const viewer = (extra: object = {}) => ({ id: 'u', nickname: 'luna', ...extra })

test('"Chi può giocare" lets in everyone, the followers (and the fan club) or the fan club alone', () => {
  assert.equal(allowedToPlay({ audience: 'all' }, viewer()), true)
  assert.equal(allowedToPlay({}, viewer()), true)
  assert.equal(allowedToPlay({ audience: 'followers' }, viewer()), false)
  assert.equal(allowedToPlay({ audience: 'followers' }, viewer({ follower: false })), false)
  assert.equal(allowedToPlay({ audience: 'followers' }, viewer({ follower: true })), true)
  assert.equal(allowedToPlay({ audience: 'followers' }, viewer({ fan: true })), true)
  assert.equal(allowedToPlay({ audience: 'fans' }, viewer({ follower: true })), false)
  assert.equal(allowedToPlay({ audience: 'fans' }, viewer({ fan: true })), true)
})

test('every game has the audience and voice settings, once, with ZeroContext reading only followers by default', () => {
  for (const game of GAMES) {
    assert.equal(game.settings.filter((s) => s.id === 'audience').length, 1, game.id)
    assert.equal(game.settings.filter((s) => s.id === 'voiceFollowersOnly').length, 1, game.id)
    const defaults = defaultSettings(game.settings)
    assert.equal(defaults.audience, 'all', game.id)
    assert.equal(defaults.voiceFollowersOnly, game.id === 'context', game.id)
  }
})
