import { useState } from 'react'
import { type SourceKind, type SourceStatus } from '@zerocade/shared'
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
  const { sources } = useDashboard()
  const [inputs, setInputs] = useState<Record<SourceKind, string>>({ tiktok: '', twitch: '' })

  return (
    <div className="sources">
      <h1>Live sources</h1>
      <p className="text-muted">
        Connect real TikTok and Twitch channels to drive the overlay instead of the simulator.
      </p>
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