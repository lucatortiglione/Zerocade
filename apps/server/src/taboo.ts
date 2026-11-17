// ZeroTaboo's rooms: the coordinator that owns the timers, the dedup, the limits and the state in memory, and runs the effects of
// the pure machine (taboo-machine.ts): draws from the deck, saves in the store, emits the states. Decisions of the organiser
// (16-17/11/2026): D2 the first message ARRIVED at the server wins; D5 every comment on an active card is an attempt; D6 only
// the competitive platform gets an individual winner; D7 the real match takes the bridge's messages only, the simulator only
// in practice mode; D15/D24 a lost bridge or a pause freezes the timer and marks the exposure as interrupted.
// Nothing here awaits: the writes are short synchronous transactions, one per closed card.
import {
  TABOO_RULES, TABOO_NARRATIVES, TABOO_ROUND_PLANS, TABOO_CATEGORIES,
  type GameSettings, type TabooAdminCard, type TabooAdminState, type TabooCategory, type TabooCommand, type TabooConfig, type TabooErrorCode,
  type TabooLeader, type TabooMode, type TabooOutcome, type TabooPlatform, type TabooPublicState, type TabooReply, type TabooRoundSummary, type Viewer,
} from '@zerocade/shared'
import { RoomParticipants } from './gameRooms.js'
import { matchAnswer, tokenize, type CompiledAnswer } from './taboo-answer.js'
import { availableCategories, drawCard, type Deck, type TabooCard } from './taboo-deck.js'
import { OTHER_WRONG, type TabooStore } from './taboo-db.js'
import {
  DEFAULT_CONFIG, initialState, remainingAt, skipsLeft, streakOf, transition, type Effect, type MachineInput, type MatchState,
} from './taboo-machine.js'
import { rankPlayers, scoreRound, tally, type Win } from './taboo-scoring.js'

export interface TabooDeps {
  store: TabooStore
  deck(): Deck // throws when the deck is not there
  monotonicNow(): number // durations, deadlines, the 2 s limit: never the civil clock (DIRETTIVE §6)
  wallNow(): number // the instants saved in the records and the logs
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  random(): number
  newId(): string
  emitPublic(key: string, state: TabooPublicState): void
  emitAdmin(key: string, admin: TabooAdminState): void
  bridgeReady(key: string): boolean
  allowed(key: string, user: Viewer): boolean // "Chi può giocare"
  settings(key: string): GameSettings
  issue(key: string, message: string): void // the dashboard's runtime:issue
  log(level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void
}

// A chat message as the room takes it: from the bridge (id of the message, `platform:id` user) or, in practice mode, the simulator.
export interface TabooMessage {
  source: 'bridge' | 'simulator'
  user: Viewer
  text: string
  messageId: string // '' when the source has none
  platform: TabooPlatform
}

type Ignored = 'not-listening' | 'late' | 'source' | 'host' | 'audience' | 'duplicate' | 'cooldown' | 'multiple' | 'invalid' | 'wrong' | 'limit'

const fail = (error: TabooErrorCode, message: string): TabooReply => ({ ok: false, error, message })
const ok: TabooReply = { ok: true }
const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

export class TabooRoom {
  private ms: MatchState = initialState()
  private disposed = false
  private readonly abort = new AbortController()
  private roundTimer: unknown = null
  private emitTimer: unknown = null
  private lastEmit = -Infinity
  private deckData: Deck | null = null
  private compiled: CompiledAnswer | null = null
  private rowMatch: number | null = null
  private readonly rowRound = new Map<number, number>()
  private readonly rowExposure = new Map<number, number>()
  private readonly cards = new Map<number, TabooCard>() // the card of each exposure, by the machine's exposure number
  private used = new Set<string>()
  private recent = new Set<string>()
  private wins: (Win & { exposure: number; round: number })[] = []
  private lastWinner: TabooPublicState['lastWinner'] = null
  private revealed: TabooPublicState['revealed'] = null
  private summary: TabooRoundSummary | null = null
  private correction: string | null = null
  private notice: string | null = null
  private pendingWinner: { user: Viewer; platform: TabooPlatform; receivedMs: number; messageKey: string | null; alias: string | null } | null = null
  private intermissionUntil = 0
  private votes = new Map<string, TabooCategory>()
  private depth = 0
  private pendingCache: { id: number; exposure: number | null; reason: string; at: number }[] | null = null // reports waiting; read from the store once, not on every emission
  // Per match and per exposure: bounded by construction (DIRETTIVE §3, §5).
  private readonly participants = new RoomParticipants(10_000)
  private seenKeys = new Set<string>()
  private lastAttempt = new Map<string, number>()
  private activeGuessers = new Set<string>()
  private guessCount = 0
  private wrong = new Map<string, number>()
  private readonly roundMessages = new Map<string, Set<number>>()
  private metrics = { received: 0, ignored: {} as Record<string, number>, closed: { solved: 0, skipped: 0, taboo: 0, round_timeout: 0 } as Record<TabooOutcome, number>, overflow: 0 }

