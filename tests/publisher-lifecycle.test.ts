import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

test('publisher cancels its owned network requests and waits for an accepted transfer before removing its files', { timeout: 10000 }, async () => {
  process.env.ZEROCADE_DB = join(mkdtempSync(join(tmpdir(), 'zerocade-publisher-')), 'test.db')
  const http = createServer((_req, res) => { res.writeHead(200); res.end('{}') })
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
  const address = http.address()
  assert.ok(address && typeof address !== 'string')
  process.env.ZEROCADE_PUBLISH_TARGET = 'test@localhost:/isolated'
  process.env.ZEROCADE_PUBLISH_HTTP = `http://127.0.0.1:${address.port}`
  const { startLeaderboardPublisher } = await import('../apps/server/src/leaderboard-publish.ts')
  const { reports } = await import('../apps/server/src/infrastructureClient.ts')
  const { closeDb } = await import('../apps/server/src/db.ts')
  let accepted!: () => void
  const started = new Promise<void>((done) => { accepted = done })
  let complete!: () => void
  const pending = new Promise<void>((done) => { complete = done })
  let batchFile = ''
  const publisher = await startLeaderboardPublisher('publisher-room', async (args) => {
    batchFile = args[args.indexOf('-b') + 1]
    accepted()
    await pending
    assert.ok(existsSync(batchFile), 'accepted transfer retains ownership of its source files')
  })
  try {
    assert.ok(publisher)
    await started
    const closing = publisher.close()
    assert.ok(existsSync(batchFile))
    complete()
    await closing
    assert.equal(existsSync(dirname(batchFile)), false)
  } finally {
    complete()
    await publisher?.close()
    await reports.close()
    closeDb()
    http.closeAllConnections()
    await new Promise<void>((done) => http.close(() => done()))
  }
})
