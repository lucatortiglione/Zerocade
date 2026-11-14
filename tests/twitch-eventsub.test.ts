import assert from 'node:assert/strict'
import { test } from 'node:test'

const { TwitchEventSub, parseEventSubMessage } = await import('../apps/server/src/twitch-eventsub.ts')

process.env.TWITCH_CLIENT_ID = 'client-id'
process.env.TWITCH_CLIENT_SECRET = 'very-secret-value'
process.env.TWITCH_USER_ACCESS_TOKEN = 'user-token-secret'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('a message that is not JSON or lacks metadata and payload is ignored, not thrown', () => {
  assert.equal(parseEventSubMessage('not json'), null)
  assert.equal(parseEventSubMessage('null'), null)
  assert.equal(parseEventSubMessage('{"payload":{}}'), null)
  assert.equal(parseEventSubMessage('{"metadata":{},"payload":{}}'), null)
  assert.equal(parseEventSubMessage('{"metadata":{"message_type":"x"}}'), null)
  const ok = parseEventSubMessage('{"metadata":{"message_type":"notification"},"payload":{"a":1}}')
  assert.equal(ok?.metadata.message_type, 'notification')
})

test('a user token is validated in the header; no app token or secret is sent in a URL', async () => {
  const seen: { url: string; body: string; authorization: string | null }[] = []
  const fetchFn = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), body: String(init?.body ?? ''), authorization: new Headers(init?.headers).get('authorization') })
    return json({}, 500)
  }) as unknown as typeof fetch
  const ev = new TwitchEventSub('chan', () => {}, { fetchFn })
  await assert.rejects(ev.start(), /token validation failed \(HTTP 500\)/)
  assert.equal(seen.length, 1)
  assert.ok(!seen[0].url.includes('very-secret-value'), 'the secret must not be in the URL')
  assert.equal(seen[0].body, '')
  assert.equal(seen[0].authorization, 'OAuth user-token-secret')
  assert.ok(!seen[0].url.includes('user-token-secret'))
})

test('a request that never answers is abandoned, and the error does not mention the secret', async () => {
  const fetchFn = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })) as unknown as typeof fetch
  const ev = new TwitchEventSub('chan', () => {}, { fetchFn, requestTimeoutMs: 30 })
  await assert.rejects(ev.start(), (err: Error) => {
    assert.match(err.message, /token validation: no answer in time/)
    assert.ok(!err.message.includes('very-secret-value'))
    return true
  })
})

test('an unknown channel is reported by name', async () => {
  let calls = 0
  const fetchFn = (async () => (++calls === 1 ? json({ client_id: 'client-id', user_id: '1', scopes: [] }) : json({ data: [] }))) as unknown as typeof fetch
  const ev = new TwitchEventSub('nobody', () => {}, { fetchFn })
  await assert.rejects(ev.start(), /channel not found: nobody/)
})
