import type { GameControl, SessionState } from '@zerocade/shared'
import { socket } from '../socket'
import { MessageComposer } from './Regia'

// Pause, restart and end the game in play, and the creator's message: the same buttons for every game
// that has no control column of its own (the canvas games).
const send = (command: GameControl) => socket.emit('game:control', command)

export function GameControls({ session }: { session: SessionState }) {
  const ended = Boolean(session.ended)
  const restart = () => {
    if (window.confirm('Riavviare il gioco? La classifica della live si azzera.')) send('restart')
  }
  return (
    <section className="side-controls">
      <button type="button" className="side-action side-action--blue" disabled={ended} onClick={() => send(session.paused ? 'resume' : 'pause')}>
        {session.paused ? '▶ Riprendi gioco' : '⏸ Metti in pausa'}
      </button>
      <button type="button" className="side-action side-action--orange" onClick={restart}>
        ↻ Riavvia gioco
      </button>
      <MessageComposer />
      <EndSession ended={ended} />
    </section>
  )
}

// Ends the session (the overlay shows nothing) or starts it again. Also in the control columns of the games
// that have their own.
export function EndSession({ ended }: { ended: boolean }) {
  const end = () => {
    if (window.confirm('Terminare la sessione? Lo schermo di gioco si svuota finché non la riavvii.')) send('end')
  }
  return ended ? (
    <button type="button" className="side-action side-action--blue" onClick={() => send('start')}>
      ▶ Avvia sessione
    </button>
  ) : (
    <button type="button" className="side-action side-action--red" onClick={end}>
      ⏻ Termina sessione
    </button>
  )
}
