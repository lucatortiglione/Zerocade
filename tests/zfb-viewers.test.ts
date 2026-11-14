import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { ZfbBridge } from '../apps/server/src/zfb.ts'

// A ZeroFollowerBot bridge on a free local port (ws comes with socket.io): the viewer count it sends reaches
// accounts(), the dashboard's "Spettatori" cell.
const { WebSocketServer } = createRequire(import.meta.url)('ws') as {
  WebSocketServer: new (o: { port: number }) => {
    on(e: 'connection', f: (s: { send(d: string): void }) => void): void
    once(e: 'listening', f: () => void): void
    address(): { port: number }
    close(): void
  }
}

const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 20))
  assert.ok(ok(), 'timed out')
}

test('the bridge viewer count reaches accounts(), and goes with the account', async () => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise<void>((r) => server.once('listening', r))
  let bot: { send(d: string): void } | null = null
  server.on('connection', (s) => {
    bot = s
    s.send(JSON.stringify({ type: 'hello', protocol: 1, requests: ['skip', 'words'] }))
    s.send(JSON.stringify({ type: 'status', tiktok: 'anna', twitch: '' }))
  })
  let changes = 0
  const bridge = new ZfbBridge(() => undefined, () => undefined, () => changes++)
  try {
    bridge.configure({ enabled: true, port: server.address().port })
    await until(() => bridge.accounts().length === 1)
    // Connected, the count not said yet: unknown, not 0.
    assert.equal(bridge.accounts()[0].viewers, undefined)

    const send = (m: object) => bot!.send(JSON.stringify(m))
    send({ type: 'viewers', platform: 'tiktok', count: 42, at: 1 })
    await until(() => bridge.accounts()[0]?.viewers === 42)
    assert.equal(changes, 1)
    // Nobody watching is a count; nonsense and a platform it reads no account on are not.
    send({ type: 'viewers', platform: 'tiktok', count: 0 })
    await until(() => bridge.accounts()[0]?.viewers === 0)
    send({ type: 'viewers', platform: 'tiktok', count: 'molti' })
    send({ type: 'viewers', platform: 'twitch', count: 7 })
    send({ type: 'viewers', platform: 'tiktok', count: 0 })
    await new Promise((r) => setTimeout(r, 100))
    assert.deepEqual(bridge.accounts().map((a) => [a.kind, a.viewers]), [['tiktok', 0]])
    assert.equal(changes, 2)

    // The live closes, then another one opens: its viewers are not the old ones.
    send({ type: 'status', tiktok: '', twitch: '' })
    await until(() => bridge.accounts().length === 0)
    send({ type: 'status', tiktok: 'bruno', twitch: '' })
    await until(() => bridge.accounts().length === 1)
    assert.equal(bridge.accounts()[0].viewers, undefined)
  } finally {
    bridge.close()
    server.close()
  }
})
