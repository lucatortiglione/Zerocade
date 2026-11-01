import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_WIDGETS,
  GAMES,
  GIFTS,
  defaultSettings,
  type BivioState,
  type BivioStats,
  type LiveEvent,
  type SessionState,
  type WidgetId,
} from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'
import { SettingsForm } from './SettingsForm'
import { TriggerEditor } from './TriggerEditor'

// The whole Bivio control column: connection and simulator, stream widgets, the round in
// progress, collected answers, triggers and game settings, as collapsible sections.

export function BivioSidebar({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)

  const reset = () => {
    if (game && window.confirm('Ripristinare le impostazioni predefinite di Bivio?')) {
      socket.emit('settings:set', defaultSettings(game.settings))
    }
  }

  return (
    <aside className="panel left-panel side">
      <label className="side__switch">
        <span>Gioco</span>
        <select value={session.gameId} onChange={(e) => socket.emit('game:select', e.target.value)}>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.emoji} {g.name}
            </option>
          ))}
        </select>
      </label>

      <Section title="Connessione" extra={<ConnectionBadge />}>
        <Connection />
      </Section>

      <Section title="Impostazioni stream">
        <StreamSettings session={session} />
      </Section>

      <div className="side__game">
        <span>🔀 Bivio · Preferiresti…?</span>
        <button type="button" className="side__link" onClick={reset}>
          Ripristina
        </button>
      </div>

      <Section title="Info partita">
        <GameInfo />
      </Section>

      <Section title="Risposte raccolte" open={false}>
        <CollectedAnswers lang={session.settings.lang === 'en' ? 'en' : 'it'} />
      </Section>

      <Section title="Trigger">
        <TriggerEditor session={session} titled={false} />
      </Section>

      <Section title="Impostazioni gioco">
        <SettingsForm session={session} />
      </Section>
    </aside>
  )
}

function Section({ title, extra, open = true, children }: { title: string; extra?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="side-section" open={open}>
      <summary className="side-section__head">
        <span>{title}</span>
        {extra && <span className="side-section__extra">{extra}</span>}
      </summary>
      <div className="side-section__body">{children}</div>
    </details>
  )
}

// --- Connessione ---

function ConnectionBadge() {
  const { connected, sources } = useDashboard()
  const live = sources.tiktok?.state === 'connected' || sources.twitch?.state === 'connected'
  const label = !connected ? 'Offline' : live ? 'Live' : 'Pronto'
  return <span className={`side-badge side-badge--${label.toLowerCase()}`}>{label}</span>
}

