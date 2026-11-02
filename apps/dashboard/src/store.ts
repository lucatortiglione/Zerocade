import { useSyncExternalStore } from 'react'
import {
  type BivioState,
  type BridgeStatus,
  type FeedEvent,
  type Gifter,
  type IncastroMoment,
  type IncastroSolution,
  type IncastroState,
  type PadBoard,
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
  pads: PadBoard | null
  // The live events of this room, oldest first.
  feed: FeedItem[]
}

let state: DashboardState = {
  connected: false,
  session: null,
  gifters: [],
  sources: {},
  savedSources: {},
  bridge: null,
  bivio: null,
  incastro: null,
  incastroSolution: null,
  pads: null,
  feed: [],
}
const listeners = new Set<() => void>()

function update(patch: Partial<DashboardState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
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
socket.on('disconnect', () => update({ connected: false }))
socket.on('feed:events', (items) => update({ feed: [...state.feed, ...items].slice(-FEED_KEPT) }))
socket.on('session:state', (session) => update({ session }))
socket.on('ranking:update', (ranking) => update({ gifters: ranking }))
socket.on('source:status', (status) => {
  update({ sources: { ...state.sources, [status.kind]: status } })
})
socket.on('source:saved', (savedSources) => update({ savedSources }))
socket.on('bridge:status', (bridge) => update({ bridge }))
socket.on('bivio:state', (bivio) => update({ bivio }))
socket.on('incastro:state', (incastro) => update({ incastro, feed: marked(state.feed, incastro.moments) }))
socket.on('incastro:solution', (incastroSolution) => update({ incastroSolution }))
socket.on('pads:state', (pads) => update({ pads }))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useDashboard = () => useSyncExternalStore(subscribe, () => state)
