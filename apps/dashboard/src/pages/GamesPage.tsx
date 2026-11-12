import { GAMES, type SessionState } from '@zerocade/shared'
import { BivioSidebar } from '../components/BivioSidebar'
import { IncastroSidebar } from '../components/IncastroSidebar'
import { LiveColumn } from '../components/LiveColumn'
import { GameControls } from '../components/GameControls'
import { BridgeControl } from '../components/Regia'
import { QuizzlandSidebar } from '../components/QuizzlandSidebar'
import { SettingsPanel } from '../components/SettingsPanel'
import { Simulator } from '../components/Simulator'
import { TopGifters } from '../components/TopGifters'
import { TriggerEditor } from '../components/TriggerEditor'
import { WidgetsPanel } from '../components/WidgetsPanel'
import { overlayUrl, previewUrl, publicLeaderboardUrl } from '../overlayKey'
import { socket } from '../socket'
import { useDashboard } from '../store'

export function GamesPage() {
  const { session, gameSecret } = useDashboard()

  // Bivio, Incastro and Quizzland have their own control column (game switcher included) next
  // to the preview. Every game gets the same right column: pads, creators and latest gifts.
  if (session?.gameId === 'zerodubbi' || session?.gameId === 'incastro' || session?.gameId === 'quizzland') {
    return (
      <div className="games games--bivio">
        {session.gameId === 'zerodubbi' ? (
          <BivioSidebar session={session} />
        ) : session.gameId === 'incastro' ? (
          <IncastroSidebar session={session} />
        ) : (
          <QuizzlandSidebar session={session} />
        )}
        <Preview session={session} />
        <LiveColumn />
      </div>
    )
  }

  return (
    <div className="games">
      <aside className="panel left-panel">
        <section>
          <h2 className="section-label">Games</h2>
          <GamePicker session={session} />
        </section>
        {(session?.gameId === 'context' || session?.gameId === 'zerowordle' || session?.gameId === 'zeroreazioniacatena') && (
          <section>
            <h2 className="section-label">Soluzione</h2>
            <div className="context-solution">{gameSecret ? gameSecret.replaceAll('-', ' → ') : '…'}</div>
            <p className="text-muted small">La parola segreta del round in corso: la chat non la vede.</p>
          </section>
        )}
        {session && <GameControls session={session} />}
        <section>
          <h2 className="section-label">Chat Twitch e TikTok</h2>
          <p className="text-muted small">
            Il gioco riceve la chat da ZeroFollowerBot, che dice anche chi è follower o nel fan club. Attiva in
            ZeroFollowerBot &ldquo;Manda chat ed eventi a Zerocade&rdquo; e imposta qui la stessa porta.
          </p>
          <BridgeControl label="Collegati a ZeroFollowerBot (Twitch e TikTok)" />
        </section>
        {session && <LeaderboardLinks gameId={session.gameId} />}
        <Simulator />
        {session && <TriggerEditor session={session} />}
        {session && <SettingsPanel session={session} />}
        {session?.gameId === 'word-association' && <WordAssociationData />}
        {session && <WidgetsPanel session={session} />}
        <TopGifters />
      </aside>

      <Preview session={session} />

      <LiveColumn />
    </div>
  )
}

const BRAIN_CATEGORIES = new Set(['Quiz', 'Parole'])
const BRAIN_GAMES = new Set(['memory-maestro', 'zerodubbi'])

// The leaderboard page the server publishes for the game: Sessione, Giorno, Settimana, Mese and All Time. Open it,
// or use the link as a browser source (add ?sfondo=trasparente) in the stream.
function LeaderboardLinks({ gameId }: { gameId: string }) {
  const base = new URL(`/classifica/${gameId}`, overlayUrl).href
  return (
    <section>
      <h2 className="section-label">Classifica</h2>
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
    </section>
  )
}

// The games in a drop-down, in alphabetical order; the chosen game's description sits below it.
function GamePicker({ session }: { session: SessionState | null }) {
  const current = GAMES.find((g) => g.id === session?.gameId)
  // Only the quiz and brain games: the arcade, fighting and party ones stay out of the list (a session
  // already on one of them still shows it).
  const listed = GAMES.filter((g) => BRAIN_CATEGORIES.has(g.category) || BRAIN_GAMES.has(g.id) || g.id === current?.id)
  // One list in alphabetical order (by name, ignoring case), not grouped by category.
  const sorted = [...listed].sort((x, y) => x.name.localeCompare(y.name, 'it', { sensitivity: 'base' }))
  return (
    <div className="game-picker">
      <select
        aria-label="Gioco"
        value={current?.id ?? ''}
        onChange={(e) => socket.emit('game:select', e.target.value)}
      >
        {!current && <option value="">Scegli un gioco…</option>}
        {sorted.map((game) => (
          <option key={game.id} value={game.id}>
            {game.emoji} {game.name}
          </option>
        ))}
      </select>
      {current && <p className="text-muted small">{current.description}</p>}
    </div>
  )
}

// Word Association's telemetry, for gioco-zeroassociations/analyze_telemetry.py: which hidden
// words the chat finds, how fast, and what it writes instead.
function WordAssociationData() {
  return (
    <section>
      <h2 className="section-label">Dati di gioco</h2>
      <p className="text-muted small">
        Round giocati e tentativi della chat: servono a misurare la difficoltà delle parole e a trovare le associazioni che la
        chat si aspetta.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn--small" href="/api/word-association/rounds.csv" download>
          Round (CSV)
        </a>
        <a className="btn btn--small" href="/api/word-association/guesses.csv" download>
          Tentativi (CSV)
        </a>
      </div>
    </section>
  )
}

function Preview({ session }: { session: SessionState | null }) {
  return (
    <main className="preview">
      <div className="preview__head">
        <div className="preview__title">
          <span className="preview__dot" aria-hidden="true" />
          Live preview
          {session && <span className="preview__game">{GAMES.find((g) => g.id === session.gameId)?.name}</span>}
        </div>
        <a className="btn btn--ghost btn--small" href={overlayUrl} target="_blank" rel="noreferrer">
          Open ↗
        </a>
      </div>
      <div className="preview__frame">
        <iframe title="Overlay preview" src={previewUrl} />
      </div>
      <p className="text-muted small">This is exactly what your viewers see on stream.</p>
    </main>
  )
}