  constructor(private readonly key: string, private readonly deps: TabooDeps) {}

  // ---- Reads (copies: what is emitted is never an array this room goes on changing, DIRETTIVE §6) ----

  state(): TabooPublicState {
    const ms = this.ms
    const now = this.deps.monotonicNow()
    const active = ms.active
    const plan = TABOO_ROUND_PLANS.find((p) => p.number === ms.round)
    const card = active ? this.cards.get(active.exposure) : undefined
    const ranked = rankPlayers(tally(this.wins)).slice(0, 10)
    return {
      version: ms.version, matchId: ms.matchId, phase: ms.phase, round: ms.round, rounds: TABOO_RULES.rounds, roundKind: plan?.kind ?? null,
      narrative: ms.chosenNarrative, category: active?.card.category ?? ms.chosenCategory, difficulty: active?.card.difficulty ?? null,
      team: ms.team, threshold: ms.config.threshold, reachedThreshold: ms.reachedThreshold !== null, streak: streakOf(ms), skipsLeft: skipsLeft(ms),
      remainingMs: remainingAt(ms, now), serverNow: this.deps.wallNow(),
      // D26: the five words the streamer cannot say are shown; the target and the aliases are not.
      forbidden: card ? [...card.taboo] : [],
      jackpot: active?.jackpot ?? false, sung: active?.sung ?? false, interrupted: ms.phase === 'suspended' || (active?.interrupted ?? false),
      lastWinner: this.lastWinner ? { ...this.lastWinner, user: this.lastWinner.user ? { ...this.lastWinner.user } : null } : null,
      revealed: this.revealed ? { ...this.revealed } : null,
      leaders: ranked.map((r): TabooLeader => ({ id: r.id, nickname: r.nickname, ...(r.avatar ? { avatar: r.avatar } : {}), solved: r.solved, hard: r.hard, medium: r.medium, place: r.place })),
      roundSummary: this.summary ? { ...this.summary, topGuessers: this.summary.topGuessers.map((g) => ({ ...g })) } : null,
      correction: this.correction, notice: this.notice, platform: ms.config.platform, mode: ms.config.mode,
    }
  }

  admin(): TabooAdminState {
    const ms = this.ms
    const now = this.deps.monotonicNow()
    const card = ms.active ? this.cards.get(ms.active.exposure) : undefined
    const adminCard: TabooAdminCard | null = ms.active && card
      ? { exposure: ms.active.exposure, code: card.code, revision: card.revision, target: card.target, taboo: [...card.taboo], aliases: [...card.aliases], difficulty: card.difficulty, category: card.category }
      : null
    const open = ms.phase === 'round' && ms.active !== null
    return {
      state: this.state(), card: adminCard,
      reports: this.pending().map((r) => ({ id: r.id, exposure: this.machineExposure(r.exposure) ?? 0, reason: r.reason, at: r.at, status: 'pending' as const })),
      recent: ms.rounds.flatMap((r) => r.cards.map((c) => ({
        round: r.number, exposure: c.exposure, target: this.cards.get(c.exposure)?.target ?? '', outcome: c.outcome,
        winner: this.wins.find((w) => w.exposure === c.exposure)?.nickname ?? null,
      }))).slice(-10).reverse(),
      warnings: this.deckData ? [...this.deckData.warnings] : [],
      bridgeReady: this.deps.bridgeReady(this.key),
      canStartRound: ms.phase === 'intermission' && (ms.round === 1 || now >= this.intermissionUntil),
      canSing: open && !ms.sungUsed && !ms.active!.jackpot && ms.deadline - now <= TABOO_RULES.sungWindowMs,
      metrics: { received: this.metrics.received, ignored: { ...this.metrics.ignored }, closed: { ...this.metrics.closed }, overflow: this.metrics.overflow },
    }
  }

  private pending(): { id: number; exposure: number | null; reason: string; at: number }[] {
    if (this.rowMatch === null) return []
    if (this.pendingCache === null) {
      try { this.pendingCache = this.deps.store.pendingReports(this.rowMatch) } catch (error) {
        this.deps.log('error', 'taboo: segnalazioni non lette', { error: String(error) })
        return []
      }
    }
    return this.pendingCache
  }

