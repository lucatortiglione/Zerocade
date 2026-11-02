import { useRef, useState } from 'react'
import {
  GAMES,
  GIFTS,
  defaultSettings,
  type IncastroCommand,
  type IncastroSolution,
  type IncastroState,
  type LiveEvent,
  type SessionState,
} from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'
import {
  ConnectionBadge,
  GameSwitch,
  LiveSimulator,
  MessageComposer,
  StreamSettings,
  TiktokAccount,
  pick,
  simViewer,
} from './Regia'
import { Section } from './Section'
import { SettingsForm } from './SettingsForm'
import { TriggerEditor } from './TriggerEditor'

// The Incastro control column: connection and simulator, stream widgets, the level in
// progress with its solution, the live's leaderboard, triggers and game settings.

export function IncastroSidebar({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)

  const reset = () => {
    if (game && window.confirm('Ripristinare le impostazioni predefinite di Incastro?')) {
      socket.emit('settings:set', defaultSettings(game.settings))
    }
  }

  return (
    <aside className="panel left-panel side">
      <GameSwitch session={session} />

      <Section title="Connessione" extra={<ConnectionBadge />}>
        <Connection />
      </Section>

      <Section title="Impostazioni stream">
        <StreamSettings session={session} />
      </Section>

      <div className="side__game">
        <span>🌱 Incastro · ruota e schema</span>
        <button type="button" className="side__link" onClick={reset}>
          Ripristina
        </button>
      </div>

      <Section title="Info partita">
        <GameInfo />
      </Section>

      <Section title="Soluzione" open={false}>
        <Solution />
      </Section>

      <Section title="Classifica della live">
        <Scores />
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

const control = (command: IncastroCommand) => socket.emit('incastro:control', command)

// --- Connessione ---

function Connection() {
  const { incastro, incastroSolution } = useDashboard()
  // Read when the simulator fires, so it is not restarted on every word.
  const live = useRef({ incastro, incastroSolution })
  live.current = { incastro, incastroSolution }

  const restart = () => {
    if (window.confirm('Ricominciare dal livello 1? La classifica della live si azzera.')) control('restart')
  }

  return (
    <>
      <TiktokAccount />

      <LiveSimulator makeEvent={() => fakeEvent(live.current.incastro, live.current.incastroSolution)} />

      <button
        type="button"
        className="side-action side-action--blue"
        disabled={!incastro || incastro.phase === 'empty'}
        onClick={() => control(incastro?.paused ? 'resume' : 'pause')}
      >
        {incastro?.paused ? '▶ Riprendi gioco' : '⏸ Metti in pausa'}
      </button>
      <button type="button" className="side-action side-action--orange" onClick={restart}>
        ↻ Ricomincia dal livello 1
      </button>
      <MessageComposer />
    </>
  )
}

const CHATTER = ['ciao!', '😂😂', 'difficile!', 'ma dai', '🔥🔥', 'GG', 'bella questa']

// Viewers who find words now and then, try extras, repeat what is on the board and type
// a few wrong guesses, among likes, shares and gifts.
function fakeEvent(state: IncastroState | null, solution: IncastroSolution | null): LiveEvent {
  const user = simViewer()
  const roll = Math.random()
  const words = solution?.words ?? []
  const open = words.filter((_, i) => !state?.words[i]?.text)
  const shown = words.filter((_, i) => state?.words[i]?.text)
  const casual = (w: string) => (Math.random() < 0.6 ? w.toLowerCase() : w)
  if (roll < 0.2 && open.length) return { type: 'comment', user, text: casual(pick(open)) }
  if (roll < 0.34 && solution?.extras.length) return { type: 'comment', user, text: casual(pick(solution.extras)) }
  if (roll < 0.42 && shown.length) return { type: 'comment', user, text: casual(pick(shown)) }
  if (roll < 0.62 && state?.letters) {
    const scrambled = [...state.letters].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3))
    return { type: 'comment', user, text: scrambled.join('').toLowerCase() }
  }
  if (roll < 0.75) return { type: 'comment', user, text: pick(CHATTER) }
  if (roll < 0.88) return { type: 'like', user, count: 1 + Math.floor(Math.random() * 10) }
  if (roll < 0.93) return { type: 'share', user }
  if (roll < 0.98) return { type: 'gift', user, giftId: GIFTS[Math.floor(Math.random() ** 3 * GIFTS.length)].id, count: 1 }
  return { type: 'follow', user }
}

// --- Info partita ---

const PHASE: Record<IncastroState['phase'], string> = {
  playing: 'In gioco',
  complete: 'Riepilogo',
  empty: 'Nessun livello',
}

