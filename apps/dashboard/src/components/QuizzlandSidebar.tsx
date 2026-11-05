import { useEffect, useRef, useState } from 'react'
import {
  GAMES,
  GIFTS,
  QUIZZLAND_LETTERS,
  defaultSettings,
  quizzlandCategoryById,
  type LiveEvent,
  type QuizzlandCommand,
  type QuizzlandSolution,
  type QuizzlandState,
  type QuizzlandStats,
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

// The Quizzland (ZeroQuizz) control column: connection and simulator, stream widgets, the question in
// play (with its right answer, which only the dashboard gets ahead of the reveal), the live's
// leaderboard, collected answers, triggers and game settings.

const control = (command: QuizzlandCommand) => socket.emit('quizzland:control', command)

export function QuizzlandSidebar({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)

  const reset = () => {
    if (game && window.confirm('Ripristinare le impostazioni predefinite di ZeroQuizz?')) {
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
        <span>🧠 ZeroQuizz · quiz d’intelligenza</span>
        <button type="button" className="side__link" onClick={reset}>
          Ripristina
        </button>
      </div>

      <Section title="Domanda in corso" extra={<Counter />}>
        <Round session={session} />
      </Section>

      <Section title="Classifica della live">
        <Scores />
      </Section>

      <Section title="Risposte raccolte" open={false}>
        <CollectedAnswers />
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

// --- Connessione ---

function Connection() {
  const { quizzland, quizzlandSolution } = useDashboard()
  // Read when the simulator fires, so it is not restarted on every answer.
  const live = useRef({ quizzland, quizzlandSolution })
  live.current = { quizzland, quizzlandSolution }

  const restart = () => {
    if (window.confirm('Ricominciare il quiz? La classifica della live si azzera.')) control('restart')
  }

  return (
    <>
      <TiktokAccount />

      <LiveSimulator makeEvent={() => fakeEvent(live.current.quizzland, live.current.quizzlandSolution)} />

      <button
        type="button"
        className="side-action side-action--blue"
        disabled={!quizzland?.question}
        onClick={() => control(quizzland?.paused ? 'resume' : 'pause')}
      >
        {quizzland?.paused ? '▶ Riprendi gioco' : '⏸ Metti in pausa'}
      </button>
      <button type="button" className="side-action side-action--orange" onClick={restart}>
        ↻ Ricomincia il quiz
      </button>
      <MessageComposer />
    </>
  )
}

const CHATTER = ['😂😂', 'facile!', 'boh', 'ma dai', '🔥🔥', 'GG', 'questa la so']

// Viewers who answer (a little better than chance, as letters or numbers), chat, like and
// now and then send a gift.
function fakeEvent(state: QuizzlandState | null, solution: QuizzlandSolution | null): LiveEvent {
  const user = simViewer()
  const roll = Math.random()
  const n = state?.question?.options.length ?? 4
  if (roll < 0.72) {
    const right = solution && solution.roundId === state?.roundId ? solution.correct : -1
    const answer = right >= 0 && Math.random() < 0.55 ? right : Math.floor(Math.random() * n)
    const text = Math.random() < 0.75 ? QUIZZLAND_LETTERS[answer] : String(answer + 1)
    return { type: 'comment', user, text: Math.random() < 0.5 ? text.toLowerCase() : text }
  }
  if (roll < 0.8) return { type: 'comment', user, text: pick(CHATTER) }
  if (roll < 0.92) return { type: 'like', user, count: 1 + Math.floor(Math.random() * 10) }
  if (roll < 0.97) return { type: 'gift', user, giftId: GIFTS[Math.floor(Math.random() ** 3 * GIFTS.length)].id, count: 1 }
  return { type: 'follow', user }
}

// --- Domanda in corso ---

const PHASE: Record<QuizzlandState['phase'], string> = {
  question: 'Risposte aperte',
  reveal: 'Risposta giusta',
  break: 'Classifica',
  empty: 'Nessuna domanda',
}

const DIFFICULTY = ['', 'facile', 'media', 'difficile']

function Counter() {
  const { quizzland } = useDashboard()
  if (!quizzland?.question) return null
  return (
    <span className="text-muted">
      {quizzland.number} · {quizzland.available} {quizzland.available === 1 ? 'domanda' : 'domande'}
    </span>
  )
}

function Round({ session }: { session: SessionState }) {
  const { quizzland, quizzlandSolution } = useDashboard()
  if (!quizzland) return <p className="text-muted small">In attesa del server…</p>
  const q = quizzland.question
  const asking = quizzland.phase === 'question'
  const reveal = quizzland.phase === 'reveal'
  // The right answer: from the reveal on everyone has it; before, only this dashboard.
  const correct =
    quizzland.correct ?? (quizzlandSolution && quizzlandSolution.roundId === quizzland.roundId ? quizzlandSolution.correct : null)
  const total = quizzland.counts?.reduce((a, b) => a + b, 0) ?? 0

  return (
    <>
      <div className="info-row">
        <span>Fase</span>
        <strong>{quizzland.paused ? 'In pausa' : PHASE[quizzland.phase]}</strong>
      </div>
      {q && quizzland.phase !== 'empty' && (
        <>
          <div className="info-row info-row--stack">
            <span>
              {quizzlandCategoryById(q.category)?.label ?? q.category} · {DIFFICULTY[q.difficulty]}
            </span>
            <span className="qz-question">{q.text}</span>
          </div>
          <ul className="round-words">
            {q.options.map((text, i) => (
              <li
                key={i}
                className={`round-word qz-option${i === correct ? ' qz-option--right' : ''}${
                  quizzland.eliminated.includes(i) ? ' qz-option--out' : ''
                }`}
              >
                <span className="round-word__word">
                  <span className="qz-option__letter">{QUIZZLAND_LETTERS[i]}</span> {text}
                </span>
                <span className="round-word__who">
                  {quizzland.counts ? `${quizzland.counts[i]}${total ? ` · ${Math.round((quizzland.counts[i] / total) * 100)}%` : ''}` : ''}
                  {i === correct && ' ✓'}
                </span>
              </li>
            ))}
          </ul>
          {asking && <p className="text-muted small">Solo qui: l’overlay mostra la risposta giusta allo scadere del tempo.</p>}
          <div className="info-row">
            <span>Risposte</span>
            <strong>
              {quizzland.answered}
              {(reveal || quizzland.phase === 'break') && ` · ${quizzland.right} giuste`}
            </strong>
          </div>
        </>
      )}
      {reveal && session.settings.autoNext === false && (
        <p className="text-muted small">“Avanza da solo” è spento: la risposta resta finché non premi Avanti.</p>
      )}
      <div className="side-controls">
        <button type="button" className="btn btn--small" onClick={() => control('next')}>
          {asking ? '⏭ Salta' : '⏭ Avanti'}
        </button>
        <button type="button" className="btn btn--small" disabled={!asking} onClick={() => control('reveal')}>
          👁 Rivela
        </button>
        <button type="button" className="btn btn--small" disabled={!asking} onClick={() => control('extra-time')}>
          +10 s
        </button>
        <button
          type="button"
          className="btn btn--small"
          disabled={!asking || quizzland.eliminated.length > 0 || (q?.options.length ?? 0) < 3}
          onClick={() => control('fifty')}
        >
          ✂ 50:50
        </button>
      </div>
      {/* A wrong question (typo, wrong answer, ambiguous) is not dealt again until unmarked. */}
      {q && quizzland.phase !== 'empty' && (
        <div className="side-flag">
          {q.flagged ? (
            <>
              <span className="source-status source-status--error">Segnata come sbagliata: non tornerà</span>
              <button type="button" className="btn btn--small" onClick={() => control('unflag')}>
                Annulla
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--small" onClick={() => control('flag')}>
              ⚠ Domanda sbagliata
            </button>
          )}
        </div>
      )}
      {quizzland.flagged > 0 && (
        <p className="text-muted small">
          {quizzland.flagged === 1 ? '1 domanda segnata' : `${quizzland.flagged} domande segnate`} come sbagliata: le trovi nel
          CSV di “Risposte raccolte”, colonna segnalata_il.
        </p>
      )}
    </>
  )
}

// --- Classifica della live ---

function Scores() {
  const { quizzland } = useDashboard()
  const scores = quizzland?.scores ?? []
  return (
    <>
      {scores.length === 0 ? (
        <p className="text-muted small">Nessun punto ancora: la classifica cambia a ogni risposta rivelata.</p>
      ) : (
        <ol className="answers">
          {scores.map((s, i) => (
            <li key={s.id}>
              <span className="answers__text">
                {i + 1}. {s.nickname}
                {s.streak >= 2 && <span className="text-muted"> · 🔥 {s.streak}</span>}
              </span>
              <span className="answers__num">
                {s.points.toLocaleString('it')} punti · {s.correct} {s.correct === 1 ? 'giusta' : 'giuste'}
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

// --- Risposte raccolte ---

const share = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

function CollectedAnswers() {
  const { quizzland } = useDashboard()
  const [stats, setStats] = useState<QuizzlandStats | null>(null)
  const [lastReveal, setLastReveal] = useState('')

  useEffect(() => {
    if (quizzland?.phase === 'reveal') setLastReveal(quizzland.roundId)
  }, [quizzland?.phase, quizzland?.roundId])

  // Loaded once, then again after every reveal.
  useEffect(() => {
    let cancelled = false
    fetch('/api/quizzland/stats')
      .then((res) => (res.ok ? (res.json() as Promise<QuizzlandStats>) : null))
      .then((next) => !cancelled && setStats(next))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [lastReveal])

  if (!stats) return <p className="text-muted small">Statistiche non disponibili.</p>
  const played = stats.questions.filter((q) => q.answers > 0)
  // The questions the chat gets wrong most: the hardest, or the badly worded.
  const hardest = [...played].sort((x, y) => x.correct / x.answers - y.correct / y.answers || y.answers - x.answers).slice(0, 5)

  return (
    <>
      <p className="small">
        <strong>{stats.totalAnswers.toLocaleString('it')}</strong> risposte su {played.length} di {stats.questions.length} domande
      </p>
      {hardest.length > 0 && (
        <>
          <p className="text-muted small">Le più sbagliate</p>
          <ol className="answers">
            {hardest.map((q) => {
              const right = share(q.correct, q.answers)
              return (
                <li key={q.id} title={`${q.text} → ${q.answer}`}>
                  <span className="answers__text">{q.text}</span>
                  <span className="answers__split qz-split" style={{ ['--a' as string]: `${right}%` }} />
                  <span className="answers__num">
                    {right}% giuste · {q.answers}
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}
      <a className="btn btn--small side__export" href="/api/quizzland/export.csv" download>
        ⬇ Esporta CSV
      </a>
    </>
  )
}
