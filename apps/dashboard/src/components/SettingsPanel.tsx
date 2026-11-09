import { GAMES, settingVisible, type GameSetting, type SessionState } from '@zerocade/shared'
import { socket } from '../socket'

// Live settings are tuned here and applied to the overlay in real time. A setting not saved yet
// (added after the session was created) shows its default, which is what the game uses.
export function SettingsPanel({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)
  if (!game || game.settings.length === 0) return null

  const set = (id: string, value: number | boolean | string) =>
    socket.emit('settings:set', { [id]: value })

  const field = (s: GameSetting) => {
    const value = session.settings[s.id] ?? s.default
    if (s.kind === 'toggle') {
      return (
        <label className="toggle">
          <input type="checkbox" checked={value === true} onChange={(e) => set(s.id, e.target.checked)} />
          {s.label}
        </label>
      )
    }
    if (s.kind === 'select') {
      return (
        <label className="setting">
          <span className="setting__label">{s.label}</span>
          <select value={String(value)} onChange={(e) => set(s.id, e.target.value)}>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )
    }
    if (s.kind !== 'number') return null
    return (
      <label className="setting">
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
  }

  return (
    <section>
      <h2 className="section-label">Live settings</h2>
      <div className="settings">
        {game.settings
          .filter((s) => settingVisible(s, game.settings, session.settings))
          .map((s) => (
            // A setting shown because of another one sits indented under it.
            <div key={s.id} className={s.when ? 'setting-sub' : undefined} style={s.when ? undefined : { display: 'contents' }}>
              {field(s)}
            </div>
          ))}
      </div>
    </section>
  )
}
