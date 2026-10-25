import { DEFAULT_WIDGETS, type SessionState, type WidgetId } from '@zerocade/shared'
import { socket } from '../socket'

const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'alerts', label: 'Alerts' },
  { id: 'follower', label: 'Latest follower' },
  { id: 'goal', label: 'Goal bar' },
  { id: 'gifters', label: 'Top gifters' },
]

export function WidgetsPanel({ session }: { session: SessionState }) {
  const toggle = (id: WidgetId, on: boolean) =>
    socket.emit('scene:set', { widgets: { ...session.widgets, [id]: on } })

  return (
    <section>
      <h2 className="section-label">Overlay widgets</h2>
      <div className="widget-toggles">
        {WIDGETS.map((w) => (
          <label key={w.id} className="toggle">
            <input
              type="checkbox"
              checked={Boolean(session.widgets[w.id])}
              onChange={(e) => toggle(w.id, e.target.checked)}
            />
            {w.label}
          </label>
        ))}
      </div>
      <div className="goal-row">
        <label htmlFor="widget-goal">Goal target (coins)</label>
        <input
          id="widget-goal"
          type="number"
          min={100}
          step={100}
          value={session.goal}
          onChange={(e) => socket.emit('scene:set', { goal: Math.max(100, Number(e.target.value) || DEFAULT_WIDGETS.goal) })}
        />
      </div>
    </section>
  )
}