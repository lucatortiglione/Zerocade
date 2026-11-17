import { useRef, useState } from 'react'
import {
  GAMES,
  TABOO_CATEGORIES,
  TABOO_DIFFICULTY_LABEL,
  defaultSettings,
  type LiveEvent,
  type SessionState,
  type TabooAdminState,
  type TabooCategory,
  type TabooMode,
} from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'
import { BridgeControl, ConnectionBadge, GameSwitch, LiveSimulator, MessageComposer, StreamSettings, pick, simViewer } from './Regia'
import { EndSession } from './GameControls'
import { Section } from './Section'
import { SettingField, SettingsForm } from './SettingsForm'
import { useTabooSend, type TabooSend as Send } from './useTabooSend'
import { TriggerEditor } from './TriggerEditor'

// The ZeroTaboo control column: the match, the card in play with the words only the director sees (its target, the five Taboo
// words and the aliases), skip and Taboo from the buttons (D8), the reports to decide between the rounds, the deck's editorial
// warnings (shown, never corrected, D18) and the game's settings. Every command carries the version the director saw, so a
// click on an old state does nothing and says so (DIRETTIVE §13).

export function TabooSidebar({ session }: { session: SessionState }) {
  const { tabooAdmin } = useDashboard()
  const game = GAMES.find((g) => g.id === session.gameId)
  const { send, message } = useTabooSend()
  const reset = () => {
    if (game && window.confirm('Ripristinare le impostazioni predefinite di ZeroTaboo?')) socket.emit('settings:set', defaultSettings(game.settings))
  }

  return (
    <aside className="panel left-panel side">
      <GameSwitch session={session} />

      <Section title="Connessione" extra={<ConnectionBadge />}>
        <p className="text-muted small">
          ZeroTaboo riceve le risposte della chat dal ponte di ZeroFollowerBot (non dai connettori diretti). Attiva in ZeroFollowerBot
          &ldquo;Manda chat ed eventi a Zerocade&rdquo; e imposta qui la stessa porta.
        </p>
        <BridgeControl label="Ricevi risposte TikTok e Twitch da ZeroFollowerBot" />
        <SettingField session={session} id="audience" />
        <SettingField session={session} id="voiceFollowersOnly" />
        <Simulator admin={tabooAdmin} />
        <MessageComposer />
        <EndSession ended={Boolean(session.ended)} />
      </Section>

      <Section title="Impostazioni stream">
        <StreamSettings session={session} />
      </Section>

      <div className="side__game">
        <span>🎭 ZeroTaboo · Taboo per la diretta</span>
        <button type="button" className="side__link" onClick={reset}>Ripristina</button>
      </div>

      {message && <p className="side-error" role="alert">{message}</p>}

      <Section title="Partita">
        <Match admin={tabooAdmin} send={send} />
      </Section>

      <Section title="Carta in gioco">
        <a className="side__link" href="/taboo" target="_blank" rel="noreferrer">Apri la vista streamer a tutto schermo ↗</a>
        <CardPanel admin={tabooAdmin} send={send} />
      </Section>

      <Section title="Segnalazioni e rettifiche">
        <Reports admin={tabooAdmin} send={send} />
      </Section>

      <Section title="Mazzo e metriche" open={false}>
        <Info admin={tabooAdmin} />
      </Section>

      <Section title="Trigger" open={false}>
        <TriggerEditor session={session} titled={false} />
      </Section>

      <Section title="Impostazioni gioco">
        <SettingsForm session={session} />
        <p className="text-muted small">Le impostazioni valgono dalla partita successiva: la soglia non cambia a partita in corso.</p>
      </Section>
    </aside>
  )
}

