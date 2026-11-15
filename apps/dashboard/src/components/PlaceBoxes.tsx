import { useEffect, useRef, useState } from 'react'
import type { BoxPos, SessionState, TickerConfig } from '@zerocade/shared'
import { socket } from '../socket'

type Which = 'messagePos' | 'tickerPos'

// Where each box sits when the creator never moved it (the overlay's own CSS), as a % of the preview.
const DEFAULTS: Record<Which, BoxPos> = { messagePos: { x: 50, y: 6 }, tickerPos: { x: 50, y: 95 } }
const LABELS: Record<Which, string> = { messagePos: 'Messaggio', tickerPos: 'Messaggi a rotazione' }

// A layer over the preview with a handle for each message box: drag it where it should appear on stream.
// The position is saved in the session as a % of the overlay, so it holds at any size of the browser source.
export function PlaceBoxes({ session }: { session: SessionState }) {
  const ticker = session.ticker
  const layer = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ which: Which; pos: BoxPos } | null>(null)

  const save = (patch: Partial<TickerConfig>) => socket.emit('scene:set', { ticker: { ...ticker, ...patch } })
  const posOf = (which: Which): BoxPos => (drag?.which === which ? drag.pos : ticker[which] ?? DEFAULTS[which])

  const toPos = (e: React.PointerEvent): BoxPos => {
    const r = layer.current!.getBoundingClientRect()
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) }
  }

  // Esc while dragging gives the box back to where it was.
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  return (
    <div ref={layer} className="place-layer">
      {(['messagePos', 'tickerPos'] as const).map((which) => {
        const p = posOf(which)
        return (
          <div
            key={which}
            className={`place-box${drag?.which === which ? ' place-box--drag' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDrag({ which, pos: toPos(e) })
            }}
            onPointerMove={(e) => drag?.which === which && setDrag({ which, pos: toPos(e) })}
            onPointerUp={(e) => {
              if (drag?.which !== which) return
              const pos = toPos(e)
              setDrag(null)
              save({ [which]: pos })
            }}
            onPointerCancel={() => setDrag(null)}
          >
            ⠿ {LABELS[which]}
          </div>
        )
      })}
      {(ticker.messagePos || ticker.tickerPos) && (
        <button className="btn btn--ghost btn--small place-reset" onClick={() => save({ messagePos: null, tickerPos: null })}>
          Ripristina posizioni
        </button>
      )}
    </div>
  )
}
