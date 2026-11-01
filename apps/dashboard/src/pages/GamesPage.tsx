import { GAMES, type SessionState } from '@zerocade/shared'
import { BivioSidebar } from '../components/BivioSidebar'
import { LiveColumn } from '../components/LiveColumn'
import { SettingsPanel } from '../components/SettingsPanel'
import { Simulator } from '../components/Simulator'
import { TopGifters } from '../components/TopGifters'
import { TriggerEditor } from '../components/TriggerEditor'
import { WidgetsPanel } from '../components/WidgetsPanel'
import { overlayUrl, previewUrl } from '../overlayKey'
import { socket } from '../socket'
import { useDashboard } from '../store'

export function GamesPage() {
  const { session } = useDashboard()

  // Bivio has its own control column (game switcher included) next to the preview.
  // Every game gets the same right column: pads, creators and latest gifts.
  if (session?.gameId === 'bivio') {
    return (
      <div className="games games--bivio">
        <BivioSidebar session={session} />
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
          <div className="game-list">
            {GAMES.map((game) => (
              <button
                key={game.id}
                className={`game-card${session?.gameId === game.id ? ' game-card--active' : ''}`}
                aria-pressed={session?.gameId === game.id}
                onClick={() => socket.emit('game:select', game.id)}
              >
                <span
                  className="game-card__thumb"
                  style={{ background: `linear-gradient(135deg, ${game.gradient[0]}, ${game.gradient[1]})` }}
                  aria-hidden="true"
                >
                  {game.emoji}
                </span>
                <span className="game-card__body">
                  <span className="game-card__name">{game.name}</span>
                  <span className="game-card__desc">{game.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <Simulator />
        {session && <TriggerEditor session={session} />}
        {session && <SettingsPanel session={session} />}
        {session && <WidgetsPanel session={session} />}
        <TopGifters />
      </aside>

      <Preview session={session} />

      <LiveColumn />
    </div>
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
