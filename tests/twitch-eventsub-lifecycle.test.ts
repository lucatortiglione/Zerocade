import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TwitchEventSub } from '../apps/server/src/twitch-eventsub.ts'

process.env.TWITCH_CLIENT_ID = 'client-id'
const json = (body: unknown) => new Response(JSON.stringify(body))
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

class FakeSocket {
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  closed = false
  constructor(auto = true) { if (auto) queueMicrotask(() => this.welcome()) }
  welcome() { this.message('session_welcome', { session: { id: 'session-1', keepalive_timeout_seconds: 1 } }) }
  message(type: string, payload: object, id = '') { this.onmessage?.({ data: JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }) }) }
  close() { this.closed = true; this.onclose?.() }
}
function setup(auto = true) {
  const sockets: FakeSocket[] = []
  const requests: { url: string; body?: Record<string, unknown> }[] = []
  const notices: string[] = []
  const events: string[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, ...(init?.body && { body: JSON.parse(String(init.body)) }) })
    if (url.includes('/validate')) return json({ client_id: 'client-id', user_id: '101', scopes: ['moderator:read:followers'] })
    if (url.includes('/users?')) return json({ data: [{ id: '202' }] })
    return json({ data: [{ id: 'subscription' }] })
  }
  const eventsub = new TwitchEventSub('tester', (event) => events.push(event.type), {
    fetchFn, userToken: 'fake-user-token', onStatus: (message) => notices.push(message),
    socketFactory: () => { const socket = new FakeSocket(auto || sockets.length === 0); sockets.push(socket); return socket as unknown as WebSocket },
  })
  return { eventsub, sockets, requests, notices, events }
}

test('follow v2 and raid use the authenticated user, broadcaster and correct conditions', async () => {
  const { eventsub, requests } = setup()
  try {
    assert.deepEqual(await eventsub.start(), [])
    const subscriptions = requests.filter((request) => request.body).map((request) => request.body)
    assert.equal(subscriptions[0]?.version, '2')
    assert.deepEqual(subscriptions[0]?.condition, { broadcaster_user_id: '202', moderator_user_id: '101' })
    assert.deepEqual(subscriptions[1]?.condition, { to_broadcaster_user_id: '202' })
  } finally { eventsub.close() }
})

test('a reconnect hands over only after welcome, deduplicates notifications and rejects foreign hosts', async () => {
  const { eventsub, sockets, requests, events, notices } = setup(false)
  try {
    await eventsub.start()
    const old = sockets[0]
    old.message('session_reconnect', { session: { reconnect_url: 'wss://evil.example/ws' } })
    assert.equal(sockets.length, 1)
    assert.match(notices.at(-1)!, /rifiutato/)
    old.message('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=test' } })
    assert.equal(sockets.length, 2)
    assert.equal(old.closed, false)
    const notification = { subscription: { type: 'channel.follow' }, event: { user_id: '1', user_name: 'Anna' } }
    old.message('notification', notification, 'same-id')
    sockets[1].welcome()
    await flush()
    assert.equal(old.closed, true)
    sockets[1].message('notification', notification, 'same-id')
    old.message('notification', notification, 'stale-id')
    assert.deepEqual(events, ['follow'])
    assert.equal(requests.length, 4, 'migrated subscriptions must not be recreated')
  } finally { eventsub.close() }
})

test('closing during an HTTP setup cannot open a late socket', async () => {
  let answer!: (response: Response) => void
  let opened = 0
  const fetchFn: typeof fetch = async () => new Promise<Response>((resolve) => { answer = resolve })
  const eventsub = new TwitchEventSub('tester', () => {}, { userToken: 'fake', fetchFn,
    socketFactory: () => { opened++; throw new Error('must not open') } })
  const starting = eventsub.start()
  const failed = assert.rejects(starting)
  eventsub.close()
  answer(json({ client_id: 'client-id', user_id: '1', scopes: [] }))
  await failed
  assert.equal(opened, 0)
})

test('a missing keepalive starts a bounded recovery; closing cancels its retry timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { eventsub, sockets, notices } = setup()
  try {
    await eventsub.start()
    t.mock.timers.tick(2001)
    assert.equal(sockets[0].closed, true)
    assert.ok(notices.some((message) => message.includes('scollegato')))
    t.mock.timers.tick(2000)
    await flush()
    assert.equal(sockets.length, 2)
    eventsub.close()
    t.mock.timers.tick(120_000)
    await flush()
    assert.equal(sockets.length, 2)
  } finally { eventsub.close(); t.mock.timers.reset() }
})
