import { CONTEXT_LIMITS, CONTEXT_SEMANTIC_RULES, pickSecret, semanticMode, specialPoints, thermalScore,
  type ContextSemanticGuess, type ContextSemanticState, type GameSettings, type LiveEvent, type Viewer } from '@zerocade/shared'
import { closerHint, lookup, rankAgainst, startHint, type Ranking } from '@zerocade/shared/contextRanking'
import type { Corpus } from './context-tournament-ranking.js'

interface Options {
  corpus: Corpus
  settings: GameSettings
  emit(state: ContextSemanticState): void
  award(user: Viewer, points: number): void
  secret(word: string): void
  uses?(word: string): number
  lastAt?(word: string): number
  now?(): number
  random?(): number
  specialRoundsEnabled?: boolean
}

// One authoritative session per room. Overlays only draw snapshots; reconnecting cannot
// reset the clock, consume another attempt, advance the ninth round or award points again.
export class ContextSemanticGame {
  private readonly now: () => number
  private settings: GameSettings
  private round = 0
  private completedRounds = 0
  private matchRounds = 0
  private secret = -1
  private ranking!: Ranking
  private started = 0
  private until = 0
  private pausedAt: number | null = null
  private phase: ContextSemanticState['phase'] = 'playing'
  private attempts = 0
  private best = Infinity
  private taken = new Set<number>()
  private guesses: ContextSemanticGuess[] = []
  private typed: ContextSemanticState['typed'] = []
  private notes: string[] = []
  private rescues = new Set<number>()
  private shown = 0
  private hints = 0
  private hintAt = 0
  private solver: Viewer | null = null
  private reason: ContextSemanticState['reason'] = null
  private scores = new Map<string, ContextSemanticState['leaders'][number]>()
  private lastSecond = -1

  constructor(private readonly options: Options) {
    if (!options.corpus.data.semantic) throw new Error('Pool semantici assenti')
    this.now = options.now ?? (() => performance.now())
    this.settings = options.settings
    this.begin()
  }

