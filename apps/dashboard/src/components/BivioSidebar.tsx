import { useEffect, useRef, useState } from 'react'
import {
  GAMES,
  GIFTS,
  defaultSettings,
  type BivioState,
  type BivioStats,
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
      <GameSwitch session={session} />

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

// --- Connessione ---

function Connection() {
  const { bivio } = useDashboard()
  // The simulator reads the round through a ref, so it is not restarted on every vote.
  const bivioRef = useRef(bivio)
  bivioRef.current = bivio

  return (
    <>
      <TiktokAccount />

      <LiveSimulator makeEvent={() => fakeEvent(bivioRef.current)} />

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
      <MessageComposer />
    </>
  )
}

const CHATTER = ['😂😂', 'GG', 'difficile!', 'ma dai', '🔥🔥']

// Each round leans one way (between 20/80 and 80/20), so simulated results are not all 50/50.
const leanFor = (roundId: string) => 0.2 + ([...roundId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997) * 0.6

function fakeEvent(bivio: BivioState | null): LiveEvent {
  const user = simViewer()
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
      {/* A wrong question (typo, bad translation, nonsense) is saved to a file and not dealt again. */}
      {q && bivio.phase !== 'empty' && (
        <div className="side-flag">
          {q.flagged ? (
            <>
              <span className="source-status source-status--error">Segnata come sbagliata: non tornerà</span>
              <button type="button" className="btn btn--small" onClick={() => socket.emit('bivio:control', 'unflag')}>
                Annulla
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--small" onClick={() => socket.emit('bivio:control', 'flag')}>
              ⚠ Domanda sbagliata
            </button>
          )}
        </div>
      )}
      {bivio.flagged > 0 && (
        <a className="btn btn--small side__export" href="/api/bivio/flagged.csv" download>
          ⬇ Domande sbagliate ({bivio.flagged})
        </a>
      )}
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
