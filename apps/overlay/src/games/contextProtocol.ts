import type { ContextVocabulary, Ranking } from './contextRanking'
import type { ContextErrorKind } from '@zerocade/shared'

export type ContextRequest = { type: 'load'; id: number; origin: string } | { type: 'rank'; id: number; secret: number }
export type ContextResponse =
  | { type: 'ready'; id: number; vocabulary: ContextVocabulary }
  | { type: 'ranked'; id: number; ranking: Ranking; durationMs: number }
  | { type: 'error'; id: number; kind: ContextErrorKind; message: string }

export interface ContextComputer {
  load(): Promise<ContextVocabulary>
  rank(secret: number): Promise<Ranking>
  dispose(): void
}

export interface ContextWorkerPort {
  postMessage(request: ContextRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ContextResponse>) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  terminate(): unknown
}