  // The messages are comments of an active card: ZeroFollowerBot's voice need not read them (D22).
  listening(): boolean {
    return this.ms.phase === 'round' && this.ms.active !== null
  }

  // ---- The chat ----

  offer(m: TabooMessage): void {
    if (this.disposed) return
    const ms = this.ms
    // The counters reach the director's panel with the coalesced emission (at most every 200 ms), not one send per comment.
    const ignore = (why: Ignored) => { this.metrics.ignored[why] = (this.metrics.ignored[why] ?? 0) + 1; this.publish(false) }
    // The vote of round 3: a letter A-F in the interval, one per user, the last one counts.
    if (ms.phase === 'intermission' && TABOO_ROUND_PLANS[ms.round - 1]?.votesCategory) {
      this.vote(m)
      return
    }
    this.metrics.received++
    if (ms.phase !== 'round' || !ms.active || !this.compiled) return ignore('not-listening')
    // D7: the real match listens to the bridge only; the simulator only plays practice matches.
    if ((ms.config.mode === 'standard') !== (m.source === 'bridge')) return ignore('source')
    const now = this.deps.monotonicNow()
    if (now >= ms.deadline) return ignore('late') // I7: the deadline, not the timer
    if (m.user.host === true) return ignore('host') // the streamer cannot answer his own card (§2)
    if (!m.user.id || m.user.id.endsWith(':anonymous')) return ignore('invalid')
    if (!this.deps.allowed(this.key, m.user)) return ignore('audience')
    if (!this.participants.accept(m.user.id, (text) => this.deps.issue(this.key, text))) return ignore('limit')
    const messageKey = m.messageId ? `${m.platform}:${m.messageId}` : null
    if (messageKey) {
      if (this.seenKeys.has(messageKey)) return ignore('duplicate')
      if (this.seenKeys.size < TABOO_RULES.maxSeenMessageKeys) this.seenKeys.add(messageKey)
      else this.metrics.overflow++
    }
    // D5: every comment on an active card is an attempt, one per user every 2 s from the reception; one that comes sooner
    // does not count and does not move the window.
    const last = this.lastAttempt.get(m.user.id)
    if (last !== undefined && now - last < TABOO_RULES.guessCooldownMs) return ignore('cooldown')
    this.lastAttempt.set(m.user.id, now)
    this.guessCount++
    this.activeGuessers.add(m.user.id)
    this.noteVoice(m.user.id)
    const verdict = matchAnswer(m.text, this.compiled)
    if (verdict.kind === 'invalid') return ignore('invalid')
    if (verdict.kind === 'multiple') return ignore('multiple')
    if (verdict.kind === 'none') {
      // Wrong answers only aggregated, without the user (D16); the cap is the store's.
      // The map is capped here, before it grows (DIRETTIVE §3): a new text beyond the cap is counted in "(altro)".
      const typed = tokenize(m.text).join(' ').slice(0, TABOO_RULES.wrongAnswerChars)
      const text = typed && !this.wrong.has(typed) && this.wrong.size >= TABOO_RULES.maxWrongAnswerTexts - 1 ? OTHER_WRONG : typed
      if (text) this.wrong.set(text, (this.wrong.get(text) ?? 0) + 1)
      return ignore('wrong')
    }
    // D6: the individual winner only on the competitive platform; the other closes the card for the team.
    const eligible = m.platform === ms.config.platform
    this.pendingWinner = eligible ? { user: m.user, platform: m.platform, receivedMs: Math.round(now), messageKey, alias: verdict.via } : null
    const t = this.apply({ type: 'answer', matchId: ms.matchId!, now, exposure: ms.active.exposure, winner: eligible ? m.user.id : null })
    if (t.ignored) this.pendingWinner = null
  }

  private noteVoice(userId: string): void {
    const rounds = this.roundMessages.get(userId) ?? new Set<number>()
    rounds.add(this.ms.round)
    this.roundMessages.set(userId, rounds)
  }

  private vote(m: TabooMessage): void {
    if (this.ms.config.mode === 'standard' && m.source !== 'bridge') return
    if (m.user.host === true || !this.deps.allowed(this.key, m.user)) return
    const letter = tokenize(m.text).join('').toUpperCase()
    if (letter.length !== 1 || !TABOO_CATEGORIES.some((c) => c.code === letter)) return
    if (!this.participants.accept(m.user.id, (text) => this.deps.issue(this.key, text))) return
    this.votes.set(m.user.id, letter as TabooCategory)
    this.publish(false)
  }

