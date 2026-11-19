// ZeroWordHunt's rooms: the coordinator that owns the timers, the order of the messages, the limits and the state in memory.
// The server alone decides who found a word first (spec §7.3): the first valid message that ARRIVES here, in arrival order
// (`receiveSequence`), takes the word; the claim is saved before it is published (§9.4) and the table refuses a second holder.
// The public state never holds a target that is not found, its path or its avatar cell (§10.3): only the admin state has them.
// Nothing here awaits: every write is a short synchronous transaction.
import {
  WORDHUNT_RULES, WORDHUNT_SIZES, wordHuntDirections, WORDHUNT_SIZE_DEFAULT, isWordHuntSize, wordHuntPoints,
  type GameSettings, type Viewer, type WordHuntAdminState, type WordHuntAdminTarget, type WordHuntClaim, type WordHuntCommand, type WordHuntEnd,
  type WordHuntErrorCode, type WordHuntLeader, type WordHuntMode, type WordHuntPhase, type WordHuntPublicState, type WordHuntReply, type WordHuntWinner,
} from '@zerocade/shared'
import { RoomParticipants } from './gameRooms.js'
import {
  WordHuntGenerationError, cellName, fixtureBoard, generateBoard, nextColor, normalizeGuess,
  type Board, type BoardTarget, type FixtureFile,
} from './wordhunt-domain.js'
import { isBusyError, type ClaimInput, type WordHuntStore } from './wordhunt-db.js'

export interface WordHuntDeps {
  store: WordHuntStore
  // The words a generated board draws from: undefined while they are still being read (in a worker), null when there are none.
  dictionary(): readonly string[] | null | undefined
  fixture(): FixtureFile // the board of the reference screenshot
  monotonicNow(): number // durations and deadlines: never the civil clock (DIRETTIVE §6)
  wallNow(): number // the instants saved in the records
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  newId(): string
  newSeed(): string
  emitPublic(key: string, state: WordHuntPublicState): void
  emitAdmin(key: string, admin: WordHuntAdminState): void
  allowed(key: string, user: Viewer): boolean // "Chi può giocare"
  settings(key: string): GameSettings
  autoplay(key: string): boolean // rounds start by themselves: the setting is on, the game is not paused or ended
  issue(key: string, message: string): void // the dashboard's runtime:issue
  log(level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void
}

// A chat message as the room takes it: the platform's id of the message when it has one, '' otherwise.
export interface WordHuntMessage {
  user: Viewer
  text: string
  messageId: string
  platform: string
}

type Ignored = 'not-listening' | 'late' | 'host' | 'audience' | 'duplicate' | 'rate' | 'invalid' | 'wrong' | 'already-claimed' | 'limit' | 'storage'

interface Total { winner: WordHuntWinner; words: number; points: number; first: number }

interface Pending { target: BoardTarget; winner: WordHuntWinner; color: string; points: number; seq: number; input: ClaimInput; tries: number }
const CLAIM_RETRY_MS = 150
const CLAIM_RETRIES = 40 // about 6 s: after that the claim is given up and the director is told

interface Held {
  target: BoardTarget
  winner: WordHuntWinner
  color: string
  points: number
  seq: number
}

const fail = (error: WordHuntErrorCode, message: string): WordHuntReply => ({ ok: false, error, message })
const ok: WordHuntReply = { ok: true }
const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
const copyWinner = (w: WordHuntWinner): WordHuntWinner => ({ id: w.id, nickname: w.nickname, ...(w.avatar ? { avatar: w.avatar } : {}) })

export class WordHuntRoom {
  private disposed = false
  private version = 0
  private eventSeq = 0
  private phase: WordHuntPhase = 'idle'
  private mode: WordHuntMode | null = null
  private board: Board | null = null
  private roundId: string | null = null
  private roundRow: number | null = null
  private end: WordHuntEnd | null = null
  private durationMs = 0
  private deadline = 0 // monotonic, while active and not paused
  private countdownEnd = 0
  private paused = false
  private pausedRemaining = 0
  private roundTimer: unknown = null
  private countdownTimer: unknown = null
  private emitTimer: unknown = null
  private lastEmit = -Infinity
  private notice: string | null = null
  private autoTimer: unknown = null
  private autoHold = false // "Chiudi" stops the automatic rounds until the game is chosen again or a round is made by hand
  private dictionaryWaits = 0 // times the automatic round waited for the dictionary to be read
  private nextAt = 0 // monotonic: when the automatic round starts, 0 when none is waiting
  private sequence = 0
  private readonly held = new Map<number, Held>()
  private readonly byWord = new Map<string, BoardTarget>()
  private readonly participants = new RoomParticipants(WORDHUNT_RULES.maxParticipants)
  private seenKeys = new Set<string>()
  private readonly windows = new Map<string, number[]>()
  private storedGuesses = 0
  private lastClaim: WordHuntClaim | null = null
  private readonly sessionTotals = new Map<string, Total>()
  private sessionRounds = 0
  private readonly pending: Pending[] = []
  private retryTimer: unknown = null
  private readonly userColors = new Map<string, string>() // every player keeps one colour for the whole session
  private roundFolded = false
  private metrics = { received: 0, ignored: {} as Record<string, number>, guesses: 0, overflow: 0 }

