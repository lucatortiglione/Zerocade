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

const OVERLAY_ORIGIN: string = import.meta.env.VITE_OVERLAY_ORIGIN ?? 'http://localhost:5174'

export const overlayUrl = `${OVERLAY_ORIGIN}/?key=${overlayKey}`