  // ---- The commands of the director ----

  // Never throws: an unexpected error (a failed read or write) becomes a typed reply the director can read (DIRETTIVE §7).
  control(command: TabooCommand): TabooReply {
    try { return this.run(command) } catch (error) {
      this.deps.log('error', 'taboo: comando non eseguito', { type: command.type, error: String(error) })
      return fail('unavailable', 'Errore inatteso: controlla il registro del server prima di ripetere.')
    }
  }

  private run(command: TabooCommand): TabooReply {
    if (this.disposed) return fail('unavailable', 'La stanza è chiusa.')
    if (command.expectedVersion !== this.ms.version) return fail('stale-version', 'Il comando si riferisce a uno stato vecchio: riprova.')
    const ms = this.ms
    const mid = ms.matchId ?? ''
    const now = this.deps.monotonicNow()
    switch (command.type) {
      case 'start-match': return this.startMatch(command)
      case 'start-round': return this.startRound(now)
      case 'skip': return this.result(this.apply({ type: 'skip', matchId: mid, now, exposure: command.exposure }))
      case 'taboo': return this.result(this.apply({ type: 'taboo', matchId: mid, now, exposure: command.exposure }))
      case 'sing': return this.result(this.apply({ type: 'sing', matchId: mid, now, exposure: command.exposure }))
      case 'category': return this.result(this.apply({ type: 'set-category', matchId: mid, category: command.category }))
      case 'pause': return this.result(this.apply({ type: 'suspend', matchId: mid, now }))
      case 'resume':
        if (ms.config.mode === 'standard' && !this.deps.bridgeReady(this.key)) return fail('bridge-missing', 'Collega ZeroFollowerBot prima di riprendere.')
        this.notice = null
        return this.result(this.apply({ type: 'resume', matchId: mid, now }))
      case 'cancel': return this.result(this.apply({ type: 'cancel', matchId: mid }))
      case 'dismiss': return this.result(this.apply({ type: 'dismiss', matchId: mid }))
      case 'report': return this.report(command)
      case 'decide': return this.decide(command)
    }
  }

  // The generic "pause" button of the dashboard (D24): a technical suspension, the timer frozen.
  pause(on: boolean): void {
    const ms = this.ms
    if (!ms.matchId) return
    if (on) this.apply({ type: 'suspend', matchId: ms.matchId, now: this.deps.monotonicNow() })
    else if (ms.config.mode !== 'standard' || this.deps.bridgeReady(this.key)) {
      this.notice = null
      this.apply({ type: 'resume', matchId: ms.matchId, now: this.deps.monotonicNow() })
    }
  }

  // D15: a lost bridge freezes a round in play; the director resumes when it is back.
  bridgeChanged(): void {
    const ms = this.ms
    if (ms.config.mode !== 'standard' || !ms.matchId) return
    if ((ms.phase === 'round' || ms.phase === 'intermission') && !this.deps.bridgeReady(this.key)) {
      this.notice = 'Pausa tecnica: il ponte ZeroFollowerBot si è scollegato.'
      this.apply({ type: 'suspend', matchId: ms.matchId, now: this.deps.monotonicNow() })
    } else this.publish(false)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.abort.abort()
    this.clearRoundTimer()
    if (this.emitTimer !== null) this.deps.clearTimer(this.emitTimer)
    this.emitTimer = null
    // A match in play is closed as cancelled if the write succeeds: a restart cannot resume it.
    if (this.rowMatch !== null && (this.ms.phase === 'round' || this.ms.phase === 'intermission' || this.ms.phase === 'suspended')) {
      try { this.deps.store.setMatchStatus(this.rowMatch, 'cancelled', this.deps.wallNow()) } catch (error) { this.deps.log('warn', 'taboo: chiusura della partita non scritta', { error: String(error) }) }
    }
  }

  // ---- Commands in detail ----