  constructor(private readonly key: string, private readonly deps: WordHuntDeps) {}

  // ---- Reads (copies: what is emitted is never an array this room goes on changing, DIRETTIVE §6) ----

  private claimOf(h: Held): WordHuntClaim {
    return {
      target: h.target.id, word: h.target.word, cells: h.target.cells.map(cellName), avatarCell: cellName(h.target.anchor),
      color: h.color, winner: copyWinner(h.winner), points: h.points, seq: h.seq,
    }
  }

  // The colour of a player's words: the same one for all of them, and in the next rounds too. A colour already worn on the board by someone
  // else is not given twice (a remembered one that clashes is replaced); the palette starts again only when it has run out.
  private colorFor(id: string): string {
    const others = [...this.held.values()].filter((h) => h.winner.id !== id).sort((a, b) => a.seq - b.seq).map((h) => h.color)
    const mine = this.userColors.get(id)
    if (mine && !others.includes(mine)) return mine
    const color = nextColor(others)
    this.userColors.set(id, color)
    return color
  }

  // One standings table from per-player totals: points, then words, then who scored first.
  private rank(byId: Map<string, Total>): WordHuntLeader[] {
    const sorted = [...byId.values()].sort((a, b) => b.points - a.points || b.words - a.words || a.first - b.first)
    let place = 0
    return sorted.slice(0, WORDHUNT_RULES.leaders).map((r, i): WordHuntLeader => {
      const prev = sorted[i - 1]
      if (!prev || prev.points !== r.points || prev.words !== r.words) place = i + 1
      return { id: r.winner.id, nickname: r.winner.nickname, ...(r.winner.avatar ? { avatar: r.winner.avatar } : {}), words: r.words, points: r.points, place }
    })
  }

  private add(byId: Map<string, Total>, h: Held): void {
    const row = byId.get(h.winner.id)
    if (row) { row.words++; row.points += h.points; row.first = Math.min(row.first, h.seq); if (h.winner.avatar) row.winner = h.winner }
    else byId.set(h.winner.id, { winner: h.winner, words: 1, points: h.points, first: h.seq })
  }

  private leaders(): WordHuntLeader[] {
    const byId = new Map<string, Total>()
    for (const h of this.held.values()) this.add(byId, h)
    return this.rank(byId)
  }

  // The session: the rounds already closed plus the one on the board. `first` is an order of arrival that restarts every round, so for
  // the ties the rounds are kept apart by an offset (an earlier round came first).
  private sessionLeaders(): WordHuntLeader[] {
    const byId = new Map<string, Total>([...this.sessionTotals].map(([id, t]) => [id, { ...t }]))
    if (!this.roundFolded) for (const h of this.held.values()) this.add(byId, { ...h, seq: h.seq + this.sessionRounds * 1e9 })
    return this.rank(byId)
  }

