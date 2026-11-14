// The room's secret word, for the games that play one word at a time (ZeroContext, ZeroWordle): each
// round is reported to the server, which keeps one word per room, so the dashboard's preview and the
// stream's overlay play the same word and the creator can read it in the dashboard.

let current: { adopt(word: string): void } | null = null
let listening = false
const sockets = () => import('../socket').then((m) => m.socket)
export interface RoomSecret {
  follow(instance: { adopt(word: string): void }): () => void
  report(word: string, prev: string | null): void
  // The round's word is on screen (found, or "Termina round"), until the next round.
  reveal?(word: string): void
}

// The game instance that follows the room's word: it is told when another overlay's word wins.
export function followSecret(instance: { adopt(word: string): void }) {
  current = instance
  if (!listening && typeof window !== 'undefined') {
    listening = true
    void sockets().then((s) => s.on('secret:word', ({ word }) => current?.adopt(word)))
      .catch(() => { listening = false; console.warn('[room-secret] Collegamento alla soluzione non disponibile.') })
  }
  return () => { if (current === instance) current = null }
}

// A round starts with `word`; `prev` is the word of the round it replaces (null at the start).
export function reportSecret(word: string, prev: string | null) {
  const owner = current
  if (typeof window !== 'undefined') void sockets().then((s) => {
    if (current === owner) s.emit('secret:round', { word, prev })
  }).catch(() => console.warn('[room-secret] Invio della soluzione non confermato.'))
}

// ZeroContext: the round with `word` is over and its word is shown. Until the next round the chat's single words are
// not guesses, and the server asks ZeroFollowerBot's voice not to read them.
export function revealSecret(word: string) {
  const owner = current
  if (typeof window !== 'undefined') void sockets().then((s) => {
    if (current === owner) s.emit('secret:revealed', { word })
  }).catch(() => console.warn('[room-secret] Fine del round non comunicata.'))
}
