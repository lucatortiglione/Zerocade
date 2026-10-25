import { GAMES, type SessionState } from '@zerocade/shared'
import { socket } from '../socket'

// Live settings are tuned here and applied to the overlay in real time.
export function SettingsPanel({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)
  if (!game || game.settings.length === 0) return null

  const set = (id: string, value: number | boolean | string) =>
    socket.emit('settings:set', { ...session.settings, [id]: value })

  return (
    <section>
      <h2 className="section-label">Live settings</h2>
      <div className="settings">
        {game.settings.map((s) => {
          const value = session.settings[s.id]
          if (s.kind === 'toggle') {
            return (
              <label key={s.id} className="toggle">
                <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(s.id, e.target.checked)} />
                {s.label}
              </label>
            )
          }
          if (s.kind === 'select') {
            return (
              <label key={s.id} className="setting">
                <span className="setting__label">{s.label}</span>
                <select value={String(value ?? s.default)} onChange={(e) => set(s.id, e.target.value)}>
                  {s.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
          return (
            <label key={s.id} className="setting">
              <span className="setting__label">{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={Number(value)}
                onChange={(e) => set(s.id, Number(e.target.value))}
              />
              <span className="setting__value">{Number(value)}</span>
            </label>
          )
        })}
      </div>
    </section>
  )
}