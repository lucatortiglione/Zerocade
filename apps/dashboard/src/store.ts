import { useSyncExternalStore } from 'react'
import { addToRanking, type Gifter, type SessionState } from '@zerocade/shared'
import { socket } from './socket'

// A small external store fed by the socket; components read it with useDashboard().

interface DashboardState {
  connected: boolean
  session: SessionState | null
  gifters: Gifter[]
}

let state: DashboardState = { connected: false, session: null, gifters: [] }
const listeners = new Set<() => void>()

function update(patch: Partial<DashboardState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

socket.on('connect', () => update({ connected: true }))
socket.on('disconnect', () => update({ connected: false }))
socket.on('session:state', (session) => update({ session }))
socket.on('live:event', (event) => {
  if (event.type === 'gift') update({ gifters: addToRanking(state.gifters, event) })
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useDashboard = () => useSyncExternalStore(subscribe, () => state)
