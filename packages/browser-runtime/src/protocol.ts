import type { HandshakeAuth } from '@zerocade/shared'

export type TransportRequest =
  | { type: 'open'; origin: string; auth: HandshakeAuth }
  | { type: 'emit'; delivery: number; event: string; args: unknown[]; ack?: number }
  | { type: 'received'; delivery: number }
  | { type: 'close' }
export type TransportResponse =
  | { type: 'event'; delivery: number; event: string; args: unknown[] }
  | { type: 'consumed'; delivery: number }
  | { type: 'ack'; id: number; args: unknown[] }
  | { type: 'fault'; message: string }
