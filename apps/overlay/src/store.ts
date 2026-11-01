import { useSyncExternalStore } from 'react'
import { giftById, type BivioState, type Gifter, type LiveEvent, type SessionState } from '@zerocade/shared'
import { socket } from './socket'
import { playSound } from './audio'

interface OverlayState {
  connected: boolean
  session: SessionState | null
  event: LiveEvent | null
  seq: number
  ranking: Gifter[]
  lastFollower: string | null
  totalCoins: number
  bivio: BivioState | null
  // performance.now() when `bivio` arrived, to count its remainingMs down locally.
  bivioAt: number
  // The creator's latest message, shown for a few seconds; messageSeq keys each one.
  message: string | null
  messageSeq: number
}

let state: OverlayState = {
  connected: false,
  session: null,
  event: null,
  seq: 0,
  ranking: [],
  lastFollower: null,
  totalCoins: 0,
  bivio: null,
  bivioAt: 0,
  message: null,
  messageSeq: 0,
}
const listeners = new Set<() => void>()

function update(patch: Partial<OverlayState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

socket.on('connect', () => update({ connected: true }))
socket.on('disconnect', () => update({ connected: false }))
socket.on('session:state', (session) => update({ session }))
socket.on('ranking:update', (ranking) => update({ ranking }))
socket.on('live:event', (event) => {
  const patch: Partial<OverlayState> = { event, seq: state.seq + 1 }
  if (event.type === 'follow') patch.lastFollower = event.user.nickname
  if (event.type === 'gift') patch.totalCoins = state.totalCoins + (giftById(event.giftId)?.coins ?? 0) * event.count
  update(patch)
})
socket.on('dj:play', (play) => playSound(play))
socket.on('bivio:state', (bivio) => update({ bivio, bivioAt: performance.now() }))

const MESSAGE_MS = 8000
socket.on('overlay:message', (message) => {
  const messageSeq = state.messageSeq + 1
  update({ message, messageSeq })
  setTimeout(() => {
    if (state.messageSeq === messageSeq) update({ message: null })
  }, MESSAGE_MS)
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useOverlay = () => useSyncExternalStore(subscribe, () => state)
