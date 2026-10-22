import { GAMES, type SessionState, type Trigger } from '@zerocade/shared'

// In memory for now, so a restart wipes it. Move to a database once accounts exist.
const sessions = new Map<string, SessionState>()

function defaultState(gameId: string): SessionState {
  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0]
  return { gameId: game.id, triggers: game.defaultTriggers }
}

export function getSession(key: string) {
  let state = sessions.get(key)
  if (!state) {
    state = defaultState(GAMES[0].id)
    sessions.set(key, state)
  }
  return state
}

export function selectGame(key: string, gameId: unknown) {
  if (typeof gameId !== 'string' || !GAMES.some((g) => g.id === gameId)) return null
  const state = defaultState(gameId)
  sessions.set(key, state)
  return state
}

export function setTriggers(key: string, triggers: Trigger[]) {
  const state = { ...getSession(key), triggers }
  sessions.set(key, state)
  return state
}
