import type { Feed, Gifter, LiveEvent, PadBoard, SourceKind } from '@zerocade/shared'
import type { EventRow } from './db.js'
import type { Boards, PeriodId } from './scores.js'

// Only these internal operations cross the thread boundary; SQL and function
// names supplied by an HTTP client are never executed.
export interface InfrastructureJobs {
  event: { args: { key: string; creator: string; game: string; event: LiveEvent; at?: number }; result: Gifter[] | null }
  ranking: { args: { key: string }; result: Gifter[] }
  creator: { args: { kind: SourceKind; username: string; game: string; viewers?: number }; result: void }
  events: { args: { key: string; limit: number }; result: EventRow[] }
  feed: { args: { creator?: string; since: number }; result: Omit<Feed, 'live'> }
  boards: { args: { key: string; game: string; limit: number; at: number; start: number }; result: { boards: Boards; resets: Partial<Record<PeriodId, number>> } }
  site: { args: { key: string; at: number; starts: Record<string, number> }; result: Map<string, string> }
  export: { args: { kind: 'bivio' | 'bivio-flags' | 'quizzland' | 'zw-plays' | 'zw-answers' | 'wa-rounds' | 'wa-guesses' | 'taboo-exposures' | 'taboo-calibration' }; result: string }
  padSave: { args: { key: string; input: unknown }; result: { error: string | null; board: PadBoard } }
  padRemove: { args: { key: string; id: string }; result: PadBoard }
  padVolume: { args: { key: string; volume: number }; result: PadBoard }
  padBoard: { args: { key: string }; result: PadBoard }
  // ZeroWordHunt's dictionary: read from the two databases in the worker, never on the main thread (it takes about a second).
  wordhuntWords: { args: null; result: readonly string[] | null }
  barrier: { args: null; result: void }
  close: { args: null; result: void }
}
export type JobName = keyof InfrastructureJobs
export type JobRequest = { [K in JobName]: { id: number; kind: K; args: InfrastructureJobs[K]['args'] } }[JobName]
export type JobResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }
