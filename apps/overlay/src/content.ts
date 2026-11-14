// Loads game content from the server's SQLite-backed `/api/content` endpoint and
// exposes synchronous accessors for the games. Content is cached once at boot.

let store: Record<string, unknown[]> = {}
let ready = false
let loading: Promise<void> | null = null

const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

// The server may still be starting when the overlay opens: a failed request is tried again a few times, each one
// cut off after a while, before the games start with no content.
const ATTEMPTS = 3
const ATTEMPT_TIMEOUT_MS = 10_000

async function fetchContent(retryDelayMs: number): Promise<Record<string, unknown[]>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('/api/content', { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) })
      if (res.ok) return ((await res.json()) as Record<string, unknown[]> | null) ?? {}
    } catch {
      // network error or timeout: counted as a failed attempt
    }
    if (attempt >= ATTEMPTS) return {}
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
  }
}

export async function loadContent(retryDelayMs = 1000): Promise<void> {
  if (loading) return loading
  loading = fetchContent(retryDelayMs).then((json) => {
    store = json
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
