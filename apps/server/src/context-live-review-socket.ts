import type { Socket } from 'socket.io'
import type { ClientToServerEvents, HandshakeAuth, LiveReviewReply, ServerToClientEvents } from '@zerocade/shared'
import type { ContextLiveReviews } from './context-live-reviews.js'

export function registerContextLiveReviews(socket: Socket<ClientToServerEvents, ServerToClientEvents>, auth: HandshakeAuth,
  store: ContextLiveReviews, playing: () => boolean, onError: (error: unknown) => void) {
  function reply(ack: (result: LiveReviewReply) => void, vote?: { id: unknown; verdict: unknown }) {
    if (typeof ack !== 'function') return
    if (auth.clientType !== 'dashboard') return ack({ ok: false, error: 'Accesso riservato alla regia.' })
    try {
      if (playing()) return ack({ ok: false, error: 'I confronti si aprono al termine della sessione ZeroContext.' })
      if (vote && !store.vote(auth.key, vote.id, vote.verdict))
        return ack({ ok: false, error: 'Voto non salvato. Ricarica i confronti per vedere i voti già registrati.' })
      ack({ ok: true, pairs: store.latest(auth.key) })
    } catch (error) {
      onError(error)
      ack({ ok: false, error: 'Impossibile leggere o salvare i confronti. Riprova.' })
    }
  }
  socket.on('context:live-review', ack => reply(ack))
  socket.on('context:live-vote', (id, verdict, ack) => reply(ack, { id, verdict }))
}