  private startMatch(c: Extract<TabooCommand, { type: 'start-match' }>): TabooReply {
    if (this.ms.phase !== 'setup') return fail('wrong-phase', 'Una partita è già in corso.')
    const mode: TabooMode = c.mode === 'practice' ? 'practice' : 'standard'
    if (mode === 'standard' && !this.deps.bridgeReady(this.key)) return fail('bridge-missing', 'Collega ZeroFollowerBot: la partita vera usa solo i messaggi del suo ponte.')
    let deck: Deck
    try { deck = this.deps.deck() } catch (error) { this.deps.log('error', 'taboo: mazzo non disponibile', { error: String(error) }); return fail('unavailable', 'Il mazzo di ZeroTaboo non è disponibile.') }
    if (deck.cards.length < 20) return fail('unavailable', 'Il mazzo non ha abbastanza carte valide.')
    // The configuration is a snapshot of the settings at this moment: it does not change during the match (I10).
    const settings = this.deps.settings(this.key)
    const config: TabooConfig = {
      threshold: clampInt(c.threshold ?? settings.tabooThreshold, TABOO_RULES.thresholdMin, TABOO_RULES.thresholdMax, TABOO_RULES.thresholdDefault),
      platform: (c.platform ?? settings.tabooPlatform) === 'twitch' ? 'twitch' : 'tiktok',
      intermissionMs: clampInt(settings.tabooIntermissionSeconds, TABOO_RULES.intermissionMinMs / 1000, TABOO_RULES.intermissionMaxMs / 1000, DEFAULT_CONFIG.intermissionMs / 1000) * 1000,
      mode, rulesVersion: TABOO_RULES.version,
    }
    const id = this.deps.newId()
    const t = transition(this.ms, { type: 'start-match', matchId: id, config })
    if (t.error) return fail(t.error.code, t.error.message)
    try {
      this.rowMatch = this.deps.store.startMatch({ id, roomKey: this.key, mode, platform: config.platform, threshold: config.threshold, rulesVersion: config.rulesVersion, deckVersion: deck.version, at: this.deps.wallNow() })
    } catch (error) { this.deps.log('error', 'taboo: partita non salvata', { error: String(error) }); return fail('unavailable', 'Non riesco a salvare la partita.') }
    this.ms = t.state
    this.deckData = deck
    this.resetMatch()
    this.pendingCache = null
    try { this.recent = this.deps.store.recentCards(this.key) } catch { this.recent = new Set() }
    this.deps.log('info', 'taboo: partita avviata', { matchId: id, mode, platform: config.platform, threshold: config.threshold, cards: deck.cards.length })
    this.publish(true)
    return ok
  }

  private startRound(now: number): TabooReply {
    const ms = this.ms
    if (ms.phase !== 'intermission') return fail('wrong-phase', 'Il round parte dall\'intervallo.')
    if (ms.round > 1 && now < this.intermissionUntil) return fail('wrong-phase', `Intervallo in corso: restano ${Math.ceil((this.intermissionUntil - now) / 1000)} secondi.`)
    const plan = TABOO_ROUND_PLANS[ms.round - 1]
    // Round 3: the vote closes now, before the timer (§5). A tie or no vote is decided by chance among the categories with cards (D11).
    if (plan.votesCategory && !ms.chosenCategory) {
      const available = availableCategories(this.deckData!.cards, this.used)
      if (!available.length) return fail('unavailable', 'Non restano carte nel mazzo.')
      const counts = new Map<TabooCategory, number>()
      for (const v of this.votes.values()) if (available.includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1)
      const top = Math.max(0, ...counts.values())
      const leaders = top > 0 ? [...counts].filter(([, n]) => n === top).map(([c]) => c) : available
      const chosen = leaders[Math.min(leaders.length - 1, Math.floor(this.deps.random() * leaders.length))]
      this.notice = top === 0 ? 'Nessun voto: la categoria è scelta a sorte.' : leaders.length > 1 ? 'Pareggio: la categoria è scelta a sorte tra le più votate.' : null
      this.apply({ type: 'set-category', matchId: ms.matchId!, category: chosen })
    }
    this.summary = null
    this.correction = null
    return this.result(this.apply({ type: 'start-round', matchId: ms.matchId!, now }))
  }

  private report(c: Extract<TabooCommand, { type: 'report' }>): TabooReply {
    if (this.rowMatch === null || !this.ms.matchId) return fail('wrong-phase', 'Non c\'è una partita.')
    const row = this.rowExposure.get(c.exposure)
    if (row === undefined) return fail('bad-input', 'Carta non trovata.')
    try {
      this.deps.store.report({
        match: this.rowMatch, exposure: row, kind: 'violation', reportedAt: this.deps.wallNow(), actor: 'dashboard', reason: c.reason,
        violationAt: c.violationAfterMs === undefined ? null : this.deps.wallNow() - Math.max(0, c.violationAfterMs),
      })
    } catch (error) {
      if (error instanceof RangeError) return fail('too-many-reports', 'Troppe segnalazioni in attesa.')
      this.deps.log('error', 'taboo: segnalazione non salvata', { error: String(error) })
      return fail('unavailable', 'Non riesco a salvare la segnalazione.')
    }
    this.pendingCache = null
    this.publish(true)
    return ok
  }

