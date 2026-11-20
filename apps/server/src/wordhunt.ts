// ZeroWordHunt's rooms: the coordinator that owns the timers, the order of the messages, the limits and the state in memory.
// The server alone decides who found a word first (spec §7.3): the first valid message that ARRIVES here, in arrival order
// (`receiveSequence`), takes the word; the claim is saved before it is published (§9.4) and the table refuses a second holder.
// The public state never holds a target that is not found, its path or its avatar cell (§10.3): only the admin state has them.
// Nothing here awaits: every write is a short synchronous transaction.
import {
  WORDHUNT_RULES, WORDHUNT_SIZES, wordHuntDirections, WORDHUNT_SIZE_DEFAULT, isWordHuntSize, wordHuntPoints,
  WORDHUNT_HINT_TIERS, WORDHUNT_HINT_WAIT_MS, parseWordHuntHintTiers, wordHuntLastHintStage, type WordHuntHint, type WordHuntSize,
  type GameSettings, type Viewer, type WordHuntAdminState, type WordHuntAdminTarget, type WordHuntClaim, type WordHuntCommand, type WordHuntEnd,
  type WordHuntErrorCode, type WordHuntLeader, type WordHuntMode, type WordHuntPhase, type WordHuntPublicState, type WordHuntReply, type WordHuntSound, type WordHuntWinner,
} from '@zerocade/shared'
import { RoomParticipants } from './gameRooms.js'
import { availableTopics } from './wordhunt-topics.js'
import {
  WordHuntGenerationError, cellName, fixtureBoard, generateBoard, nextColor, normalizeGuess, seededRandom,
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
  emitSound(key: string, sound: WordHuntSound): void
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

interface Pending { target: BoardTarget; winner: WordHuntWinner; color: string; points: number; seq: number; activeAt: number; input: ClaimInput; tries: number }
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
  private startingLevel: WordHuntSize | null = null
  private nextLevel: WordHuntSize | null = null
  private level: WordHuntSize | null = null
  private activeStart = 0
  private teamTime: WordHuntPublicState['teamTime'] = null
  private topic: string | null = null
  private topicPair: ReturnType<typeof availableTopics> = []
  private ballotRound = 0
  private readonly voters = new Map<string, 0 | 1>()
  private votes: [number, number] = [0, 0]
  private pausedAt = 0
  private pausedTotalMs = 0
  private penultimateAt: number | null = null
  private lastWordMs: number | null = null
  private timedFinishes = 0
  private totalLastWordMs = 0
  private deadline = 0 // monotonic deadline of the countdown or active round
  private paused = false
  private pausedRemaining = 0
  private roundTimer: unknown = null
  private hint: WordHuntHint | null = null
  private hintTimer: unknown = null
  private hintDue = 0
  private hintWait = WORDHUNT_HINT_WAIT_MS
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
  private pendingEnd: WordHuntEnd | null = null
  private retryTimer: unknown = null
  private readonly userColors = new Map<string, string>() // every player keeps one colour for the whole session
  private roundFolded = false
  private metrics = { received: 0, ignored: {} as Record<string, number>, guesses: 0, overflow: 0 }

  constructor(private readonly key: string, private readonly deps: WordHuntDeps,
    private readonly records = new Map<WordHuntSize, number>()) {}

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
    const others = [...this.held.values(), ...this.pending].filter((h) => h.winner.id !== id).sort((a, b) => a.seq - b.seq).map((h) => h.color)
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
    if (this.phase === 'countdown' || this.phase === 'active') {
      if (!Number.isFinite(this.deadline)) return 0
      return this.paused ? this.pausedRemaining : Math.max(0, this.deadline - now)
    }
    if (this.phase === 'ready') return this.durationMs
    return 0
  }

  state(): WordHuntPublicState {
    const board = this.board
    const claims = [...this.held.values()].sort((a, b) => a.seq - b.seq).map((h) => this.claimOf(h))
    return {
      version: this.version, eventSeq: this.eventSeq, roundId: this.roundId, phase: this.phase, mode: this.mode,
      topic: this.topic, teamTime: this.teamTime && { ...this.teamTime },
      ballot: this.topicPair.length ? { options: [this.topicPair[0]!.name, this.topicPair[1]!.name], votes: [...this.votes] } : null,
      rows: board?.rows ?? WORDHUNT_RULES.rows, cols: board?.cols ?? WORDHUNT_RULES.cols,
      letters: board ? board.letters.map((line) => line.join('')) : [],
      total: board?.targets.length ?? 0, found: this.held.size, claims, paused: this.paused, hint: this.hint,
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
      state: this.state(), level: this.level, seed: board?.seed ?? null, checksum: board?.checksum ?? null, targets,
      decoys: (board?.decoys ?? []).map((d) => ({ word: d.word, cells: d.cells.map(cellName) })),
      dictionaryReady: (this.deps.dictionary()?.length ?? 0) > 0, auto: !this.autoHold && this.deps.autoplay(this.key),
      metrics: { ...this.metrics, ignored: { ...this.metrics.ignored }, lastWordMs: this.lastWordMs, timedFinishes: this.timedFinishes,
        meanLastWordMs: this.timedFinishes ? this.totalLastWordMs / this.timedFinishes : null },
    }
  }

  // The messages are comments of an active round: ZeroFollowerBot's voice need not read them.
  listening(): boolean { return this.phase === 'active' && !this.paused && this.pendingEnd === null }

  // ---- The chat ----

  offer(m: WordHuntMessage): void {
    if (this.disposed) return
    if (this.phase === 'finished' && this.topicPair.length) {
      const choice = m.text.trim()
      if ((choice === '1' || choice === '2') && m.user.id && !m.user.id.endsWith(':anonymous') && this.deps.allowed(this.key, m.user)) {
        const index = choice === '1' ? 0 : 1
        const prev = this.voters.get(m.user.id)
        if (prev === index || (prev === undefined && this.voters.size >= WORDHUNT_RULES.maxParticipants)) return
        if (prev !== undefined) this.votes[prev]--
        this.voters.set(m.user.id, index)
        this.votes[index]++
        this.publish(false)
      }
      return
    }
    const ignore = (why: Ignored) => { this.metrics.ignored[why] = (this.metrics.ignored[why] ?? 0) + 1; if (this.phase === 'active') this.publish(false) }
    this.metrics.received++
    if (!this.listening() || !this.board) return ignore('not-listening')
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
    // A claim waiting for the database to be free (below) already owns its word: whoever writes it after is late.
    if (this.pending.some((p) => p.target.id === target.id)) return ignore('already-claimed')
    const color = this.colorFor(winner.id)
    const points = wordHuntPoints(target.word.length)
    const claim: Pending = { target, winner, color, points, seq, activeAt: now - this.pausedTotalMs, input: {
      roundRow: this.roundRow!, targetSeq: target.id, viewer: winner, platform: m.platform, messageKey, guess, receivedMs: Math.round(now),
      receiveSeq: seq, color, points, wallMs: this.deps.wallNow(),
    }, tries: 0 }
    this.pending.push(claim)
    if (this.pending.length === 1) this.drainClaims()
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
        return 'busy'
      }
      this.deps.log('error', 'wordhunt: parola non salvata', { error: String(error), tries: c.tries })
      this.deps.issue(this.key, 'ZeroWordHunt: una parola trovata non è stata salvata e non è stata assegnata. Controlla il registro del server.')
      return 'failed'
    }
  }

  private drainClaims(): void {
    while (this.pending.length) {
      const claim = this.pending[0]!
      const result = this.tryClaim(claim)
      if (result === 'busy') {
        this.retryTimer = this.deps.setTimer(() => { this.retryTimer = null; this.drainClaims() }, CLAIM_RETRY_MS)
        return
      }
      this.pending.shift()
      if (result === 'ok') this.confirm(claim)
      else {
        const why = result === 'lost' ? 'already-claimed' : 'storage'
        this.metrics.ignored[why] = (this.metrics.ignored[why] ?? 0) + 1
        this.publish(false)
      }
    }
    if (this.pendingEnd !== null) this.finishRound(this.pendingEnd)
  }

  private confirm(c: Pending): void {
    const { target, winner, color, points, seq } = c
    const held: Held = { target, winner, color, points, seq }
    this.held.set(target.id, held)
    const left = this.board!.targets.length - this.held.size
    if (left === 0 && this.teamTime) {
      const elapsedMs = Math.max(0, Math.round(c.activeAt - this.activeStart))
      const previous = this.teamTime.bestMs
      const improved = previous === null || elapsedMs < previous
      const bestMs = improved ? elapsedMs : previous
      this.records.set(this.teamTime.level, bestMs)
      this.teamTime = { level: this.teamTime.level, bestMs, elapsedMs, improved }
    }
    if (left === 1) this.penultimateAt = c.activeAt
    if (left === 0 && this.penultimateAt !== null) {
      this.lastWordMs = Math.round(c.activeAt - this.penultimateAt)
      this.totalLastWordMs += this.lastWordMs
      this.timedFinishes++
    }
    this.resetHint()
    this.lastClaim = this.claimOf(held)
    this.eventSeq++
    this.bump()
    this.publish(true)
    this.deps.emitSound(this.key, 'found')
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
    this.syncProgression(settings)
    const level = command.mode === 'generated' && !command.size ? this.nextLevel : null
    const size = WORDHUNT_SIZES[command.size ?? level ?? (isWordHuntSize(settings.wordhuntSize) ? settings.wordhuntSize : WORDHUNT_SIZE_DEFAULT)]
    const targets = clampInt(command.targetCount, WORDHUNT_RULES.targetMin, WORDHUNT_RULES.targetMax, size.words)
    // 0 seconds is no limit (the default); otherwise the setting is the time for 24 words.
    const baseSeconds = settings.wordhuntSeconds === 0 ? 0 : clampInt(settings.wordhuntSeconds, WORDHUNT_RULES.roundSecondsMin, WORDHUNT_RULES.roundSecondsMax, WORDHUNT_RULES.roundSecondsDefault)
    const scaled = command.mode === 'generated' ? Math.round((baseSeconds * targets) / WORDHUNT_RULES.targetCount / 10) * 10 : baseSeconds
    const durationMs = command.durationSeconds === undefined && baseSeconds === 0
      ? 0
      : clampInt(command.durationSeconds ?? scaled, WORDHUNT_RULES.roundSecondsMin, WORDHUNT_RULES.roundSecondsMax, WORDHUNT_RULES.roundSecondsMin) * 1000
    let board: Board
    const topic = command.mode === 'generated' ? this.winningTopic() : null
    try {
      if (command.mode === 'fixture') board = fixtureBoard(this.deps.fixture())
      else {
        const words = this.deps.dictionary()
        if (words === undefined) return fail('no-dictionary', 'Il dizionario si sta caricando: riprova tra un momento.')
        if (!words || words.length === 0) return fail('no-dictionary', 'Il dizionario delle parole non è disponibile: usa la griglia di riferimento.')
        board = generateBoard(topic?.words ?? words, {
          seed: command.seed ?? this.deps.newSeed(),
          targetCount: targets, rows: size.rows, cols: size.cols,
          minWordLength: WORDHUNT_RULES.minWordLength,
          directions: level ? wordHuntDirections(level === 'large', level !== 'quick') :
            wordHuntDirections(settings.wordhuntReverse !== false, settings.wordhuntDiagonal !== false),
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
    this.topic = topic?.name ?? null
    this.level = level
    this.teamTime = level && targets === size.words ? { level, bestMs: this.records.get(level) ?? null, elapsedMs: null, improved: false } : null
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
    this.startClock(countdownMs)
    this.store((s, row) => s.setStatus(row, 'countdown', this.deps.wallNow()))
    this.eventSeq++
    this.emitAll()
    return ok
  }

  private startClock(ms: number): void {
    this.deadline = this.deps.monotonicNow() + ms
    if (!Number.isFinite(ms)) return // unlimited round
    this.roundTimer = this.deps.setTimer(() => {
      this.roundTimer = null
      if (this.phase === 'countdown') this.begin()
      else this.finishRound('timeout')
    }, ms)
  }

  private begin(): void {
    if (this.disposed || (this.phase !== 'ready' && this.phase !== 'countdown')) return
    this.phase = 'active'
    this.activeStart = this.deps.monotonicNow() - this.pausedTotalMs
    if (this.level && this.level === this.nextLevel) this.nextLevel = this.level === 'quick' ? 'standard' : 'large'
    this.startClock(this.durationMs === 0 ? Infinity : this.durationMs)
    this.resetHint()
    this.store((s, row) => s.setStatus(row, 'active', this.deps.wallNow()))
    this.eventSeq++
    this.emitAll()
    this.deps.emitSound(this.key, 'start')
  }

  private finishRound(end: WordHuntEnd): void {
    if (this.phase !== 'active' && this.phase !== 'countdown') return
    this.clearHintTimer()
    this.hint = null
    if (this.pending.length) {
      // Stop accepting answers now; fold scores and start the next round only after every eligible answer has been saved or reported.
      this.pendingEnd ??= end
      this.clearRoundTimer()
      return
    }
    this.pendingEnd = null
    this.clearTimers()
    this.paused = false
    this.phase = 'finished'
    this.end = end
    this.ballotRound++
    this.syncBallot()
    this.foldRound()
    this.store((s, row) => s.setStatus(row, 'finished', this.deps.wallNow(), end))
    this.eventSeq++
    // The next round starts by itself after the pause, which is the time to look at the board that is over.
    const pause = clampInt(this.deps.settings(this.key).wordhuntPauseSeconds, WORDHUNT_RULES.pauseSecondsMin, WORDHUNT_RULES.pauseSecondsMax, WORDHUNT_RULES.pauseSecondsDefault)
    this.scheduleAuto(pause * 1000)
    this.emitAll()
    this.deps.emitSound(this.key, 'complete')
  }

  // ---- The rounds that start by themselves ----

  // Called when the room is opened (the game is chosen): the first round is made a moment later.
  kick(): void {
    if (this.phase === 'idle') this.scheduleAuto(WORDHUNT_RULES.autoStartDelayMs)
  }

  // The dictionary has just been read: the dashboards learn that a generated board can be made.
  dictionaryLoaded(): void { this.syncBallot(); this.publish(true) }

  // A setting changed, or the game was resumed: if nothing is waiting between two rounds, look again soon.
  settingsChanged(): void {
    this.syncProgression(this.deps.settings(this.key))
    if (this.syncBallot()) this.publish(true)
    if (this.phase === 'active' && this.hintThreshold() !== (this.hint?.threshold ?? 0)) {
      this.resetHint()
      this.publish(true)
    }
    if ((this.phase === 'idle' || this.phase === 'finished') && this.autoTimer === null) this.scheduleAuto(1000)
  }

  private syncProgression(settings: GameSettings): void {
    const start = isWordHuntSize(settings.wordhuntProgression) ? settings.wordhuntProgression : null
    if (start !== this.startingLevel) {
      this.startingLevel = start
      this.nextLevel = start
    }
  }

  private clearBallot(): void {
    this.topicPair = []
    this.voters.clear()
    this.votes = [0, 0]
  }

  private syncBallot(): boolean {
    const enabled = this.phase === 'finished' && this.deps.settings(this.key).wordhuntThemeVote === true
    if (!enabled) {
      if (!this.topicPair.length) return false
      this.clearBallot()
      return true
    }
    if (this.topicPair.length) return false
    const topics = availableTopics(this.deps.dictionary() ?? [])
    if (topics.length < 2) return false
    this.topicPair = [topics[(this.ballotRound - 1) % topics.length]!, topics[this.ballotRound % topics.length]!]
    return true
  }

  private winningTopic() {
    const [a, b] = this.votes
    if (a + b === 0) return null
    const index = a === b ? Math.floor(seededRandom(this.roundId!)() * 2) : a > b ? 0 : 1
    return this.topicPair[index]
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
    if (this.phase !== 'active' || this.pendingEnd !== null) return fail('wrong-phase', 'Si può correggere solo con il round in corso.')
    const held = this.held.get(target)
    if (!held) return fail('not-found', 'Questa parola non è stata ancora assegnata.')
    const text = reason.replace(/\s+/g, ' ').trim().slice(0, WORDHUNT_RULES.maxReasonChars)
    if (!text) return fail('bad-input', 'Serve un motivo.')
    if (!this.deps.store.revoke(this.roundRow!, target, text, this.deps.wallNow())) return fail('unavailable', 'La correzione non è stata registrata.')
    this.held.delete(target)
    this.penultimateAt = null
    this.resetHint()
    if (this.lastClaim?.target === target) this.lastClaim = null
    this.notice = `Parola ${held.target.word} riaperta dalla regia.`
    this.eventSeq++
    this.emitAll()
    return ok
  }

  pause(on: boolean): void {
    if (!on) this.settingsChanged() // the game is resumed between two rounds: the next one is waited for again
    if (this.disposed || (this.phase !== 'active' && this.phase !== 'countdown') || this.paused === on) return
    this.paused = on
    if (on) {
      this.pausedAt = this.deps.monotonicNow()
      this.pausedRemaining = Math.max(0, this.deadline - this.deps.monotonicNow())
      this.clearRoundTimer()
      if (this.hintTimer !== null) this.hintWait = Math.max(0, this.hintDue - this.deps.monotonicNow())
      this.clearHintTimer()
    } else {
      this.pausedTotalMs += this.deps.monotonicNow() - this.pausedAt
      this.startClock(this.pausedRemaining)
      this.armHintTimer()
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
    this.teamTime = null
    this.topic = null
    this.clearBallot()
    this.level = null
    this.penultimateAt = null
    this.lastWordMs = null
    this.pausedTotalMs = 0
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
    this.clearHintTimer()
    this.hint = null
    this.clearRoundTimer()
    if (this.autoTimer !== null) this.deps.clearTimer(this.autoTimer)
    this.autoTimer = null
    this.nextAt = 0
    if (this.retryTimer !== null) this.deps.clearTimer(this.retryTimer)
    this.retryTimer = null
    this.pending.length = 0
    if (this.emitTimer !== null) this.deps.clearTimer(this.emitTimer)
    this.emitTimer = null
  }

  private bump(): void { this.version++ }

  private hintThreshold(): number {
    if (!this.board || this.phase !== 'active' || this.pendingEnd !== null) return 0
    const left = this.board.targets.length - this.held.size
    const tiers = parseWordHuntHintTiers(this.deps.settings(this.key).wordhuntHintTiers ?? WORDHUNT_HINT_TIERS)
    return left > 0 ? tiers?.find(t => left <= t.remaining)?.taps ?? 0 : 0
  }

  private resetHint(): void {
    this.clearHintTimer()
    const threshold = this.hintThreshold()
    this.hint = threshold ? { threshold, taps: 0, stage: 0, zone: null } : null
    this.hintWait = WORDHUNT_HINT_WAIT_MS
    this.armHintTimer()
  }

  private clearHintTimer(): void {
    if (this.hintTimer !== null) this.deps.clearTimer(this.hintTimer)
    this.hintTimer = null
  }

  private lastHintStage(): number {
    return wordHuntLastHintStage((this.board?.targets.length ?? 0) - this.held.size)
  }

  private armHintTimer(): void {
    if (!this.hint || this.hint.stage >= this.lastHintStage() || this.paused || this.disposed) return
    this.hintDue = this.deps.monotonicNow() + this.hintWait
    this.hintTimer = this.deps.setTimer(() => {
      this.hintTimer = null
      if (this.deps.monotonicNow() >= this.deadline) return
      this.narrowHint()
      this.publish(true)
    }, this.hintWait)
  }

  private narrowHint(): void {
    const board = this.board
    const hint = this.hint
    const target = board?.targets.find(t => !this.held.has(t.id))
    if (!board || !hint || hint.stage >= this.lastHintStage() || !target) return
    this.clearHintTimer()
    if (hint.stage === 2) {
      this.hint = { ...hint, stage: 3, taps: 0, wordLength: target.word.length }
      return
    }
    const split = Math.ceil(board.rows / 2)
    const upper = target.start.row < split
    const half = { top: upper ? 0 : split, bottom: upper ? split - 1 : board.rows - 1, left: 0, right: board.cols - 1 }
    const stage = hint.stage === 0 ? 1 : 2
    const top = Math.min(half.bottom - 3, half.top + 4 * Math.floor((target.start.row - half.top) / 4))
    const left = Math.min(board.cols - 5, 5 * Math.floor(target.start.col / 5))
    const zone = stage === 1 ? half : { top, bottom: top + 3, left, right: left + 4 }
    this.hint = { threshold: hint.threshold, stage, taps: 0, zone }
    this.hintWait = WORDHUNT_HINT_WAIT_MS
    this.armHintTimer()
  }

  tap(count: number): void {
    if (!this.hint || this.hint.stage >= this.lastHintStage() || !this.listening() || this.deps.monotonicNow() >= this.deadline ||
        !Number.isSafeInteger(count) || count < 1) return
    let available = count
    // A connector can deliver a whole batch of likes in a single event.
    while (this.hint.stage < this.lastHintStage() && available > 0) {
      const needed = this.hint.threshold - this.hint.taps
      if (available < needed) {
        this.hint = { ...this.hint, taps: this.hint.taps + available }
        break
      }
      available -= needed
      this.narrowHint()
    }
    this.publish(false)
  }

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
  private readonly records = new Map<string, Map<WordHuntSize, number>>()
  constructor(private readonly deps: WordHuntDeps) {}

  open(key: string): WordHuntRoom {
    let room = this.rooms.get(key)
    if (!room) {
      const records = this.records.get(key) ?? new Map<WordHuntSize, number>()
      this.records.set(key, records)
      room = new WordHuntRoom(key, this.deps, records)
      this.rooms.set(key, room)
      room.kick()
    }
    return room
  }
  get(key: string): WordHuntRoom | undefined { return this.rooms.get(key) }
  endSession(key: string): void { this.records.get(key)?.clear(); this.records.delete(key) }
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
    this.records.clear()
    if (errors.length) throw new AggregateError(errors, 'Chiusura delle partite di ZeroWordHunt incompleta')
  }
}
