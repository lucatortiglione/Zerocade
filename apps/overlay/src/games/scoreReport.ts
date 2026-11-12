// Every point a viewer earns goes to the server, which keeps the leaderboards by session, day, week, month and
// all time (apps/server/src/scores.ts). The dashboard's preview (?preview) plays along but does not report, so a
// point is counted once, by the overlay of the stream.

let game = ''
const PREVIEW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview')

// The game the overlay is running now (set when it is created).
export const setScoreGame = (id: string) => {
  game = id
}

export function reportScore(id: string, name: string, avatar: string | undefined, points: number) {
  if (PREVIEW || typeof window === 'undefined' || !game || !Number.isInteger(points) || points <= 0) return
  void import('../socket').then(({ socket }) => socket.emit('score:add', { game, user: { id, nickname: name, avatar }, points }))
}
