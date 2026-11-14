import { DEFAULT_WIDGETS, GAMES, defaultSettings, normalizeContextColors, type GameControl, type GameSettings, type SessionState, type Trigger, type WidgetConfig } from '@zerocade/shared'
import { loadSession, saveSession, setAsideSession } from './db.js'

// Games that changed id: a session saved under the old one continues under the new one.
const RENAMED: Record<string, string> = { 'five-letters': 'zerowordle', bivio: 'zerodubbi' }

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

// Run state of each room's game: not saved, a restart of Zerocade starts it afresh.
const runtime = new Map<string, { paused: boolean; ended: boolean; run: number }>()
const live = (key: string) => runtime.get(key) ?? { paused: false, ended: false, run: 0 }

// When each game's session began in each room (it was chosen, restarted or started again): the start of its
// "Sessione" leaderboard. Before anything, the start of the server.
const BOOT = Date.now()
const began = new Map<string, Record<string, number>>()
const markSession = (key: string, gameId: string) => began.set(key, { ...began.get(key), [gameId]: Date.now() })
export const sessionSince = (key: string, gameId: string): number => began.get(key)?.[gameId] ?? BOOT

export function getSession(key: string): SessionState {
  return { ...loadState(key), ...live(key) }
}

export function controlGame(key: string, command: GameControl): SessionState {
  const cur = live(key)
  if (command === 'pause') runtime.set(key, { ...cur, paused: true })
  else if (command === 'resume') runtime.set(key, { ...cur, paused: false })
  else if (command === 'end') runtime.set(key, { ...cur, paused: false, ended: true })
  else {
    runtime.set(key, { paused: false, ended: false, run: cur.run + 1 }) // restart, start
    markSession(key, loadState(key).gameId)
  }
  return getSession(key)
}

function loadState(key: string): SessionState {
  const row = loadSession(key)
  if (row) {
    try {
      const game = GAMES.find((g) => g.id === (RENAMED[row.game_id] ?? row.game_id)) ?? GAMES[0]
      const settings = { ...defaultSettings(game.settings), ...(JSON.parse(row.settings) as GameSettings) }
      if (game.id === 'context') Object.assign(settings, normalizeContextColors(settings))
      return {
        gameId: game.id,
        triggers: JSON.parse(row.triggers) as Trigger[],
        // Settings added to a game after this session was saved start at their default.
        settings,
        widgets: JSON.parse(row.widgets ?? '{}') as SessionState['widgets'],
        goal: typeof row.goal === 'number' ? row.goal : DEFAULT_WIDGETS.goal,
      }
    } catch (err) {
      // The saved row is unreadable: keep a copy (sessions_corrupt) and say so, then start from the defaults below.
      console.error(`[sessioni] la sessione salvata di ${key} non si legge (${err instanceof Error ? err.message : err}): copia in sessions_corrupt`)
      try {
        setAsideSession(key, row)
      } catch (copyErr) {
        console.error('[sessioni] copia non riuscita', copyErr)
      }
    }
  }
  const state = defaultState(GAMES[0].id)
  save(key, state)
  return state
}

export function selectGame(key: string, gameId: unknown) {
  const game = typeof gameId === 'string' ? GAMES.find((g) => g.id === gameId) : undefined
  if (!game) return null
  const prev = loadState(key)
  runtime.set(key, { paused: false, ended: false, run: live(key).run + 1 })
  markSession(key, game.id)
  const state: SessionState = {
    gameId: game.id,
    triggers: game.defaultTriggers,
    settings: defaultSettings(game.settings),
    widgets: prev.widgets,
    goal: prev.goal,
  }
  save(key, state)
  return getSession(key)
}

export function setTriggers(key: string, triggers: Trigger[]) {
  const state = { ...getSession(key), triggers }
  save(key, state)
  return state
}

export function setSettings(key: string, settings: GameSettings) {
  const state = { ...getSession(key), settings }
  if (state.gameId === 'context') state.settings = { ...settings, ...normalizeContextColors(settings) }
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
