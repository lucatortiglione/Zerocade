import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawAvatar } from '../apps/overlay/src/games/avatar.ts'

test('avatar cache is bounded, cancels evicted images and retains recently used entries', () => {
  class Picture {
    src = ''
    referrerPolicy = ''
    complete = false
    naturalWidth = 0
    constructor() { created.push(this) }
  }
  const created: Picture[] = []
  const original = globalThis.Image
  globalThis.Image = Picture as unknown as typeof Image
  const canvas = new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D
  try {
    for (let n = 0; n < 300; n++) drawAvatar(canvas, `https://example.test/${n}`, 0, 0, 10)
    assert.equal(created.length, 300)
    assert.equal(created.filter((picture) => picture.src).length, 256)
    assert.equal(created[43].src, '')
    drawAvatar(canvas, 'https://example.test/44', 0, 0, 10)
    assert.equal(created.length, 300, 'a cached image is reused')
    drawAvatar(canvas, 'https://example.test/new', 0, 0, 10)
    assert.equal(created[45].src, '')
    assert.notEqual(created[44].src, '', 'a recently used image survives eviction')
    drawAvatar(canvas, 'x'.repeat(4097), 0, 0, 10)
    assert.equal(created.length, 301, 'oversized URLs cannot enter the cache')
  } finally { globalThis.Image = original }
})
