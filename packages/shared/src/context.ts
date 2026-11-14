// Per-instance and per-resource budgets for ZeroContext's real consumers:
// HTTP hosting, browser loading, ranking worker and game coordination.
export const CONTEXT_LIMITS = Object.freeze({
  words: 200_000, dimensions: 1024, vectors: 128 * 1024 * 1024,
  vocab: 4 * 1024 * 1024, secrets: 512 * 1024, links: 4 * 1024 * 1024,
  linkCount: 500_000, linksPerSecret: 4096, maxBoost: 10_000_000,
  loadMs: 30_000, rankMs: 15_000,
  pendingActions: 300, pendingBytes: 256 * 1024,
  guesses: 10_000, players: 10_000,
})

export const CONTEXT_COLORS = Object.freeze({ red: '#ef4444', orange: '#f97316', yellow: '#facc15', cyan: '#22d3ee', blue: '#3b82f6' })
export const CONTEXT_COLOR_STOPS = Object.freeze({ red: 10, orange: 100, yellow: 1000, cyan: 10_000 })
export const CONTEXT_COLOR_MAX = Object.freeze({ red: 1000, orange: 10_000, yellow: 50_000, cyan: CONTEXT_LIMITS.words })

export function normalizeContextColors(settings: Record<string, unknown>) {
  const value = (id: string, fallback: number, max: number) => {
    const raw = settings[id]
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(1, Math.trunc(raw))) : fallback
  }
  const redUntil = value('redUntil', CONTEXT_COLOR_STOPS.red, CONTEXT_COLOR_MAX.red)
  const orangeUntil = Math.max(redUntil + 1, value('orangeUntil', CONTEXT_COLOR_STOPS.orange, CONTEXT_COLOR_MAX.orange))
  const yellowUntil = Math.max(orangeUntil + 1, value('yellowUntil', CONTEXT_COLOR_STOPS.yellow, CONTEXT_COLOR_MAX.yellow))
  const cyanUntil = Math.max(yellowUntil + 1, value('cyanUntil', CONTEXT_COLOR_STOPS.cyan, CONTEXT_COLOR_MAX.cyan))
  return { redUntil, orangeUntil, yellowUntil, cyanUntil }
}

export type ContextErrorKind = 'network' | 'data' | 'worker' | 'timeout' | 'closed' | 'superseded' | 'saturated'
export class ContextError extends Error {
  constructor(readonly kind: ContextErrorKind, message: string) { super(message); this.name = 'ContextError' }
}