  // §3.5: decided in the interval. A violation before the winning answer revokes the win and corrects the score; one that cannot
  // be verified leaves no retroactive sanction (the event stays recorded).
  private decide(c: Extract<TabooCommand, { type: 'decide' }>): TabooReply {
    const ms = this.ms
    if (this.rowMatch === null || !ms.matchId) return fail('wrong-phase', 'Non c\'è una partita.')
    if (ms.phase !== 'intermission' && ms.phase !== 'finished') return fail('wrong-phase', 'Le segnalazioni si decidono tra i round.')
    const report = this.pending().find((r) => r.id === c.report)
    if (!report) return fail('bad-input', 'Segnalazione non trovata o già decisa.')
    if (!c.verifiable) {
      try { this.deps.store.rejectReport(report.id) } catch (error) {
        this.deps.log('error', 'taboo: segnalazione non chiusa', { error: String(error) })
        return fail('unavailable', 'Non riesco a salvare la decisione.')
      }
      this.pendingCache = null
      this.correction = 'Segnalazione non verificabile: nessuna sanzione retroattiva.'
      this.publish(true)
      return ok
    }
    const machineExposure = this.machineExposure(report.exposure)
    const round = ms.rounds.find((r) => r.cards.some((card) => card.exposure === machineExposure))
    const index = round ? round.cards.findIndex((card) => card.exposure === machineExposure) : -1
    if (!round || index < 0) return fail('bad-input', 'La carta non è in un round chiuso.')
    const t = transition(ms, { type: 'rectify', matchId: ms.matchId, round: round.number, index })
    if (t.error) return fail(t.error.code, t.error.message)
    const effect = t.effects.find((e): e is Extract<Effect, { type: 'correction' }> => e.type === 'correction')
    try {
      const rows = (effect?.deltas ?? []).map((d) => ({ exposure: this.rowExposure.get(round.cards[d.index].exposure)!, delta: d.delta }))
      this.deps.store.applyCorrection(report.id, this.rowMatch, rows, this.deps.wallNow())
    } catch (error) {
      this.deps.log('error', 'taboo: rettifica non salvata', { error: String(error) })
      return fail('unavailable', 'Non riesco a salvare la rettifica.')
    }
    this.pendingCache = null
    this.ms = t.state
    this.wins = this.wins.filter((w) => w.exposure !== machineExposure)
    this.correction = `Rettifica: ${c.reason.slice(0, TABOO_RULES.maxReasonChars)} (punteggio di squadra ${t.state.team}).`
    this.publish(true)
    return ok
  }

  private result(t: { error?: { code: TabooErrorCode; message: string }; ignored?: string }): TabooReply {
    if (t.error) return fail(t.error.code, t.error.message)
    if (t.ignored) return fail('stale-version', 'Il comando si riferisce a uno stato vecchio: riprova.')
    return ok
  }

  // ---- The machine and its effects ----

  private apply(input: MachineInput): ReturnType<typeof transition> {
    const t = transition(this.ms, input)
    if (t.error || t.ignored) return t
    this.ms = t.state
    this.depth++
    try { for (const effect of t.effects) this.execute(effect) } finally { this.depth-- }
    if (this.depth === 0) this.publish(true)
    return t
  }

