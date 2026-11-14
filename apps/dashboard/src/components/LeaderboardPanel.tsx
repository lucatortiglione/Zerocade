import { GAMES } from '@zerocade/shared'
import { useCallback, useEffect, useState } from 'react'
import { overlayUrl, publicLeaderboardUrl } from '../overlayKey'
import { socket } from '../socket'

// What the server says about a game's leaderboards (/api/leaderboard/:game): the periods, the first of each, and
// when each one was last reset from here.
interface BoardsInfo {
  periods: { id: string; label: string }[]
  boards: Record<string, { name: string; points: number }[]>
  resets?: Record<string, number>
}

const when = (at: number) => new Date(at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// A game's leaderboard page (Sessione, Giorno, Settimana, Mese and All Time): open it, use it as a browser source,
// share it; and reset one leaderboard at a time. A reset deletes no points: from then on that period counts only
// the new ones, and the other periods stay as they were.
export function LeaderboardPanel({ gameId }: { gameId: string }) {
  const base = new URL(`/classifica/${gameId}`, overlayUrl).href
  const [info, setInfo] = useState<BoardsInfo | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard/${encodeURIComponent(gameId)}?limit=1`, { cache: 'no-store' })
      if (res.ok) setInfo((await res.json()) as BoardsInfo)
    } catch {
      // The server is restarting: the next round fills it in.
    }
  }, [gameId])

  useEffect(() => {
    setInfo(null)
    void load()
    const timer = window.setInterval(() => void load(), 10_000)
    return () => window.clearInterval(timer)
  }, [load])

  const reset = (period: { id: string; label: string }) => {
    const game = GAMES.find((g) => g.id === gameId)?.name ?? gameId
    const question = `Azzerare la classifica «${period.label}» di ${game}?\n\nDa adesso conta solo i punti nuovi; le altre classifiche restano com'erano.`
    if (!window.confirm(question)) return
    socket.emit('leaderboard:reset', { game: gameId, period: period.id }, () => void load())
  }

  return (
    <>
      <p className="text-muted small">
        Sessione, Giorno, Settimana, Mese e All Time di questo gioco, in una pagina web del server: aprila o usala come sorgente browser
        (aggiungi <code>?sfondo=trasparente</code>).
      </p>
      <a className="btn btn--small" href={base} target="_blank" rel="noreferrer">
        Apri classifica ↗
      </a>{' '}
      <button type="button" className="btn btn--small" onClick={() => void navigator.clipboard?.writeText(`${base}?sfondo=trasparente`)}>
        Copia link per OBS
      </button>
      {publicLeaderboardUrl && (
        <>
          <p className="text-muted small">
            Link per gli spettatori (porta propria, sola lettura): raggiungibile da chi è in rete con questo PC; da internet serve
            aprire la porta sul router o un tunnel.
          </p>
          <button type="button" className="btn btn--small" onClick={() => void navigator.clipboard?.writeText(`${publicLeaderboardUrl}${gameId}`)}>
            Copia link pubblico
          </button>{' '}
          <a className="btn btn--small" href={`${publicLeaderboardUrl}${gameId}`} target="_blank" rel="noreferrer">
            Apri ↗
          </a>
        </>
      )}
      {info && (
        <>
          <p className="text-muted small">Azzera una classifica alla volta: i punti restano salvati e le altre non cambiano.</p>
          <div className="leaderboard-resets">
            {info.periods.map((period) => {
              const first = info.boards[period.id]?.[0]
              const resetAt = info.resets?.[period.id]
              return (
                <div className="leaderboard-reset" key={period.id}>
                  <span className="leaderboard-reset__period">{period.label}</span>
                  <span className="leaderboard-reset__info text-muted" title={resetAt ? `Azzerata il ${when(resetAt)}` : undefined}>
                    {first ? `1° ${first.name} · ${first.points}` : 'vuota'}
                    {resetAt ? ` · azzerata ${when(resetAt)}` : ''}
                  </span>
                  <button type="button" className="btn btn--small" onClick={() => reset(period)}>
                    ↺ Azzera
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