  // Closes the round on the board into the session totals, once.
  private foldRound(): void {
    if (this.roundFolded || !this.held.size) return
    for (const h of this.held.values()) this.add(this.sessionTotals, { ...h, seq: h.seq + this.sessionRounds * 1e9 })
    this.sessionRounds++
    this.roundFolded = true
  }

  private remaining(now: number): number {
    if (this.phase === 'countdown') return Math.max(0, this.countdownEnd - now)
    if (this.phase === 'active') return this.durationMs === 0 ? 0 : this.paused ? this.pausedRemaining : Math.max(0, this.deadline - now)
    if (this.phase === 'ready') return this.durationMs
    return 0
  }

  state(): WordHuntPublicState {
    const board = this.board
    const claims = [...this.held.values()].sort((a, b) => a.seq - b.seq).map((h) => this.claimOf(h))
    return {
      version: this.version, eventSeq: this.eventSeq, roundId: this.roundId, phase: this.phase, mode: this.mode,
      rows: board?.rows ?? WORDHUNT_RULES.rows, cols: board?.cols ?? WORDHUNT_RULES.cols,
      letters: board ? board.letters.map((line) => line.join('')) : [],
      total: board?.targets.length ?? 0, found: this.held.size, claims, paused: this.paused,
      limited: this.durationMs > 0, remainingMs: this.remaining(this.deps.monotonicNow()), serverNow: this.deps.wallNow(), end: this.end,
      leaders: this.leaders(), sessionLeaders: this.sessionLeaders(), nextRoundMs: this.autoTimer !== null ? Math.max(0, this.nextAt - this.deps.monotonicNow()) : null, lastClaim: this.lastClaim ? { ...this.lastClaim, cells: [...this.lastClaim.cells], winner: copyWinner(this.lastClaim.winner) } : null,
      notice: this.notice,
    }
  }

  admin(): WordHuntAdminState {
    const board = this.board
    const targets: WordHuntAdminTarget[] = (board?.targets ?? []).map((t) => ({
      target: t.id, word: t.word, cells: t.cells.map(cellName), avatarCell: cellName(t.anchor), direction: t.direction,
      found: this.held.has(t.id), winner: this.held.get(t.id)?.winner.nickname ?? null,
    }))
    return {
      state: this.state(), seed: board?.seed ?? null, checksum: board?.checksum ?? null, targets,
      decoys: (board?.decoys ?? []).map((d) => ({ word: d.word, cells: d.cells.map(cellName) })),
      dictionaryReady: (this.deps.dictionary()?.length ?? 0) > 0, auto: !this.autoHold && this.deps.autoplay(this.key),
      metrics: { received: this.metrics.received, ignored: { ...this.metrics.ignored }, guesses: this.metrics.guesses, overflow: this.metrics.overflow },
    }
  }

  // The messages are comments of an active round: ZeroFollowerBot's voice need not read them.
  listening(): boolean { return this.phase === 'active' && !this.paused }

  // ---- The chat ----