  private execute(e: Effect): void {
    if (this.disposed) return
    const ms = this.ms
    switch (e.type) {
      case 'round-start': {
        try {
          this.rowRound.set(e.round, this.deps.store.startRound(this.rowMatch!, e.round, e.category, e.narrative, this.deps.wallNow()))
        } catch (error) { this.persistFailed('round', error) }
        return
      }
      case 'set-timer': {
        this.clearRoundTimer()
        const matchId = ms.matchId
        this.roundTimer = this.deps.setTimer(() => {
          this.roundTimer = null
          // A late callback checks that it still belongs to this match and round (DIRETTIVE §5 "Fasi delimitate").
          if (this.disposed || this.abort.signal.aborted || this.ms.matchId !== matchId || this.ms.round !== e.round) return
          this.apply({ type: 'timeout', matchId: matchId!, round: e.round, now: this.deps.monotonicNow() })
        }, e.ms)
        return
      }
      case 'clear-timer': this.clearRoundTimer(); return
      case 'draw-card': {
        const out = drawCard(this.deckData!.cards, { mix: e.mix, category: e.category, used: this.used, recent: this.recent }, () => this.deps.random())
        if (!out) {
          this.deps.issue(this.key, 'Il mazzo di ZeroTaboo è esaurito: concludi la partita.')
          this.notice = 'Il mazzo è esaurito.'
          queueMicrotask(() => { if (!this.disposed && this.ms.matchId) this.apply({ type: 'suspend', matchId: this.ms.matchId, now: this.deps.monotonicNow() }) })
          return
        }
        if (out.relaxed.includes('category')) this.notice = `La categoria votata è esaurita: si gioca con ${TABOO_CATEGORIES.find((c) => c.code === out.card.category)?.name}.`
        this.used.add(out.card.code)
        this.cards.set(e.exposure, out.card)
        this.apply({ type: 'card-drawn', matchId: ms.matchId!, round: e.round, now: this.deps.monotonicNow(), exposure: e.exposure, card: { code: out.card.code, revision: out.card.revision, difficulty: out.card.difficulty, category: out.card.category } })
        return
      }
      case 'open-card': {
        const card = this.cards.get(e.card.exposure)
        this.compiled = card?.answer ?? null
        this.lastAttempt = new Map()
        this.activeGuessers = new Set()
        this.guessCount = 0
        this.wrong = new Map()
        try {
          this.rowExposure.set(e.card.exposure, this.deps.store.openExposure({
            round: this.rowRound.get(e.round)!, seq: e.card.exposure, cardCode: e.card.card.code, cardRevision: e.card.card.revision, difficulty: e.card.card.difficulty,
            startMs: this.deps.wallNow(), availableMs: e.card.availableMs, jackpot: e.card.jackpot,
          }))
        } catch (error) { this.persistFailed('exposure', error) }
        return
      }
      case 'close-card': {
        this.notice = null // a note (a category over, a draw by chance) is shown with the card it was about
        const row = this.rowExposure.get(e.closed.exposure)
        const winner = e.closed.outcome === 'solved' ? this.pendingWinner : null
        this.pendingWinner = null
        this.compiled = null
        try {
          if (row === undefined || this.rowMatch === null) throw new Error('esposizione non salvata')
          this.deps.store.closeExposure(row, {
            outcome: e.closed.outcome, endMs: this.deps.wallNow(), solveMs: e.closed.solveMs, sung: e.closed.sung, interrupted: e.closed.interrupted,
            activeGuessers: this.activeGuessers.size, guessCount: this.guessCount,
            winner: winner ? { platform: winner.platform, userId: winner.user.id, receivedMs: winner.receivedMs, messageKey: winner.messageKey, alias: winner.alias } : null,
            events: e.events, match: this.rowMatch, at: this.deps.wallNow(),
          })
          this.deps.store.addWrongAnswers(row, this.wrong)
        } catch (error) { this.persistFailed('card', error) }
        this.metrics.closed[e.closed.outcome]++
        const card = this.cards.get(e.closed.exposure)
        // The answer is shown only now that the card is closed (§10, §12.2).
        this.revealed = card ? { target: card.target, outcome: e.closed.outcome } : null
        const points = e.events.reduce((sum, ev) => sum + ev.delta, 0)
        if (e.closed.outcome === 'solved') {
          this.lastWinner = { user: winner ? { id: winner.user.id, nickname: winner.user.nickname, ...(winner.user.avatar ? { avatar: winner.user.avatar } : {}) } : null, difficulty: e.closed.card.difficulty, points }
          if (winner) this.wins.push({ id: winner.user.id, nickname: winner.user.nickname, ...(winner.user.avatar ? { avatar: winner.user.avatar } : {}), difficulty: e.closed.card.difficulty, exposure: e.closed.exposure, round: e.round })
        } else this.lastWinner = null
        return
      }
      case 'round-end': {
        const round = ms.rounds.find((r) => r.number === e.round)
        try { if (round) this.deps.store.endRound(this.rowRound.get(e.round)!, round.skipsUsed, this.deps.wallNow()) } catch (error) { this.persistFailed('round', error) }
        this.compiled = null
        this.notice = null
        this.intermissionUntil = this.deps.monotonicNow() + ms.config.intermissionMs
        if (round) {
          const counts = { solved: 0, skipped: 0, taboo: 0, round_timeout: 0 }
          for (const r of round.results) counts[r.kind]++
          const before = ms.rounds.filter((r) => r.number < e.round).reduce((team, r) => scoreRound(team, r.results).team, 0)
          this.summary = {
            round: e.round, solved: counts.solved, skipped: counts.skipped, taboo: counts.taboo, timeout: counts.round_timeout, points: scoreRound(before, round.results).team - before,
            topGuessers: rankPlayers(tally(this.wins.filter((w) => w.round === e.round))).slice(0, TABOO_RULES.topGuessers).map((r) => ({ id: r.id, nickname: r.nickname, ...(r.avatar ? { avatar: r.avatar } : {}), solved: r.solved, hard: r.hard, medium: r.medium, place: r.place })),
          }
        }
        return
      }
      case 'match-end': {
        try { if (this.rowMatch !== null) this.deps.store.setMatchStatus(this.rowMatch, e.outcome === 'cancelled' ? 'cancelled' : 'finished', this.deps.wallNow()) } catch (error) { this.persistFailed('match', error) }
        this.compiled = null
        this.deps.log('info', 'taboo: partita finita', { matchId: ms.matchId, outcome: e.outcome, team: e.team })
        return
      }
      case 'choose-category': this.votes = new Map(); return
      case 'choose-narrative': {
        const narrative = TABOO_NARRATIVES[Math.min(TABOO_NARRATIVES.length - 1, Math.floor(this.deps.random() * TABOO_NARRATIVES.length))]
        // The machine is already in the interval of round 4: the constraint is set at once, before the director can press the button.
        if (this.ms.matchId) this.apply({ type: 'set-narrative', matchId: this.ms.matchId, narrative })
        return
      }
      case 'correction': return
    }
  }

