import { useRef, useState } from 'react'
import {
  GAMES,
  GIFTS,
  defaultSettings,
  type IncastroCommand,
  type IncastroOutcome,
  type IncastroSolution,
  type IncastroState,
  type IncastroVariant,
  type IncastroWord,
  type LiveEvent,
  type SessionState,
} from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'
import {
  ConnectionBadge,
  GameSwitch,
  LiveSimulator,
  BridgeControl,
  MessageComposer,
  StreamSettings,
  TiktokAccount,
  pick,
  simViewer,
} from './Regia'
import { EndSession } from './GameControls'
import { Section } from './Section'
import { SettingField, SettingsForm } from './SettingsForm'
import { TriggerEditor } from './TriggerEditor'

// The Incastro (ZeroWords) control column: connection and simulator, stream widgets, the
// words of the level in progress, its controls, the live's leaderboard, triggers and game
// settings.

// The automatic letter and the automatic difficulty sit by the level's controls instead of
// among the game settings.
const AT_HAND = ['autoHints', 'hintSeconds', 'dda']

export function IncastroSidebar({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)

  const reset = () => {
    if (game && window.confirm('Ripristinare le impostazioni predefinite di ZeroWords?')) {
      socket.emit('settings:set', defaultSettings(game.settings))
    }
  }

  return (
    <aside className="panel left-panel side">
      <GameSwitch session={session} />

      <Section title="Connessione" extra={<ConnectionBadge />}>
        <Connection session={session} />
      </Section>

      <Section title="Impostazioni stream">
        <StreamSettings session={session} />
      </Section>

      <div className="side__game">
        <span>🌱 ZeroWords · ruota e schema</span>
        <button type="button" className="side__link" onClick={reset}>
          Ripristina
        </button>
      </div>

      <Section title="Parole del round" extra={<FoundCount />}>
        <RoundWords />
      </Section>

      <Section title="Info partita">
        <GameInfo session={session} />
      </Section>

      <Section title="Classifica della live">
        <Scores />
      </Section>

      <Section title="Trigger">
        <TriggerEditor session={session} titled={false} />
      </Section>

      <Section title="Impostazioni gioco">
        <SettingsForm session={session} omit={AT_HAND} />
      </Section>
    </aside>
  )
}

const control = (command: IncastroCommand) => socket.emit('incastro:control', command)

// --- Connessione ---

function Connection({ session }: { session: SessionState }) {
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
      <BridgeControl label="Collegati a ZeroFollowerBot (Twitch e TikTok)" />
      <SettingField session={session} id="audience" />
      <SettingField session={session} id="voiceFollowersOnly" />

      <LiveSimulator makeEvent={() => fakeEvent(live.current.incastro, live.current.incastroSolution)} />

      <button
        type="button"
        className="side-action side-action--blue"
        disabled={!incastro || incastro.phase === 'empty' || incastro.phase === 'loading'}
        onClick={() => control(incastro?.paused ? 'resume' : 'pause')}
      >
        {incastro?.paused ? '▶ Riprendi gioco' : '⏸ Metti in pausa'}
      </button>
      <button type="button" className="side-action side-action--orange" onClick={restart}>
        ↻ Ricomincia dal livello 1
      </button>
      <MessageComposer />
      <EndSession ended={Boolean(session.ended)} />
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
  intro: 'Sfondo, poi la griglia',
  playing: 'In gioco',
  complete: 'Riepilogo',
  loading: 'Preparazione livello…',
  empty: 'Nessun livello',
}

const VARIANT: Record<IncastroVariant, string> = {
  easy: 'Agevolata',
  standard: 'Standard',
  expert: 'Esperto',
}

// How the chat did on the last level, as the automatic difficulty reads it.
const OUTCOME: Record<IncastroOutcome, string> = {
  easier: 'In difficoltà',
  harder: 'Troppo facile',
  steady: 'Nella media',
  idle: 'Nessuno ha giocato',
}

