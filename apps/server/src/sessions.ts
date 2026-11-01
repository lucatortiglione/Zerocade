import { DEFAULT_WIDGETS, GAMES, defaultSettings, type GameSettings, type SessionState, type Trigger, type WidgetConfig } from '@zerocade/shared'
import { loadSession, saveSession } from './db.js'

function defaultState(gameId: string): SessionState {
  const game = GAMES.find((g) => g.id === gameId) ?? GAMES[0]
  return {
    gameId: game.id,
    triggers: game.defaultTriggers,
    settings: defaultSettings(game.settings),
    widgets: { ...DEFAULT_WIDGETS.widgets },
    goal: DEFAULT_WIDGETS.goal,
  }
}

const save = (key: string, state: SessionState) =>
  saveSession(
    key,
    state.gameId,
    JSON.stringify(state.triggers),
    JSON.stringify(state.settings),
    JSON.stringify(state.widgets),
    state.goal,
  )

export function getSession(key: string): SessionState {
  const row = loadSession(key)
  if (row) {
    try {
      const game = GAMES.find((g) => g.id === row.game_id) ?? GAMES[0]
      return {
        gameId: game.id,
        triggers: JSON.parse(row.triggers) as Trigger[],
        // Settings added to a game after this session was saved start at their default.
        settings: { ...defaultSettings(game.settings), ...(JSON.parse(row.settings) as GameSettings) },
        widgets: JSON.parse(row.widgets ?? '{}') as SessionState['widgets'],
        goal: typeof row.goal === 'number' ? row.goal : DEFAULT_WIDGETS.goal,
      }
    } catch {
      // fall through to defaults below
    }
  }
  const state = defaultState(GAMES[0].id)
  save(key, state)
  return state
}

export function selectGame(key: string, gameId: unknown) {
  const game = typeof gameId === 'string' ? GAMES.find((g) => g.id === gameId) : undefined
  if (!game) return null
  const prev = getSession(key)
  const state: SessionState = {
    gameId: game.id,
    triggers: game.defaultTriggers,
    settings: defaultSettings(game.settings),
    widgets: prev.widgets,
    goal: prev.goal,
  }
  save(key, state)
  return state
}

export function setTriggers(key: string, triggers: Trigger[]) {
  const state = { ...getSession(key), triggers }
  save(key, state)
  return state
}

export function setSettings(key: string, settings: GameSettings) {
  const state = { ...getSession(key), settings }
  save(key, state)
  return state
}

export function setScene(key: string, scene: Partial<WidgetConfig>) {
  const cur = getSession(key)
  const state: SessionState = {
    ...cur,
    widgets: scene.widgets ? { ...cur.widgets, ...scene.widgets } : cur.widgets,
    goal: typeof scene.goal === 'number' ? scene.goal : cur.goal,
  }
  save(key, state)
  return state
}