  // A save that fails: the score the audience would see is not the one saved, so the match is frozen with a reason the director can read
  // (as the tournament does in settle()); nothing is shown as saved that was not (DIRETTIVE §9).
  private persistFailed(what: string, error: unknown): void {
    this.deps.log('error', `taboo: salvataggio non riuscito (${what})`, { error: String(error) })
    this.deps.issue(this.key, 'Non riesco a salvare la partita di ZeroTaboo: la partita è sospesa. Controlla il registro prima di riprendere.')
    this.notice = 'Pausa tecnica: salvataggio non riuscito.'
    queueMicrotask(() => { if (!this.disposed && this.ms.matchId && (this.ms.phase === 'round' || this.ms.phase === 'intermission')) this.apply({ type: 'suspend', matchId: this.ms.matchId, now: this.deps.monotonicNow() }) })
  }

  private machineExposure(row: number | null): number | null {
    if (row === null) return null
    for (const [machine, stored] of this.rowExposure) if (stored === row) return machine
    return null
  }

  private resetMatch(): void {
    this.rowRound.clear(); this.rowExposure.clear(); this.cards.clear()
    this.used = new Set(); this.wins = []; this.lastWinner = null; this.revealed = null; this.summary = null; this.correction = null; this.notice = null
    this.pendingWinner = null; this.votes = new Map(); this.seenKeys = new Set(); this.lastAttempt = new Map(); this.activeGuessers = new Set()
    this.guessCount = 0; this.wrong = new Map(); this.roundMessages.clear(); this.participants.clear(); this.intermissionUntil = 0
    this.metrics = { received: 0, ignored: {}, closed: { solved: 0, skipped: 0, taboo: 0, round_timeout: 0 }, overflow: 0 }
  }

  private clearRoundTimer(): void {
    if (this.roundTimer !== null) this.deps.clearTimer(this.roundTimer)
    this.roundTimer = null
  }

  // At most one state every 200 ms; a change of phase or of card goes out at once.
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
    if (immediate || now - this.lastEmit >= TABOO_RULES.emitEveryMs) {
      if (this.emitTimer !== null) { this.deps.clearTimer(this.emitTimer); this.emitTimer = null }
      send()
    } else if (this.emitTimer === null) this.emitTimer = this.deps.setTimer(send, TABOO_RULES.emitEveryMs - (now - this.lastEmit))
  }

  // Used by the tests and by the first emission to a client that has just connected.
  publishNow(): void { this.publish(true) }
}

export class TabooRooms {
  private readonly rooms = new Map<string, TabooRoom>()
  constructor(private readonly deps: TabooDeps) {}

  open(key: string): TabooRoom {
    let room = this.rooms.get(key)
    if (!room) {
      room = new TabooRoom(key, this.deps)
      this.rooms.set(key, room)
    }
    return room
  }
  get(key: string): TabooRoom | undefined { return this.rooms.get(key) }
  close(key: string): void {
    const room = this.rooms.get(key)
    this.rooms.delete(key)
    room?.dispose()
  }
  closeAll(): void {
    const errors: unknown[] = []
    for (const room of this.rooms.values()) {
      try { room.dispose() } catch (error) { errors.push(error) }
    }
    this.rooms.clear()
    if (errors.length) throw new AggregateError(errors, 'Chiusura delle partite di ZeroTaboo incompleta')
  }
  bridgeChanged(): void { for (const room of this.rooms.values()) room.bridgeChanged() }
}
