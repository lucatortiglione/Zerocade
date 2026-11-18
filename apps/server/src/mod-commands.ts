import type { LiveEvent } from '@zerocade/shared'

// "!next" in the chat, written by a moderator (or by the streamer, who is one anyway): ends the round of the game in play.
// It is a command, never an answer: the games do not see it as a comment.
export function isEndRoundCommand(event: LiveEvent): boolean {
  return event.type === 'comment' && (event.user.moderator === true || event.user.host === true) && /^!next$/i.test(event.text.trim())
}
