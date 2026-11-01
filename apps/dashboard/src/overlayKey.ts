// The overlay key ties this dashboard to the overlays it controls. Until accounts exist it lives
// in this browser only, so clearing site data gives you a new overlay link.

const STORAGE_KEY = 'zerocade.overlayKey'

function loadKey() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
    const key = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, key)
    return key
  } catch {
    return crypto.randomUUID()
  }
}

export const overlayKey = loadKey()

// In dev the overlay has its own Vite server; a build is hosted by the Zerocade server
// itself, under /overlay/ on the same origin as this dashboard.
const OVERLAY_ORIGIN: string | undefined = import.meta.env.VITE_OVERLAY_ORIGIN
const overlayBase = OVERLAY_ORIGIN
  ? `${OVERLAY_ORIGIN}/`
  : import.meta.env.DEV
    ? 'http://localhost:5174/'
    : `${window.location.origin}/overlay/`

export const overlayUrl = `${overlayBase}?key=${overlayKey}`

// The dashboard's own preview of the overlay, which stays silent (no text-to-speech).
export const previewUrl = `${overlayUrl}&preview=1`
