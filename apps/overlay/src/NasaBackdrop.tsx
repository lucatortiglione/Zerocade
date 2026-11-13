import { useEffect, useState, useSyncExternalStore } from 'react'
import { nasaPhotoAt, type NasaPhoto } from '@zerocade/shared'

// NASA's Image of the Day behind a game. The list comes from the server (GET /api/nasa, the latest pictures of
// NASA's feed); the picture in view from the clock (nasaPhotoAt), so the dashboard preview and the stream show
// the same one. A new picture is loaded before it fades in over the old one. Without a list (no internet), nothing
// shows and the game keeps its plain background.

const REFRESH_MS = 30 * 60_000
const RETRY_MS = 60_000

let photos: NasaPhoto[] = []
let started = false
const listeners = new Set<() => void>()

async function load() {
  try {
    const res = await fetch('/api/nasa', { cache: 'no-store' })
    const list = res.ok ? ((await res.json()) as NasaPhoto[]) : []
    if (Array.isArray(list) && list.length) {
      photos = list
      listeners.forEach((l) => l())
    }
  } catch {
    // The server is restarting: the next try comes soon.
  }
  setTimeout(load, photos.length ? REFRESH_MS : RETRY_MS)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) {
    started = true
    void load()
  }
  return () => listeners.delete(listener)
}

const useNasaPhotos = () => useSyncExternalStore(subscribe, () => photos)

// The number of the current period of `minutes`, updated when the next one starts.
function useSlot(minutes: number) {
  const period = Math.max(1, minutes) * 60_000
  const [slot, setSlot] = useState(() => Math.floor(Date.now() / period))
  useEffect(() => {
    let timer = 0
    const tick = () => {
      const now = Date.now()
      setSlot(Math.floor(now / period))
      timer = window.setTimeout(tick, period - (now % period) + 50)
    }
    tick()
    return () => clearTimeout(timer)
  }, [period])
  return slot
}

interface Layer {
  photo: NasaPhoto
  id: number
}

let nextId = 0

export function NasaBackdrop({ minutes, veil = true }: { minutes: number; veil?: boolean }) {
  const list = useNasaPhotos()
  const slot = useSlot(minutes)
  const period = Math.max(1, minutes) * 60_000
  const target = nasaPhotoAt(list, minutes, slot * period)
  const [layers, setLayers] = useState<Layer[]>([])
  const current = layers.at(-1)?.photo

  useEffect(() => {
    if (!target || target.url === current?.url) return
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      setLayers((old) => [...old.slice(-1), { photo: target, id: ++nextId }])
      // The next picture too, so it is in the browser's cache when its turn comes.
      const next = nasaPhotoAt(list, minutes, (slot + 1) * period)
      if (next && next.url !== target.url) new Image().src = next.url
    }
    img.src = target.url
    return () => {
      live = false
    }
  }, [target?.url])

  if (!current) return null
  return (
    <div className="nasa" aria-hidden="true">
      {layers.map((l) => (
        <div key={l.id} className="nasa__photo" style={{ backgroundImage: `url("${l.photo.url}")` }} />
      ))}
      {veil && <div className="nasa__veil" />}
      <p className="nasa__credit">NASA · {current.title}</p>
    </div>
  )
}
