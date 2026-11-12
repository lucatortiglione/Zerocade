import { useEffect, useRef, useSyncExternalStore } from 'react'
import { GAMES, describeSource, triggersFor } from '@zerocade/shared'
import { Engine } from './games/engine'
import { createGame } from './games/registry'
import { useOverlay } from './store'
import { Widgets } from './Widgets'
import { Bivio } from './Bivio'
import { Incastro } from './Incastro'
import { Quizzland } from './Quizzland'
import { isContentReady, loadContent, subscribeContent } from './content'
import { ScoreTicker } from './ScoreTicker'


export function App() {
  const { connected, session, event, seq, message, messageSeq, gif, gifSeq, incastro, quizzland } = useOverlay()
  const contentReady = useSyncExternalStore(subscribeContent, isContentReady)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)

  // Boot the engine once.
  useEffect(() => {
    void loadContent()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    const engine = new Engine(ctx)
    engineRef.current = engine
    engine.start()
    return () => {
      window.removeEventListener('resize', resize)
      engine.stop()
    }
  }, [])

  // Swap the game when the selection changes (only once content is loaded).
  // Games without a canvas instance (Bivio, Incastro, Quizzland) leave the canvas blank.
  // A restart (`run`) starts the game afresh; an ended session shows nothing until it is started again.
  useEffect(() => {
    if (!session || !contentReady) return
    if (session.ended) {
      engineRef.current?.clear()
      return
    }
    const game = GAMES.find((g) => g.id === session.gameId)
    const instance = game ? createGame(game.id) : null
    if (game && instance) engineRef.current?.setGame(instance, session.settings)
    else engineRef.current?.clear()
  }, [session?.gameId, session?.run, session?.ended, contentReady])

  useEffect(() => {
    engineRef.current?.setPaused(Boolean(session?.paused))
  }, [session?.paused, session?.run, contentReady])

  // Tune settings live.
  useEffect(() => {
    engineRef.current?.setSettings(session?.settings ?? {})
  }, [session?.settings])

  // Dispatch matching triggers on each incoming event. Nothing a viewer does (messages, likes, gifts, follows,
  // joins) shows over the game by itself: the Alerts widget does that, when the creator turns it on.
  useEffect(() => {
    if (!event || !session || session.paused || session.ended) return
    const game = GAMES.find((g) => g.id === session.gameId)
    if (game) {
      for (const t of triggersFor(session.triggers, event)) engineRef.current?.pushAction(t.action, event)
    }
  }, [seq])

  const game = session ? GAMES.find((g) => g.id === session.gameId) : undefined

  const scores = session?.gameId === 'incastro' ? incastro?.scores
    : session?.gameId === 'quizzland' ? quizzland?.scores : undefined

  return (
    <div className="overlay">
      <canvas ref={canvasRef} className="overlay__canvas" />
      {session?.gameId === 'zerodubbi' && <Bivio />}
      {session?.gameId === 'incastro' && <Incastro />}
      {session?.gameId === 'quizzland' && <Quizzland />}
      <header className="overlay__top">
        <span className="overlay__brand">{game?.emoji ?? '🎮'}</span>
        <span className="overlay__title">{game?.name ?? 'Zerocade'}</span>
        <span className={`dot${connected ? ' dot--on' : ''}`} />
      </header>

      {session?.settings.showLeaderboard !== false && scores && <ScoreTicker scores={scores} />}
      <Widgets />
      {session?.paused && !session.ended && <div className="overlay-state">⏸ In pausa</div>}
      {session?.ended && <div className="overlay-state">Sessione terminata</div>}

      {gif && <img key={gifSeq} className="overlay-gif" src={gif.url} alt={gif.label} />}

      {message && (
        <div key={messageSeq} className="overlay-message" role="status">
          {message}
        </div>
      )}

      {session && game && (
        <footer className="overlay__guide">
          {session.triggers.map((t, i) => {
            const s = describeSource(t.source)
            const a = game.actions.find((x) => x.id === t.action)
            return (
              <div key={i} className="guide-chip">
                <span>{s.icon}</span>
                <span className="guide-chip__label">{s.label}</span>
                <span className="guide-chip__arrow">→</span>
                <span>{a?.label ?? t.action}</span>
              </div>
            )
          })}
        </footer>
      )}
    </div>
  )
}

