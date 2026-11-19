import type { Viewer } from './index.js'

export const CONTEXT_SEMANTIC_RULES = Object.freeze({ specialRoundsEnabled: false, every: 9, seconds: 180, attempts: 100, basePoints: 2500 })
export const semanticMode = (round: number, enabled: boolean = CONTEXT_SEMANTIC_RULES.specialRoundsEnabled): 'ordinary' | 'special' =>
  enabled && round > 0 && round % 9 === 0 ? 'special' : 'ordinary'
export function thermalScore(cosine: number, special: boolean): number {
  if (!Number.isFinite(cosine)) return 0
  const baseline = special ? .07 : .10
  return 100 * Math.min(1, Math.max(0, (cosine - baseline) / (1 - baseline))) ** (special ? 1.05 : 1.15)
}
export function specialPoints(elapsedSeconds: number, attempts: number): number {
  const time = Math.max(0, Math.min(180, elapsedSeconds))
  const used = Math.max(0, Math.min(100, attempts))
  return Math.floor(2500 * (1 + .6 * (180 - time) / 180 + .4 * (100 - used) / 100))
}
export interface ContextSemanticGuess { word: string; rank: number; temperature: number; by: Viewer | null; at: number }
export interface ContextSemanticState {
  round: number
  // The first round is being prepared (the server's ranking thread is loading the words or ranking the secret).
  preparing?: boolean
  mode: 'ordinary' | 'special'
  phase: 'playing' | 'intermission' | 'completed'
  paused: boolean
  remainingMs: number | null
  attempts: number
  total: number
  solution: string | null
  prefix: string
  wordLength: number | null
  solvedBy: Viewer | null
  reason: 'found' | 'time' | 'attempts' | 'creator' | null
  best: number | null
  closest: ContextSemanticGuess[]
  last: ContextSemanticGuess | null
  typed: { text: string; user: Viewer; rank: number | null }[]
  notes: string[]
  leaders: { id: string; name: string; pts: number; avatar?: string }[]
}