function GameInfo() {
  const { incastro } = useDashboard()
  const [target, setTarget] = useState('')
  if (!incastro) return <p className="text-muted small">In attesa del server…</p>
  const playing = incastro.phase === 'playing'
  const found = incastro.words.filter((w) => w.text && !w.missed).length

  const go = () => {
    const level = Number(target)
    if (Number.isInteger(level) && level >= 1) socket.emit('incastro:goto', level)
    setTarget('')
  }

  return (
    <>
      <div className="info-row">
        <span>Fase</span>
        <strong>{incastro.paused ? 'In pausa' : PHASE[incastro.phase]}</strong>
      </div>
      <div className="info-row">
        <span>
          Capitolo {incastro.chapter.id} · {incastro.chapter.name}
        </span>
        <strong>
          {incastro.chapter.levelInChapter}/{incastro.chapter.size}
        </strong>
      </div>
      <div className="info-row">
        <span>Livello</span>
        <strong>
          {incastro.level} di {incastro.levelCount}
        </strong>
      </div>
      <div className="info-row">
        <span>Parole · extra</span>
        <strong>
          {found}/{incastro.words.length} · {incastro.extrasFound}/{incastro.extrasTotal}
        </strong>
      </div>
      <div className="side-controls">
        <button type="button" className="btn btn--small" onClick={() => control('prev')}>
          ⏮ Indietro
        </button>
        <button type="button" className="btn btn--small" onClick={() => control('replay')}>
          ↺ Rigioca
        </button>
        <button type="button" className="btn btn--small" onClick={() => control('next')}>
          ⏭ Salta
        </button>
        <button type="button" className="btn btn--small" disabled={!playing} onClick={() => control('hint')}>
          💡 Lettera
        </button>
        <button type="button" className="btn btn--small" disabled={!playing} onClick={() => control('reveal-word')}>
          🔤 Parola
        </button>
        <button type="button" className="btn btn--small" disabled={!playing} onClick={() => control('shuffle')}>
          🔀 Mescola
        </button>
      </div>
      {playing && incastro.durationMs > 0 && (
        <button type="button" className="btn btn--small" onClick={() => control('extra-time')}>
          +30 s
        </button>
      )}
      <form
        className="side-message"
        onSubmit={(e) => {
          e.preventDefault()
          go()
        }}
      >
        <input
          type="number"
          min={1}
          max={incastro.levelCount || undefined}
          placeholder="Vai al livello…"
          aria-label="Vai al livello"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button type="submit" className="btn btn--small" disabled={!target}>
          Vai
        </button>
      </form>
    </>
  )
}

// --- Soluzione ---

function Solution() {
  const { incastro, incastroSolution } = useDashboard()
  if (!incastro || !incastroSolution || incastroSolution.level !== incastro.level) {
    return <p className="text-muted small">In attesa del livello…</p>
  }
  return (
    <>
      <ol className="answers">
        {incastroSolution.words.map((word, i) => {
          const w = incastro.words[i]
          const status = !w?.text ? 'da trovare' : w.missed ? 'mancata' : w.by ? w.by.nickname : 'con gli aiuti'
          return (
            <li key={word}>
              <span className={`answers__text${w?.text ? '' : ' inc-open'}`}>{word}</span>
              <span className="answers__num">{status}</span>
            </li>
          )
        })}
      </ol>
      <details className="inc-extras">
        <summary className="text-muted small">{incastroSolution.extras.length} parole extra valide</summary>
        <p className="small">{incastroSolution.extras.join(' · ') || '—'}</p>
      </details>
      <p className="text-muted small">Qui soltanto: l’overlay non riceve mai la soluzione.</p>
    </>
  )
}

// --- Classifica della live ---

function Scores() {
  const { incastro } = useDashboard()
  const scores = incastro?.scores ?? []
  return (
    <>
      {scores.length === 0 ? (
        <p className="text-muted small">Nessun punto ancora.</p>
      ) : (
        <ol className="answers">
          {scores.map((s, i) => (
            <li key={s.id}>
              <span className="answers__text">
                {i + 1}. {s.nickname}
              </span>
              <span className="answers__num">
                {s.points} {s.points === 1 ? 'punto' : 'punti'} · {s.words} {s.words === 1 ? 'parola' : 'parole'}
              </span>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn btn--small side__export"
        disabled={!scores.length}
        onClick={() => window.confirm('Azzerare la classifica della live?') && control('clear-scores')}
      >
        🧹 Azzera classifica
      </button>
    </>
  )
}
