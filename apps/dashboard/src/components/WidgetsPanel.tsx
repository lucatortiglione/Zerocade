import { useEffect, useState } from 'react'
import { DEFAULT_WIDGETS, TICKER_LIMITS, type SessionState, type TickerConfig, type WidgetId } from '@zerocade/shared'
import { socket } from '../socket'

const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'alerts', label: 'Alerts' },
  { id: 'joins', label: 'Ingressi ("joined")' },
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
      <TickerPanel ticker={session.ticker} />
    </section>
  )
}

const NL = String.fromCharCode(10)

// "Messaggi a rotazione": one message at a time on the overlay, a new one every N seconds, one per line.
function TickerPanel({ ticker }: { ticker: TickerConfig }) {
  const [text, setText] = useState(ticker.messages.join(NL))
  const [interval, setIntervalSec] = useState(String(ticker.intervalSec))
  // Another dashboard changed them: follow, unless this one is being edited.
  useEffect(() => {
    setText(ticker.messages.join(NL))
    setIntervalSec(String(ticker.intervalSec))
  }, [ticker.messages.join(NL), ticker.intervalSec])
  const lines = () => text.split(NL).map((l) => l.trim()).filter(Boolean)
  const save = (patch: Partial<TickerConfig>) =>
    socket.emit('scene:set', {
      ticker: {
        enabled: ticker.enabled,
        intervalSec: Math.min(TICKER_LIMITS.intervalMax, Math.max(TICKER_LIMITS.intervalMin, Math.round(Number(interval)) || ticker.intervalSec)),
        messages: lines(),
        ...patch,
      },
    })
  return (
    <div className="ticker-panel">
      <label className="toggle">
        <input type="checkbox" checked={ticker.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        Messaggi a rotazione
      </label>
      <label htmlFor="ticker-interval">Un messaggio ogni (secondi)</label>
      <input
        id="ticker-interval"
        type="number"
        min={TICKER_LIMITS.intervalMin}
        max={TICKER_LIMITS.intervalMax}
        value={interval}
        onChange={(e) => setIntervalSec(e.target.value)}
        onBlur={() => save({})}
      />
      <label htmlFor="ticker-messages">Messaggi (uno per riga, max {TICKER_LIMITS.maxMessages})</label>
      <textarea
        id="ticker-messages"
        rows={4}
        maxLength={(TICKER_LIMITS.maxLength + 1) * TICKER_LIMITS.maxMessages}
        placeholder="Seguici per non perdere le prossime dirette!"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save({})}
      />
      <p className="text-muted small">
        Compaiono a schermo uno alla volta, a turno, per {TICKER_LIMITS.showSec} secondi. Massimo {TICKER_LIMITS.maxLength} caratteri ciascuno.
      </p>
    </div>
  )
}