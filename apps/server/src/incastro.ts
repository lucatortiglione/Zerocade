import { existsSync, readFileSync } from 'node:fs'
import type {
  GameSettings,
  IncastroChapter,
  IncastroCommand,
  IncastroMoment,
  IncastroOutcome,
  IncastroPlayer,
  IncastroRecord,
  IncastroScore,
  IncastroSolution,
  IncastroState,
  IncastroVariant,
  LiveEvent,
} from '@zerocade/shared'
import { toCsv } from './csv.js'
import {
  addZerowordsAnswer,
  endZerowordsPlay,
  incastroLevel,
  saveIncastroLevel,
  startZerowordsPlay,
  zerowordsAnswers,
  zerowordsPlays,
  type ZerowordsPlayEnd,
} from './db.js'
import { nasaPhotos, randomPhoto, type NasaPhoto } from './nasa.js'
import { files } from './wordgen/files.js'
import type { Placed } from './wordgen/board.js'
import type { GeneratedLevel, Grid } from './wordgen/generator.js'
import { MIN_LEN } from './wordgen/lexicon.js'
import { levels } from './wordgen/levels.js'

// Incastro (shown as ZeroWords), the word game: a wheel of letters and a crossword to fill
// from chat, in Italian. Levels never run out: the generator (wordgen/, ALGORITMO.md in
// gioco-parole) makes level n when the game gets near it, with an easier and a harder grid on
// the same wheel; the chapters of chapters.json repeat. DDA picks the grid of each level from
// how the chat did on the ones before. Every level played is saved (zerowords_plays) to
// calibrate the generator on.

// The grid in play: the level's standard grid or one of its variants.
type Level = Grid & { id: number; letters: string; secret: string | null }

// Where a hint came from: the automatic letter, the dashboard, or a gift (or other trigger).
type HintOrigin = 'auto' | 'streamer' | 'trigger'

interface Chapter {
  id: number
  name: string
  background: string
  accent: string
}

const CHAPTER_DATA = existsSync(files.chapters)
  ? (JSON.parse(readFileSync(files.chapters, 'utf-8')) as { levelsPerChapter: number; chapters: Chapter[] })
  : { levelsPerChapter: 20, chapters: [] }

const VARIANTS: IncastroVariant[] = ['easy', 'standard', 'expert']
// DDA: automatic letters and dashboard hints that completed this share of the words mean the
// chat struggled; finishing with no such word and at most this many automatic letters per
// word means it cruised (gifts' hints do not count either way). The grid changes after
// DDA_STREAK levels alike, at least DDA_GAP levels after the last change.
const STRUGGLE_SHARE = 1 / 3
const CRUISE_AUTO_PER_WORD = 1 / 4
const DDA_STREAK = 2
const DDA_GAP = 3

