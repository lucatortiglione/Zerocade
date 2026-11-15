import { useEffect, useState } from 'react'
import {
  TOURNAMENT_RULES,
  type ContextTournamentAdmin,
  type TournamentCommand,
  type TournamentPhase,
  type TournamentReply,
  type TournamentRow,
  type TournamentSummary,
} from '@zerocade/shared'
import { socket } from '../socket'
import { clearTournamentError, useDashboard } from '../store'
import { timesOut } from '../format'

// ZeroContext's tournament, for its organiser (regolamento §13, specifica §10): start it, run its rounds, see the
// secret and the full Classifica Torneo ZeroContext, look back at past tournaments. The server checks every command;
// this panel only asks and shows the answer.

const PHASE: Record<TournamentPhase, string> = {
  ready: 'Pronto: avvia la prima manche',
  'window-open': 'Invio aperto',
  'window-processing': 'Elaborazione',
  intermission: 'Top 10 a schermo',
  suspended: 'Sospeso',
  completed: 'Concluso',
  cancelled: 'Annullato',
}

const send = (command: TournamentCommand) =>
  new Promise<TournamentReply>((resolve) => socket.emit('context:tournament', command, resolve))

export function ContextTournamentPanel() {
  const { tournament, tournamentAt, tournamentError, bridge, secretUses } = useDashboard()
  const [error, setError] = useState<string | null>(null)
  const shown = error ?? tournamentError
  const run = async (command: TournamentCommand) => {
    setError(null)
    clearTournamentError()
    const reply = await send(command)
    if (!reply.ok) setError(reply.error)
  }
  const open = tournament && tournament.state.phase !== 'completed' && tournament.state.phase !== 'cancelled'
  const bridgeReady = bridge?.state === 'connected' && Boolean(bridge.tiktok || bridge.twitch)
  return (
    <section className="tournament-panel">
      <h2 className="section-label">Torneo ZeroContext</h2>
      {shown && (
        <p className="tournament-panel__error" role="alert">
          {shown}{' '}
          <button type="button" className="btn btn--small btn--ghost" onClick={() => { setError(null); clearTournamentError() }}>OK</button>
        </p>
      )}
      {open ? <Running admin={tournament} at={tournamentAt} run={run} uses={secretUses} /> : (
        <>
          {tournament && <Ended admin={tournament} run={run} />}
          <Create bridgeReady={bridgeReady} run={run} />
        </>
      )}
      <History />
    </section>
  )
}

function Create({ bridgeReady, run }: { bridgeReady: boolean; run: (c: TournamentCommand) => Promise<void> }) {
  const [rounds, setRounds] = useState<number | null>(5)
  const [seconds, setSeconds] = useState(TOURNAMENT_RULES.intermissionMinMs / 1000)
  const start = () => {
    const what = rounds === null ? 'senza limite di manche (lo chiudi tu con «Concludi torneo»)' : `di ${rounds} manche`
    if (window.confirm(`Avviare un torneo ZeroContext ${what}? Le scelte restano fisse per tutto il torneo.`)) {
      void run({ type: 'create', totalRounds: rounds, intermissionSeconds: seconds })
    }
  }
  return (
    <div className="tournament-panel__create">
      <p className="text-muted small">
        Finestre globali da 6 s, una parola valida per persona e finestra, 70 finestre per manche. Si gioca dalla chat
        tramite ZeroFollowerBot: entra in classifica chi manda il primo tentativo valido. Regali e abbonamenti non danno
        vantaggi; «Chi può giocare» resta quello impostato ora.
      </p>
      <div className="tournament-panel__row">
        <span>Manche</span>
        {[...TOURNAMENT_RULES.rounds, null].map((n) => (
          <label key={n ?? 'endless'} className="tournament-panel__choice"
            title={n === null ? 'Nessun limite: il torneo va avanti finché non premi «Concludi torneo»' : undefined}>
            <input type="radio" name="tournament-rounds" checked={rounds === n} onChange={() => setRounds(n)} /> {n ?? 'Infinite'}
          </label>
        ))}
      </div>
      <label className="tournament-panel__row">
        <span>Top 10 a schermo almeno (s)</span>
        <input type="number" min={TOURNAMENT_RULES.intermissionMinMs / 1000} max={TOURNAMENT_RULES.intermissionMaxMs / 1000} value={seconds}
          onChange={(e) => setSeconds(Math.max(TOURNAMENT_RULES.intermissionMinMs / 1000, Number(e.target.value) || 0))} />
      </label>
      {!bridgeReady && <p className="text-muted small">Collega ZeroFollowerBot (sotto) per avviare il torneo.</p>}
      <button type="button" className="btn btn--primary" disabled={!bridgeReady} onClick={start}>🏆 Avvia torneo ZeroContext</button>
    </div>
  )
}

