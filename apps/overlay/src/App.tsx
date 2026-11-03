import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GAMES, describeSource, triggersFor, type LiveEvent, type Viewer } from '@zerocade/shared'
import { Engine } from './games/engine'
import { createGame } from './games/registry'
import { useOverlay } from './store'
import { Widgets } from './Widgets'
import { Bivio } from './Bivio'
import { Incastro } from './Incastro'
import { isContentReady, loadContent, subscribeContent } from './content'
import { ViewerAvatar } from './ViewerAvatar'

interface Toast {
  id: number
  icon: string
  user: Viewer
  text: string
}

export function App() {
  const { connected, session, event, seq, message, messageSeq, gif, gifSeq } = useOverlay()
  const contentReady = useSyncExternalStore(subscribeContent, isContentReady)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

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
  // Games without a canvas instance (Bivio) leave the canvas blank.
  useEffect(() => {
    if (!session || !contentReady) return
    const game = GAMES.find((g) => g.id === session.gameId)
    const instance = game ? createGame(game.id) : null
    if (game && instance) engineRef.current?.setGame(instance, session.settings)
    else engineRef.current?.clear()
  }, [session?.gameId, contentReady])

  // Tune settings live.
  useEffect(() => {
    engineRef.current?.setSettings(session?.settings ?? {})
  }, [session?.settings])

  // Dispatch matching triggers + toast on each incoming event.
  useEffect(() => {
    if (!event || !session) return
    const game = GAMES.find((g) => g.id === session.gameId)
    if (game) {
      for (const t of triggersFor(session.triggers, event)) engineRef.current?.pushAction(t.action, event)
    }
    // Bivio has no room for toasts over its title: votes show as bubbles, and gifts,
    // likes and follows can still use the Avvisi widget. In Incastro every comment is a
    // guess: the words found have their own feed.
    if (session.gameId === 'bivio' || session.gameId === 'incastro') return
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev.slice(-4), { id, user: event.user, ...describeEvent(event) }])
    // Not cleared when the next event arrives: every toast removes itself.
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [seq])

  const game = session ? GAMES.find((g) => g.id === session.gameId) : undefined

  return (
    <div className="overlay">
      <canvas ref={canvasRef} className="overlay__canvas" />
      {session?.gameId === 'bivio' && <Bivio />}
      {session?.gameId === 'incastro' && <Incastro />}
      <header className="overlay__top">
        <span className="overlay__brand">{game?.emoji ?? '🎮'}</span>
        <span className="overlay__title">{game?.name ?? 'Zerocade'}</span>
        <span className={`dot${connected ? ' dot--on' : ''}`} />
      </header>

      <Widgets />

      {gif && <img key={gifSeq} className="overlay-gif" src={gif.url} alt={gif.label} />}

      {message && (
        <div key={messageSeq} className="overlay-message" role="status">
          {message}
        </div>
      )}

      <div className="overlay__toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.icon}</span>
            <ViewerAvatar viewer={t.user} />
            <span className="toast__text">{t.text}</span>
          </div>
        ))}
      </div>

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

// The toast's icon, and its text after the viewer's picture.
function describeEvent(event: LiveEvent): { icon: string; text: string } {
  switch (event.type) {
    case 'gift':
      return { icon: '🎁', text: `${event.user.nickname} ×${event.count}` }
    case 'like':
      return { icon: '👍', text: `${event.user.nickname} ×${event.count}` }
    case 'follow':
      return { icon: '➕', text: `${event.user.nickname} followed` }
    case 'share':
      return { icon: '🔁', text: `${event.user.nickname} shared` }
    case 'comment':
      return { icon: '💬', text: `${event.user.nickname}: ${event.text}` }
    case 'join':
      return { icon: '👋', text: `${event.user.nickname} joined` }
  }
}
