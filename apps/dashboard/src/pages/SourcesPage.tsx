import { useEffect, useState } from 'react'
import { type SourceKind, type SourceStatus } from '@zerocade/shared'
import { BridgeControl } from '../components/Regia'
import { socket } from '../socket'
import { useDashboard } from '../store'

const SOURCES: { kind: SourceKind; label: string; placeholder: string; hint: string }[] = [
  {
    kind: 'tiktok',
    label: 'TikTok',
    placeholder: '@username',
    hint: 'TikTok LIVE username. Gifts, likes, comments, follows, shares and joins are relayed to the overlay.',
  },
  {
    kind: 'twitch',
    label: 'Twitch',
    placeholder: 'channel',
    hint: 'Twitch channel name. Chat messages and bits (cheers) are relayed to the overlay.',
  },
]

export function SourcesPage() {
  const { sources, savedSources } = useDashboard()
  const saved = { tiktok: savedSources.tiktok ?? '', twitch: savedSources.twitch ?? '' }
  const [inputs, setInputs] = useState<Record<SourceKind, string>>(saved)
  // The names saved on the server fill the fields once they arrive.
  useEffect(() => setInputs((prev) => ({ ...prev, tiktok: saved.tiktok })), [saved.tiktok])
  useEffect(() => setInputs((prev) => ({ ...prev, twitch: saved.twitch })), [saved.twitch])

  return (
    <div className="sources">
      <h1>Live sources</h1>
      <p className="text-muted">
        Connect real TikTok and Twitch channels to drive the overlay instead of the simulator.
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
        return (
          <section key={s.kind} className="source-card">
            <h2>{s.label}</h2>
            <p className="text-muted small">{s.hint}</p>
            <div className="source-card__row">
              <input
                type="text"
                placeholder={s.placeholder}
                value={inputs[s.kind]}
                onChange={(e) => setInputs({ ...inputs, [s.kind]: e.target.value })}
                disabled={busy}
              />
              {st?.state === 'connected' ? (
                <button className="btn" onClick={() => socket.emit('source:disconnect', s.kind)}>
                  Disconnect
                </button>
              ) : (
                <button
                  className="btn btn--primary"
                  disabled={!inputs[s.kind].trim() || st?.state === 'connecting'}
                  onClick={() => socket.emit('source:connect', { kind: s.kind, username: inputs[s.kind].trim() })}
                >
                  Connect
                </button>
              )}
            </div>
            {st && (
              <div className={`source-status source-status--${st.state}`}>
                {st.state}
                {st.message ? `: ${st.message}` : ''}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}