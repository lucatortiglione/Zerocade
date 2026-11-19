import { useState } from 'react'
import { DJ_SOUNDS, type DjPlay } from '@zerocade/shared'
import { socket } from '../socket'

const isAudioUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function DjPadPage() {
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')

  const play = (p: DjPlay, label: string) => {
    socket.emit('dj:play', p)
    setNotice(`Inviato all’overlay: ${label}.`)
  }
  const playUrl = () => {
    const value = url.trim()
    if (!isAudioUrl(value)) {
      setNotice('Indirizzo non valido: deve iniziare con http:// o https://.')
      return
    }
    play({ url: value }, 'suono dall’indirizzo')
  }

  return (
    <div className="djpad" id="contenuto" tabIndex={-1}>
      <h1>DJ Pad</h1>
      <p className="text-muted">I suoni partono sull&rsquo;overlay appena li tocchi, anche durante la diretta.</p>
      <div className="djpad__grid">
        {DJ_SOUNDS.map((s) => (
          <button key={s.id} type="button" className="djpad__btn" onClick={() => play({ soundId: s.id }, s.label)}>
            <span className="djpad__emoji" aria-hidden="true">
              {s.emoji}
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="djpad__custom">
        <label className="sr-only" htmlFor="djpad-url">Indirizzo di un file audio</label>
        <input
          id="djpad-url"
          name="djpad-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://esempio.it/suono.mp3…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) playUrl() }}
        />
        <button type="button" className="btn btn--primary" disabled={!url.trim()} onClick={playUrl}>
          Riproduci indirizzo
        </button>
      </div>
      <p className="text-muted small" aria-live="polite">{notice}</p>
    </div>
  )
}
