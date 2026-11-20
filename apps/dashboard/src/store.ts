import { useSyncExternalStore } from 'react'
import { frameNotifications } from '@zerocade/browser-runtime'
import {
  EMPTY_LIVE_STATS,
  type BivioState,
  type BridgeStatus,
  type ContextTournamentAdmin,
  type FeedEvent,
  type Gifter,
  type IncastroMoment,
  type IncastroSolution,
  type IncastroState,
  type LiveStats,
  type PadBoard,
  type QuizzlandSolution,
  type QuizzlandState,
  type TabooAdminState,
  type TabooPublicState,
  type WordHuntAdminState,
  type WordHuntPublicState,
  type SavedSources,
  type SessionState,
  type SourceKind,
  type SourceStatus,
} from '@zerocade/shared'
import { socket } from './socket'

// A small external store fed by the socket; components read it with useDashboard().

// A line of the chat box; `mark` is what ZeroWords made of the comment's word.
export type FeedMark = 'found' | 'extra' | 'secret' | 'repeat'
export interface FeedItem extends FeedEvent {
  mark?: FeedMark
}

const FEED_KEPT = 150

interface DashboardState {
  runtimeIssue: string | null
  connected: boolean
  session: SessionState | null
  gifters: Gifter[]
  sources: Partial<Record<SourceKind, SourceStatus>>
  // The account names entered last time, to fill the fields in.
  savedSources: SavedSources
  // ZeroFollowerBot's bridge: TikTok and Twitch read by ZeroFollowerBot (null until the server says).
  bridge: BridgeStatus | null
  bivio: BivioState | null
  incastro: IncastroState | null
  incastroSolution: IncastroSolution | null
  quizzland: QuizzlandState | null
  // The right answer of the question in play, sent to dashboards only.
  quizzlandSolution: QuizzlandSolution | null
  // ZeroTaboo: the public state, and the director's view (the card in play with its Taboo words and aliases), for dashboards only.
  taboo: TabooPublicState | null
  tabooAdmin: TabooAdminState | null
  // ZeroWordHunt: the public state, and the director's view (every word with its path and its avatar cell), for dashboards only.
  wordhunt: WordHuntPublicState | null
  wordhuntAdmin: WordHuntAdminState | null
  // ZeroContext's secret word of the round in play.
  gameSecret: string | null
  // ZeroContext's tournament as its organiser sees it (secret, full standings), and the last refused command.
  tournament: ContextTournamentAdmin | null
  tournamentAt: number
  tournamentError: string | null
  // ZeroContext: how many times each secret word has come out (classic and tournament rounds).
  secretUses: Record<string, number>
  pads: PadBoard | null
  // The live events of this room, oldest first.
  feed: FeedItem[]
  // The live's counters since this Zerocade started.
  stats: LiveStats
}

let state: DashboardState = {
  runtimeIssue: null,
  connected: false,
  session: null,
  gifters: [],
  sources: {},
  savedSources: {},
  bridge: null,
  bivio: null,
  incastro: null,
  incastroSolution: null,
  quizzland: null,
  quizzlandSolution: null,
  taboo: null,
  tabooAdmin: null,
  wordhunt: null,
  wordhuntAdmin: null,
  gameSecret: null,
  tournament: null,
  tournamentAt: 0,
  tournamentError: null,
  secretUses: {},
  pads: null,
  feed: [],
  stats: EMPTY_LIVE_STATS,
}
const listeners = new Set<() => void>()
const notifications = frameNotifications(() => { for (const listener of listeners) listener() })

function update(patch: Partial<DashboardState>) {
  state = { ...state, ...patch }
  notifications.notify()
}

// ZeroWords' verdict on the chat: each word found, extra, secret or repeated (the wheel's
// moments) marks the oldest unmarked comment of that viewer with the word, from the last
// few seconds (the moment follows its comment by a fraction of a second).
const MARK_WITHIN_MS = 15_000
let lastMoment = 0
const wordsOf = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .split(/[^A-Z]+/)

function marked(feed: FeedItem[], moments: IncastroMoment[]): FeedItem[] {
  const newest = moments[0]?.seq ?? 0
  // A fresh room numbers its moments from 1.
  if (newest < lastMoment) lastMoment = 0
  const fresh = moments.filter((m) => m.seq > lastMoment).reverse()
  lastMoment = Math.max(lastMoment, newest)
  let out = feed
  for (const m of fresh) {
    if (m.kind !== 'found' && m.kind !== 'extra' && m.kind !== 'secret' && m.kind !== 'repeat') continue
    const i = out.findIndex(
      (it) =>
        !it.mark &&
        it.at > Date.now() - MARK_WITHIN_MS &&
        it.event.type === 'comment' &&
        it.event.user.id === m.by.id &&
        wordsOf(it.event.text).includes(m.word),
    )
    if (i >= 0) out = out.map((it, k) => (k === i ? { ...it, mark: m.kind } : it))
  }
  return out
}

// A new connection gets the server's latest events again.
socket.on('connect', () => update({ connected: true, feed: [] }))
socket.on('disconnect', () => update({ connected: false, sources: {}, bridge: null }))
socket.on('feed:events', (items) => update({ feed: [...state.feed, ...items].slice(-FEED_KEPT) }))
socket.on('session:state', (session) =>
  update({ session, gameSecret: session.gameId === state.session?.gameId ? state.gameSecret : null }),
)
socket.on('secret:word', ({ word }) => update({ gameSecret: word }))
socket.on('ranking:update', (ranking) => update({ gifters: ranking }))
socket.on('stats:update', (stats) => update({ stats }))
socket.on('source:status', (status) => {
  update({ sources: { ...state.sources, [status.kind]: status } })
})
socket.on('source:saved', (savedSources) => update({ savedSources }))
socket.on('bridge:status', (bridge) => update({ bridge }))
socket.on('runtime:issue', (issue) => update({ runtimeIssue: issue.message }))
export const clearRuntimeIssue = () => update({ runtimeIssue: null })
socket.on('bivio:state', (bivio) => update({ bivio }))
socket.on('incastro:state', (incastro) => update({ incastro, feed: marked(state.feed, incastro.moments) }))
socket.on('incastro:solution', (incastroSolution) => update({ incastroSolution }))
socket.on('quizzland:state', (quizzland) => update({ quizzland }))
socket.on('quizzland:solution', (quizzlandSolution) => update({ quizzlandSolution }))
socket.on('taboo:state', (taboo) => update({ taboo }))
socket.on('taboo:admin', (tabooAdmin) => update({ tabooAdmin }))
socket.on('wordhunt:state', (wordhunt) => update({ wordhunt }))
socket.on('wordhunt:admin', (wordhuntAdmin) => update({ wordhuntAdmin }))
socket.on('pads:state', (pads) => update({ pads }))
socket.on('context:tournament-admin', (tournament) => update({ tournament, tournamentAt: performance.now() }))
socket.on('context:tournament-error', ({ message }) => update({ tournamentError: message }))
socket.on('context:secret-uses', (secretUses) => update({ secretUses }))
socket.on('context:secret-used', ({ word, uses }) => update({ secretUses: { ...state.secretUses, [word]: uses } }))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) notifications.cancel()
  }
}

export const useDashboard = () => useSyncExternalStore(subscribe, () => state)

// The organiser has read the tournament's error: it goes away.
export const clearTournamentError = () => update({ tournamentError: null })
