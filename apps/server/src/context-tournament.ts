import { randomUUID } from 'node:crypto'
import {
  TOURNAMENT_RULES,
  allowedToPlay,
  BAND_STRENGTH,
  tournamentBand,
  type ContextTournamentAdmin,
  type ContextTournamentState,
  type TournamentCommand,
  type TournamentGuessView,
  type TournamentPhase,
  type TournamentReply,
  type TournamentTypedView,
  type TournamentRow,
  type Viewer,
} from '@zerocade/shared'
import type { ContextTournamentStore, GuessRecord, RoundRecord, TournamentRecord } from './context-tournament-db.js'
import { planOf, planRound, positionOf, readGuess, type Corpus, type RoundPlan } from './context-tournament-ranking.js'
import { scoreRound, standings, topTen, type RoundOutcome } from './context-tournament-scoring.js'

// ZeroContext's tournament, run by the server alone (regolamento v2.3, specifica tecnica): global 6-second windows, one
// valid word per player and window, 70 windows a round, 5, 7 or endless rounds, Pioneer + Jackpot - blue filter, the Top 10
// between rounds (at least the configured time, then the next round only on command), everything saved before it
// is shown. Overlays and the dashboard's preview only receive its state; the secret goes to dashboards only.
//
// Decided with the organiser (15/11/2026): players enrol with their first valid guess, also once the tournament has
// started; only ZeroFollowerBot's messages count (no direct connector), so a tournament needs the bridge, and a bridge
// lost during a round suspends it; closing a round early counts as unsolved; a tie left after §9 is ex aequo.

export interface TournamentDeps {
  store: ContextTournamentStore
  // The 3-2-1 before each window; 0 turns it off (tests).
  countdownMs?: number
  // The setting "Parole scritte a schermo" of the room.
  typedWords?: (key: string) => boolean
  corpus: () => Corpus | null
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  random?: () => number
  emitPublic: (key: string, state: ContextTournamentState | null) => void
  emitAdmin: (key: string, admin: ContextTournamentAdmin | null) => void
  // ZeroFollowerBot's bridge is connected and brings this room's chat.
  bridgeReady: (key: string) => boolean
  // How many times a secret word has come out in ZeroContext (classic and tournament), and a new round with it.
  secretUses?: (word: string) => number
  secretLastAt?: (word: string) => number
  recordSecretUse?: (key: string, word: string) => void
}

interface Live {
  t: TournamentRecord
  phase: TournamentPhase
  round: RoundRecord | null
  plan: RoundPlan | null
  window: number
  // Date.now() when the open window closes, or the next one opens.
  deadline: number
  timer: unknown
  seq: number
  thisWindow: Set<string>
  typed: TournamentTypedView[]
  // The window the words of the 3-2-1 count for (it is not open yet), null outside of it.
  pending: number | null
  usedWords: Set<number>
  messages: Set<string>
  submissions: number
  overflow: number
  board: TournamentGuessView[]
  lastWindow: TournamentGuessView[]
  buoy: TournamentGuessView | null
  best: number | null
  solution: string | null
  solvedBy: string | null
  achievements: string[]
  rows: TournamentRow[]
  players: Set<string>
  // How many rounds are settled, kept here: every publish asks for it, and the rounds change only on a few commands.
  settled: number
  version: number
  publishTimer: unknown
}

const SUSPENDED_ON_RESTART = 'Zerocade si è riavviato durante una manche: la finestra interrotta ripartirà da capo, con i tentativi già registrati.'
const SUSPENDED_ON_BRIDGE = 'Il ponte ZeroFollowerBot si è scollegato: senza i suoi messaggi il torneo non può continuare.'
const PAUSED = 'Pausa dell\'organizzatore.'

export class ContextTournaments {
  private readonly live = new Map<string, Live>()
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly random: () => number
  // Versions keep growing across restarts, so a dashboard never mistakes an old state for a new one.
  private version: number

  constructor(private readonly deps: TournamentDeps) {
    this.now = deps.now ?? Date.now
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
    this.random = deps.random ?? Math.random
    this.version = this.now()
  }

  // At start-up: the open tournaments come back; one that was in the middle of a round is suspended, and its
  // organiser chooses to resume or cancel (nothing is invented for the time the server was off).
  restore() {
    for (const t of this.deps.store.allOpen()) {
      let record = t
      if (t.status === 'active') {
        this.deps.store.setStatus(t.id, 'suspended', this.now(), SUSPENDED_ON_RESTART)
        this.deps.store.audit(t.id, this.deps.store.playing(t.id)?.id ?? null, 'suspend', 'sistema', { reason: SUSPENDED_ON_RESTART }, this.now())
        record = this.deps.store.tournament(t.id)!
      }
      const live = this.fresh(record)
      const round = this.deps.store.playing(t.id)
      if (round) this.loadRound(live, round)
      live.phase = record.status === 'suspended' ? 'suspended' : this.idlePhase(live)
      this.refreshStandings(live)
      this.live.set(t.roomKey, live)
      this.publishWhenStartable(live)
    }
  }

