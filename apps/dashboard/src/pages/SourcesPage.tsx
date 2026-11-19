import { useEffect, useState } from 'react'
import { type SourceKind, type SourceState, type SourceStatus } from '@zerocade/shared'
import { BridgeControl } from '../components/Regia'
import { socket } from '../socket'
import { useDashboard } from '../store'

const SOURCES: { kind: SourceKind; label: string; field: string; placeholder: string; hint: string }[] = [
  {
    kind: 'tiktok',
    label: 'TikTok',
    field: 'Nome utente TikTok',
    placeholder: '@nomeutente…',
    hint: 'Il nome utente della diretta TikTok. Regali, like, commenti, follow, condivisioni e ingressi arrivano all’overlay.',
  },
  {
    kind: 'twitch',
    label: 'Twitch',
    field: 'Canale Twitch',
    placeholder: 'nomecanale…',
    hint: 'Il nome del canale Twitch. Messaggi della chat e bits (cheer) arrivano all’overlay.',
  },
]

// The connection state as the creator reads it (the server sends the internal code).
const STATE_LABEL: Record<SourceState, string> = {
  idle: 'Non collegato',
  connecting: 'Collegamento in corso…',
  connected: 'Collegato',
  error: 'Errore',
}

export function SourcesPage() {
  const { sources, savedSources } = useDashboard()
  const saved = { tiktok: savedSources.tiktok ?? '', twitch: savedSources.twitch ?? '' }
  const [inputs, setInputs] = useState<Record<SourceKind, string>>(saved)
  // The names saved on the server fill the fields once they arrive.
  useEffect(() => setInputs((prev) => ({ ...prev, tiktok: saved.tiktok })), [saved.tiktok])
  useEffect(() => setInputs((prev) => ({ ...prev, twitch: saved.twitch })), [saved.twitch])

  return (
    <div className="sources" id="contenuto" tabIndex={-1}>
      <h1>Sorgenti della diretta</h1>
      <p className="text-muted">
        Collega i canali TikTok e Twitch veri per guidare l&rsquo;overlay al posto del simulatore.
      </p>
      <section className="source-card">
        <h2>ZeroFollowerBot</h2>
        <p className="text-muted small">
          Se ZeroFollowerBot è aperto su questo PC legge già la diretta TikTok (con la tua chiave di Euler Stream) e la chat
          di Twitch: Zerocade riceve da lui chat ed eventi, senza un secondo collegamento. In ZeroFollowerBot, scheda
          Account, accendi &ldquo;Manda chat ed eventi a Zerocade&rdquo; con la stessa porta. Con il ponte acceso non
          collegare anche qui sotto la stessa diretta: ogni evento arriverebbe due volte.
        </p>
        <BridgeControl />
      </section>
      {SOURCES.map((s) => {
        const st: SourceStatus | undefined = sources[s.kind]
        const busy = st?.state === 'connecting' || st?.state === 'connected'
        const id = `source-${s.kind}`
        return (
          <section key={s.kind} className="source-card">
            <h2>{s.label}</h2>
            <p className="text-muted small" id={`${id}-hint`}>{s.hint}</p>
            <div className="source-card__row">
              <label className="sr-only" htmlFor={id}>{s.field}</label>
              <input
                id={id}
                name={id}
                type="text"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={`${id}-hint`}
                placeholder={s.placeholder}
                value={inputs[s.kind]}
                onChange={(e) => setInputs({ ...inputs, [s.kind]: e.target.value })}
                disabled={busy}
              />
              {st?.state === 'connected' ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (window.confirm(`Scollegare ${s.label} (${st.username})? Chat ed eventi di questa diretta smettono di arrivare.`))
                      socket.emit('source:disconnect', s.kind)
                  }}
                >
                  Scollega {s.label}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!inputs[s.kind].trim() || st?.state === 'connecting'}
                  onClick={() => socket.emit('source:connect', { kind: s.kind, username: inputs[s.kind].trim() })}
                >
                  {st?.state === 'connecting' ? 'Collegamento…' : `Collega ${s.label}`}
                </button>
              )}
            </div>
            <div className={`source-status${st ? ` source-status--${st.state}` : ''}`} aria-live="polite">
              {st && (
                <>
                  {STATE_LABEL[st.state]}
                  {st.message ? `: ${st.message}` : ''}
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
