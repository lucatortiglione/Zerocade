import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { GAMES, activeTriggers, sharesPhotoBackground, triggersFor, type GameCommand, type LiveEvent } from '@zerocade/shared'
import { setRoundCheer } from './audio'
import { NasaBackdrop } from './NasaBackdrop'
import { Engine } from './games/engine'
import { createGame } from './games/registry'
import { createContextTournament } from './games/contextTournamentGame'
import { createSemanticContext } from './games/contextSemanticGame'
import { Taboo } from './Taboo'
import { WordHunt } from './WordHunt'
import { socket } from './socket'
import { overlaySnapshot, useOverlay } from './store'
import { Widgets } from './Widgets'
import { Bivio } from './Bivio'
import { Incastro } from './Incastro'
import { Quizzland } from './Quizzland'
import { ContextTournament } from './ContextTournament'
import { isContentReady, loadContent, subscribeContent } from './content'
import { ScoreTicker } from './ScoreTicker'
import { guideLine } from './guide'


export function App() {
  const { connected, session, message, messageSeq, gif, gifSeq, incastro, quizzland, contextTournament, contextSemantic } = useOverlay()
  // ZeroContext's tournament is the server's (ContextTournament): the classic game does not run under it.
  const tournamentOn = session?.gameId === 'context' && Boolean(contextTournament)
  const semanticOn = session?.gameId === 'context' && !tournamentOn && Boolean(contextSemantic)
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

  // The creator's commands to the game in play ("Termina round" in the dashboard).
  useEffect(() => {
    const onCommand = (command: GameCommand) => engineRef.current?.pushCommand(command)
    socket.on('game:command', onCommand)
    return () => {
      socket.off('game:command', onCommand)
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
    if (tournamentOn) {
      engineRef.current?.setGame(createContextTournament(), session.settings)
      return
    }
    if (semanticOn) { engineRef.current?.setGame(createSemanticContext(), session.settings); return }
    const game = GAMES.find((g) => g.id === session.gameId)
    const instance = game ? createGame(game.id) : null
    if (game && instance) engineRef.current?.setGame(instance, session.settings)
    else engineRef.current?.clear()
  }, [session?.gameId, session?.run, session?.ended, contentReady, tournamentOn, semanticOn])

  useEffect(() => {
    engineRef.current?.setPaused(Boolean(session?.paused))
  }, [session?.paused, session?.run, contentReady])

  // Tune settings live.
  useEffect(() => {
    engineRef.current?.setSettings(session?.settings ?? {})
    setRoundCheer(session?.settings.roundCheer !== false)
  }, [session?.settings])

  // Dispatch matching triggers on each incoming event. Nothing a viewer does (messages, likes, gifts, follows,
  // joins) shows over the game by itself: the Alerts widget does that, when the creator turns it on.
  useEffect(() => {
    const dispatch = (event: LiveEvent) => {
      const { session, contextTournament, contextSemantic } = overlaySnapshot()
      if (!session || session.paused || session.ended) return
      if (session.gameId === 'context' && (contextTournament || contextSemantic)) return
      if (GAMES.some((g) => g.id === session.gameId)) {
        for (const t of triggersFor(activeTriggers(session), event)) engineRef.current?.pushAction(t.action, event)
      }
    }
    // Subscribe directly: React may combine renders, but each worker event must
    // reach the engine once, in order, including bursts of chat messages.
    socket.on('live:event', dispatch)
    return () => { socket.off('live:event', dispatch) }
  }, [])

  const game = session ? GAMES.find((g) => g.id === session.gameId) : undefined
  // NASA's picture of the day behind the canvas games (ZeroDubbi, ZeroQuizz and ZeroWords draw their own).
  const photoMinutes =
    session && !session.ended && game && sharesPhotoBackground(game.id) && (session.settings.background ?? 'nasa') === 'nasa'
      ? Number(session.settings.photoMinutes) || 3
      : 0

  const scores = session?.gameId === 'incastro' ? incastro?.scores
    : session?.gameId === 'quizzland' ? quizzland?.scores : undefined

  return (
    // Il colore del gioco (dal catalogo) segna il marchio in alto: è l'unico accento per gioco.
    <div className="overlay" style={{ '--game-accent': game?.gradient[0] ?? '#8fb3ff' } as CSSProperties}>
      {photoMinutes > 0 && <NasaBackdrop minutes={photoMinutes} />}
      <canvas ref={canvasRef} className="overlay__canvas" />
      {session?.gameId === 'zerodubbi' && <Bivio />}
      {session?.gameId === 'incastro' && <Incastro />}
      {session?.gameId === 'quizzland' && <Quizzland />}
      {session?.gameId === 'zerotaboo' && <Taboo />}
      {session?.gameId === 'zerowordhunt' && <WordHunt />}
      {tournamentOn && <ContextTournament />}
      <header className="overlay__top">
        <span className="overlay__title">{game?.name ?? 'Zerocade'}</span>
        <span className={`dot${connected ? ' dot--on' : ''}`} aria-label={connected ? 'Collegato' : 'Non collegato'} />
      </header>

      {session?.settings.showLeaderboard !== false && scores && <ScoreTicker scores={scores} />}
      <Widgets />
      {session?.paused && !session.ended && (
        <div className="overlay-pause" role="status" aria-live="polite">
          <div className="overlay-pause__card">
            <span className="overlay-pause__icon" aria-hidden="true">⏸</span>
            <strong>In pausa</strong>
            <small>Si riparte tra poco</small>
          </div>
        </div>
      )}
      {session?.ended && <div className="overlay-state">Sessione terminata</div>}

      {gif && <img key={gifSeq} className="overlay-gif" src={gif.url} alt={gif.label} />}

      {message && (
        <div
          key={messageSeq}
          className={`overlay-message${session?.ticker?.messagePos ? ' placed' : ''}`}
          style={session?.ticker?.messagePos ? { left: `${session.ticker.messagePos.x}%`, top: `${session.ticker.messagePos.y}%` } : undefined}
          role="status"
        >
          {message}
        </div>
      )}

      {session && game && !tournamentOn && (
        <footer className="overlay__guide">
          {activeTriggers(session).map((t, i) => {
            const line = guideLine(t, game)
            return (
              <div key={i} className="guide-chip">
                <span aria-hidden="true">{line.icon}</span>
                <span>{line.text}</span>
              </div>
            )
          })}
        </footer>
      )}
    </div>
  )
}

