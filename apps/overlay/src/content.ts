// Loads game content from the server's SQLite-backed `/api/content` endpoint and
// exposes synchronous accessors for the games. Content is cached once at boot.

let store: Record<string, unknown[]> = {}
let ready = false
let loading: Promise<void> | null = null

const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

export async function loadContent(): Promise<void> {
  if (loading) return loading
  loading = fetch('/api/content')
    .then((res) => (res.ok ? res.json() : {}))
    .then((json: Record<string, unknown[]>) => {
      store = json ?? {}
    })
    .catch(() => {
      store = {}
    })
    .finally(() => {
      ready = true
      emit()
    })
  return loading
}

export const isContentReady = () => ready

export function subscribeContent(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Raw items for a game, cast by the caller.
export const itemsFor = <T>(gameId: string): T[] => (store[gameId] as T[] | undefined) ?? []

// Convenience for games whose bank is a plain list of words.
export const wordsFor = (gameId: string): string[] => itemsFor<string>(gameId)
