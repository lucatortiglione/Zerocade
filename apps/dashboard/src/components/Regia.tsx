import { useEffect, useRef, useState } from 'react'
import { DEFAULT_WIDGETS, GAMES, type LiveEvent, type SessionState, type Viewer, type WidgetId } from '@zerocade/shared'
import { socket } from '../socket'
import { connectionLabels, connectionStatus } from '../connectionStatus'
import { useDashboard } from '../store'

// Pieces shared by the control columns of the server-driven games (Bivio, Incastro): the
// game switcher, the TikTok link, the live simulator, the creator's message and the
// stream widgets.

const BRAIN_CATEGORIES = new Set(['Quiz', 'Parole'])
const BRAIN_GAMES = new Set(['memory-maestro', 'zerodubbi'])

// The games the dashboard offers, in every game menu: only the quiz and brain games (the arcade, fighting and party
// ones stay out; the game in play is always there), in one alphabetical list by name, ignoring case.
export function listedGames(currentId?: string) {
  const listed = GAMES.filter((g) => BRAIN_CATEGORIES.has(g.category) || BRAIN_GAMES.has(g.id) || g.id === currentId)
  return listed.sort((x, y) => x.name.localeCompare(y.name, 'it', { sensitivity: 'base' }))
}

export function GameSwitch({ session }: { session: SessionState }) {
  return (
    <label className="side__switch">
      <span>Gioco</span>
      <select value={session.gameId} onChange={(e) => socket.emit('game:select', e.target.value)}>
        {listedGames(session.gameId).map((g) => (
          <option key={g.id} value={g.id}>
            {g.emoji} {g.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ConnectionBadge() {
  const status = connectionStatus(useDashboard())
  return <span className={`side-badge side-badge--${status}`}>{connectionLabels[status]}</span>
}

export function TiktokAccount() {
  const { sources, savedSources, bridge } = useDashboard()
  const tiktok = sources.tiktok
  const saved = savedSources.tiktok ?? ''
  const [username, setUsername] = useState(saved)
  // The name saved on the server fills the field once it arrives.
  useEffect(() => setUsername(saved), [saved])
  // ZeroFollowerBot already reads this live: connecting here too would bring every event twice.
  const viaBridge = bridge?.state === 'connected' && bridge.tiktok ? bridge.tiktok : ''

  return (
    <>
      {viaBridge && tiktok?.state !== 'connected' && tiktok?.state !== 'connecting' ? (
        <div className="side-account">
          <span className="side-account__name">@{viaBridge}</span>
          <span className="source-status source-status--connected">da ZeroFollowerBot</span>
        </div>
      ) : tiktok?.state === 'connected' || tiktok?.state === 'connecting' ? (
        <div className="side-account">
          <span className="side-account__name">@{tiktok.username}</span>
          <span className={`source-status source-status--${tiktok.state}`}>
            {tiktok.state === 'connected' ? 'collegato' : 'connessione…'}
          </span>
          <button type="button" className="btn btn--small" onClick={() => socket.emit('source:disconnect', 'tiktok')}>
            Scollega
          </button>
        </div>
      ) : (
        <form
          className="side-account"
          onSubmit={(e) => {
            e.preventDefault()
            if (username.trim()) socket.emit('source:connect', { kind: 'tiktok', username: username.trim() })
          }}
        >
          <input
            type="text"
            placeholder="@utente TikTok"
            aria-label="Utente TikTok"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="side-action side-action--red side-action--inline" disabled={!username.trim()}>
            Collega TikTok
          </button>
        </form>
      )}
      {tiktok?.state === 'error' && <p className="source-status source-status--error">{tiktok.message ?? 'Errore'}</p>}
      <BridgeSummary />
    </>
  )
}

// One line on ZeroFollowerBot's bridge, when it is on: what it is reading, or why it is not connected.
export function BridgeSummary() {
  const { bridge } = useDashboard()
  if (!bridge?.enabled) return null
  const accounts = [bridge.tiktok && `TikTok @${bridge.tiktok}`, bridge.twitch && `Twitch ${bridge.twitch}`].filter(Boolean)
  return (
    <p className={`bridge-line bridge-line--${bridge.state}`}>
      <span className="bridge-line__name">ZeroFollowerBot</span>
      {bridge.state === 'connected'
        ? accounts.length
          ? accounts.join(' · ')
          : 'collegato, nessuna diretta aperta'
        : (bridge.message ?? 'collegamento…')}
    </p>
  )
}

// The bridge's switch and port (Sources page): Zerocade listens to ZeroFollowerBot on this PC.
export function BridgeControl({ label = 'Ricevi chat ed eventi da ZeroFollowerBot' }: { label?: string }) {
  const { bridge, connected } = useDashboard()
  const [port, setPort] = useState('')
  useEffect(() => {
    if (bridge) setPort(String(bridge.port))
  }, [bridge?.port])
  if (!bridge) return null
  const portNumber = Number(port)
  const validPort = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535
  const set = (enabled: boolean) => validPort && socket.emit('bridge:set', { enabled, port: portNumber })
  return (
    <>
      <label className="bridge-toggle">
        <input type="checkbox" checked={bridge.enabled} disabled={!validPort} onChange={(e) => set(e.target.checked)} />
        {label}
      </label>
      <div className="source-card__row">
        <label className="bridge-port">
          Porta
          <input
            type="number"
            min={1024}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            onBlur={() => bridge.enabled && portNumber !== bridge.port && set(true)}
          />
        </label>
        {bridge.enabled && (
          <button
            type="button"
            className="btn btn--small"
            disabled={!connected}
            onClick={() => socket.emit('bridge:retry')}
          >
            {bridge.state === 'connected' ? 'Ricollega' : 'Ritenta connessione'}
          </button>
        )}
      </div>
      <BridgeSummary />
    </>
  )
}

export function MessageComposer() {
  const [composing, setComposing] = useState(false)
  const [message, setMessage] = useState('')

  const sendMessage = () => {
    if (!message.trim()) return
    socket.emit('message:send', message.trim())
    setMessage('')
    setComposing(false)
  }

  return (
    <>
      <button
        type="button"
        className="side-action side-action--blue"
        aria-expanded={composing}
        onClick={() => setComposing(!composing)}
      >
        📣 Invia messaggio
      </button>
      {composing && (
        <form
          className="side-message"
          onSubmit={(e) => {
            e.preventDefault()
            sendMessage()
          }}
        >
          <input
            type="text"
            maxLength={140}
            placeholder="Testo da mostrare sull'overlay"
            aria-label="Messaggio"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn--primary btn--small" disabled={!message.trim()}>
            Invia
          </button>
        </form>
      )}
    </>
  )
}

const INTENSITY = {
  calm: { label: 'Tranquillo', perSecond: 1 },
  lively: { label: 'Vivace', perSecond: 3 },
  hyped: { label: 'Scatenato', perSecond: 8 },
}
type Intensity = keyof typeof INTENSITY

const SIM_NAMES = ['luna', 'marco_99', 'giulia.live', 'tex', 'sofi', 'ale_gamer', 'nina', 'kappa', 'teo', 'bea']
const SIM_VIEWERS = SIM_NAMES.flatMap((name) => [1, 2, 3, 4, 5].map((n) => `${name}${n}`))
export const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

// A made-up viewer, with a generated picture, for the simulator.
export function simViewer(): Viewer {
  const nickname = pick(SIM_VIEWERS)
  return { id: `sim-${nickname}`, nickname, avatar: `https://api.dicebear.com/9.x/adventurer/png?seed=${nickname}` }
}

// Sends `makeEvent()` at the chosen pace. The game reads its own state when asked, so the
// interval is not restarted on every update.
export function LiveSimulator({ makeEvent }: { makeEvent: () => LiveEvent }) {
  const [intensity, setIntensity] = useState<Intensity>('lively')
  const [running, setRunning] = useState(false)
  const make = useRef(makeEvent)
  make.current = makeEvent

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => socket.emit('sim:event', make.current()), 1000 / INTENSITY[intensity].perSecond)
    return () => clearInterval(timer)
  }, [running, intensity])

  return (
    <div className="side-box">
      <span className="side-box__title">Simulatore live</span>
      <p className="text-muted small">Prova il gioco con spettatori, chat e regali finti. Non serve collegare TikTok.</p>
      <select aria-label="Intensità" value={intensity} onChange={(e) => setIntensity(e.target.value as Intensity)}>
        {Object.entries(INTENSITY).map(([id, v]) => (
          <option key={id} value={id}>
            {v.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`side-action ${running ? 'side-action--red' : 'side-action--blue'}`}
        onClick={() => setRunning(!running)}
      >
        {running ? '■ Ferma simulatore' : '▶ Avvia simulatore'}
      </button>
    </div>
  )
}

const WIDGETS: { id: WidgetId; label: string; icon: string }[] = [
  { id: 'alerts', label: 'Avvisi', icon: '🔔' },
  { id: 'joins', label: 'Ingressi', icon: '👋' },
  { id: 'follower', label: 'Ultimo follower', icon: '➕' },
  { id: 'goal', label: 'Barra obiettivo', icon: '🎯' },
  { id: 'gifters', label: 'Top donatori', icon: '🏆' },
]

export function StreamSettings({ session }: { session: SessionState }) {
  return (
    <>
      {WIDGETS.map((w) => (
        <label key={w.id} className="switch-row">
          <span className="switch-row__icon" aria-hidden="true">
            {w.icon}
          </span>
          {w.label}
          <input
            type="checkbox"
            checked={Boolean(session.widgets[w.id])}
            onChange={(e) => socket.emit('scene:set', { widgets: { [w.id]: e.target.checked } as SessionState['widgets'] })}
          />
        </label>
      ))}
      {session.widgets.goal && (
        <label className="form__row">
          <span className="form__label">Obiettivo (monete)</span>
          <input
            type="number"
            min={100}
            step={100}
            value={session.goal}
            onChange={(e) => socket.emit('scene:set', { goal: Math.max(100, Number(e.target.value) || DEFAULT_WIDGETS.goal) })}
          />
        </label>
      )}
    </>
  )
}
