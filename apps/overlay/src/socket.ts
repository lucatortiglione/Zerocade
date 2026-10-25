import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@zerocade/shared'

// The overlay key is passed as ?key=… by the dashboard's overlay link.
const key = new URLSearchParams(window.location.search).get('key') ?? ''

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  path: '/socket.io',
  transports: ['websocket'],
  auth: { clientType: 'overlay', key },
})
