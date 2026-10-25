import { useState } from 'react'
import { DJ_SOUNDS, type DjPlay } from '@zerocade/shared'
import { socket } from '../socket'

export function DjPadPage() {
  const [url, setUrl] = useState('')

  const play = (p: DjPlay) => socket.emit('dj:play', p)

  return (
    <div className="djpad">
      <h1>DJ Pad</h1>
      <p className="text-muted">Sounds play on the overlay the moment you tap them, even mid-stream.</p>
      <div className="djpad__grid">
        {DJ_SOUNDS.map((s) => (
          <button key={s.id} className="djpad__btn" onClick={() => play({ soundId: s.id })}>
            <span className="djpad__emoji" aria-hidden="true">
              {s.emoji}
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="djpad__custom">
        <input
          type="text"
          placeholder="Paste an audio URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn btn--primary" disabled={!url} onClick={() => play({ url })}>
          Play URL
        </button>
      </div>
    </div>
  )
}