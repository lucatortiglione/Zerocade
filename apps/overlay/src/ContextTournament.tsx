import { useEffect } from 'react'

// ZeroContext's tournament is drawn on the canvas, like the classic game (games/contextTournamentGame.ts). This only
// marks the page, so the play guide stays out of its way.
export function ContextTournament() {
  useEffect(() => {
    document.body.classList.add('tournament-on')
    return () => document.body.classList.remove('tournament-on')
  }, [])
  return null
}