// Saving the plays must never stop the game.
function safely(save: () => void): void {
  try {
    save()
  } catch (err) {
    console.warn(`[zerowords] saving the play: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// The plays saved so far, one row per level, and the answers and hints within them.
export function zerowordsCsv(which: 'plays' | 'answers'): string {
  const { columns, rows } = which === 'plays' ? zerowordsPlays() : zerowordsAnswers()
  return toCsv([columns, ...rows])
}

// Chat text -> the words to check: accents folded (CITTÀ -> CITTA), upper case, 3-10
// letters (wheels have up to 9). A comment can carry a few words ("amo ora"), not a whole list.
const MAX_WORDS_PER_COMMENT = 4
export function wordsIn(text: string): string[] {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
  const words = folded.split(/[^A-Z]+/).filter((w) => w.length >= 3 && w.length <= 10)
  return [...new Set(words)].slice(0, MAX_WORDS_PER_COMMENT)
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// A new wheel order that does not read the full-length word around the circle, nor
// (when it can help it) the order the wheel already had.
function reshuffle(letters: string, full: string): string {
  let best = letters
  for (let i = 0; i < 60; i++) {
    const next = shuffle([...letters]).join('')
    const ring = next + next
    const reads = ring.includes(full) || [...ring].reverse().join('').includes(full)
    if (!reads && next !== letters) return next
    if (!reads) best = next
  }
  return best
}

// Whether a word can be made with the wheel's letters, each used once.
function onWheel(word: string, letters: string): boolean {
  const left = [...letters]
  for (const ch of word) {
    const at = left.indexOf(ch)
    if (at < 0) return false
    left.splice(at, 1)
  }
  return true
}

const num = (s: GameSettings, id: string, fallback: number) => (typeof s[id] === 'number' ? (s[id] as number) : fallback)

const EMIT_EVERY_MS = 150
const MOMENTS_KEPT = 8
const SCORES_SHOWN = 10
const FULL_WORD_BONUS = 3
const EXTRA_POINTS = 1
// The secret word is worth twice a grid word of its length.
const SECRET_POINTS_PER_LETTER = 2
const EXTRA_TIME_MS = 30_000
const MAX_LEVEL_MS = 1_800_000
const TRIGGER_HINT_GAP_MS = 2000
const SHUFFLE_GAP_MS = 3000
const REPEAT_GAP_MS = 4000
// The summary stays a little longer when a chapter closes, for the new garden.
const CHAPTER_BONUS_MS = 4000

type CellState = 'hidden' | 'hint' | 'found'
// A moment before it gets its number (Omit over each member of the union).
type NewMoment = IncastroMoment extends infer M ? (M extends unknown ? Omit<M, 'seq'> : never) : never

class IncastroRoom {
  // Level number - 1.
  private index = 0
  private level: Level | null = null
  // DDA: the grid in play, and the one the next level will use.
  private playing: IncastroVariant = 'standard'
  private variant: IncastroVariant = 'standard'
  // Letters and words shown by hints in this level, by where they came from, and the grid
  // words a hint completed.
  private hints: Record<HintOrigin, number> = { auto: 0, streamer: 0, trigger: 0 }
  private helped = new Map<number, HintOrigin>()
  // DDA: how the last level finished went, and the outcome counted in a row (idle levels
  // skipped), how many times, and levels since the grid last changed.
  private lastOutcome: IncastroOutcome | null = null
  private streakOf: IncastroOutcome | null = null
  private streak = 0
  private sinceChange = DDA_GAP
  // The level in play as saved (zerowords_plays) and what is counted for it: viewers who
  // tried a word of the wheel, those words and the ones that are nothing, the first and the
  // longest wait for a word found by chat. Times in played milliseconds (see elapsed()).
  private play: number | null = null
  private players = new Set<string>()
  private attempts = 0
  private wrong = 0
  private firstMs: number | null = null
  private lastFindMs = 0
  private stallMs = 0
  private clockMs = 0
  private clockSince = 0
  // Bumped by every level start, so a level generated too late is not started.
  private loading = 0
  // The level as generated, kept for its play row (saved when the grid comes in).
  private made: GeneratedLevel | null = null
  // The NASA picture behind this level (background 'nasa'), and the next level's.
  private photo: NasaPhoto | null = null
  private nextPhoto: NasaPhoto | null = null
  private letters = ''
  private shuffles = 0
  private cells = new Map<string, { letter: string; state: CellState }>()
  private found = new Map<number, IncastroPlayer | null>()
  private missed = false
  private extras = new Set<string>()
  private extraWords = new Set<string>()
  private wordIndex = new Map<string, number>()
  private scores = new Map<string, IncastroScore>()
  private levelScores = new Map<string, IncastroScore>()
  private longest: IncastroRecord | null = null
  // Who found the level's secret word (null with secretFound means nobody yet).
  private secretFound = false
  private secretBy: IncastroPlayer | null = null
  private moments: IncastroMoment[] = []
  private seq = 0
  private phase: IncastroState['phase'] = 'empty'
  private chapterDone = false
  private triggerHints = 0
  private lastTriggerHint = 0
  private lastShuffle = 0
  private lastRepeat = new Map<string, number>()
  // Phase timer (level limit, or the summary), as in Bivio: while it runs the phase ends
  // at `endsAt`, otherwise `leftMs` is what is left; 0 and no timer = no limit.
  private durationMs = 0
  private leftMs = 0
  private endsAt = 0
  private timer: NodeJS.Timeout | undefined
  // Automatic hint, restarted whenever a word is found.
  private hintLeftMs = 0
  private hintEndsAt = 0
  private hintTimer: NodeJS.Timeout | undefined
  private emitTimer: NodeJS.Timeout | undefined
  private paused = false
  private watched = true

  constructor(
    private key: string,
    private settings: GameSettings,
    private emit: (state: IncastroState) => void,
    private emitSolution: (solution: IncastroSolution) => void,
  ) {
    // From where this overlay key stopped last time.
    this.startLevel((incastroLevel(this.key) ?? 1) - 1)
  }

  action(action: string, event: LiveEvent): void {
    if (!this.watched || this.paused) return
    const by: IncastroPlayer = { id: event.user.id, nickname: event.user.nickname, avatar: event.user.avatar }
    if (action === 'guess') return this.guess(event)
    if (action === 'shuffle') {
      if (Date.now() - this.lastShuffle < SHUFFLE_GAP_MS) return
      return this.shuffleWheel(by)
    }
    if (action === 'extra_time') return this.addTime(EXTRA_TIME_MS)
    // Hints from gifts and other triggers: capped per level and spaced out, so a burst of
    // roses does not solve the board in one go.
    if (action !== 'hint' && action !== 'reveal_word') return
    const now = Date.now()
    if (this.triggerHints >= num(this.settings, 'giftHints', 6) || now - this.lastTriggerHint < TRIGGER_HINT_GAP_MS) return
    const done = action === 'hint' ? this.revealLetter(by, 'trigger') : this.revealWord(by, 'trigger')
    if (done) {
      this.triggerHints++
      this.lastTriggerHint = now
    }
  }

  control(command: IncastroCommand): void {
    switch (command) {
      case 'next':
        return this.startLevel(this.index + 1)
      case 'prev':
        return this.startLevel(this.index - 1)
      case 'replay':
        return this.startLevel(this.index)
      case 'hint':
        this.revealLetter(null, 'streamer')
        return
      case 'reveal-word':
        this.revealWord(null, 'streamer')
        return
      case 'shuffle':
        return this.shuffleWheel(null)
      case 'extra-time':
        return this.addTime(EXTRA_TIME_MS)
      case 'pause':
        this.freeze()
        this.clockStop()
        this.paused = true
        return this.emitNow()
      case 'resume':
        this.paused = false
        this.schedule()
        this.clockStart()
        return this.emitNow()
      case 'restart':
        this.scores.clear()
        this.longest = null
        this.variant = 'standard'
        this.lastOutcome = null
        this.streakOf = null
        this.streak = 0
        this.sinceChange = DDA_GAP
        return this.startLevel(0)
      case 'clear-scores':
        this.scores.clear()
        this.levelScores.clear()
        this.longest = null
        return this.emitNow()
    }
  }

  goto(level: number): void {
    if (Number.isInteger(level)) this.startLevel(level - 1)
  }

  applySettings(settings: GameSettings): void {
    const prev = this.settings
    this.settings = settings
    const changed = (id: string) => prev[id] !== settings[id]
    if (this.phase === 'playing' && (changed('autoHints') || changed('hintSeconds'))) this.restartHintTimer()
    if (changed('background')) this.pickPhoto()
    if (this.phase === 'playing' && changed('levelSeconds')) {
      this.freeze()
      const ms = num(settings, 'levelSeconds', 0) * 1000
      // A new limit counts from now; 0 removes it.
      this.durationMs = ms
      this.leftMs = ms
      this.schedule()
    }
    if (this.phase === 'complete' && changed('autoNext')) {
      this.setTimer(settings.autoNext === false ? 0 : this.summaryMs())
    }
    this.emitNow()
  }

  // Nobody has the dashboard or an overlay open: freeze the timers and ignore chat.
  suspend(): void {
    this.freeze()
    this.clockStop()
    this.watched = false
  }

  watch(): IncastroState {
    if (!this.watched) {
      this.watched = true
      this.schedule()
      this.clockStart()
    }
    return this.snapshot()
  }

  solution(): IncastroSolution {
    return {
      level: this.level?.id ?? 0,
      words: this.level?.words.map((w) => w.w) ?? [],
      extras: this.level?.extras ?? [],
      secret: this.level?.secret ?? null,
    }
  }

  dispose(): void {
    if (this.phase === 'playing') this.endPlay('left', null)
    this.loading++
    clearTimeout(this.timer)
    clearTimeout(this.hintTimer)
    clearTimeout(this.emitTimer)
  }

  snapshot(): IncastroState {
    const level = this.level
    const lpc = CHAPTER_DATA.levelsPerChapter
    const chapterIndex = Math.floor(this.index / lpc)
    const chapterData = CHAPTER_DATA.chapters[chapterIndex % Math.max(1, CHAPTER_DATA.chapters.length)]
    const chapter: IncastroChapter = {
      id: chapterIndex + 1,
      name: chapterData?.name ?? '',
      accent: chapterData?.accent ?? '#e8577e',
      background: chapterData?.background ?? '',
      levelInChapter: (this.index % lpc) + 1,
      size: lpc,
    }
    const grid: string[] = []
    if (level) {
      for (let r = 0; r < level.rows; r++) {
        let row = ''
        for (let c = 0; c < level.cols; c++) {
          const cell = this.cells.get(`${r},${c}`)
          row += !cell ? '.' : cell.state === 'found' ? cell.letter : cell.state === 'hint' ? cell.letter.toLowerCase() : '_'
        }
        grid.push(row)
      }
    }
    const top = (map: Map<string, IncastroScore>, n: number) =>
      [...map.values()].sort((a, b) => b.points - a.points || b.words - a.words).slice(0, n)
    return {
      phase: this.phase,
      paused: this.paused,
      level: this.index + 1,
      variant: this.playing,
      nextVariant: this.variant,
      ddaOutcome: this.lastOutcome,
      ddaStreak: this.lastOutcome === this.streakOf ? this.streak : 0,
      ddaNeeded: DDA_STREAK,
      difficulty: level ? { target: level.metrics.target, dsim: level.metrics.dsim } : null,
      photo: this.photo,
      nextPhoto: this.nextPhoto?.url ?? null,
      chapter,
      letters: this.letters,
      shuffles: this.shuffles,
      rows: level?.rows ?? 0,
      cols: level?.cols ?? 0,
      grid,
      words:
        level?.words.map((w, i) => {
          const shown = this.found.has(i) || this.missed
          return {
            r: w.r,
            c: w.c,
            d: w.d,
            length: w.w.length,
            text: shown ? w.w : null,
            by: this.found.get(i) ?? null,
            missed: !this.found.has(i) && this.missed,
          }
        }) ?? [],
      extrasFound: this.extras.size,
      extrasTotal: this.extraWords.size,
      moments: this.moments,
      scores: top(this.scores, SCORES_SHOWN),
      levelScores: top(this.levelScores, 3),
      longest: this.longest,
      // Shown once found, or when the level is over.
      secret: level?.secret
        ? {
            length: level.secret.length,
            word: this.secretFound || this.phase === 'complete' ? level.secret : null,
            by: this.secretBy,
          }
        : null,
      remainingMs: this.timeLeft(),
      durationMs: this.durationMs,
      hintInMs: this.hintTimer ? Math.max(0, this.hintEndsAt - Date.now()) : this.hintLeftMs,
      timeUp: this.missed,
      chapterDone: this.chapterDone,
    }
  }

  // Level index + 1 at once when it is already made, otherwise once the generator has it
  // (the overlay shows the level coming meanwhile).
  private startLevel(index: number): void {
    // Skipped, replayed or left for another one: saved as left, with no DDA outcome.
    if (this.phase === 'playing') this.endPlay('left', null)
    clearTimeout(this.hintTimer)
    this.hintTimer = undefined
    this.index = Math.max(0, index)
    const n = this.index + 1
    const ticket = ++this.loading
    const made = levels.ready(n)
    if (made) return this.begin(made)
    this.level = null
    this.phase = 'loading'
    this.setTimer(0)
    this.emitNow()
    levels.get(n).then(
      (level) => {
        if (ticket === this.loading) this.begin(level)
      },
      () => {
        if (ticket !== this.loading) return
        this.phase = 'empty'
        this.emitNow()
      },
    )
  }

  private begin(made: GeneratedLevel): void {
    // A variant this wheel has none of: the standard grid.
    const grid = (this.variant === 'standard' ? null : made.variants[this.variant]) ?? made
    this.playing = grid === made ? 'standard' : this.variant
    const level: Level = { ...grid, id: made.id, letters: made.letters, secret: made.secret }
    this.level = level
    this.letters = level.letters
    this.shuffles = 0
    this.cells.clear()
    for (const w of level.words) {
      for (let i = 0; i < w.w.length; i++) {
        const r = w.d === 'H' ? w.r : w.r + i
        const c = w.d === 'H' ? w.c + i : w.c
        this.cells.set(`${r},${c}`, { letter: w.w[i], state: 'hidden' })
      }
    }
    this.wordIndex = new Map(level.words.map((w, i) => [w.w, i]))
    // The secret word is its own prize, not one of the extras.
    this.extraWords = new Set(level.extras.filter((w) => w !== level.secret))
    this.secretFound = false
    this.secretBy = null
    this.found.clear()
    this.extras.clear()
    this.levelScores.clear()
    this.lastRepeat.clear()
    this.missed = false
    this.chapterDone = false
    this.triggerHints = 0
    this.hints = { auto: 0, streamer: 0, trigger: 0 }
    this.helped.clear()
    this.moments = []
    this.made = made
    saveIncastroLevel(this.key, level.id)
    this.pickPhoto()
    this.emitSolution(this.solution())
    // Made while this one is played.
    levels.prefetch(level.id + 1)
    // The background alone for a few seconds, then the grid; at once on a plain colour or a
    // see-through background, which have nothing to show.
    const bg = this.settings.background
    const introMs = bg === 'color' || bg === 'transparent' ? 0 : num(this.settings, 'introSeconds', 4) * 1000
    if (introMs <= 0) return this.go()
    this.phase = 'intro'
    this.hintLeftMs = 0
    this.setTimer(introMs)
    this.emitNow()
  }

  // The grid comes in: the level's clock, its time limit and the automatic letters start.
  private go(): void {
    this.phase = 'playing'
    this.startPlay(this.made!)
    this.setTimer(num(this.settings, 'levelSeconds', 0) * 1000)
    this.restartHintTimer()
    this.emitNow()
  }

  // The level's NASA picture: the one picked (and preloaded by the overlays) during the level
  // before, or one at random once the feed has answered (the overlay keeps the garden
  // meanwhile, or if NASA cannot be reached). Then the next level's, to preload.
  private pickPhoto(): void {
    if (this.settings.background !== 'nasa') {
      this.photo = null
      this.nextPhoto = null
      return
    }
    const ready = this.nextPhoto
    if (ready) this.photo = ready
    this.nextPhoto = null
    const ticket = this.loading
    void nasaPhotos().then((list) => {
      if (ticket !== this.loading || this.settings.background !== 'nasa') return
      if (!ready) this.photo = randomPhoto(list, this.photo?.url) ?? this.photo
      this.nextPhoto = randomPhoto(list, this.photo?.url)
      this.emitNow()
    })
  }

  private complete(): void {
    if (this.phase !== 'playing') return
    if (this.missed) {
      this.level!.words.forEach((w, i) => {
        if (!this.found.has(i)) this.answer('grid', w.w, 'missed', this.shownOf(w))
      })
    }
    const outcome = this.outcome()
    this.endPlay(this.missed ? 'time-up' : 'complete', outcome)
    this.phase = 'complete'
    this.judge(outcome)
    this.chapterDone = (this.index + 1) % CHAPTER_DATA.levelsPerChapter === 0
    clearTimeout(this.hintTimer)
    this.hintTimer = undefined
    this.hintLeftMs = 0
    this.setTimer(this.settings.autoNext === false ? 0 : this.summaryMs())
    this.emitNow()
  }

  // --- DDA ---

  // How the chat did on the level just finished: struggled (time ran out, or the automatic
  // letter and the dashboard completed a third of the words), cruised (none of them did, and
  // few automatic letters came), or in between. Idle when nobody tried a word: an automatic
  // letter then says nothing about the grid. Gifts' hints are the viewers' choice and count
  // for neither.
  private outcome(): IncastroOutcome {
    if (!this.players.size) return 'idle'
    const words = this.level?.words.length ?? 0
    const helped = [...this.helped.values()].filter((o) => o !== 'trigger').length
    if (this.missed || (words > 0 && helped / words >= STRUGGLE_SHARE)) return 'easier'
    if (!helped && !this.hints.streamer && this.hints.auto <= words * CRUISE_AUTO_PER_WORD) return 'harder'
    return 'steady'
  }

  // The grid of the next level: a step easier or harder once DDA_STREAK levels in a row
  // asked for it (idle ones skipped), and at least DDA_GAP levels after the last change, so
  // one lucky level does not move it; the standard grid when DDA is off.
  private judge(outcome: IncastroOutcome): void {
    this.lastOutcome = outcome
    this.sinceChange++
    if (outcome !== 'idle') {
      this.streak = outcome === this.streakOf ? this.streak + 1 : 1
      this.streakOf = outcome
    }
    if (this.settings.dda === false) {
      this.variant = 'standard'
      return
    }
    const step = this.streakOf === 'easier' ? -1 : this.streakOf === 'harder' ? 1 : 0
    if (!step || this.streak < DDA_STREAK || this.sinceChange < DDA_GAP) return
    const next = VARIANTS[Math.max(0, Math.min(VARIANTS.length - 1, VARIANTS.indexOf(this.variant) + step))]
    if (next === this.variant) return
    this.variant = next
    this.streak = 0
    this.sinceChange = 0
  }

  // --- Plays saved for calibration ---

  private startPlay(made: GeneratedLevel): void {
    const level = this.level!
    this.players.clear()
    this.attempts = 0
    this.wrong = 0
    this.firstMs = null
    this.lastFindMs = 0
    this.stallMs = 0
    this.clockMs = 0
    this.clockSince = 0
    this.clockStart()
    this.play = null
    safely(() => {
      this.play = startZerowordsPlay({
        key: this.key,
        level: level.id,
        variant: this.playing,
        generator: made.version,
        archetype: made.archetype,
        seed: made.seed,
        target: level.metrics.target,
        dsim: level.metrics.dsim,
        words: level.words.length,
        hint_seconds: this.settings.autoHints === false ? 0 : num(this.settings, 'hintSeconds', 30),
      })
    })
  }

  private endPlay(result: ZerowordsPlayEnd['result'], outcome: IncastroOutcome | null): void {
    this.clockStop()
    const id = this.play
    if (id === null) return
    this.play = null
    const now = this.elapsed()
    safely(() =>
      endZerowordsPlay(id, {
        active_ms: Math.round(now),
        result,
        outcome,
        players: this.players.size,
        attempts: this.attempts,
        wrong: this.wrong,
        hints_auto: this.hints.auto,
        hints_streamer: this.hints.streamer,
        hints_trigger: this.hints.trigger,
        first_ms: this.firstMs,
        stall_ms: Math.round(Math.max(this.stallMs, now - this.lastFindMs)),
      }),
    )
  }

  private answer(kind: 'grid' | 'extra' | 'secret' | 'hint', word: string | null, how: HintOrigin | 'chat' | 'missed', shown: string | null = null): void {
    const play = this.play
    if (play === null) return
    safely(() => addZerowordsAnswer({ play, at_ms: Math.round(this.elapsed()), kind, word, how, shown }))
  }

  // A grid word as it shows on the board: V_G___.
  private shownOf(w: Placed): string {
    return this.cellsOf(w)
      .map((c) => (c.state === 'hidden' ? '_' : c.letter))
      .join('')
  }

  // Played time of the level: running while it is played, watched and not paused.
  private clockStart(): void {
    if (!this.clockSince && this.phase === 'playing' && !this.paused && this.watched) this.clockSince = Date.now()
  }

  private clockStop(): void {
    if (this.clockSince) this.clockMs += Date.now() - this.clockSince
    this.clockSince = 0
  }

  private elapsed(): number {
    return this.clockMs + (this.clockSince ? Date.now() - this.clockSince : 0)
  }

  private summaryMs(): number {
    return num(this.settings, 'completeSeconds', 8) * 1000 + (this.chapterDone ? CHAPTER_BONUS_MS : 0)
  }

  private guess(event: LiveEvent): void {
    if (event.type !== 'comment' || this.phase !== 'playing' || !this.level) return
    const by: IncastroPlayer = { id: event.user.id, nickname: event.user.nickname, avatar: event.user.avatar }
    const before = this.seq
    for (const word of wordsIn(event.text)) {
      const i = this.wordIndex.get(word)
      // A try: a word of the wheel's letters, long enough to count (not just chatter).
      if (word.length >= MIN_LEN && onWheel(word, this.letters)) {
        this.attempts++
        this.players.add(by.id)
        if (i === undefined && word !== this.level.secret && !this.extraWords.has(word)) this.wrong++
      }
      if (i !== undefined) {
        if (!this.found.has(i)) this.findWord(i, by)
        else if (Date.now() - (this.lastRepeat.get(word) ?? 0) > REPEAT_GAP_MS) {
          // Shown now and then, so a word everybody types does not flood the feed.
          this.lastRepeat.set(word, Date.now())
          this.addMoment({ kind: 'repeat', word, by })
        }
      } else if (word === this.level.secret && !this.secretFound) {
        const points = SECRET_POINTS_PER_LETTER * word.length
        this.secretFound = true
        this.secretBy = by
        this.addPoints(by, points, 1)
        this.noteLongest(word, by)
        this.addMoment({ kind: 'secret', word, by, points })
        this.answer('secret', word, 'chat')
      } else if (this.settings.extras !== false && this.extraWords.has(word) && !this.extras.has(word)) {
        this.answer('extra', word, 'chat')
        this.extras.add(word)
        this.addPoints(by, EXTRA_POINTS, 0)
        this.noteLongest(word, by)
        this.addMoment({ kind: 'extra', word, by, points: EXTRA_POINTS })
      }
      if (this.phase !== 'playing') break
    }
    // Most comments are chatter or wrong words: only a moment is worth an update.
    if (this.seq !== before) this.queueEmit()
  }

  private findWord(i: number, by: IncastroPlayer): void {
    const word = this.level!.words[i]
    const full = word.w.length === this.letters.length
    const points = word.w.length + (full ? FULL_WORD_BONUS : 0)
    const now = this.elapsed()
    this.answer('grid', word.w, 'chat', this.shownOf(word))
    this.firstMs ??= Math.round(now)
    this.stallMs = Math.max(this.stallMs, now - this.lastFindMs)
    this.lastFindMs = now
    this.found.set(i, by)
    this.cellsOf(word).forEach((cell) => (cell.state = 'found'))
    this.addPoints(by, points, 1)
    this.noteLongest(word.w, by)
    this.addMoment({ kind: 'found', word: word.w, by, points, full })
    this.restartHintTimer()
    this.checkDone()
  }

  // A letter for everyone. The first letter of a word nobody has started helps most;
  // otherwise any hidden letter. Returns false when there is nothing left to show.
  private revealLetter(by: IncastroPlayer | null, origin: HintOrigin): boolean {
    if (this.phase !== 'playing' || !this.level) return false
    const open = this.level.words.filter((_, i) => !this.found.has(i))
    const untouched = open.filter((w) => this.cellsOf(w).every((c) => c.state === 'hidden'))
    const pool = untouched.length
      ? untouched.map((w) => this.cellsOf(w)[0])
      : open.flatMap((w) => this.cellsOf(w)).filter((c) => c.state === 'hidden')
    if (!pool.length) return false
    pool[Math.floor(Math.random() * pool.length)].state = 'hint'
    this.hints[origin]++
    this.answer('hint', null, origin)
    this.addMoment({ kind: 'hint', by })
    this.completeShownWords(origin)
    this.restartHintTimer()
    this.emitNow()
    return true
  }

  private revealWord(by: IncastroPlayer | null, origin: HintOrigin): boolean {
    if (this.phase !== 'playing' || !this.level) return false
    const open = this.level.words.map((w, i) => ({ w, i })).filter(({ i }) => !this.found.has(i))
    if (!open.length) return false
    const { w } = open[Math.floor(Math.random() * open.length)]
    for (const cell of this.cellsOf(w)) if (cell.state === 'hidden') cell.state = 'hint'
    this.hints[origin]++
    this.answer('hint', w.w, origin)
    this.addMoment({ kind: 'reveal', word: w.w, by })
    this.completeShownWords(origin)
    this.restartHintTimer()
    this.emitNow()
    return true
  }

  // Words whose every letter is now on the board count as found, by nobody: the hint did it.
  private completeShownWords(origin: HintOrigin): void {
    this.level!.words.forEach((w, i) => {
      if (this.found.has(i) || this.cellsOf(w).some((c) => c.state === 'hidden')) return
      this.found.set(i, null)
      this.helped.set(i, origin)
      this.answer('grid', w.w, origin)
    })
    this.checkDone()
  }

  private checkDone(): void {
    if (this.level && this.found.size === this.level.words.length) this.complete()
  }

  private shuffleWheel(by: IncastroPlayer | null): void {
    if (this.phase !== 'playing' || !this.level) return
    this.lastShuffle = Date.now()
    this.letters = reshuffle(this.letters, this.level.words[0].w)
    this.shuffles++
    this.addMoment({ kind: 'shuffle', by })
    this.emitNow()
  }

  private addTime(ms: number): void {
    if (this.phase !== 'playing' || this.durationMs <= 0) return
    this.freeze()
    this.leftMs = Math.min(this.leftMs + ms, MAX_LEVEL_MS)
    this.durationMs = Math.max(this.durationMs, this.leftMs)
    this.schedule()
    this.emitNow()
  }

  private cellsOf(w: Placed) {
    return [...w.w].map((_, k) => this.cells.get(w.d === 'H' ? `${w.r},${w.c + k}` : `${w.r + k},${w.c}`)!)
  }

  private addPoints(by: IncastroPlayer, points: number, words: number): void {
    for (const map of [this.scores, this.levelScores]) {
      const cur = map.get(by.id)
      map.set(by.id, {
        id: by.id,
        nickname: by.nickname,
        avatar: by.avatar ?? cur?.avatar,
        points: (cur?.points ?? 0) + points,
        words: (cur?.words ?? 0) + words,
      })
    }
  }

  // A longer word takes the record; one of the same length leaves it to whoever was first.
  private noteLongest(word: string, by: IncastroPlayer): void {
    if (word.length > (this.longest?.word.length ?? 0)) this.longest = { word, by }
  }

  private addMoment(moment: NewMoment): void {
    this.moments = [{ ...moment, seq: ++this.seq } as IncastroMoment, ...this.moments].slice(0, MOMENTS_KEPT)
  }

  // --- Timers ---

  private setTimer(ms: number): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.durationMs = ms
    this.leftMs = ms
    this.schedule()
  }

  private restartHintTimer(): void {
    clearTimeout(this.hintTimer)
    this.hintTimer = undefined
    this.hintLeftMs = this.phase === 'playing' && this.settings.autoHints !== false ? num(this.settings, 'hintSeconds', 30) * 1000 : 0
    this.schedule()
  }

  // (Re)starts both timers from what they have left; a running one keeps counting.
  private schedule(): void {
    this.freeze()
    if (this.paused || !this.watched) return
    if (this.leftMs > 0) {
      this.endsAt = Date.now() + this.leftMs
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.leftMs = 0
        if (this.phase === 'playing') this.timeUp()
        else if (this.phase === 'intro') this.go()
        else if (this.phase === 'complete') this.startLevel(this.index + 1)
      }, this.leftMs)
    }
    if (this.hintLeftMs > 0 && this.phase === 'playing') {
      this.hintEndsAt = Date.now() + this.hintLeftMs
      this.hintTimer = setTimeout(() => {
        this.hintTimer = undefined
        this.hintLeftMs = 0
        if (!this.revealLetter(null, 'auto')) this.emitNow()
      }, this.hintLeftMs)
    }
  }

  private timeUp(): void {
    this.missed = true
    this.complete()
  }

  private freeze(): void {
    if (this.timer) this.leftMs = Math.max(0, this.endsAt - Date.now())
    if (this.hintTimer) this.hintLeftMs = Math.max(0, this.hintEndsAt - Date.now())
    clearTimeout(this.timer)
    clearTimeout(this.hintTimer)
    this.timer = undefined
    this.hintTimer = undefined
  }

  private timeLeft(): number {
    return this.timer ? Math.max(0, this.endsAt - Date.now()) : this.leftMs
  }

  // A busy chat can send dozens of words a second: coalesce them into one update.
  private queueEmit(): void {
    this.emitTimer ??= setTimeout(() => this.emitNow(), EMIT_EVERY_MS)
  }

  private emitNow(): void {
    clearTimeout(this.emitTimer)
    this.emitTimer = undefined
    this.emit(this.snapshot())
  }
}

// One room per overlay key, alive while that key has Incastro selected.
export class IncastroRooms {
  private rooms = new Map<string, IncastroRoom>()

  constructor(
    private emit: (key: string, state: IncastroState) => void,
    private emitSolution: (key: string, solution: IncastroSolution) => void,
  ) {}

  // Starts the game for a key if needed and wakes it up if it was suspended.
  open(key: string, settings: GameSettings): IncastroState {
    let room = this.rooms.get(key)
    if (!room) {
      room = new IncastroRoom(
        key,
        settings,
        (state) => this.emit(key, state),
        (solution) => this.emitSolution(key, solution),
      )
      this.rooms.set(key, room)
    }
    return room.watch()
  }

  get(key: string): IncastroRoom | undefined {
    return this.rooms.get(key)
  }

  close(key: string): void {
    this.rooms.get(key)?.dispose()
    this.rooms.delete(key)
  }
}
