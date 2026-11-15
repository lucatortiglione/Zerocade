import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useState } from 'react'
import { bandInfo, type ContextTournamentState, type TournamentGuessView, type TournamentRow } from '@zerocade/shared'
import { useOverlay } from './store'
import './contextTournament.css'

// ZeroContext's tournament, drawn from the server's state alone (the overlay decides nothing: specifica §10). The
// countdown comes from the server's remaining time, counted down locally between two states. The secret is never
// here before the round is over: only its length.

const UI = {
  mode: 'Modalità Torneo ZeroContext',
  round: (x: number, y: number | null) => (y === null ? `Manche ${x}` : `Manche ${x} di ${y}`),
  window: (x: number, y: number) => `Finestra ${x}/${y}`,
  open: 'INVIO APERTO',
  processing: 'ELABORAZIONE',
  next: 'NUOVA FINESTRA',
  oneWord: 'Una parola per finestra: vale la prima valida',
  submissions: (n: number) => (n === 1 ? '1 parola ricevuta' : `${n} parole ricevute`),
  ready: 'Il torneo sta per iniziare',
  readyHint: 'Scrivi una parola in chat quando si apre la finestra: entri in classifica con il primo tentativo valido.',
  top10: 'Classifica Torneo ZeroContext — Top 10',
  final: 'Torneo concluso',
  cancelled: 'Torneo annullato',
  suspended: 'Torneo in pausa',
  waitNext: 'La prossima manche parte quando l\'organizzatore la avvia',
  solved: (word: string, who: string) => `La parola era ${word.toUpperCase()}: l'ha trovata ${who}`,
  unsolved: (word: string) => `Nessuno ha trovato ${word.toUpperCase()}`,
  tieAtTen: 'Pari merito al 10° posto: la classifica completa li mostra tutti',
  nobody: 'Ancora nessun giocatore in classifica',
  players: (n: number) => (n === 1 ? '1 giocatore' : `${n} giocatori`),
  board: 'Le parole più vicine',
  last: 'Ultima finestra',
  buoy: 'Parola guida',
  empty: 'Nessuna parola ancora',
}

export function ContextTournament() {
  const { contextTournament: t, contextTournamentAt } = useOverlay()
  const remaining = useCountdown(t, contextTournamentAt)
  useEffect(() => {
    document.body.classList.add('tournament-on')
    return () => document.body.classList.remove('tournament-on')
  }, [])
  if (!t) return null
  const showTop = t.phase === 'intermission' || t.phase === 'completed' || t.phase === 'cancelled'
  return (
    <div className="tournament">
      <header className="tournament__head">
        <span className="tournament__mode">{UI.mode}</span>
        {t.round > 0 && <span className="tournament__round">{UI.round(t.round, t.totalRounds)}</span>}
      </header>
      {showTop ? <Standings t={t} /> : <Round t={t} remaining={remaining} />}
    </div>
  )
}

