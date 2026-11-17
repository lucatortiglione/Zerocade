import { useRef, useState } from 'react'
import { GAMES, WORDHUNT_RULES, defaultSettings, type LiveEvent, type SessionState, type WordHuntAdminState, type WordHuntMode } from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'
import { BridgeControl, ConnectionBadge, GameSwitch, LiveSimulator, MessageComposer, StreamSettings, pick, simViewer } from './Regia'
import { EndSession } from './GameControls'
import { Section } from './Section'
import { SettingField, SettingsForm } from './SettingsForm'
import { useWordHuntSend, type WordHuntSend as Send } from './useWordHuntSend'
import { TriggerEditor } from './TriggerEditor'

// The ZeroWordHunt control column: the round (the reference board or a generated one, start, finish), the words only the director
// sees (with their cells and who found them), the correction of a word found by mistake, and the game's settings. The chat decides
// who found a word: there is no button that names a winner. Every command carries the version the director saw (DIRETTIVE §13).

export function WordHuntSidebar({ session }: { session: SessionState }) {
  const { wordhuntAdmin } = useDashboard()
  const game = GAMES.find((g) => g.id === session.gameId)
  const { send, message } = useWordHuntSend()
  const reset = () => {
    if (game && window.confirm('Ripristinare le impostazioni predefinite di ZeroWordHunt?')) socket.emit('settings:set', defaultSettings(game.settings))
  }

  return (
    <aside className="panel left-panel side">
      <GameSwitch session={session} />

      <Section title="Connessione" extra={<ConnectionBadge />}>
        <p className="text-muted small">
          ZeroWordHunt legge i commenti della chat: il primo messaggio valido che arriva al server conquista la parola. Collega TikTok/Twitch
          oppure il ponte di ZeroFollowerBot.
        </p>
        <BridgeControl label="Ricevi risposte TikTok e Twitch da ZeroFollowerBot" />
        <SettingField session={session} id="audience" />
        <SettingField session={session} id="voiceFollowersOnly" />
        <Simulator admin={wordhuntAdmin} />
        <MessageComposer />
        <EndSession ended={Boolean(session.ended)} />
      </Section>

      <Section title="Impostazioni stream">
        <StreamSettings session={session} />
      </Section>

      <div className="side__game">
        <span>🔎 ZeroWordHunt · cerca-parole per la diretta</span>
        <button type="button" className="side__link" onClick={reset}>Ripristina</button>
      </div>

      {message && <p className="side-error" role="alert">{message}</p>}

      <Section title="Round">
        <Round admin={wordhuntAdmin} send={send} />
      </Section>

      <Section title="Parole nascoste">
        <Words admin={wordhuntAdmin} send={send} />
      </Section>

      <Section title="Metriche" open={false}>
        <Info admin={wordhuntAdmin} />
      </Section>

      <Section title="Trigger" open={false}>
        <TriggerEditor session={session} titled={false} />
      </Section>

      <Section title="Impostazioni gioco">
        <SettingsForm session={session} />
        <p className="text-muted small">Durata e conto alla rovescia valgono dal round successivo.</p>
      </Section>
    </aside>
  )
}

