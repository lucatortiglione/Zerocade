import { useEffect, useState } from 'react'
import { TABOO_CATEGORIES, TABOO_DIFFICULTY_LABEL } from '@zerocade/shared'
import { useTabooSend } from '../components/useTabooSend'
import { useDashboard } from '../store'

// The streamer's view: the card in play at full screen, for a second monitor or a phone next to the camera. The target is here and
// in the dashboard only: the public overlay shows the five Taboo words, never the word to be guessed (until the card is closed).

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TabooCardPage() {
  const { taboo, tabooAdmin, session } = useDashboard()
  const { send, message } = useTabooSend()
  // The time left, counted down here from the value the server sent and when it arrived (a suspended round stays frozen).
  const [seen, setSeen] = useState({ ms: 0, at: performance.now() })
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => { setSeen({ ms: taboo?.remainingMs ?? 0, at: performance.now() }) }, [taboo?.version, taboo?.remainingMs])
  const running = taboo?.phase === 'round'
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  if (session && session.gameId !== 'zerotaboo') return <main className="taboo-director"><p>Seleziona ZeroTaboo nella pagina dei giochi per vedere la carta.</p></main>
  if (!taboo || !tabooAdmin) return <main className="taboo-director"><p>In attesa di ZeroTaboo…</p></main>
  const card = tabooAdmin.card
  const left = running ? Math.max(0, seen.ms - (now - seen.at)) : taboo.remainingMs
  const category = TABOO_CATEGORIES.find((c) => c.code === card?.category)

  return (
    <main className="taboo-director">
      <header className="taboo-director__bar">
        <span>Round {taboo.round}/{taboo.rounds}</span>
        <span className="taboo-director__time" data-low={running && left < 15_000}>{clock(left)}</span>
        <span>Squadra {taboo.team}/{taboo.threshold}</span>
        <span>Skip {taboo.skipsLeft}</span>
      </header>

      {card && taboo.phase !== 'suspended' ? (
        <>
          <p className="taboo-director__meta">
            {category?.name} · {TABOO_DIFFICULTY_LABEL[card.difficulty]}
            {taboo.jackpot ? ' · JACKPOT ×2' : ''}{taboo.sung ? ' · CANTATA ×2' : ''}
          </p>
          <h1 className="taboo-director__target" aria-label="La parola da far indovinare">{card.target}</h1>
          <section className="taboo-director__taboo" aria-label="Parole che non puoi dire">
            <h2>Non dire</h2>
            <ul>{card.taboo.map((w) => <li key={w}>{w}</li>)}</ul>
          </section>
          <p className="taboo-director__rule">Non dire nemmeno le parole del bersaglio. {card.aliases.length ? `Alias accettati: ${card.aliases.join(' · ')}.` : ''}</p>
          <div className="taboo-director__buttons">
            <button type="button" className="side-action side-action--blue" disabled={taboo.skipsLeft <= 0} onClick={() => void send({ type: 'skip', exposure: card.exposure })}>⏭ Skip</button>
            <button type="button" className="side-action side-action--orange" onClick={() => { if (window.confirm('Violazione Taboo? La carta è persa (−1 punto).')) void send({ type: 'taboo', exposure: card.exposure }) }}>🚫 Violazione Taboo</button>
          </div>
        </>
      ) : (
        <div className="taboo-director__idle">
          <h1>
            {taboo.phase === 'setup' ? 'Nessuna partita' : taboo.phase === 'intermission' ? `Intervallo · prossimo round ${taboo.round}` : taboo.phase === 'suspended' ? 'Pausa tecnica: il tempo è fermo' : taboo.phase === 'finished' ? 'Partita finita' : 'Nessuna carta in gioco'}
          </h1>
          {taboo.notice && <p>{taboo.notice}</p>}
          {taboo.phase === 'intermission' && (
            <button type="button" className="side-action side-action--blue" disabled={!tabooAdmin.canStartRound} onClick={() => void send({ type: 'start-round' })}>▶ Avvia round {taboo.round}</button>
          )}
          {taboo.phase === 'suspended' && <button type="button" className="side-action side-action--blue" onClick={() => void send({ type: 'resume' })}>▶ Riprendi</button>}
        </div>
      )}
      {message && <p className="side-error" role="alert">{message}</p>}
    </main>
  )
}
