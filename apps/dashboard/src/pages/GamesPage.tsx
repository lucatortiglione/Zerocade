import { GAMES } from '@zerocade/shared'
import { SettingsPanel } from '../components/SettingsPanel'
import { Simulator } from '../components/Simulator'
import { TopGifters } from '../components/TopGifters'
import { TriggerEditor } from '../components/TriggerEditor'
import { WidgetsPanel } from '../components/WidgetsPanel'
import { overlayUrl } from '../overlayKey'
import { socket } from '../socket'
import { useDashboard } from '../store'

export function GamesPage() {
  const { session } = useDashboard()

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
        {session && <TriggerEditor session={session} />}
        {session && <SettingsPanel session={session} />}
        {session && <WidgetsPanel session={session} />}
      </aside>

      <main className="preview">
        <div className="preview__frame">
          <iframe title="Overlay preview" src={overlayUrl} />
        </div>
        <p className="text-muted small">Live preview: this is what your viewers see.</p>
      </main>

      <aside className="panel right-panel">
        <Simulator />
        <TopGifters />
      </aside>
    </div>
  )
}