  private number(name: string, fallback: number) {
    const value = this.settings[name]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  private get specialsEnabled() { return this.options.specialRoundsEnabled ?? CONTEXT_SEMANTIC_RULES.specialRoundsEnabled }
  private get special() { return semanticMode(this.round, this.specialsEnabled) === 'special' }
  private get word() { return this.options.corpus.data.words[this.secret] }
  private elapsed(at = this.pausedAt ?? this.now()) { return Math.max(0, at - this.started) }
  private get hintsOff() { return this.settings.disableAllHints === true }

  private begin() {
    this.round++
    const { data } = this.options.corpus
    const pools = data.semantic!
    const pool = !this.specialsEnabled ? data.secrets : this.special ? pools.special : pools.ordinary
    const free = pool.filter((i) => i !== this.secret)
    this.secret = pickSecret(free.length ? free : pool, (i) => this.options.uses?.(data.words[i]) ?? 0,
      (i) => this.options.lastAt?.(data.words[i]) ?? 0, this.options.random ?? Math.random)
    this.ranking = rankAgainst(data, this.secret)
    this.phase = 'playing'
    this.attempts = 0; this.best = Infinity; this.shown = 0; this.hints = 0
    this.taken.clear(); this.rescues.clear(); this.guesses = []; this.typed = []; this.notes = []
    this.solver = null; this.reason = null
    this.started = this.now(); this.hintAt = this.started; this.lastSecond = -1
    if (this.pausedAt !== null) this.pausedAt = this.started
    if (!this.hintsOff && this.settings.starterWords === true) {
      for (const share of [.4, .1, .02]) this.place(this.ranking.order[Math.floor(data.words.length * share)], null)
    }
    if (!this.hintsOff && this.settings.startHintOn === true) {
      const rank = startHint(this.ranking, this.number('startHint', 30), Math.max(1, this.number('hintClosest', 4) - 1))
      if (rank > 0) this.place(this.ranking.order[rank], null)
    }
    this.options.secret(this.word)
    this.emit()
  }

  snapshot(): ContextSemanticState {
    const at = this.pausedAt ?? this.now()
    return { round: this.round, mode: this.special ? 'special' : 'ordinary', phase: this.phase, paused: this.pausedAt !== null,
      remainingMs: this.phase === 'playing' ? this.special ? Math.max(0, 180000 - this.elapsed(at)) : null : Math.max(0, this.until - at),
      attempts: this.attempts, total: this.options.corpus.data.words.length,
      solution: this.phase === 'playing' ? null : this.word, prefix: this.word.slice(0, this.shown),
      wordLength: !this.hintsOff && this.settings.showWordLength !== false ? this.word.length : null,
      solvedBy: this.solver, reason: this.reason, best: Number.isFinite(this.best) ? this.best : null,
      closest: [...this.guesses].sort((a, b) => a.rank - b.rank).slice(0, 10), last: this.guesses.at(-1) ?? null,
      typed: [...this.typed], notes: [...this.notes], leaders: [...this.scores.values()].sort((a, b) => b.pts - a.pts).slice(0, 10) }
  }
  private emit() { this.options.emit(this.snapshot()) }

  settingsChanged(settings: GameSettings) {
    this.settings = settings
    if (this.hintsOff) {
      this.guesses = this.guesses.filter((g) => g.by !== null)
      this.taken = new Set(this.guesses.map((g) => this.options.corpus.data.index.get(g.word)!))
      this.best = this.guesses.reduce((best, g) => Math.min(best, g.rank), Infinity)
      this.shown = 0; this.notes = []
    }
    this.emit()
  }
  pause(value: boolean) {
    if (value === (this.pausedAt !== null)) return
    if (value) { this.tick(); this.pausedAt = this.now() }
    else {
      const duration = this.now() - this.pausedAt!
      this.started += duration; this.until += duration; this.hintAt += duration; this.pausedAt = null
    }
    this.emit()
  }
  private place(i: number, by: Viewer | null) {
    if (this.taken.has(i)) return
    this.taken.add(i)
    const rank = this.ranking.rankOf[i]
    this.guesses.push({ word: this.options.corpus.data.words[i], rank, by,
      temperature: thermalScore(this.ranking.similarities?.[i] ?? 0, this.special), at: this.now() })
    this.best = Math.min(this.best, rank)
  }
  private award(user: Viewer, points: number) {
    if (!this.scores.has(user.id) && this.scores.size >= CONTEXT_LIMITS.players) return
    const current = this.scores.get(user.id)
    this.scores.set(user.id, { id: user.id, name: user.nickname, avatar: user.avatar, pts: (current?.pts ?? 0) + points })
    this.options.award(user, points)
  }
  action(action: string, event: LiveEvent) {
    this.tick()
    if (this.pausedAt !== null || this.phase !== 'playing') return
    if (action === 'reveal_closer') { this.hint(); this.emit(); return }
    if (action === 'small_hint') {
      if (!this.hintsOff) this.shown = Math.min(this.shown + 1, Math.max(1, this.word.length - 2))
      this.emit(); return
    }
    if (event.type !== 'comment' || event.text.length > 256) return
    const i = lookup(this.options.corpus.data, event.text, this.secret)
    const user = { id: event.user.id.slice(0, 64), nickname: event.user.nickname.slice(0, 32), avatar: event.user.avatar?.slice(0, 512) }
    this.typed = [...this.typed, { text: event.text.trim().slice(0, 24), user, rank: i < 0 ? null : this.ranking.rankOf[i] }].slice(-6)
    if (i < 0 || this.taken.has(i)) { this.emit(); return }
    if (this.attempts >= CONTEXT_LIMITS.guesses) { this.finish('attempts'); return }
    const improved = this.ranking.rankOf[i] < this.best
    this.attempts++
    this.place(i, user)
    if (i === this.secret) {
      this.award(user, this.special ? specialPoints(this.elapsed() / 1000, this.attempts) : this.number('finderPoints', 100))
      this.finish('found', user)
    } else if (this.special && this.attempts >= 100) this.finish('attempts')
    else {
      const multiplier = ({ none: 0, low: .5, normal: 1, high: 2 } as Record<string, number>)[String(this.settings.closestPoints ?? 'normal')] ?? 1
      if (!this.special && improved && multiplier > 0) this.award(user, Math.max(1, Math.round(multiplier * this.number('finderPoints', 100) / (this.best + 1))))
      this.rescue(); this.emit()
    }
  }
  private rescue() {
    if (!this.special || this.hintsOff) return
    const elapsed = this.elapsed()
    if (!this.rescues.has(1) && (this.attempts >= 50 || elapsed >= 90000) && this.best > 999) {
      this.rescues.add(1)
      this.notes.push(`INDIZIO: ${this.options.corpus.data.semantic!.domains[this.secret]}.`)
    }
    if (!this.rescues.has(2) && (this.attempts >= 75 || elapsed >= 150000) && this.best > 299) {
      this.rescues.add(2)
      this.notes.push('SOCCORSO: prova parole comuni affini al dominio indicato.')
    }
  }
  private hint() {
    if (this.hintsOff || this.hints >= this.number('maxHintsPerRound', 5)) return
    const rank = closerHint(this.ranking, this.best, this.taken, Math.max(1, this.number('hintClosest', 4) - 1))
    if (rank > 0) { this.place(this.ranking.order[rank], null); this.hints++ }
  }
  private finish(reason: NonNullable<ContextSemanticState['reason']>, user: Viewer | null = null) {
    if (this.phase !== 'playing') return
    this.reason = reason; this.solver = user; this.completedRounds++; this.matchRounds++
    this.phase = 'intermission'
    this.until = this.now() + Math.max(0, this.number('breakSeconds', 8)) * 1000
    this.emit()
  }
  next() { if (this.pausedAt === null) this.finish('creator') }
  tick() {
    if (this.pausedAt !== null || this.phase === 'completed') return
    if (this.phase === 'intermission') {
      if (this.now() >= this.until) {
        if (this.settings.matchEnds === 'words' && this.matchRounds >= this.number('matchWords', 10)) {
          this.scores.clear(); this.matchRounds = 0
        }
        this.begin()
      }
      return
    }
    if (this.special && this.elapsed() >= 180000) { this.finish('time'); return }
    this.rescue()
    if (!this.hintsOff && this.settings.autoHints === true && this.now() - this.hintAt >= this.number('autoHintSeconds', 45) * 1000) {
      this.hintAt = this.now(); this.hint()
    }
    const second = Math.floor(this.elapsed() / 1000)
    if (second !== this.lastSecond) { this.lastSecond = second; this.emit() }
  }
}