function Connection() {
  const { sources, bivio } = useDashboard()
  const tiktok = sources.tiktok
  const [username, setUsername] = useState('')
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
      {tiktok?.state === 'connected' || tiktok?.state === 'connecting' ? (
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

      <LiveSimulator />

      <button
        type="button"
        className="side-action side-action--blue"
        disabled={!bivio?.question}
        onClick={() => socket.emit('bivio:control', bivio?.paused ? 'resume' : 'pause')}
      >
        {bivio?.paused ? '▶ Riprendi gioco' : '⏸ Metti in pausa'}
      </button>
      <button type="button" className="side-action side-action--orange" onClick={() => socket.emit('bivio:control', 'restart')}>
        ↻ Riavvia gioco
      </button>
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
const CHATTER = ['😂😂', 'GG', 'difficile!', 'ma dai', '🔥🔥']
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

// Each round leans one way (between 20/80 and 80/20), so simulated results are not all 50/50.
const leanFor = (roundId: string) => 0.2 + ([...roundId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997) * 0.6

function fakeEvent(bivio: BivioState | null): LiveEvent {
  const nickname = pick(SIM_VIEWERS)
  const user = { id: `sim-${nickname}`, nickname, avatar: `https://api.dicebear.com/9.x/adventurer/png?seed=${nickname}` }
  const roll = Math.random()
  if (roll < 0.75) {
    const a = Math.random() < leanFor(bivio?.roundId ?? '')
    return { type: 'comment', user, text: a ? pick(['A', 'a', '1']) : pick(['B', 'b', '2']) }
  }
  if (roll < 0.83) return { type: 'comment', user, text: pick(CHATTER) }
  if (roll < 0.93) return { type: 'like', user, count: 1 + Math.floor(Math.random() * 10) }
  if (roll < 0.98) return { type: 'gift', user, giftId: GIFTS[Math.floor(Math.random() ** 3 * GIFTS.length)].id, count: 1 }
  return { type: 'follow', user }
}

function LiveSimulator() {
  const { bivio } = useDashboard()
  const [intensity, setIntensity] = useState<Intensity>('lively')
  const [running, setRunning] = useState(false)
  // The interval reads the round through a ref, so it is not restarted on every vote.
  const bivioRef = useRef(bivio)
  bivioRef.current = bivio

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => socket.emit('sim:event', fakeEvent(bivioRef.current)), 1000 / INTENSITY[intensity].perSecond)
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

// --- Impostazioni stream ---

const WIDGETS: { id: WidgetId; label: string; icon: string }[] = [
  { id: 'alerts', label: 'Avvisi', icon: '🔔' },
  { id: 'follower', label: 'Ultimo follower', icon: '➕' },
  { id: 'goal', label: 'Barra obiettivo', icon: '🎯' },
  { id: 'gifters', label: 'Top donatori', icon: '🏆' },
]

function StreamSettings({ session }: { session: SessionState }) {
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

// --- Info partita ---

const PHASE: Record<BivioState['phase'], string> = {
  voting: 'Voto in corso',
  reveal: 'Risultato',
  break: 'Pausa tra le domande',
  empty: 'Nessuna domanda',
}

const share = (votes: number, total: number) => (total ? Math.round((votes / total) * 100) : 0)

function GameInfo() {
  const { bivio } = useDashboard()
  if (!bivio) return <p className="text-muted small">In attesa del server…</p>
  const q = bivio.question
  const total = bivio.votes.a + bivio.votes.b
  const a = share(bivio.votes.a, total)
  const voting = bivio.phase === 'voting'

  return (
    <>
      <div className="info-row">
        <span>Fase</span>
        <strong>{bivio.paused ? 'In pausa' : PHASE[bivio.phase]}</strong>
      </div>
      {q && bivio.phase !== 'empty' && (
        <div className="info-row info-row--stack">
          <span>Domanda {bivio.played}</span>
          <span className="info-row__option info-row__option--a">A · {q.a}</span>
          <span className="info-row__option info-row__option--b">B · {q.b}</span>
        </div>
      )}
      <div className="info-row">
        <span>Voti</span>
        <strong>
          A: {bivio.votes.a} ({total ? a : 0}%) B: {bivio.votes.b} ({total ? 100 - a : 0}%)
        </strong>
      </div>
      <div className="side-controls">
        <button type="button" className="btn btn--small" onClick={() => socket.emit('bivio:control', 'next')}>
          ⏭ Prossima
        </button>
        <button type="button" className="btn btn--small" disabled={!voting} onClick={() => socket.emit('bivio:control', 'reveal')}>
          👁 Rivela
        </button>
        <button type="button" className="btn btn--small" disabled={!voting} onClick={() => socket.emit('bivio:control', 'extra-time')}>
          +10 s
        </button>
      </div>
    </>
  )
}

// --- Risposte raccolte ---

function CollectedAnswers({ lang }: { lang: 'it' | 'en' }) {
  const { bivio } = useDashboard()
  const [stats, setStats] = useState<BivioStats | null>(null)
  const [lastReveal, setLastReveal] = useState('')

  useEffect(() => {
    if (bivio?.phase === 'reveal') setLastReveal(bivio.roundId)
  }, [bivio?.phase, bivio?.roundId])

  // Loaded once, then again after every reveal.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/bivio/stats?lang=${lang}`)
      .then((res) => (res.ok ? (res.json() as Promise<BivioStats>) : null))
      .then((next) => !cancelled && setStats(next))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [lang, lastReveal])

  if (!stats) return <p className="text-muted small">Statistiche non disponibili.</p>
  const played = stats.questions.filter((d) => d.rounds > 0).length
  const mostVoted = stats.questions
    .filter((d) => d.votesA + d.votesB > 0)
    .sort((x, y) => y.votesA + y.votesB - (x.votesA + x.votesB))
    .slice(0, 5)

  return (
    <>
      <p className="small">
        <strong>{stats.totalVotes.toLocaleString('it')}</strong> voti su {played} di {stats.questions.length} domande
      </p>
      {mostVoted.length > 0 && (
        <ol className="answers">
          {mostVoted.map((d) => {
            const n = d.votesA + d.votesB
            const a = share(d.votesA, n)
            return (
              <li key={d.id} title={`${d.a} / ${d.b}`}>
                <span className="answers__text">
                  {d.a} <span className="text-muted">o</span> {d.b}
                </span>
                <span className="answers__split" style={{ ['--a' as string]: `${a}%` }} />
                <span className="answers__num">
                  {a}–{100 - a}% · {n}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <a className="btn btn--small side__export" href="/api/bivio/export.csv" download>
        ⬇ Esporta CSV
      </a>
    </>
  )
}
