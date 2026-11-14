// Data a game cannot play without, downloaded once from the server: ZeroContext's words and ZeroReazioniACatena's
// chains. A failed download (the server restarting, a lost connection) is tried again, at most every RETRY_MS, for
// as long as the game asks for it; until then the game says what is missing. The other games' content has its own
// policy (../content.ts: a few attempts, then the games start without it).
export const RETRY_MS = 10_000

// Whether a download may start at `now` (performance.now()): none has failed, or the last failure, at `failedAt`,
// is at least RETRY_MS old.
export const retryDue = (failedAt: number | null, now: number): boolean => failedAt === null || now - failedAt >= RETRY_MS