function GameInfo({ session }: { session: SessionState }) {
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
        <strong>{incastro.level}</strong>
      </div>
      <div className="info-row">
        <span>Griglia</span>
        <strong>
          {VARIANT[incastro.variant]}
          {incastro.difficulty && ` · difficoltà ${Math.round(incastro.difficulty.dsim)}`}
        </strong>
      </div>
      {incastro.phase === 'playing' && incastro.nextVariant !== incastro.variant && (
        <p className="text-muted small">Questa ruota non ha la griglia {VARIANT[incastro.nextVariant]}: si gioca la Standard.</p>
      )}
      {session.settings.dda !== false && incastro.ddaOutcome && (
        <div className="info-row">
          <span>Andamento chat</span>
          <strong>
            {OUTCOME[incastro.ddaOutcome]}
            {(incastro.ddaOutcome === 'easier' || incastro.ddaOutcome === 'harder') &&
              incastro.ddaStreak > 0 &&
              ` · ${Math.min(incastro.ddaStreak, incastro.ddaNeeded)}/${incastro.ddaNeeded}`}
          </strong>
        </div>
      )}
      {incastro.phase === 'complete' && incastro.nextVariant !== incastro.variant && (
        <div className="info-row">
          <span>Prossimo livello</span>
          <strong>{VARIANT[incastro.nextVariant]}</strong>
        </div>
      )}
      <div className="info-row">
        <span>Parole · extra</span>
        <strong>
          {found}/{incastro.words.length} · {incastro.extrasFound}/{incastro.extrasTotal}
        </strong>
      </div>
      {incastro.phase === 'complete' && (
        <>
          <button type="button" className="side-action side-action--blue" onClick={() => control('next')}>
            ▶ Prossimo livello
          </button>
          {session.settings.autoNext === false && (
            <p className="text-muted small">“Avanza da solo” è spento: il riepilogo resta finché non premi qui.</p>
          )}
        </>
      )}
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
      <div className="form">
        <SettingField session={session} id="autoHints" />
        {session.settings.autoHints !== false && <SettingField session={session} id="hintSeconds" />}
        <SettingField session={session} id="dda" />
      </div>
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
          placeholder="Vai al livello…"
          aria-label="Vai al livello"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button type="submit" className="btn btn--small" disabled={!target}>
          Vai
        </button>
      </form>
      <p className="text-muted small">Dati delle partite, per tarare la difficoltà:</p>
      <div className="side-controls">
        <a className="btn btn--small" href="/api/zerowords/plays.csv" download>
          ⬇ Partite
        </a>
        <a className="btn btn--small" href="/api/zerowords/answers.csv" download>
          ⬇ Risposte
        </a>
      </div>
    </>
  )
}

// --- Parole del round ---

// The solution of the level on screen (null while the next one is on its way).
function useRound() {
  const { incastro, incastroSolution } = useDashboard()
  return incastro && incastroSolution && incastroSolution.level === incastro.level ? { incastro, solution: incastroSolution } : null
}

function FoundCount() {
  const round = useRound()
  if (!round) return null
  const found = round.incastro.words.filter((w) => w.text).length
  return (
    <span className="text-muted">
      {found}/{round.incastro.words.length}
    </span>
  )
}

// A word as the chat sees it on the board: its letters already there (found in a crossing
// word, or given by a hint), a dot for each one still hidden.
function shownOf(state: IncastroState, w: IncastroWord): string {
  let out = ''
  for (let k = 0; k < w.length; k++) {
    const ch = w.d === 'H' ? state.grid[w.r]?.[w.c + k] : state.grid[w.r + k]?.[w.c]
    out += !ch || ch === '_' || ch === '.' ? '·' : ch.toUpperCase()
  }
  return out
}

// The level's words, for the streamer to help the chat with: first the ones still to find,
// shortest first, each with what the board already shows; then the ones found. Only the
// dashboard gets them: the overlay never receives the solution.
function RoundWords() {
  const round = useRound()
  if (!round) return <p className="text-muted small">In attesa del livello…</p>
  const { incastro, solution } = round
  const rows = solution.words.map((word, i) => ({ word, w: incastro.words[i] }))
  const open = rows
    .filter((r) => r.w && !r.w.text)
    .sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word))
  const done = rows.filter((r) => !r.w || r.w.text)
  const secret = incastro.secret
  return (
    <>
      {open.length > 0 && (
        <ul className="round-words">
          {open.map(({ word, w }) => (
            <li key={word} className="round-word">
              <span className="round-word__word">{word}</span>
              <span className="round-word__shown" title="Quello che il pubblico vede sullo schema">
                {shownOf(incastro, w)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {solution.secret && (
        <div className={`round-word round-word--secret${secret?.word ? ' round-word--done' : ''}`}>
          <span className="round-word__word">🔒 {solution.secret}</span>
          <span className="round-word__who">{secret?.by ? secret.by.nickname : secret?.word ? 'nessuno' : 'parola segreta'}</span>
        </div>
      )}
      {done.length > 0 && (
        <ul className="round-words">
          {done.map(({ word, w }) => (
            <li key={word} className={`round-word round-word--done${w?.missed ? ' round-word--missed' : ''}`}>
              <span className="round-word__word">{word}</span>
              <span className="round-word__who">{w?.missed ? 'mancata' : w?.by ? w.by.nickname : 'con gli aiuti'}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="inc-extras">
        <summary className="text-muted small">{solution.extras.length} parole extra valide</summary>
        <p className="small">{solution.extras.filter((x) => x !== solution.secret).join(' · ') || '—'}</p>
      </details>
      <p className="text-muted small">Solo qui: l’overlay non riceve mai la soluzione.</p>
    </>
  )
}

// --- Classifica della live ---

function Scores() {
  const { incastro } = useDashboard()
  const scores = incastro?.scores ?? []
  const longest = incastro?.longest
  return (
    <>
      {longest && (
        <div className="info-row">
          <span>Parola più lunga</span>
          <strong>
            {longest.word} · {longest.by.nickname}
          </strong>
        </div>
      )}
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