  isOpen(key: string): boolean {
    const l = this.live.get(key)
    return Boolean(l && l.phase !== 'completed' && l.phase !== 'cancelled')
  }

  // Shown at all (an ended tournament stays on screen until dismissed).
  has(key: string): boolean {
    return this.live.has(key)
  }

  state(key: string): ContextTournamentState | null {
    const l = this.live.get(key)
    return l ? this.publicState(l) : null
  }

  admin(key: string): ContextTournamentAdmin | null {
    const l = this.live.get(key)
    if (!l) return null
    return {
      state: this.publicState(l),
      secret: l.plan && l.round ? this.deps.corpus()?.data.words[l.plan.secret] ?? null : null,
      standings: l.rows,
      overflow: l.overflow,
      canStartRound: this.startable(l) === null,
      bridgeReady: this.deps.bridgeReady(l.t.roomKey),
    }
  }

  standingsOf(id: string): TournamentRow[] | null {
    return this.deps.store.tournament(id) ? standings(this.deps.store.totals(id)) : null
  }

  // Zerocade is stopping: a round in play is suspended now, with the reason the organiser will read after the restart
  // (before the bridge closes, which would otherwise be the reason given).
  shutdown() {
    for (const l of this.live.values()) {
      if (l.phase === 'window-open' || l.phase === 'window-processing') this.suspend(l, SUSPENDED_ON_RESTART, 'sistema')
    }
    this.dispose()
  }

