import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@zerocade/shared'
import { overlayKey } from './overlayKey'

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  path: '/socket.io',
  transports: ['websocket'],
  auth: { clientType: 'dashboard', key: overlayKey },
})
