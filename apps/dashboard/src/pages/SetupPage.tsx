import { useEffect, useRef, useState } from 'react'
import { hostsLine, overlayUrl } from '../overlayKey'

export function SetupPage() {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const field = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copyLink = async () => {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(overlayUrl)
      setCopy('copied')
      timer.current = window.setTimeout(() => setCopy('idle'), 1500)
    } catch {
      // Clipboard blocked: select the link so Ctrl+C copies it.
      field.current?.select()
      setCopy('failed')
    }
  }

  return (
    <div className="setup" id="contenuto" tabIndex={-1}>
      <h1>Configurazione dell&rsquo;overlay</h1>
      <p className="text-muted">
        Un solo link per tutti i giochi. Aggiungilo una volta come sorgente browser in OBS o in TikTok LIVE Studio, con
        dimensioni 1080&nbsp;×&nbsp;1920 (1920&nbsp;×&nbsp;1080 per una scena orizzontale): quando scegli un altro gioco qui,
        l&rsquo;overlay cambia da solo.
      </p>
      <div className="url-box">
        <input ref={field} type="text" readOnly value={overlayUrl} aria-label="Link dell'overlay" translate="no"
          onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--primary" onClick={copyLink}>
          {copy === 'copied' ? 'Copiato' : 'Copia link'}
        </button>
      </div>
      <p className="small" aria-live="polite">
        {copy === 'failed' && 'Copia non riuscita: il link è selezionato, premi Ctrl+C per copiarlo.'}
      </p>
      {hostsLine && (
        <p className="setup-warning small">
          Questo link non si apre ancora: il file hosts di Windows deve contenere la riga <code translate="no">{hostsLine}</code>.
          Riavvia Zerocade e accetta la richiesta di amministratore, oppure aggiungi la riga a mano a{' '}
          <code translate="no">C:\Windows\System32\drivers\etc\hosts</code>.
        </p>
      )}
      <p className="text-muted small">
        Il link resta lo stesso con qualunque browser apra questa dashboard. Funziona solo su questo PC, mentre Zerocade è
        acceso.
      </p>
    </div>
  )
}