function Running({ admin, at, run, uses }: { admin: ContextTournamentAdmin; at: number; run: (c: TournamentCommand) => Promise<void>; uses: Record<string, number> }) {
  const s = admin.state
  const now = useClock(s.phase === 'window-open' || s.phase === 'window-processing' || s.phase === 'intermission')
  const elapsed = Math.max(0, now - at)
  const remaining = Math.max(0, s.remainingMs - elapsed)
  const intermission = Math.max(0, s.intermissionMs - elapsed)
  const version = s.version
  const reason = (question: string) => window.prompt(question)?.trim()
  const roundLive = s.phase === 'window-open' || s.phase === 'window-processing' || (s.phase === 'suspended' && s.window > 0 && !s.solution)
  return (
    <div className="tournament-panel__running">
      <p className="tournament-panel__mode">
        Modalità Torneo ZeroContext — Manche {Math.max(1, s.round)}{s.totalRounds === null ? ' · manche infinite' : ` di ${s.totalRounds}`}
      </p>
      {s.totalRounds === null && s.phase === 'intermission' && (
        <p className="text-muted small">Manche infinite: il torneo finisce quando premi «Concludi torneo».</p>
      )}
      <dl className="tournament-panel__facts">
        <dt>Stato</dt><dd>{PHASE[s.phase]}{s.phase === 'window-open' ? ` · ${Math.ceil(remaining / 1000)} s` : ''}</dd>
        {s.window > 0 && roundLive && <><dt>Finestra</dt><dd>{s.window}/{s.windowsPerRound} · {s.submissions} parole</dd></>}
        {admin.secret && <><dt>Parola segreta</dt><dd><span className="tournament-panel__secret">{admin.secret}</span> · uscita {timesOut(uses[admin.secret] ?? 1)}</dd></>}
        <dt>Giocatori</dt><dd>{s.players}</dd>
        {s.best !== null && roundLive && <><dt>Miglior posizione</dt><dd>{s.best.toLocaleString('it')}</dd></>}
        <dt>ZeroFollowerBot</dt><dd>{admin.bridgeReady ? 'collegato' : 'non collegato'}</dd>
      </dl>
      {s.suspendedReason && <p className="tournament-panel__error">{s.suspendedReason}</p>}
      {admin.overflow > 0 && <p className="tournament-panel__error">{admin.overflow} parole rifiutate: oltre {TOURNAMENT_RULES.maxPerWindow} per finestra.</p>}
      <div className="tournament-panel__actions">
        {(s.phase === 'ready' || s.phase === 'intermission') && (
          <button type="button" className="btn btn--primary" disabled={!admin.canStartRound}
            title={intermission > 0 ? 'La Top 10 resta a schermo ancora qualche secondo' : undefined}
            onClick={() => void run({ type: 'start-round', expectedVersion: version })}>
            ▶ Avvia manche {s.phase === 'ready' ? 1 : s.round + 1}{intermission > 0 ? ` (tra ${Math.ceil(intermission / 1000)} s)` : ''}
          </button>
        )}
        {(s.phase === 'window-open' || s.phase === 'window-processing') && (
          <button type="button" className="btn" onClick={() => void run({ type: 'pause', expectedVersion: version })}>⏸ Pausa</button>
        )}
        {s.phase === 'suspended' && <button type="button" className="btn btn--primary" onClick={() => void run({ type: 'resume', expectedVersion: version })}>▶ Riprendi</button>}
        {roundLive && (
          <button type="button" className="btn" onClick={() => {
            const why = reason('Chiudere la manche? Conta come non risolta: restano Pionieri e malus, niente jackpot. Motivo:')
            if (why) void run({ type: 'close-round', expectedVersion: version, reason: why })
          }}>⏹ Chiudi manche</button>
        )}
        {(roundLive || s.phase === 'intermission') && s.round > 0 && (
          <button type="button" className="btn" onClick={() => {
            const why = reason(roundLive ? 'Annullare la manche in corso? Non conta e si rigioca con un\'altra parola. Motivo:'
              : 'Annullare l\'ultima manche giocata? I suoi punti vengono tolti e si rigioca. Motivo:')
            if (why) void run({ type: 'void-round', expectedVersion: version, reason: why })
          }}>↩ Annulla manche</button>
        )}
        {(s.phase === 'intermission' || s.phase === 'ready') && (
          <button type="button" className="btn" onClick={() => {
            if (window.confirm('Concludere il torneo ora? La classifica attuale diventa quella finale.')) void run({ type: 'finish', expectedVersion: version })
          }}>🏁 Concludi torneo</button>
        )}
        {!roundLive && (s.phase === 'ready' || s.phase === 'intermission' || s.phase === 'suspended') && (
          <button type="button" className="btn" disabled={!admin.standings.length && s.round === 0}
            title="Le manche giocate finora non contano più: il torneo riparte dalla manche 1, con parole nuove" onClick={() => {
              const why = reason('Azzerare la classifica del torneo? Tutti i punti tornano a zero, le manche giocate finora non contano più '
                + 'e il torneo riparte dalla manche 1 con parole nuove. Motivo:')
              if (why) void run({ type: 'reset-standings', expectedVersion: version, reason: why })
            }}>⟲ Azzera classifica</button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => {
          const why = reason('Annullare tutto il torneo? Resta nello storico come annullato. Motivo:')
          if (why) void run({ type: 'cancel', expectedVersion: version, reason: why })
        }}>✖ Annulla torneo</button>
      </div>
      <Standings rows={admin.standings} />
    </div>
  )
}

function Ended({ admin, run }: { admin: ContextTournamentAdmin; run: (c: TournamentCommand) => Promise<void> }) {
  const s = admin.state
  return (
    <div className="tournament-panel__running">
      <p className="tournament-panel__mode">{s.phase === 'completed' ? 'Torneo concluso' : 'Torneo annullato'}: la Top 10 finale è a schermo.</p>
      <button type="button" className="btn btn--small" onClick={() => void run({ type: 'dismiss', expectedVersion: s.version })}>
        Torna alla partita classica
      </button>
      <Standings rows={admin.standings} />
    </div>
  )
}

function Standings({ rows }: { rows: TournamentRow[] }) {
  if (!rows.length) return <p className="text-muted small">Classifica vuota: si entra con il primo tentativo valido.</p>
  return (
    <table className="tournament-panel__table">
      <caption>Classifica Torneo ZeroContext</caption>
      <thead>
        <tr><th>#</th><th>Giocatore</th><th>Punti</th><th title="Manche risolte">Ris.</th><th title="Bonus Pioniere arancione e rosso">A/R</th><th title="Penalità blu">Blu</th><th title="Punti dell'ultima manche">Ult.</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.nickname}-${i}`}>
            <td>{r.place}{r.tied ? '=' : ''}</td><td>{r.nickname}</td><td>{r.points}</td><td>{r.solved}</td><td>{r.redOrange}</td>
            <td>{r.bluePenalty ? `-${r.bluePenalty}` : 0}</td><td>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function History() {
  const [list, setList] = useState<TournamentSummary[] | null>(null)
  const [rows, setRows] = useState<{ id: string; rows: TournamentRow[] } | null>(null)
  const load = () => socket.emit('context:tournament-history', (history) => setList(history))
  const status = { active: 'in corso', intermission: 'in corso', suspended: 'sospeso', completed: 'concluso', cancelled: 'annullato' }
  return (
    <details className="tournament-panel__history" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) load() }}>
      <summary>Storico dei tornei</summary>
      {!list ? <p className="text-muted small">…</p> : list.length === 0 ? <p className="text-muted small">Nessun torneo finora.</p> : (
        <ul>
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" className="btn btn--small btn--ghost" onClick={() =>
                socket.emit('context:tournament-standings', t.id, (r) => setRows(r ? { id: t.id, rows: r } : null))}>
                {new Date(t.createdAt).toLocaleString('it')} · {status[t.status]} · {t.totalRounds === null ? `${t.roundsPlayed} manche (infinite)` : `${t.roundsPlayed}/${t.totalRounds} manche`} · {t.players} giocatori
                {t.winners.length ? ` · 🏆 ${t.winners.join(', ')}` : ''}
              </button>
              {rows?.id === t.id && <Standings rows={rows.rows} />}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

// Re-renders every 250 ms while something counts down.
function useClock(ticking: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [ticking])
  return now
}
