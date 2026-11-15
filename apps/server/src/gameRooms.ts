// A failure in one game must not leave the other rooms' timers running at shutdown.
export function disposeGameRooms<T extends { dispose(): void }>(rooms: Map<string, T>): void {
  const errors: unknown[] = []
  try {
    for (const room of rooms.values()) {
      try { room.dispose() }
      catch (error) { errors.push(error) }
    }
  } finally { rooms.clear() }
  if (errors.length) throw new AggregateError(errors, 'Chiusura delle partite incompleta')
}

// Shared by the server-driven games. Existing players remain admitted at the
// limit; a new player is refused before any votes, scores or history grow.
export class RoomParticipants {
  private players = new Set<string>()
  private reported = false
  constructor(private limit = 10_000) {}
  accept(id: string, issue: (message: string) => void): boolean {
    if (this.players.has(id)) return true
    if (this.players.size < this.limit) { this.players.add(id); return true }
    if (!this.reported) {
      this.reported = true
      issue('Raggiunto il limite dei partecipanti. Seleziona nuovamente il gioco per avviare una nuova partita.')
    }
    return false
  }
  clear(): void { this.players.clear(); this.reported = false }
}