  offer(m: WordHuntMessage): void {
    if (this.disposed) return
    const ignore = (why: Ignored) => { this.metrics.ignored[why] = (this.metrics.ignored[why] ?? 0) + 1; if (this.phase === 'active') this.publish(false) }
    this.metrics.received++
    if (this.phase !== 'active' || this.paused || !this.board) return ignore('not-listening')
    const now = this.deps.monotonicNow()
    if (now >= this.deadline) return ignore('late') // the deadline, not the timer (§8.1)
    if (m.user.host === true) return ignore('host') // the streamer sees the words and cannot win them
    if (!m.user.id || m.user.id.endsWith(':anonymous')) return ignore('invalid')
    if (!this.deps.allowed(this.key, m.user)) return ignore('audience')
    if (!this.participants.accept(m.user.id, (text) => this.deps.issue(this.key, text))) return ignore('limit')
    // §7.4: a message already seen (a replay after a reconnection) is processed once.
    const messageKey = m.messageId ? `${m.platform}:${m.messageId}` : null
    if (messageKey) {
      if (this.seenKeys.has(messageKey)) return ignore('duplicate')
      if (this.seenKeys.size < WORDHUNT_RULES.maxSeenMessageKeys) this.seenKeys.add(messageKey)
      else this.metrics.overflow++
    }
    const seq = ++this.sequence // the order of arrival: the one that decides, never the clock of the platform
    // §7.5: three guesses every two seconds per user; the ones beyond do not count.
    const recent = (this.windows.get(m.user.id) ?? []).filter((t) => now - t < WORDHUNT_RULES.guessWindowMs)
    if (recent.length >= WORDHUNT_RULES.guessesPerWindow) { this.windows.set(m.user.id, recent); return ignore('rate') }
    recent.push(now)
    this.windows.set(m.user.id, recent)
    const guess = normalizeGuess(m.text)
    if (guess === null) return ignore('invalid')
    const target = this.byWord.get(guess)
    if (!target) return ignore('wrong') // a word the grid happens to read is not a target (§3.2)
    this.metrics.guesses++
    const winner: WordHuntWinner = { id: m.user.id, nickname: m.user.nickname, ...(m.user.avatar ? { avatar: m.user.avatar } : {}) }
    if (this.held.has(target.id)) {
      this.audit(target, winner, m, messageKey, guess, now, seq)
      return ignore('already-claimed') // the colour, the avatar and the score of the first one do not change (§7.4)
    }
    const color = this.colorFor(winner.id)
    const points = wordHuntPoints(target.word.length)
    // A claim waiting for the database to be free (below) already owns its word: whoever writes it after is late.
    if (this.pending.some((p) => p.target.id === target.id)) return ignore('already-claimed')
    const claim: Pending = { target, winner, color, points, seq, input: {
      roundRow: this.roundRow!, targetSeq: target.id, viewer: winner, platform: m.platform, messageKey, guess, receivedMs: Math.round(now),
      receiveSeq: seq, color, points, wallMs: this.deps.wallNow(),
    }, tries: 0 }
    const done = this.tryClaim(claim)
    if (done === 'lost') return ignore('already-claimed')
    if (done === 'failed') return ignore('storage')
    if (done === 'busy') return // retried by the timer: the word is shown as soon as it is saved
    this.confirm(claim)
  }

