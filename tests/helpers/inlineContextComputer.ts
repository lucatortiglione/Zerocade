import type { ContextComputer } from '../../apps/overlay/src/games/contextProtocol.ts'
import { ContextError } from '../../packages/shared/src/context.ts'
import { rankAgainst, type ContextData } from '../../apps/overlay/src/games/contextRanking.ts'

// Domain tests use the same pure ranker with an explicit, immutable fixture.
// Real thread/network/termination behavior is tested separately.
export function inlineContextComputer(data: ContextData): ContextComputer {
  let closed = false
  return {
    async load() { if (closed) throw new ContextError('closed', 'Fixture closed'); return data },
    async rank(secret) { if (closed) throw new ContextError('closed', 'Fixture closed'); return rankAgainst(data, secret) },
    dispose() { closed = true },
  }
}

export const settleContext = () => new Promise<void>((done) => setImmediate(done))
