import type { RoomInfo } from '@zerocade/shared'

// The room comes from the server, so every browser that opens the dashboard drives the same
// overlay and the overlay link never changes. In dev the server may start after this page:
// until it answers, the dashboard waits.

async function loadRoom(): Promise<RoomInfo> {
  for (;;) {
    try {
      const res = await fetch('/api/room')
      if (res.ok) return (await res.json()) as RoomInfo
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

const room = await loadRoom()

export const overlayKey = room.key
// Where the leaderboards are public (the mini server's port), e.g. http://192.168.1.35:3002/classifica/
export const publicLeaderboardUrl = room.publicUrl

// An overlay hosted on another origin can't ask this server for the room, so its link
// names it. Otherwise the link is the server's own, the same for every game.
const OVERLAY_ORIGIN: string | undefined = import.meta.env.VITE_OVERLAY_ORIGIN
export const overlayUrl = OVERLAY_ORIGIN ? `${OVERLAY_ORIGIN}/?key=${overlayKey}` : room.overlayUrl
// The hosts file line the server's link still needs, if any.
export const hostsLine = OVERLAY_ORIGIN ? undefined : room.hostsLine

// The dashboard's own preview of the overlay, which stays silent (no text-to-speech). In dev
// it is the overlay's Vite server, so changes show up live; a build is hosted by the
// Zerocade server under /overlay/.
const previewBase = OVERLAY_ORIGIN
  ? `${OVERLAY_ORIGIN}/`
  : import.meta.env.DEV
    ? 'http://localhost:5174/'
    : `${window.location.origin}/overlay/`
export const previewUrl = `${previewBase}?key=${overlayKey}&preview=1`
