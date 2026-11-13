// The room's secret word, for the games that play one word at a time (ZeroContext, ZeroWordle): each
// round is reported to the server, which keeps one word per room, so the dashboard's preview and the
// stream's overlay play the same word and the creator can read it in the dashboard.

let current: { adopt(word: string): void } | null = null
let listening = false
const sockets = () => import('../socket').then((m) => m.socket)

// The game instance that follows the room's word: it is told when another overlay's word wins.
export function followSecret(instance: { adopt(word: string): void }) {
  current = instance
  if (listening || typeof window === 'undefined') return
  listening = true
  void sockets().then((s) => s.on('secret:word', ({ word }) => current?.adopt(word)))
}

// A round starts with `word`; `prev` is the word of the round it replaces (null at the start).
export function reportSecret(word: string, prev: string | null) {
  if (typeof window !== 'undefined') void sockets().then((s) => s.emit('secret:round', { word, prev }))
}
