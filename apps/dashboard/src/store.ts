import { useSyncExternalStore } from 'react'
import {
  type BivioState,
  type Gifter,
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

interface DashboardState {
  connected: boolean
  session: SessionState | null
  gifters: Gifter[]
  sources: Partial<Record<SourceKind, SourceStatus>>
  // The account names entered last time, to fill the fields in.
  savedSources: SavedSources
  bivio: BivioState | null
  incastro: IncastroState | null
  incastroSolution: IncastroSolution | null
  pads: PadBoard | null
}

let state: DashboardState = {
  connected: false,
  session: null,
  gifters: [],
  sources: {},
  savedSources: {},
  bivio: null,
  incastro: null,
  incastroSolution: null,
  pads: null,
}
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
socket.on('source:saved', (savedSources) => update({ savedSources }))
socket.on('bivio:state', (bivio) => update({ bivio }))
socket.on('incastro:state', (incastro) => update({ incastro }))
socket.on('incastro:solution', (incastroSolution) => update({ incastroSolution }))
socket.on('pads:state', (pads) => update({ pads }))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useDashboard = () => useSyncExternalStore(subscribe, () => state)