  // Saved before it is shown: a crash between the commit and the broadcast loses nothing (§9.4). A database that stays busy is not a
  // lost word: the claim waits in `pending`, in order of arrival, and is retried every few tenths of a second.
  private tryClaim(c: Pending): 'ok' | 'lost' | 'busy' | 'failed' {
    try {
      if (!this.deps.store.claim(c.input)) return 'lost'
      this.storedGuesses++
      return 'ok'
    } catch (error) {
      if (isBusyError(error) && c.tries < CLAIM_RETRIES) {
        c.tries++
        if (!this.pending.includes(c)) this.pending.push(c)
        this.scheduleRetry()
        return 'busy'
      }
      this.deps.log('error', 'wordhunt: parola non salvata', { error: String(error), tries: c.tries })
      this.deps.issue(this.key, 'ZeroWordHunt: una parola trovata non è stata salvata e non è stata assegnata. Controlla il registro del server.')
      return 'failed'
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null || this.disposed) return
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = null
      const waiting = this.pending.splice(0)
      for (const c of waiting) {
        if (this.phase !== 'active' || this.held.has(c.target.id) || c.input.roundRow !== this.roundRow) continue
        const done = this.tryClaim(c) // a busy one goes back to `pending`, keeping its place at the front
        if (done === 'ok') this.confirm(c)
        else if (done === 'busy') {
          // keep the order of arrival: the ones after it wait too
          const rest = waiting.slice(waiting.indexOf(c) + 1).filter((x) => !this.pending.includes(x))
          this.pending.push(...rest)
          break
        }
      }
    }, CLAIM_RETRY_MS)
  }

  private confirm(c: Pending): void {
    const { target, winner, color, points, seq } = c
    const held: Held = { target, winner, color, points, seq }
    this.held.set(target.id, held)
    this.lastClaim = this.claimOf(held)
    this.eventSeq++
    this.bump()
    this.publish(true)
    if (this.board && this.held.size >= this.board.targets.length) this.finishRound('completed')
  }

  // A hit on a word already taken is kept for the audit, up to a cap; a failure to write it never touches the round.
  private audit(target: BoardTarget, winner: WordHuntWinner, m: WordHuntMessage, messageKey: string | null, guess: string, now: number, seq: number): void {
    if (this.storedGuesses >= WORDHUNT_RULES.maxStoredGuesses) return
    try {
      this.deps.store.claim({
        roundRow: this.roundRow!, targetSeq: target.id, viewer: winner, platform: m.platform, messageKey, guess, receivedMs: Math.round(now),
        receiveSeq: seq, color: this.held.get(target.id)!.color, points: 0, wallMs: this.deps.wallNow(),
      })
      this.storedGuesses++
    } catch (error) {
      this.deps.log('warn', 'wordhunt: tentativo non salvato', { error: String(error) })
    }
  }

  // ---- The commands of the director ----

  // Never throws: an unexpected error becomes a typed reply the director can read (DIRETTIVE §7).
  control(command: WordHuntCommand): WordHuntReply {
    try { return this.run(command) } catch (error) {
      this.deps.log('error', 'wordhunt: comando non eseguito', { type: command.type, error: String(error) })
      return fail('unavailable', 'Errore inatteso: controlla il registro del server prima di ripetere.')
    }
  }

  private run(command: WordHuntCommand): WordHuntReply {
    if (this.disposed) return fail('unavailable', 'La stanza è chiusa.')
    if (command.expectedVersion !== this.version) return fail('stale-version', 'Il comando si riferisce a uno stato vecchio: riprova.')
    switch (command.type) {
      case 'create-round':
        this.autoHold = false
        return this.createRound(command)
      case 'start': return this.start()
      case 'finish':
        if (this.phase !== 'active' && this.phase !== 'countdown') return fail('wrong-phase', 'Nessun round in corso.')
        this.finishRound('stopped')
        return ok
      case 'reset':
        if (this.phase === 'active' || this.phase === 'countdown') return fail('wrong-phase', 'Termina prima il round in corso.')
        this.autoHold = true
        this.discard()
        this.emitAll()
        return ok
      case 'revoke': return this.revoke(command.target, command.reason)
    }
  }

  private createRound(command: Extract<WordHuntCommand, { type: 'create-round' }>): WordHuntReply {
    if (this.phase === 'active' || this.phase === 'countdown') return fail('wrong-phase', 'Termina prima il round in corso.')
    const settings = this.deps.settings(this.key)
    // The size of the board: the command's, else the setting, else the large one. A smaller board has fewer words and, unless the director
    // gives the time, a proportionally shorter round (the setting is the time for 24 words).
    const size = WORDHUNT_SIZES[command.size ?? (isWordHuntSize(settings.wordhuntSize) ? settings.wordhuntSize : WORDHUNT_SIZE_DEFAULT)]
    const targets = clampInt(command.targetCount, WORDHUNT_RULES.targetMin, WORDHUNT_RULES.targetMax, size.words)
    // 0 seconds is no limit (the default); otherwise the setting is the time for 24 words.
    const baseSeconds = settings.wordhuntSeconds === 0 ? 0 : clampInt(settings.wordhuntSeconds, WORDHUNT_RULES.roundSecondsMin, WORDHUNT_RULES.roundSecondsMax, WORDHUNT_RULES.roundSecondsDefault)
    const scaled = command.mode === 'generated' ? Math.round((baseSeconds * targets) / WORDHUNT_RULES.targetCount / 10) * 10 : baseSeconds
    const durationMs = command.durationSeconds === undefined && baseSeconds === 0
      ? 0
      : clampInt(command.durationSeconds ?? scaled, WORDHUNT_RULES.roundSecondsMin, WORDHUNT_RULES.roundSecondsMax, WORDHUNT_RULES.roundSecondsMin) * 1000
    let board: Board
    try {
      if (command.mode === 'fixture') board = fixtureBoard(this.deps.fixture())
      else {
        const words = this.deps.dictionary()
        if (words === undefined) return fail('no-dictionary', 'Il dizionario si sta caricando: riprova tra un momento.')
        if (!words || words.length === 0) return fail('no-dictionary', 'Il dizionario delle parole non è disponibile: usa la griglia di riferimento.')
        board = generateBoard(words, {
          seed: command.seed ?? this.deps.newSeed(),
          targetCount: targets, rows: size.rows, cols: size.cols,
          minWordLength: WORDHUNT_RULES.minWordLength, directions: wordHuntDirections(settings.wordhuntReverse !== false, settings.wordhuntDiagonal !== false),
          // The Tabellone Grande: with many words they are kept short so that all of them, and the avatars, fit.
          maxWordLength: targets > WORDHUNT_RULES.denseTargets ? WORDHUNT_RULES.denseMaxWordLength : WORDHUNT_RULES.maxWordLength,
        })
      }
    } catch (error) {
      if (error instanceof WordHuntGenerationError) return fail('generation-failed', error.message)
      throw error
    }
    const id = this.deps.newId()
    const row = this.deps.store.createRound({ id, roomKey: this.key, mode: command.mode, board, durationMs, now: this.deps.wallNow() })
    this.discard()
    this.board = board
    this.mode = command.mode
    this.roundId = id
    this.roundRow = row
    this.durationMs = durationMs
    for (const t of board.targets) this.byWord.set(t.word, t)
    this.phase = 'ready'
    this.eventSeq++
    this.emitAll()
    return ok
  }

  private start(): WordHuntReply {
    if (this.phase !== 'ready' || !this.board) return fail('wrong-phase', 'Prima crea un round.')
    const countdownMs = clampInt(this.deps.settings(this.key).wordhuntCountdown, 0, WORDHUNT_RULES.countdownSecondsMax, WORDHUNT_RULES.countdownSecondsDefault) * 1000
    if (countdownMs === 0) { this.begin(); return ok }
    this.phase = 'countdown'
    this.countdownEnd = this.deps.monotonicNow() + countdownMs
    this.countdownTimer = this.deps.setTimer(() => { this.countdownTimer = null; this.begin() }, countdownMs)
    this.store((s, row) => s.setStatus(row, 'countdown', this.deps.wallNow()))
    this.eventSeq++
    this.emitAll()
    return ok
  }

  private begin(): void {
    if (this.disposed || (this.phase !== 'ready' && this.phase !== 'countdown')) return
    this.phase = 'active'
    // No limit: the deadline never comes and no timer is set; the round ends with the last word or by the director.
    this.deadline = this.durationMs === 0 ? Number.POSITIVE_INFINITY : this.deps.monotonicNow() + this.durationMs
    if (this.durationMs > 0) this.roundTimer = this.deps.setTimer(() => { this.roundTimer = null; this.finishRound('timeout') }, this.durationMs)
    this.store((s, row) => s.setStatus(row, 'active', this.deps.wallNow()))
    this.eventSeq++
    this.emitAll()
  }

  private finishRound(end: WordHuntEnd): void {
    if (this.phase !== 'active' && this.phase !== 'countdown') return
    this.clearTimers()
    this.paused = false
    this.phase = 'finished'
    this.end = end
    this.foldRound()
    this.store((s, row) => s.setStatus(row, 'finished', this.deps.wallNow(), end))
    this.eventSeq++
    // The next round starts by itself after the pause, which is the time to look at the board that is over.
    const pause = clampInt(this.deps.settings(this.key).wordhuntPauseSeconds, WORDHUNT_RULES.pauseSecondsMin, WORDHUNT_RULES.pauseSecondsMax, WORDHUNT_RULES.pauseSecondsDefault)
    this.scheduleAuto(pause * 1000)
    this.emitAll()
  }

  // ---- The rounds that start by themselves ----

  // Called when the room is opened (the game is chosen): the first round is made a moment later.
  kick(): void {
    if (this.phase === 'idle') this.scheduleAuto(WORDHUNT_RULES.autoStartDelayMs)
  }

  // The dictionary has just been read: the dashboards learn that a generated board can be made.
  dictionaryLoaded(): void { this.publish(true) }

  // A setting changed, or the game was resumed: if nothing is waiting between two rounds, look again soon.
  settingsChanged(): void {
    if ((this.phase === 'idle' || this.phase === 'finished') && this.autoTimer === null) this.scheduleAuto(1000)
  }

  private scheduleAuto(ms: number): void {
    if (this.autoTimer !== null) this.deps.clearTimer(this.autoTimer)
    this.autoTimer = null
    this.nextAt = 0
    if (this.disposed || this.autoHold || !this.deps.autoplay(this.key)) return
    this.nextAt = this.deps.monotonicNow() + ms
    this.autoTimer = this.deps.setTimer(() => { this.autoTimer = null; this.nextAt = 0; this.autoCycle() }, ms)
  }

  // Makes a round and starts it: a generated Tabellone Grande, or the reference board when there is no dictionary. A failure is told to
  // the director and stops the automatism (it does not retry in a loop).
  private autoCycle(): void {
    if (this.disposed || this.autoHold || !this.deps.autoplay(this.key)) return
    if (this.phase !== 'idle' && this.phase !== 'finished' && this.phase !== 'ready') return
    // The dictionary is read off the main thread: the first round waits for it (a few seconds at most), then uses the reference board.
    const words = this.deps.dictionary()
    if (words === undefined && ++this.dictionaryWaits <= 60) { this.scheduleAuto(500); return }
    try {
      let made = this.createRound({ type: 'create-round', expectedVersion: this.version, mode: words?.length ? 'generated' : 'fixture' })
      if (!made.ok && made.error === 'generation-failed') made = this.createRound({ type: 'create-round', expectedVersion: this.version, mode: 'fixture' })
      if (!made.ok) throw new Error(made.message)
      const started = this.start()
      if (!started.ok) throw new Error(started.message)
    } catch (error) {
      this.deps.log('error', 'wordhunt: round automatico non avviato', { error: String(error) })
      this.deps.issue(this.key, 'ZeroWordHunt: il round automatico non è partito. Crealo a mano dalla regia.')
      this.autoHold = true
      this.emitAll()
    }
  }

  // §8.4: a correction frees one word with a reason that stays in the log; it never names a winner.
  private revoke(target: number, reason: string): WordHuntReply {
    if (this.phase !== 'active') return fail('wrong-phase', 'Si può correggere solo con il round in corso.')
    const held = this.held.get(target)
    if (!held) return fail('not-found', 'Questa parola non è stata ancora assegnata.')
    const text = reason.replace(/\s+/g, ' ').trim().slice(0, WORDHUNT_RULES.maxReasonChars)
    if (!text) return fail('bad-input', 'Serve un motivo.')
    if (!this.deps.store.revoke(this.roundRow!, target, text, this.deps.wallNow())) return fail('unavailable', 'La correzione non è stata registrata.')
    this.held.delete(target)
    if (this.lastClaim?.target === target) this.lastClaim = null
    this.notice = `Parola ${held.target.word} riaperta dalla regia.`
    this.eventSeq++
    this.emitAll()
    return ok
  }

  pause(on: boolean): void {
    if (!on) this.settingsChanged() // the game is resumed between two rounds: the next one is waited for again
    if (this.disposed || this.phase !== 'active' || this.paused === on) return
    const now = this.deps.monotonicNow()
    if (this.durationMs === 0) { this.paused = on; this.emitAll(); return } // no clock to stop
    if (on) {
      this.pausedRemaining = Math.max(0, this.deadline - now)
      this.clearRoundTimer()
      this.paused = true
    } else {
      this.deadline = now + this.pausedRemaining
      this.roundTimer = this.deps.setTimer(() => { this.roundTimer = null; this.finishRound('timeout') }, this.pausedRemaining)
      this.paused = false
    }
    this.emitAll()
  }

  // The store never stops the room: a failed write is logged and shown to the director, the round goes on.
  private store(write: (store: WordHuntStore, row: number) => void): void {
    if (this.roundRow === null) return
    try { write(this.deps.store, this.roundRow) } catch (error) {
      this.deps.log('error', 'wordhunt: stato non salvato', { error: String(error) })
      this.deps.issue(this.key, 'ZeroWordHunt: lo stato del round non è stato salvato. Controlla il registro del server.')
    }
  }

  private discard(): void {
    // A board made and never started is closed in the store as abandoned.
    if (this.phase === 'ready') this.store((s, row) => s.setStatus(row, 'abandoned', this.deps.wallNow(), 'abandoned'))
    this.clearTimers()
    this.board = null
    this.mode = null
    this.roundId = null
    this.roundRow = null
    this.end = null
    this.durationMs = 0
    this.paused = false
    this.notice = null
    this.lastClaim = null
    this.foldRound() // a round closed by hand still counts for the session
    this.held.clear()
    this.roundFolded = false
    this.byWord.clear()
    this.participants.clear()
    this.seenKeys = new Set()
    this.windows.clear()
    this.storedGuesses = 0
    this.sequence = 0
    this.metrics = { received: 0, ignored: {}, guesses: 0, overflow: 0 }
    this.phase = 'idle'
  }

  dispose(): void {
    if (this.disposed) return
    if (this.phase === 'ready' || this.phase === 'countdown' || this.phase === 'active') this.store((s, row) => s.setStatus(row, 'abandoned', this.deps.wallNow(), 'abandoned'))
    this.disposed = true
    this.clearTimers()
  }

  private clearRoundTimer(): void {
    if (this.roundTimer !== null) this.deps.clearTimer(this.roundTimer)
    this.roundTimer = null
  }

  private clearTimers(): void {
    this.clearRoundTimer()
    if (this.autoTimer !== null) this.deps.clearTimer(this.autoTimer)
    this.autoTimer = null
    this.nextAt = 0
    if (this.countdownTimer !== null) this.deps.clearTimer(this.countdownTimer)
    this.countdownTimer = null
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer)
    this.retryTimer = null
    this.pending.length = 0
    if (this.emitTimer !== null) this.deps.clearTimer(this.emitTimer)
    this.emitTimer = null
  }

  private bump(): void { this.version++ }

  private emitAll(): void {
    this.bump()
    this.publish(true)
  }

  // At most one state every 200 ms; a change of phase or a claim goes out at once.
  private publish(immediate: boolean): void {
    if (this.disposed) return
    const now = this.deps.monotonicNow()
    const send = () => {
      this.emitTimer = null
      if (this.disposed) return
      this.lastEmit = this.deps.monotonicNow()
      this.deps.emitPublic(this.key, this.state())
      this.deps.emitAdmin(this.key, this.admin())
    }
    if (immediate || now - this.lastEmit >= WORDHUNT_RULES.emitEveryMs) {
      if (this.emitTimer !== null) { this.deps.clearTimer(this.emitTimer); this.emitTimer = null }
      send()
    } else if (this.emitTimer === null) this.emitTimer = this.deps.setTimer(send, WORDHUNT_RULES.emitEveryMs - (now - this.lastEmit))
  }

  publishNow(): void { this.publish(true) }
}

export class WordHuntRooms {
  private readonly rooms = new Map<string, WordHuntRoom>()
  constructor(private readonly deps: WordHuntDeps) {}

  open(key: string): WordHuntRoom {
    let room = this.rooms.get(key)
    if (!room) {
      room = new WordHuntRoom(key, this.deps)
      this.rooms.set(key, room)
      room.kick()
    }
    return room
  }
  get(key: string): WordHuntRoom | undefined { return this.rooms.get(key) }
  close(key: string): void {
    const room = this.rooms.get(key)
    this.rooms.delete(key)
    room?.dispose()
  }
  dictionaryLoaded(): void { for (const room of this.rooms.values()) room.dictionaryLoaded() }
  closeAll(): void {
    const errors: unknown[] = []
    for (const room of this.rooms.values()) {
      try { room.dispose() } catch (error) { errors.push(error) }
    }
    this.rooms.clear()
    if (errors.length) throw new AggregateError(errors, 'Chiusura delle partite di ZeroWordHunt incompleta')
  }
}