  dispose() {
    for (const l of this.live.values()) {
      this.stopTimer(l)
      if (l.publishTimer) this.clearTimer(l.publishTimer)
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Commands of the organiser (the dashboard). Each answers ok or why not.

  command(key: string, cmd: TournamentCommand, context: { gameId: string; audience: unknown }, actor = 'dashboard'): TournamentReply {
    try {
      if (cmd.type === 'create') return this.create(key, cmd.totalRounds, cmd.intermissionSeconds, context, actor)
      const l = this.live.get(key)
      if (!l) return fail('Nessun torneo in questa stanza.')
      // A command given on an old state (two dashboards, a double click) is refused; pause and resume are urgent and
      // safe to repeat, so they are not.
      if (cmd.type !== 'pause' && cmd.type !== 'resume' && cmd.expectedVersion !== l.version)
        return fail('Lo stato del torneo è cambiato nel frattempo: controlla e riprova.')
      switch (cmd.type) {
        case 'start-round': return this.startRound(l, actor)
        case 'pause': return this.pause(l, actor)
        case 'resume': return this.resume(l, actor)
        case 'close-round': return this.closeRound(l, cleanReason(cmd.reason), actor)
        case 'void-round': return this.voidRound(l, cleanReason(cmd.reason), actor)
        case 'finish': return this.finish(l, actor)
        case 'cancel': return this.cancel(l, cleanReason(cmd.reason), actor)
        case 'reset-standings': return this.resetStandings(l, cleanReason(cmd.reason), actor)
        case 'dismiss': return this.dismiss(l)
      }
    } catch (error) {
      console.error('[torneo]', error)
      return fail(error instanceof Error ? error.message : 'Errore del torneo.')
    }
    return fail('Comando sconosciuto.')
  }

  private create(key: string, totalRounds: number | null, intermissionSeconds: number, context: { gameId: string; audience: unknown }, actor: string): TournamentReply {
    if (context.gameId !== 'context') return fail('Il torneo si avvia con ZeroContext selezionato.')
    const shown = this.live.get(key)
    if (shown && this.isOpen(key)) return fail('C\'è già un torneo in corso: riprendilo o concludilo.')
    if (totalRounds !== null && !TOURNAMENT_RULES.rounds.includes(totalRounds)) return fail('Le manche possono essere 5, 7 o infinite.')
    const intermissionMs = Math.round(Number(intermissionSeconds) * 1000)
    if (!Number.isFinite(intermissionMs) || intermissionMs < TOURNAMENT_RULES.intermissionMinMs || intermissionMs > TOURNAMENT_RULES.intermissionMaxMs)
      return fail(`L'intervallo con la Top 10 va da ${TOURNAMENT_RULES.intermissionMinMs / 1000} a ${TOURNAMENT_RULES.intermissionMaxMs / 1000} secondi.`)
    if (!this.deps.bridgeReady(key)) return fail('Collega ZeroFollowerBot: nel torneo contano solo i messaggi del suo ponte.')
    const corpus = this.deps.corpus()
    if (!corpus) return fail('Le parole di ZeroContext non sono disponibili sul server.')
    if (shown) this.live.delete(key)
    const audience = context.audience === 'followers' || context.audience === 'fans' ? context.audience : 'all'
    const t = this.deps.store.create({ id: randomUUID(), roomKey: key, totalRounds, intermissionMs, audience, corpusHash: corpus.hash,
      rulesVersion: TOURNAMENT_RULES.version, createdAt: this.now() }, actor)
    const l = this.fresh(t)
    l.phase = 'ready'
    this.live.set(key, l)
    this.publish(l)
    return { ok: true }
  }

  private startable(l: Live): string | null {
    if (l.phase !== 'ready' && l.phase !== 'intermission') return 'Si avvia una manche solo tra una manche e l\'altra.'
    if (l.t.totalRounds !== null && this.settledRounds(l) >= l.t.totalRounds) return 'Tutte le manche sono state giocate.'
    if (l.t.intermissionSince !== null && this.now() < l.t.intermissionSince + l.t.intermissionMs)
      return 'La Top 10 resta a schermo ancora qualche secondo.'
    if (!this.deps.bridgeReady(l.t.roomKey)) return 'Collega ZeroFollowerBot per giocare la manche.'
    return null
  }

  private startRound(l: Live, actor: string): TournamentReply {
    const why = this.startable(l)
    if (why) return fail(why)
    const corpus = this.corpusFor(l)
    if (!corpus) return fail('Le parole di ZeroContext sono cambiate o non sono disponibili: il torneo non può continuare su altri dati.')
    const plan = planRound(corpus, this.deps.store.usedSecrets(l.t.id), this.random, this.deps.secretUses, this.deps.secretLastAt)
    if (!plan) return fail('Non ci sono più parole segrete da giocare.')
    const number = this.settledRounds(l) + 1
    const round = this.deps.store.startRound(l.t.id, number, plan.secret, plan.buoy, this.now(), actor)
    this.deps.recordSecretUse?.(l.t.roomKey, corpus.data.words[plan.secret])
    l.t = this.deps.store.tournament(l.t.id)!
    l.round = round
    l.plan = plan
    this.clearRound(l)
    this.countdownThen(l, 1)
    return { ok: true }
  }

  // The 3-2-1 before a window: the round is in play but no word is taken until the window opens.
  private countdownThen(l: Live, index: number) {
    const ms = this.countdownMs
    if (ms <= 0) return this.openWindow(l, index, TOURNAMENT_RULES.windowMs)
    l.phase = 'window-processing'
    l.window = index
    l.pending = index
    l.thisWindow.clear()
    l.typed = []
    l.submissions = 0
    l.deadline = this.now() + ms
    this.stopTimer(l)
    l.timer = this.setTimer(() => {
      l.timer = null
      if (l.phase === 'window-processing') this.openWindow(l, index, TOURNAMENT_RULES.windowMs)
    }, ms)
    this.publish(l)
  }

  private get countdownMs(): number {
    return this.deps.countdownMs ?? TOURNAMENT_RULES.countdownMs
  }

  private pause(l: Live, actor: string): TournamentReply {
    if (l.phase !== 'window-open' && l.phase !== 'window-processing') return fail('Si mette in pausa una manche in corso.')
    this.suspend(l, PAUSED, actor)
    return { ok: true }
  }

  private resume(l: Live, actor: string): TournamentReply {
    if (l.phase !== 'suspended') return fail('Il torneo non è sospeso.')
    if (!this.deps.bridgeReady(l.t.roomKey)) return fail('Collega ZeroFollowerBot prima di riprendere.')
    const round = this.deps.store.playing(l.t.id)
    if (!round) {
      this.deps.store.setStatus(l.t.id, 'intermission', this.now())
      this.deps.store.audit(l.t.id, null, 'resume', actor, {}, this.now())
      l.t = this.deps.store.tournament(l.t.id)!
      l.phase = this.idlePhase(l)
      this.publish(l)
      return { ok: true }
    }
    const corpus = this.corpusFor(l)
    if (!corpus) return fail('Le parole di ZeroContext sono cambiate o non sono disponibili: la manche non si può ricostruire. Annullala o annulla il torneo.')
    if (!l.plan || l.plan.secret !== round.secret) this.loadRound(l, round, corpus)
    this.deps.store.setStatus(l.t.id, 'active', this.now())
    this.deps.store.audit(l.t.id, round.id, 'resume', actor, { window: round.window, remainingMs: round.remainingMs }, this.now())
    l.t = this.deps.store.tournament(l.t.id)!
    this.openWindow(l, Math.max(1, round.window), round.remainingMs > 0 ? round.remainingMs : TOURNAMENT_RULES.windowMs)
    return { ok: true }
  }

  // "Chiudi manche": the open window is processed as at its end (a target in it still wins), then the round ends
  // unsolved, as if its 70 windows were over (decided 15/11/2026).
  private closeRound(l: Live, reason: string, actor: string): TournamentReply {
    if (!l.round || !['window-open', 'window-processing', 'suspended'].includes(l.phase)) return fail('Non c\'è una manche in corso.')
    if (!reason) return fail('Scrivi il motivo: resta nello storico.')
    this.stopTimer(l)
    const outcome = this.process(l)
    this.settle(l, outcome, outcome.solved ? null : `Chiusa dall'organizzatore: ${reason}`, actor)
    return { ok: true }
  }

  // "Annulla manche" (§10, §13.3.5): the round in play, or the last one settled; its points do not count and the same
  // round is played again with another secret.
  private voidRound(l: Live, reason: string, actor: string): TournamentReply {
    if (!reason) return fail('Scrivi il motivo dell\'annullamento: resta nello storico.')
    const target = l.round ?? this.deps.store.rounds(l.t.id).filter((r) => r.status === 'settled').at(-1) ?? null
    if (!target) return fail('Non c\'è una manche da annullare.')
    if (l.phase === 'cancelled') return fail('Il torneo è annullato.')
    this.stopTimer(l)
    if (!this.deps.store.voidRound(target.id, reason, this.now(), actor)) return fail('La manche è già stata annullata.')
    l.t = this.deps.store.tournament(l.t.id)!
    l.settled = this.countSettled(l.t.id)
    l.round = null
    l.plan = null
    this.clearRound(l)
    l.achievements = []
    this.refreshStandings(l)
    l.phase = this.idlePhase(l)
    this.publish(l)
    this.publishWhenStartable(l)
    return { ok: true }
  }

  // "Concludi torneo": between rounds, the standings so far become final.
  private finish(l: Live, actor: string): TournamentReply {
    if (l.phase !== 'intermission' && l.phase !== 'ready' && !(l.phase === 'suspended' && !l.round)) return fail('Si conclude il torneo tra una manche e l\'altra.')
    this.deps.store.setStatus(l.t.id, 'completed', this.now())
    this.deps.store.audit(l.t.id, null, 'finish', actor, { roundsPlayed: this.settledRounds(l) }, this.now())
    l.t = this.deps.store.tournament(l.t.id)!
    l.phase = 'completed'
    this.publish(l)
    return { ok: true }
  }

  // "Azzera classifica": between rounds, everything played so far stops counting and the standings are empty again;
  // the tournament goes back to its first round (ready), with the same settings and secrets not yet played.
  private resetStandings(l: Live, reason: string, actor: string): TournamentReply {
    if (l.phase === 'completed' || l.phase === 'cancelled') return fail('Il torneo è finito: per ripartire da zero avviane uno nuovo.')
    if (l.round || (l.phase !== 'ready' && l.phase !== 'intermission' && l.phase !== 'suspended'))
      return fail('Si azzera la classifica tra una manche e l\'altra: chiudi o annulla prima la manche in corso.')
    if (!l.rows.length && this.settledRounds(l) === 0) return fail('La classifica è già vuota.')
    if (!reason) return fail('Scrivi il motivo dell\'azzeramento: resta nello storico.')
    this.stopTimer(l)
    this.deps.store.resetStandings(l.t.id, reason, this.now(), actor,
      l.rows.map((r) => ({ place: r.place, nickname: r.nickname, points: r.points })))
    l.t = this.deps.store.tournament(l.t.id)!
    l.settled = this.countSettled(l.t.id)
    this.clearRound(l)
    l.achievements = []
    l.overflow = 0
    this.refreshStandings(l)
    l.phase = this.idlePhase(l)
    this.publish(l)
    return { ok: true }
  }

  // "Ripristina classifica": between rounds, the standings come back from a snapshot of the backup file (the latest one
  // when `snapshotId` is null); see ContextTournamentStore.restoreFromBackup.
  restoreFromBackup(key: string, snapshotId: number | null, actor = 'dashboard'): TournamentReply {
    try {
      const l = this.live.get(key)
      if (!l) return fail('Nessun torneo in questa stanza.')
      if (l.round || (l.phase !== 'ready' && l.phase !== 'intermission' && l.phase !== 'suspended' && l.phase !== 'completed'))
        return fail('Si ripristina la classifica tra una manche e l\'altra: chiudi o annulla prima la manche in corso.')
      this.stopTimer(l)
      this.deps.store.restoreFromBackup(l.t.id, snapshotId, this.now(), actor)
      l.t = this.deps.store.tournament(l.t.id)!
      l.settled = this.countSettled(l.t.id)
      this.clearRound(l)
      l.achievements = []
      l.overflow = 0
      this.refreshStandings(l)
      l.phase = l.t.status === 'completed' ? 'completed' : this.idlePhase(l)
      this.publish(l)
      this.publishWhenStartable(l)
      return { ok: true }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Ripristino non riuscito.')
    }
  }

  private cancel(l: Live, reason: string, actor: string): TournamentReply {
    if (l.phase === 'completed' || l.phase === 'cancelled') return fail('Il torneo è già finito.')
    if (!reason) return fail('Scrivi il motivo dell\'annullamento del torneo: resta nello storico.')
    this.stopTimer(l)
    this.deps.store.setStatus(l.t.id, 'cancelled', this.now(), reason)
    this.deps.store.audit(l.t.id, l.round?.id ?? null, 'cancel', actor, { reason }, this.now())
    l.t = this.deps.store.tournament(l.t.id)!
    l.phase = 'cancelled'
    this.publish(l)
    return { ok: true }
  }

  private dismiss(l: Live): TournamentReply {
    if (l.phase !== 'completed' && l.phase !== 'cancelled') return fail('Il torneo è ancora in corso.')
    this.stopTimer(l)
    this.live.delete(l.t.roomKey)
    this.deps.emitPublic(l.t.roomKey, null)
    this.deps.emitAdmin(l.t.roomKey, null)
    return { ok: true }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The chat: a comment from ZeroFollowerBot's bridge, while a window is open. A word that is not valid, already used
  // in the round, or a second word of the same player in the window is ignored and costs nothing (§3).

  offer(key: string, user: Viewer, text: string, messageId: string, platform: string): boolean {
    const l = this.live.get(key)
    if (!l || !l.round || !l.plan) return false
    const window = this.acceptingWindow(l)
    if (window === null) return false
    if (!user.id || user.id === 'anonymous' || user.id.endsWith(':anonymous')) return false
    if (!allowedToPlay({ audience: l.t.audience }, user)) return false
    const messageKey = messageId ? `${platform}:${messageId}` : null
    if (messageKey && l.messages.has(messageKey)) return false
    const corpus = this.deps.corpus()
    if (!corpus) return false
    if (this.deps.typedWords?.(key)) this.noteTyped(l, user, text, corpus)
    if (l.thisWindow.has(user.id)) return false
    const word = readGuess(corpus, text, l.plan.secret)
    if (word < 0 || l.usedWords.has(word)) return false
    if (l.submissions >= TOURNAMENT_RULES.maxPerWindow) {
      l.overflow++
      this.publishSoon(l)
      return false
    }
    const guess: GuessRecord = { roundId: l.round.id, seq: l.seq + 1, window, messageKey, player: user.id, word,
      position: positionOf(l.plan, word), receivedAt: this.now() }
    if (!this.deps.store.acceptGuess(guess, l.t.id, user.nickname, user.avatar ?? null)) return false
    l.seq = guess.seq
    l.players.add(user.id)
    l.thisWindow.add(user.id)
    l.usedWords.add(word)
    if (messageKey) l.messages.add(messageKey)
    l.submissions++
    this.publishSoon(l)
    return true
  }

  // The words written, shown on screen like the classic game does: any single word, valid or not, even one that does
  // not count (a second one of the player, a word already used). Cleared when the window closes.
  private noteTyped(l: Live, user: Viewer, text: string, corpus: Corpus) {
    const word = text.trim()
    if (!word || word.length > 40 || /\s/.test(word) || !l.plan) return
    const index = readGuess(corpus, word, l.plan.secret)
    l.typed = [...l.typed, { text: word, nickname: user.nickname.slice(0, 32), ...(user.avatar ? { avatar: user.avatar } : {}),
      position: index >= 0 ? positionOf(l.plan, index) : null }].slice(-6)
    this.publishSoon(l)
  }

  // The window a word written now counts for: the open one, or the next one during its 3-2-1 (decided 15/11/2026: the
  // words are collected from the countdown on, one attempt per player per window). The results' second before the
  // countdown takes none.
  private acceptingWindow(l: Live): number | null {
    if (l.phase === 'window-open') return l.window
    if (l.phase === 'window-processing' && l.pending !== null && this.now() >= l.deadline - this.countdownMs) return l.pending
    return null
  }

  // ZeroFollowerBot's bridge connected or lost: a round in play without it is suspended.
  bridgeChanged() {
    for (const l of this.live.values()) {
      if ((l.phase === 'window-open' || l.phase === 'window-processing') && !this.deps.bridgeReady(l.t.roomKey)) {
        this.suspend(l, SUSPENDED_ON_BRIDGE, 'sistema')
      } else this.publishAdmin(l)
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Windows.

  private openWindow(l: Live, index: number, ms: number) {
    if (!l.round) return
    l.phase = 'window-open'
    l.window = index
    l.deadline = this.now() + ms
    l.pending = null
    l.submissions = this.deps.store.guesses(l.round.id).filter((g) => g.window === index).length
    this.deps.store.saveWindow(l.round.id, index, ms)
    this.stopTimer(l)
    l.timer = this.setTimer(() => this.closeWindow(l), ms)
    this.publish(l)
  }

  private closeWindow(l: Live) {
    l.timer = null
    if (l.phase !== 'window-open' || !l.round) return
    const outcome = this.process(l)
    if (outcome.solved) return this.settle(l, outcome, null, 'sistema')
    if (l.window >= TOURNAMENT_RULES.windowsPerRound) return this.settle(l, outcome, 'Tempo scaduto: 70 finestre senza la parola segreta.', 'sistema')
    // The next window is the current one from now on: after a restart it opens afresh, without this one's guesses.
    this.deps.store.saveWindow(l.round.id, l.window + 1, TOURNAMENT_RULES.windowMs)
    l.phase = 'window-processing'
    l.pending = l.window + 1
    l.thisWindow.clear()
    l.typed = []
    l.submissions = 0
    const wait = TOURNAMENT_RULES.processingMs + this.countdownMs
    l.deadline = this.now() + wait
    const next = l.window + 1
    l.timer = this.setTimer(() => {
      l.timer = null
      if (l.phase === 'window-processing') this.openWindow(l, next, TOURNAMENT_RULES.windowMs)
    }, wait)
    this.publish(l)
  }

  // The closed window's results: ranks and Pioneer points of its guesses, in the official order; the lifeline after
  // window 30 when no player reached the cyan band.
  private process(l: Live): RoundOutcome {
    const corpus = this.deps.corpus()
    const guesses = this.deps.store.guesses(l.round!.id)
    const outcome = scoreRound(guesses.map((g) => ({ seq: g.seq, window: g.window, player: g.player, position: g.position })))
    const names = new Map(this.deps.store.players(l.t.id).map((p) => [p.player, p.nickname]))
    const view = (g: GuessRecord): TournamentGuessView => ({ word: corpus?.data.words[g.word] ?? '?', position: g.position,
      band: tournamentBand(g.position), author: names.get(g.player) ?? g.player, window: g.window, pioneer: outcome.pioneerBySeq.get(g.seq) ?? 0 })
    const counted = (g: GuessRecord) => outcome.solvedSeq === null || g.seq <= outcome.solvedSeq
    const revealed = guesses.filter((g) => g.window <= l.window && counted(g))
    l.lastWindow = revealed.filter((g) => g.window === l.window).map(view)
    // Only cyan and blue words leave the board, and only once warmer ones (yellow or hotter) are on it; the first word
    // each player guessed stays. Every other word stays.
    const warm = revealed.some((g) => BAND_STRENGTH[tournamentBand(g.position)] >= BAND_STRENGTH.yellow)
    const firstOf = new Map<string, number>()
    for (const g of revealed) if (!firstOf.has(g.player) || g.seq < firstOf.get(g.player)!) firstOf.set(g.player, g.seq)
    l.board = revealed.filter((g) => !warm || BAND_STRENGTH[tournamentBand(g.position)] >= BAND_STRENGTH.yellow || firstOf.get(g.player) === g.seq)
      .map(view).sort((a, b) => a.position - b.position).slice(0, TOURNAMENT_RULES.boardSize)
    l.best = outcome.best
    const round = l.round!
    if (!outcome.solved && l.plan?.buoy != null && !l.buoy &&
        (round.buoyWindow !== null || (l.window >= TOURNAMENT_RULES.buoyAfterWindow && (outcome.best === null || outcome.best > 7500)))) {
      const position = positionOf(l.plan, l.plan.buoy)
      l.buoy = { word: corpus?.data.words[l.plan.buoy] ?? '?', position, band: tournamentBand(position), author: null,
        window: round.buoyWindow ?? l.window, pioneer: 0, buoy: true }
      if (round.buoyWindow === null) {
        this.deps.store.saveBuoy(round.id, l.window)
        l.round = { ...round, buoyWindow: l.window }
      }
    }
    return outcome
  }

  // The end of a round: its points saved once, in one transaction; only then the Top 10 (§13.6). A failed save
  // suspends the tournament instead of showing standings that may be wrong.
  private settle(l: Live, outcome: RoundOutcome, closeReason: string | null, actor: string) {
    this.stopTimer(l)
    const round = l.round!
    const names = new Map(this.deps.store.players(l.t.id).map((p) => [p.player, p.nickname]))
    const name = (id: string) => names.get(id) ?? id
    const achievements = [
      ...(outcome.achievements.holeInOne ? [`Hole in One: ${name(outcome.achievements.holeInOne)}`] : []),
      ...outcome.achievements.supremePioneers.map((p) => `Pioniere Supremo: ${name(p)}`),
      ...(outcome.achievements.fireUnderIce ? [`Fuoco sotto il Ghiaccio: ${name(outcome.achievements.fireUnderIce)}`] : []),
    ]
    try {
      this.deps.store.settle(round.id, outcome, this.now(), actor, closeReason, achievements)
    } catch (error) {
      console.error('[torneo] convalida della manche non riuscita', error)
      this.suspend(l, 'La convalida della manche non è riuscita: i punti non sono stati salvati. Riprova a riprendere, o annulla la manche.', 'sistema')
      return
    }
    l.t = this.deps.store.tournament(l.t.id)!
    l.settled = this.countSettled(l.t.id)
    l.solution = this.deps.corpus()?.data.words[round.secret] ?? null
    l.solvedBy = outcome.solvedBy ? name(outcome.solvedBy) : null
    l.achievements = achievements
    l.round = null
    l.plan = null
    this.refreshStandings(l)
    l.phase = l.t.status === 'completed' ? 'completed' : 'intermission'
    this.publish(l)
    this.publishWhenStartable(l)
  }

  // «Avvia manche» is disabled while the Top 10 must stay on screen; when that time is over the dashboard must be told,
  // or its button stays disabled until a refresh.
  private publishWhenStartable(l: Live) {
    if (l.phase !== 'intermission' || l.t.intermissionSince === null) return
    const wait = l.t.intermissionSince + l.t.intermissionMs - this.now()
    if (wait <= 0) return
    this.stopTimer(l)
    l.timer = this.setTimer(() => {
      l.timer = null
      if (l.phase === 'intermission' && this.live.get(l.t.roomKey) === l) this.publish(l, false)
    }, wait + 50)
  }

  private suspend(l: Live, reason: string, actor: string) {
    if (l.round && l.phase === 'window-open') this.deps.store.saveWindow(l.round.id, l.window, Math.max(0, l.deadline - this.now()))
    this.stopTimer(l)
    this.deps.store.setStatus(l.t.id, 'suspended', this.now(), reason)
    this.deps.store.audit(l.t.id, l.round?.id ?? null, 'suspend', actor, { reason, window: l.window }, this.now())
    l.t = this.deps.store.tournament(l.t.id)!
    if (l.round) l.round = this.deps.store.playing(l.t.id)
    l.phase = 'suspended'
    this.publish(l)
  }

  // ---------------------------------------------------------------------------------------------------------------

  private fresh(t: TournamentRecord): Live {
    return { t, phase: 'ready', round: null, plan: null, window: 0, deadline: 0, timer: null, seq: 0, thisWindow: new Set(), pending: null,
      usedWords: new Set(), messages: new Set(), submissions: 0, overflow: 0, board: [], lastWindow: [], typed: [], buoy: null, best: null,
      solution: null, solvedBy: null, achievements: [], rows: [], players: new Set(this.deps.store.players(t.id).map((p) => p.player)),
      settled: this.countSettled(t.id), version: 0, publishTimer: null }
  }

  private countSettled(tournamentId: string): number {
    return this.deps.store.rounds(tournamentId).filter((r) => r.status === 'settled').length
  }

  private clearRound(l: Live) {
    l.window = 0
    l.seq = 0
    l.thisWindow.clear()
    l.usedWords.clear()
    l.messages.clear()
    l.submissions = 0
    l.typed = []
    l.board = []
    l.lastWindow = []
    l.buoy = null
    l.best = null
    l.solution = null
    l.solvedBy = null
  }

  // A round in play rebuilt from what was saved (a restart, or a resume after its data had to be reloaded).
  private loadRound(l: Live, round: RoundRecord, corpus = this.corpusFor(l)) {
    l.round = round
    l.plan = corpus ? planOf(corpus, round.secret, round.buoy) : null
    l.window = Math.max(1, round.window)
    const guesses = this.deps.store.guesses(round.id)
    l.seq = this.deps.store.lastSeq(round.id)
    l.usedWords = new Set(guesses.map((g) => g.word))
    l.messages = new Set(guesses.flatMap((g) => (g.messageKey ? [g.messageKey] : [])))
    l.thisWindow = new Set(guesses.filter((g) => g.window === l.window).map((g) => g.player))
    if (l.plan) {
      // The windows already closed are shown again as they were.
      const shown = l.window
      l.window = shown - 1
      this.process(l)
      l.window = shown
    }
  }

  private corpusFor(l: Live): Corpus | null {
    const corpus = this.deps.corpus()
    return corpus && corpus.hash === l.t.corpusHash ? corpus : null
  }

  private idlePhase(l: Live): TournamentPhase {
    if (l.t.status === 'completed') return 'completed'
    if (l.t.status === 'cancelled') return 'cancelled'
    return this.settledRounds(l) === 0 && l.t.intermissionSince === null ? 'ready' : 'intermission'
  }

  private settledRounds(l: Live): number {
    return l.settled
  }

  private refreshStandings(l: Live) {
    l.rows = standings(this.deps.store.totals(l.t.id))
    l.players = new Set(this.deps.store.players(l.t.id).map((p) => p.player))
  }

  private stopTimer(l: Live) {
    if (l.timer) this.clearTimer(l.timer)
    l.timer = null
  }

  private publicState(l: Live): ContextTournamentState {
    const now = this.now()
    const { top10, tieAtTen } = topTen(l.rows)
    const intermissionEnd = l.t.intermissionSince === null ? 0 : l.t.intermissionSince + l.t.intermissionMs
    return {
      version: l.version,
      tournamentId: l.t.id,
      status: l.t.status,
      phase: l.phase,
      round: l.round?.number ?? this.settledRounds(l),
      totalRounds: l.t.totalRounds,
      window: l.window,
      windowsPerRound: TOURNAMENT_RULES.windowsPerRound,
      countdownMs: this.countdownMs,
      remainingMs: l.phase === 'window-open' || l.phase === 'window-processing' ? Math.max(0, l.deadline - now) : 0,
      serverNow: now,
      submissions: l.phase === 'window-open' ? l.submissions : 0,
      solution: l.round ? null : l.solution,
      solvedBy: l.round ? null : l.solvedBy,
      corpusSize: this.deps.corpus()?.data.words.length ?? 0,
      typed: l.typed,
      board: l.board,
      lastWindow: l.lastWindow,
      buoy: l.buoy,
      best: l.best,
      players: l.players.size,
      top10,
      tieAtTen,
      intermissionMs: l.phase === 'intermission' ? Math.max(0, intermissionEnd - now) : 0,
      suspendedReason: l.phase === 'suspended' ? l.t.suspendedReason : null,
      achievements: l.round ? [] : l.achievements,
    }
  }

  // `bump`: a change of phase or results, which old commands must not act on; the count of submissions is not one.
  private publish(l: Live, bump = true) {
    if (l.publishTimer) {
      this.clearTimer(l.publishTimer)
      l.publishTimer = null
    }
    if (bump) l.version = ++this.version
    if (this.live.get(l.t.roomKey) !== l) return
    this.deps.emitPublic(l.t.roomKey, this.publicState(l))
    this.publishAdmin(l)
  }

  private publishAdmin(l: Live) {
    if (this.live.get(l.t.roomKey) === l) this.deps.emitAdmin(l.t.roomKey, this.admin(l.t.roomKey))
  }

  // Bursts of accepted guesses: one update at most every 250 ms (the counter of submissions; never their ranks).
  private publishSoon(l: Live) {
    if (l.publishTimer) return
    l.publishTimer = this.setTimer(() => {
      l.publishTimer = null
      this.publish(l, false)
    }, 250)
  }
}

const fail = (error: string): TournamentReply => ({ ok: false, error })
const cleanReason = (reason: unknown) => (typeof reason === 'string' ? reason.trim().slice(0, 300) : '')

// A command as it arrives from a dashboard: only known types, with their fields of the right kind.
export function sanitizeTournamentCommand(raw: unknown): TournamentCommand | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const version = typeof r.expectedVersion === 'number' && Number.isFinite(r.expectedVersion) ? r.expectedVersion : -1
  const reason = typeof r.reason === 'string' ? r.reason.slice(0, 300) : ''
  switch (r.type) {
    case 'create':
      return (r.totalRounds === null || typeof r.totalRounds === 'number') && typeof r.intermissionSeconds === 'number'
        ? { type: 'create', totalRounds: r.totalRounds, intermissionSeconds: r.intermissionSeconds } : null
    case 'start-round': case 'pause': case 'resume': case 'finish': case 'dismiss':
      return { type: r.type, expectedVersion: version }
    case 'close-round': case 'void-round': case 'cancel': case 'reset-standings':
      return { type: r.type, expectedVersion: version, reason }
    default:
      return null
  }
}
