import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, RoomInfo, ServerToClientEvents } from '@zerocade/shared'

// The overlay link has no key: the overlay asks the server for its room, retrying while
// Zerocade is still starting. A link that names a room (?key=…: the dashboard's preview,
// links copied before) uses that one.
async function roomKey(): Promise<string> {
  const named = new URLSearchParams(window.location.search).get('key')
  if (named) return named
  for (;;) {
    try {
      const res = await fetch('/api/room')
      if (res.ok) return ((await res.json()) as RoomInfo).key
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

const key = await roomKey()

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  path: '/socket.io',
  transports: ['websocket'],
  auth: { clientType: 'overlay', key },
})
