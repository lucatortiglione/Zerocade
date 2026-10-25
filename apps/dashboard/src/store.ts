import { useSyncExternalStore } from 'react'
import { type Gifter, type SessionState, type SourceKind, type SourceStatus } from '@zerocade/shared'
import { socket } from './socket'

// A small external store fed by the socket; components read it with useDashboard().

interface DashboardState {
  connected: boolean
  session: SessionState | null
  gifters: Gifter[]
  sources: Partial<Record<SourceKind, SourceStatus>>
}

let state: DashboardState = { connected: false, session: null, gifters: [], sources: {} }
const listeners = new Set<() => void>()

function update(patch: Partial<DashboardState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

socket.on('connect', () => update({ connected: true }))
socket.on('disconnect', () => update({ connected: false }))
socket.on('session:state', (session) => update({ session }))
socket.on('ranking:update', (ranking) => update({ gifters: ranking }))
socket.on('source:status', (status) => {
  update({ sources: { ...state.sources, [status.kind]: status } })
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useDashboard = () => useSyncExternalStore(subscribe, () => state)