function Round({ t, remaining }: { t: ContextTournamentState; remaining: number }) {
  if (t.phase === 'ready') {
    return (
      <section className="tournament__center">
        <h1 className="tournament__big">{UI.ready}</h1>
        <p className="tournament__hint">{UI.readyHint}</p>
        <p className="tournament__hint">{UI.players(t.players)}</p>
      </section>
    )
  }
  const seconds = Math.max(1, Math.ceil(remaining / 1000))
  return (
    <>
      {t.phase === 'suspended' ? (
        <section className="tournament__banner tournament__banner--paused">
          <strong>{UI.suspended}</strong>
          {t.suspendedReason && <span>{t.suspendedReason}</span>}
        </section>
      ) : t.phase === 'window-open' ? (
        <section className="tournament__banner tournament__banner--open">
          <span className="tournament__phase">{UI.open}</span>
          <span className="tournament__count" key={seconds}>{seconds}</span>
          <span className="tournament__meta">{UI.window(t.window, t.windowsPerRound)} · {UI.submissions(t.submissions)}</span>
          <span className="tournament__meta">{UI.oneWord}</span>
        </section>
      ) : (
        <section className="tournament__banner tournament__banner--processing">
          <span className="tournament__phase">{remaining > 400 ? UI.processing : UI.next}</span>
          <span className="tournament__meta">{UI.window(t.window, t.windowsPerRound)}</span>
        </section>
      )}
      {t.buoy && (
        <div className="tournament__buoy">
          <span className="tournament__label">{UI.buoy}</span>
          <Guess g={t.buoy} />
        </div>
      )}
      {t.lastWindow.length > 0 && (
        <section className="tournament__last">
          <span className="tournament__label">{UI.last}</span>
          <div className="tournament__chips">
            {t.lastWindow.slice(0, 8).map((g) => <Guess key={`${g.window}-${g.word}`} g={g} compact />)}
          </div>
        </section>
      )}
      <section className="tournament__board">
        <span className="tournament__label">{UI.board}</span>
        {t.board.length === 0 ? <p className="tournament__hint">{UI.empty}</p> : t.board.slice(0, 12).map((g) => <Guess key={g.word} g={g} />)}
      </section>
    </>
  )
}

function Guess({ g, compact }: { g: TournamentGuessView; compact?: boolean }) {
  const band = bandInfo(g.band)
  return (
    <div className={`tournament__guess${compact ? ' tournament__guess--compact' : ''}`} style={{ background: band.background, color: band.text }}>
      <span className="tournament__word">{g.word}</span>
      <span className="tournament__pos">{g.position.toLocaleString('it')}</span>
      {!compact && <span className="tournament__author">{g.author ?? UI.buoy}{g.pioneer > 0 ? ` · +${g.pioneer}` : ''}</span>}
    </div>
  )
}

function Standings({ t }: { t: ContextTournamentState }) {
  const title = t.phase === 'completed' ? UI.final : t.phase === 'cancelled' ? UI.cancelled : null
  return (
    <section className="tournament__standings">
      {title && <h1 className="tournament__big">{title}</h1>}
      {t.solution && <p className="tournament__result">{t.solvedBy ? UI.solved(t.solution, t.solvedBy) : UI.unsolved(t.solution)}</p>}
      {t.achievements.length > 0 && <p className="tournament__achievements">{t.achievements.join(' · ')}</p>}
      <h2 className="tournament__title">{UI.top10}</h2>
      {t.top10.length === 0 ? <p className="tournament__hint">{UI.nobody}</p> : (
        <ol className="tournament__rows">
          {t.top10.map((r, i) => <Row key={`${r.place}-${r.nickname}-${i}`} r={r} />)}
        </ol>
      )}
      {t.tieAtTen && <p className="tournament__hint">{UI.tieAtTen}</p>}
      {t.phase === 'intermission' && <p className="tournament__hint">{UI.waitNext}</p>}
    </section>
  )
}

function Row({ r }: { r: TournamentRow }) {
  const delta = r.delta === 0 ? '±0' : r.delta > 0 ? `+${r.delta}` : String(r.delta)
  return (
    <li className={`tournament__row${r.place <= 3 ? ` tournament__row--p${r.place}` : ''}`}>
      <span className="tournament__place">{r.place}{r.tied ? '=' : ''}</span>
      <span className="tournament__name">{r.nickname}</span>
      <span className="tournament__points">{r.points}</span>
      <span className={`tournament__delta${r.delta < 0 ? ' tournament__delta--down' : ''}`}>{delta}</span>
    </li>
  )
}

// The milliseconds left, from the server's remainingMs and when that state arrived.
function useCountdown(t: ContextTournamentState | null, at: number): number {
  const [now, setNow] = useState(() => performance.now())
  const ticking = t?.phase === 'window-open' || t?.phase === 'window-processing'
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [ticking])
  return t ? Math.max(0, t.remainingMs - (now - at)) : 0
}
