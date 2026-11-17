// A ZeroTaboo room with a fake clock, an in-memory store, the real deck and every emission captured.
import Database from 'better-sqlite3'
import { allowedToPlay, TABOO_RULES, type GameSettings, type TabooAdminState, type TabooCommand, type TabooPlatform, type TabooPublicState, type TabooReply, type Viewer } from '../../packages/shared/src/index.ts'
import { TabooRoom, type TabooDeps, type TabooMessage } from '../../apps/server/src/taboo.ts'
import { TabooStore } from '../../apps/server/src/taboo-db.ts'
import { loadDeck } from '../../apps/server/src/taboo-deck.ts'

export class Clock {
  now = 1_000_000
  private timers: { id: number; at: number; fn: () => void }[] = []
  private next = 1
  add(fn: () => void, ms: number) { const id = this.next++; this.timers.push({ id, at: this.now + ms, fn }); return id }
  cancel(id: unknown) { this.timers = this.timers.filter((t) => t.id !== id) }
  get pending() { return this.timers.length }
  advance(ms: number) {
    const end = this.now + ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      this.cancel(due.id)
      this.now = due.at
      due.fn()
    }
    this.now = end
  }
}

export const seeded = (seed: number) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000
export const viewer = (id: string, platform: TabooPlatform = 'tiktok', over: Partial<Viewer> = {}): Viewer => ({ id: `${platform}:${id}`, nickname: id, ...over })
export const deck = loadDeck()

export function setup(opts: { bridge?: boolean; settings?: GameSettings; random?: () => number; store?: TabooStore } = {}) {
  const clock = new Clock()
  const db = new Database(':memory:')
  const store = opts.store ?? new TabooStore(db)
  const publics: TabooPublicState[] = []
  const admins: TabooAdminState[] = []
  const issues: string[] = []
  let bridge = opts.bridge ?? true
  const settings: GameSettings = opts.settings ?? {}
  const deps: TabooDeps = {
    store, deck: () => deck, monotonicNow: () => clock.now, wallNow: () => 1_700_000_000_000 + clock.now,
    setTimer: (fn, ms) => clock.add(fn, ms), clearTimer: (h) => clock.cancel(h), random: opts.random ?? seeded(7), newId: (() => { let n = 0; return () => `match-${++n}` })(),
    emitPublic: (_k, s) => publics.push(JSON.parse(JSON.stringify(s)) as TabooPublicState),
    emitAdmin: (_k, a) => admins.push(JSON.parse(JSON.stringify(a)) as TabooAdminState),
    bridgeReady: () => bridge, allowed: (_k, user) => allowedToPlay(settings, user), settings: () => settings,
    issue: (_k, message) => issues.push(message), log: () => undefined,
  }
  const room = new TabooRoom('room', deps)
  const state = () => room.state()
  const cmd = (c: Omit<TabooCommand, 'expectedVersion'> & { expectedVersion?: number }): TabooReply => room.control({ expectedVersion: state().version, ...c } as TabooCommand)
  const say = (user: Viewer, text: string, messageId = '', platform: TabooPlatform = 'tiktok', source: TabooMessage['source'] = 'bridge') =>
    room.offer({ source, user, text, messageId, platform })
  const target = () => room.admin().card!.target
  const exposure = () => room.admin().card!.exposure
  const startMatch = (extra: Record<string, unknown> = {}) => cmd({ type: 'start-match', ...extra })
  const startRound = () => cmd({ type: 'start-round' })
  // Ends the open round by the clock, then waits the interval, so the next round can start.
  const endRound = () => { clock.advance(TABOO_RULES.roundMs); clock.advance(TABOO_RULES.intermissionDefaultMs) }
  return { room, clock, store, db, publics, admins, issues, state, cmd, say, target, exposure, startMatch, startRound, endRound, setBridge: (v: boolean) => { bridge = v }, settings }
}
export type Harness = ReturnType<typeof setup>
