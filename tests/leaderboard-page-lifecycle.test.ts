import assert from 'node:assert/strict'
import { Script } from 'node:vm'
import { after, test } from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.ZEROCADE_DB = join(mkdtempSync(join(tmpdir(), 'zerocade-page-')), 'test.db')
const { leaderboardJs } = await import('../apps/server/src/leaderboard-page.ts')
const { PERIODS } = await import('../apps/server/src/scores.ts')
const { closeDb } = await import('../apps/server/src/db.ts')
after(() => closeDb())

test('the shipped leaderboard page rejects a late poll after a newer live update, prevents overlapping polls and closes owned work', async () => {
  type Element = { children: Element[]; textContent: string; dataset: Record<string, string>; hidden: boolean; className: string;
    classList: { add(): void; toggle(): void }; style: { setProperty(): void }; append(...items: Element[]): void; replaceChildren(...items: Element[]): void; addEventListener(): void }
  const element = (): Element => ({ children: [], textContent: '', dataset: {}, hidden: false, className: '',
    classList: { add() {}, toggle() {} }, style: { setProperty() {} }, append(...items) { this.children.push(...items) },
    replaceChildren(...items) { this.children = items }, addEventListener() {} })
  const nodes = new Map(['tabs', 'list', 'empty', 'period-name'].map((id) => [id, element()]))
  const intervals: (() => void)[] = []
  let leave!: () => void
  let finish!: (response: Response) => void
  let calls = 0
  let signal: AbortSignal | undefined
  class Stream {
    static CLOSED = 2
    static current: Stream
    readyState = 1
    closed = false
    onopen?: () => void
    onmessage?: (event: { data: string }) => void
    onerror?: () => void
    constructor() { Stream.current = this }
    close() { this.closed = true }
  }
  new Script(leaderboardJs).runInNewContext({
    location: { search: '' }, URLSearchParams, Intl, TextDecoder, Uint8Array, AbortController,
    document: { body: { dataset: { game: 'context' } }, documentElement: element(), getElementById: (id: string) => nodes.get(id), createElement: element },
    EventSource: Stream, Image: element,
    fetch: (_url: string, options: { signal: AbortSignal }) => { calls++; signal = options.signal; return new Promise<Response>((done) => { finish = done }) },
    setInterval: (callback: () => void) => { intervals.push(callback); return intervals.length }, clearInterval() {},
    setTimeout: () => 1, clearTimeout() {}, addEventListener: (_name: string, callback: () => void) => { leave = callback },
  })
  assert.equal(calls, 1)
  intervals[0](); intervals[0]()
  assert.equal(calls, 1, 'only one poll can be in flight')
  const boards = (name: string) => Object.fromEntries(PERIODS.map((p) => [p.id, [{ rank: 1, name, points: 10 }]]))
  Stream.current.onmessage!({ data: JSON.stringify({ boards: boards('New') }) })
  const visibleName = () => nodes.get('list')!.children[0].children[2].textContent
  assert.equal(visibleName(), 'New')
  finish(new Response(JSON.stringify({ boards: boards('Old') })))
  await new Promise((done) => setImmediate(done))
  assert.equal(visibleName(), 'New', 'an older poll must not overwrite the live channel')
  leave()
  assert.ok(signal?.aborted)
  assert.ok(Stream.current.closed)
})