function Match({ admin, send }: { admin: TabooAdminState | null; send: Send }) {
  const [mode, setMode] = useState<TabooMode>('standard')
  const state = admin?.state
  if (!state) return <p className="text-muted small">In attesa dello stato…</p>
  const active = state.phase === 'round' || state.phase === 'intermission' || state.phase === 'suspended'
  return (
    <>
      <p className="small">
        {state.phase === 'setup' && 'Nessuna partita.'}
        {state.phase === 'intermission' && `Intervallo · prossimo round ${state.round}/${state.rounds}`}
        {state.phase === 'round' && `Round ${state.round}/${state.rounds} in corso`}
        {state.phase === 'suspended' && 'Sospesa (pausa tecnica): il tempo è fermo'}
        {state.phase === 'finished' && 'Partita finita'}
        {state.phase === 'cancelled' && 'Partita annullata'}
        {state.phase !== 'setup' && ` · squadra ${state.team}/${state.threshold}`}
      </p>
      {state.notice && <p className="text-muted small">{state.notice}</p>}
      {state.phase === 'setup' && (
        <>
          <label className="small">
            Modalità{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value as TabooMode)}>
              <option value="standard">Partita vera (ponte ZeroFollowerBot)</option>
              <option value="practice">Prova (simulatore, fuori classifica)</option>
            </select>
          </label>
          <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'start-match', mode })}>▶ Avvia partita</button>
        </>
      )}
      {state.phase === 'intermission' && (
        <>
          <button type="button" className="side-action side-action--blue" disabled={!admin.canStartRound} onClick={() => void send({ type: 'start-round' })}>
            ▶ Avvia round {state.round}
          </button>
          {state.roundKind === 'chat-choice' && (
            <div className="small">
              La chat vota scrivendo una lettera; se vuoi, scegli tu:{' '}
              {TABOO_CATEGORIES.map((c) => (
                <button key={c.code} type="button" className="btn btn--small" title={c.name} onClick={() => void send({ type: 'category', category: c.code as TabooCategory })}>
                  {c.code}
                </button>
              ))}
              {state.category && <span> · scelta: {state.category}</span>}
            </div>
          )}
        </>
      )}
      {state.phase === 'round' && <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'pause' })}>⏸ Pausa tecnica</button>}
      {state.phase === 'suspended' && <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'resume' })}>▶ Riprendi</button>}
      {active && (
        <button type="button" className="side-action side-action--orange"
          onClick={() => { if (window.confirm('Annullare la partita?')) void send({ type: 'cancel' }) }}>
          ✕ Annulla la partita
        </button>
      )}
      {(state.phase === 'finished' || state.phase === 'cancelled') && <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'dismiss' })}>Chiudi</button>}
    </>
  )
}

function CardPanel({ admin, send }: { admin: TabooAdminState | null; send: Send }) {
  const card = admin?.card
  if (!admin || !card) return <p className="text-muted small">Nessuna carta in gioco.</p>
  return (
    <>
      <div className="taboo-private">
        <p className="small text-muted">{card.code} · {TABOO_CATEGORIES.find((c) => c.code === card.category)?.name} · {TABOO_DIFFICULTY_LABEL[card.difficulty]}{admin.state.jackpot ? ' · JACKPOT' : ''}{admin.state.sung ? ' · CANTATA' : ''}</p>
        <h3 className="taboo-private__target">{card.target}</h3>
        <p className="small"><b>Taboo:</b> {card.taboo.join(' · ')}</p>
        <p className="small text-muted"><b>Alias approvati:</b> {card.aliases.length ? card.aliases.join(' · ') : 'nessuno'}</p>
        <p className="small text-muted">Non dire il bersaglio, le sue parole significative né i Taboo (ZEROTABOO §2).</p>
      </div>
      <button type="button" className="side-action side-action--blue" disabled={admin.state.skipsLeft <= 0} onClick={() => void send({ type: 'skip', exposure: card.exposure })}>
        ⏭ Skip ({admin.state.skipsLeft} rimasti)
      </button>
      <button type="button" className="side-action side-action--orange"
        onClick={() => { if (window.confirm('Segnalare una violazione Taboo? La carta è persa (−1 punto).')) void send({ type: 'taboo', exposure: card.exposure }) }}>
        🚫 Violazione Taboo
      </button>
      <button type="button" className="side-action side-action--blue" disabled={!admin.canSing} onClick={() => void send({ type: 'sing', exposure: card.exposure })}>
        🎤 Carta cantata (×2, ultimi 20 s)
      </button>
    </>
  )
}

