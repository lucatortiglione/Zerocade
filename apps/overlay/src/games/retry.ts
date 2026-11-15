// Data a game cannot play without, downloaded once from the server: ZeroContext's words and ZeroReazioniACatena's
// chains. A failed download (the server restarting, a lost connection) is tried again, at most every RETRY_MS, for
// as long as the game asks for it; until then the game says what is missing. The other games' content has its own
// policy (../content.ts: a few attempts, then the games start without it).
export const RETRY_MS = 10_000
// With `failures` in a row the wait doubles each time (10 s, 20 s, 40 s), up to this: a server that is down for long
// is not asked every ten seconds, but it is never given up on.
export const RETRY_MAX_MS = 60_000

// Whether a download may start at `now` (performance.now()): none has failed, or the last failure, at `failedAt`,
// is old enough for the number of consecutive failures so far (one, unless the game counts them).
export const retryDue = (failedAt: number | null, now: number, failures = 1): boolean =>
  failedAt === null || now - failedAt >= Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** Math.max(0, failures - 1))
