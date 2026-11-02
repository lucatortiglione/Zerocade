import { existsSync, readFileSync } from 'node:fs'
import type {
  GameSettings,
  IncastroChapter,
  IncastroCommand,
  IncastroMoment,
  IncastroPlayer,
  IncastroRecord,
  IncastroScore,
  IncastroSolution,
  IncastroState,
  IncastroVariant,
  LiveEvent,
} from '@zerocade/shared'
import { incastroLevel, saveIncastroLevel } from './db.js'
import { files } from './wordgen/files.js'
import type { Placed } from './wordgen/board.js'
import type { GeneratedLevel, Grid } from './wordgen/generator.js'
import { levels } from './wordgen/levels.js'

// Incastro (shown as ZeroWords), the word game: a wheel of letters and a crossword to fill
// from chat, in Italian. Levels never run out: the generator (wordgen/, GENERATORE.md in
// gioco-parole) makes level n when the game gets near it, with an easier and a harder grid on
// the same wheel; the chapters of chapters.json repeat. DDA picks the grid of each level from
// how the chat did on the one before.

// The grid in play: the level's standard grid or one of its variants.
type Level = Grid & { id: number; letters: string }

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
// DDA: hints that showed this share of the words mean the chat struggled.
const STRUGGLE_SHARE = 1 / 3

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

const num = (s: GameSettings, id: string, fallback: number) => (typeof s[id] === 'number' ? (s[id] as number) : fallback)

const EMIT_EVERY_MS = 150
const MOMENTS_KEPT = 8
const SCORES_SHOWN = 10
const FULL_WORD_BONUS = 3
const EXTRA_POINTS = 1
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
  // Letters and words shown by hints in this level (automatic, gifts or the dashboard).
  private hints = 0
  // Bumped by every level start, so a level generated too late is not started.
  private loading = 0
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
    const done = action === 'hint' ? this.revealLetter(by) : this.revealWord(by)
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
        this.revealLetter(null)
        return
      case 'reveal-word':
        this.revealWord(null)
        return
      case 'shuffle':
        return this.shuffleWheel(null)
      case 'extra-time':
        return this.addTime(EXTRA_TIME_MS)
      case 'pause':
        this.freeze()
        this.paused = true
        return this.emitNow()
      case 'resume':
        this.paused = false
        this.schedule()
        return this.emitNow()
      case 'restart':
        this.scores.clear()
        this.longest = null
        this.variant = 'standard'
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
    this.watched = false
  }

  watch(): IncastroState {
    if (!this.watched) {
      this.watched = true
      this.schedule()
    }
    return this.snapshot()
  }

  solution(): IncastroSolution {
    return {
      level: this.level?.id ?? 0,
      words: this.level?.words.map((w) => w.w) ?? [],
      extras: this.level?.extras ?? [],
    }
  }

  dispose(): void {
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
      difficulty: level ? { target: level.metrics.target, dsim: level.metrics.dsim } : null,
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
      extrasTotal: level?.extras.length ?? 0,
      moments: this.moments,
      scores: top(this.scores, SCORES_SHOWN),
      levelScores: top(this.levelScores, 3),
      longest: this.longest,
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
    this.playing = this.variant
    const grid = this.variant === 'standard' ? made : made.variants[this.variant]
    const level: Level = { ...grid, id: made.id, letters: made.letters }
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
    this.extraWords = new Set(level.extras)
    this.found.clear()
    this.extras.clear()
    this.levelScores.clear()
    this.lastRepeat.clear()
    this.missed = false
    this.chapterDone = false
    this.triggerHints = 0
    this.hints = 0
    this.moments = []
    this.phase = 'playing'
    saveIncastroLevel(this.key, level.id)
    this.setTimer(num(this.settings, 'levelSeconds', 0) * 1000)
    this.restartHintTimer()
    this.emitNow()
    this.emitSolution(this.solution())
    // Made while this one is played.
    levels.prefetch(level.id + 1)
  }

  private complete(): void {
    if (this.phase !== 'playing') return
    this.phase = 'complete'
    this.variant = this.nextVariant()
    this.chapterDone = (this.index + 1) % CHAPTER_DATA.levelsPerChapter === 0
    clearTimeout(this.hintTimer)
    this.hintTimer = undefined
    this.hintLeftMs = 0
    this.setTimer(this.settings.autoNext === false ? 0 : this.summaryMs())
    this.emitNow()
  }

  // DDA: one step easier when the chat struggled (time ran out, or hints showed at least a
  // third of the words), one step harder when it found every word with no hint at all; the
  // standard grid when DDA is off.
  private nextVariant(): IncastroVariant {
    if (this.settings.dda === false) return 'standard'
    const words = this.level?.words.length ?? 0
    const byHints = [...this.found.values()].filter((by) => by === null).length
    const struggled = this.missed || (words > 0 && byHints / words >= STRUGGLE_SHARE)
    const cruised = !this.missed && this.hints === 0
    const at = VARIANTS.indexOf(this.variant) + (struggled ? -1 : cruised ? 1 : 0)
    return VARIANTS[Math.max(0, Math.min(VARIANTS.length - 1, at))]
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
      if (i !== undefined) {
        if (!this.found.has(i)) this.findWord(i, by)
        else if (Date.now() - (this.lastRepeat.get(word) ?? 0) > REPEAT_GAP_MS) {
          // Shown now and then, so a word everybody types does not flood the feed.
          this.lastRepeat.set(word, Date.now())
          this.addMoment({ kind: 'repeat', word, by })
        }
      } else if (this.settings.extras !== false && this.extraWords.has(word) && !this.extras.has(word)) {
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
  private revealLetter(by: IncastroPlayer | null): boolean {
    if (this.phase !== 'playing' || !this.level) return false
    const open = this.level.words.filter((_, i) => !this.found.has(i))
    const untouched = open.filter((w) => this.cellsOf(w).every((c) => c.state === 'hidden'))
    const pool = untouched.length
      ? untouched.map((w) => this.cellsOf(w)[0])
      : open.flatMap((w) => this.cellsOf(w)).filter((c) => c.state === 'hidden')
    if (!pool.length) return false
    pool[Math.floor(Math.random() * pool.length)].state = 'hint'
    this.hints++
    this.addMoment({ kind: 'hint', by })
    this.completeShownWords()
    this.restartHintTimer()
    this.emitNow()
    return true
  }

  private revealWord(by: IncastroPlayer | null): boolean {
    if (this.phase !== 'playing' || !this.level) return false
    const open = this.level.words.map((w, i) => ({ w, i })).filter(({ i }) => !this.found.has(i))
    if (!open.length) return false
    const { w } = open[Math.floor(Math.random() * open.length)]
    for (const cell of this.cellsOf(w)) if (cell.state === 'hidden') cell.state = 'hint'
    this.hints++
    this.addMoment({ kind: 'reveal', word: w.w, by })
    this.completeShownWords()
    this.restartHintTimer()
    this.emitNow()
    return true
  }

  // Words whose every letter is now on the board count as found, by nobody.
  private completeShownWords(): void {
    this.level!.words.forEach((w, i) => {
      if (!this.found.has(i) && this.cellsOf(w).every((c) => c.state !== 'hidden')) this.found.set(i, null)
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
        else if (this.phase === 'complete') this.startLevel(this.index + 1)
      }, this.leftMs)
    }
    if (this.hintLeftMs > 0 && this.phase === 'playing') {
      this.hintEndsAt = Date.now() + this.hintLeftMs
      this.hintTimer = setTimeout(() => {
        this.hintTimer = undefined
        this.hintLeftMs = 0
        if (!this.revealLetter(null)) this.emitNow()
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