function Reports({ admin, send }: { admin: TabooAdminState | null; send: Send }) {
  const [exposure, setExposure] = useState('')
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState('')
  if (!admin) return null
  return (
    <>
      <p className="small text-muted">Una violazione tardiva o contestata si segnala qui e si decide nell&apos;intervallo: se è avvenuta prima della risposta vincente, la vittoria si revoca e il punteggio si ricalcola.</p>
      <label className="small">Carta{' '}
        <select value={exposure} onChange={(e) => setExposure(e.target.value)}>
          <option value="">— scegli —</option>
          {admin.card && <option value={admin.card.exposure}>In gioco: {admin.card.target}</option>}
          {admin.recent.map((r) => <option key={r.exposure} value={r.exposure}>R{r.round} · {r.target} ({r.outcome}{r.winner ? `, ${r.winner}` : ''})</option>)}
        </select>
      </label>
      <input className="input" maxLength={300} placeholder="Motivo (obbligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="btn btn--small" disabled={!exposure || !reason.trim()}
        onClick={() => void send({ type: 'report', exposure: Number(exposure), reason }).then((r) => { if (r.ok) setReason('') })}>
        Segnala
      </button>
      {admin.reports.length > 0 && (
        <ul className="small">
          {admin.reports.map((r) => (
            <li key={r.id}>
              <b>#{r.id}</b> carta {r.exposure}: {r.reason}
              <div>
                <input className="input" maxLength={300} placeholder="Motivo della decisione" value={decision} onChange={(e) => setDecision(e.target.value)} />
                <button type="button" className="btn btn--small" disabled={!decision.trim()} onClick={() => void send({ type: 'decide', report: r.id, verifiable: true, reason: decision })}>
                  Verificabile: revoca
                </button>
                <button type="button" className="btn btn--small" disabled={!decision.trim()} onClick={() => void send({ type: 'decide', report: r.id, verifiable: false, reason: decision })}>
                  Non verificabile
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Info({ admin }: { admin: TabooAdminState | null }) {
  if (!admin) return null
  const { metrics } = admin
  return (
    <>
      <p className="small"><b>Ponte:</b> {admin.bridgeReady ? 'collegato' : 'non collegato'} · <b>Messaggi:</b> {metrics.received}</p>
      <p className="small text-muted">Ignorati: {Object.entries(metrics.ignored).map(([k, v]) => `${k} ${v}`).join(', ') || 'nessuno'}</p>
      <p className="small text-muted">Carte chiuse: risolte {metrics.closed.solved}, saltate {metrics.closed.skipped}, Taboo {metrics.closed.taboo}, scadute {metrics.closed.round_timeout}</p>
      {admin.warnings.length > 0 && (
        <>
          <p className="small"><b>Avvisi del mazzo</b> (mostrati, non corretti):</p>
          <ul className="small text-muted">{admin.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </>
      )}
    </>
  )
}

const CHATTER = ['😂😂', 'facile!', 'boh', 'ma dai', '🔥🔥', 'GG', 'forse?']

// Practice matches only: a viewer who answers (sometimes right) or chats. The server refuses the simulator in a real match.
function Simulator({ admin }: { admin: TabooAdminState | null }) {
  const live = useRef<TabooAdminState | null>(admin)
  live.current = admin
  const makeEvent = (): LiveEvent => {
    const user = simViewer()
    const card = live.current?.card
    const text = card && Math.random() < 0.3 ? card.target : pick(CHATTER)
    return { type: 'comment', user, text }
  }
  return <LiveSimulator makeEvent={makeEvent} />
}
