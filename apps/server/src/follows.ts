import type { LiveEvent } from '@zerocade/shared'

// Who followed during the live, by room. TikTok can keep saying "does not follow" in the comments of someone who
// has just followed, for a while: for "Chi può giocare" a follow event counts at once. Kept in memory (a restart of
// Zerocade forgets it) and bounded: a follow counts for FOLLOW_TTL_MS, and a room keeps the latest MAX_FOLLOWS.
export const FOLLOW_TTL_MS = 12 * 60 * 60 * 1000
export const MAX_FOLLOWS = 10_000

export class RecentFollows {
  private readonly rooms = new Map<string, Map<string, number>>()

  constructor(private readonly now: () => number = Date.now) {}

  // The event, with its viewer marked as a follower when they followed in this room recently; a follow event is
  // remembered (and its viewer marked).
  apply(key: string, event: LiveEvent): LiveEvent {
    const now = this.now()
    let room = this.rooms.get(key)
    if (event.type === 'follow') {
      if (!room) this.rooms.set(key, (room = new Map()))
      room.delete(event.user.id) // inserted again at the end: when full, the oldest follow goes first
      room.set(event.user.id, now + FOLLOW_TTL_MS)
      for (const oldest of room.keys()) {
        if (room.size <= MAX_FOLLOWS) break
        room.delete(oldest)
      }
      return marked(event)
    }
    const until = room?.get(event.user.id)
    if (until === undefined) return event
    if (until <= now) {
      room!.delete(event.user.id)
      return event
    }
    return marked(event)
  }
}

const marked = (event: LiveEvent): LiveEvent =>
  event.user.follower === true ? event : { ...event, user: { ...event.user, follower: true } }