function Round({ admin, send }: { admin: WordHuntAdminState | null; send: Send }) {
  const [mode, setMode] = useState<WordHuntMode>('fixture')
  const [seed, setSeed] = useState('')
  const state = admin?.state
  if (!admin || !state) return <p className="text-muted small">In attesa dello stato…</p>
  const open = state.phase === 'countdown' || state.phase === 'active'
  return (
    <>
      <p className="small">
        {state.phase === 'idle' && 'Nessun round.'}
        {state.phase === 'ready' && `Round pronto · ${state.total} parole`}
        {state.phase === 'countdown' && `Conto alla rovescia · trovate ${state.found}/${state.total}`}
        {state.phase === 'active' && `${state.paused ? 'Round in pausa' : 'Round in corso'} · trovate ${state.found}/${state.total}`}
        {state.phase === 'finished' && `Round finito · trovate ${state.found}/${state.total}`}
      </p>
      {state.notice && <p className="text-muted small">{state.notice}</p>}
      {!open && (
        <>
          <label className="small">
            Griglia{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value as WordHuntMode)}>
              <option value="fixture">Di riferimento (le 8 parole dello screenshot)</option>
              <option value="generated" disabled={!admin.dictionaryReady}>Generata{admin.dictionaryReady ? '' : ' (dizionario non disponibile)'}</option>
            </select>
          </label>
          {mode === 'generated' && (
            <input className="input" maxLength={WORDHUNT_RULES.maxSeedChars} placeholder="Seme (facoltativo, per ripetere la griglia)" value={seed} onChange={(e) => setSeed(e.target.value)} />
          )}
          <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'create-round', mode, ...(mode === 'generated' && seed.trim() ? { seed: seed.trim() } : {}) })}>
            ＋ Crea round
          </button>
        </>
      )}
      {state.phase === 'ready' && <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'start' })}>▶ Avvia round</button>}
      {open && (
        <button type="button" className="side-action side-action--orange" onClick={() => { if (window.confirm('Terminare il round adesso?')) void send({ type: 'finish' }) }}>
          ■ Termina round
        </button>
      )}
      {(state.phase === 'ready' || state.phase === 'finished') && <button type="button" className="btn btn--small" onClick={() => void send({ type: 'reset' })}>Chiudi</button>}
    </>
  )
}

function Words({ admin, send }: { admin: WordHuntAdminState | null; send: Send }) {
  const [reason, setReason] = useState('')
  if (!admin || admin.targets.length === 0) return <p className="text-muted small">Nessuna parola: crea un round.</p>
  const active = admin.state.phase === 'active'
  return (
    <>
      <p className="small text-muted">Le soluzioni sono visibili solo qui: la chat e l&apos;overlay non le ricevono.</p>
      <ul className="small">
        {admin.targets.map((t) => (
          <li key={t.target}>
            <b>{t.word}</b> <span className="text-muted">{t.cells[0]}→{t.cells[t.cells.length - 1]} · avatar {t.avatarCell}</span>
            {t.found ? <> ✓ {t.winner}</> : null}
            {t.found && active && (
              <button type="button" className="btn btn--small" disabled={!reason.trim()} title="Riapre la parola; serve il motivo" onClick={() => void send({ type: 'revoke', target: t.target, reason }).then((r) => { if (r.ok) setReason('') })}>
                Riapri
              </button>
            )}
          </li>
        ))}
      </ul>
      {active && <input className="input" maxLength={WORDHUNT_RULES.maxReasonChars} placeholder="Motivo della correzione (per riaprire una parola)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      {admin.decoys.length > 0 && (
        <p className="small text-muted"><b>Esche</b> (parole vere nella griglia che non valgono): {admin.decoys.map((d) => d.word).join(' · ')}</p>
      )}
    </>
  )
}

function Info({ admin }: { admin: WordHuntAdminState | null }) {
  if (!admin) return null
  const { metrics } = admin
  return (
    <>
      <p className="small"><b>Messaggi:</b> {metrics.received} · <b>Tentativi su una parola:</b> {metrics.guesses}</p>
      <p className="small text-muted">Ignorati: {Object.entries(metrics.ignored).map(([k, v]) => `${k} ${v}`).join(', ') || 'nessuno'}</p>
      {admin.seed && <p className="small text-muted">Seme: {admin.seed} · controllo {admin.checksum?.slice(0, 12)}</p>}
    </>
  )
}

// Viewers of the simulator who write a word of the grid now and then, or chat.
const CHATTER = ['😂😂', 'wow', 'boh', 'ma dai', '🔥🔥', 'GG', 'forse?']
function Simulator({ admin }: { admin: WordHuntAdminState | null }) {
  const live = useRef<WordHuntAdminState | null>(admin)
  live.current = admin
  const makeEvent = (): LiveEvent => {
    const open = live.current?.targets.filter((t) => !t.found) ?? []
    const text = open.length && Math.random() < 0.3 ? pick(open).word.toLowerCase() : pick(CHATTER)
    return { type: 'comment', user: simViewer(), text }
  }
  return <LiveSimulator makeEvent={makeEvent} />
}
