import { randomUUID } from 'node:crypto'
import { disposeGameRooms, RoomParticipants } from './gameRooms.js'
import { openSource, sourceReady, zeroQuizzDb } from './schema-db.js'
import Database from 'better-sqlite3'
import {
  QUIZZLAND_LETTERS,
  type GameSettings,
  type LiveEvent,
  type QuizzlandCommand,
  type QuizzlandFast,
  type QuizzlandPlayer,
  type QuizzlandScore,
  type QuizzlandSolution,
  type QuizzlandState,
  type QuizzlandStats,
  type Viewer,
} from '@zerocade/shared'
import { toCsv } from './csv.js'
import { recordScore } from './scores.js'
import { flagQuizzland, quizzlandFlags, quizzlandTotalsByQuestion, recordQuizzlandAnswer, unflagQuizzland } from './db.js'

// Quizzland (ZeroQuizz), the server-driven quiz. Questions come from its own database,
// database/ZeroQuizz.sqlite3 (tables domande, opzioni, categorie; gioco-quizzland/script/domande.py imports
// and exports it as CSV), read once at start: a new question only needs an edit and a restart. The
// Windows package ships the file next to the server; ZEROCADE_QUIZZLAND_DB points elsewhere.

interface Question {
  id: string
  category: string
  difficulty: number
  text: string
  explanation: string
  // The answers keep the database's order on screen (Primo, Secondo, Terzo…).
  fixedOrder: boolean
  // In the database's order (opzioni.posizione); `answer` is the right one.
  options: string[]
  answer: number
}

// ZEROCADE_QUIZZLAND_DB (a database or `file#schema`), otherwise database/ZeroQuizz.sqlite3.
const dbPath = [
  process.env.ZEROCADE_QUIZZLAND_DB,
  zeroQuizzDb,
].find((p): p is string => typeof p === 'string' && sourceReady(p))

interface Row {
  id: string
  categoria: string
  difficolta: number
  testo: string
  spiegazione: string
  ordine_fisso: number
  opzione: string
  giusta: number
}

// The active questions, in the database's order (domande.ordine). One without 2 to 4 answers, or without
// exactly one right answer, is left out (script/domande.py stats lists them).
function loadQuestions(): Question[] {
  if (!dbPath) {
    console.warn('[quizzland] database/ZeroQuizz.sqlite3 not found: the game has no questions')
    return []
  }
  let db: Database.Database | undefined
  try {
    db = openSource(dbPath)
    const rows = db
      .prepare(
        `SELECT d.id, c.nome AS categoria, d.difficolta, d.testo, d.spiegazione, d.ordine_fisso, o.testo AS opzione,
                o.posizione = d.giusta AS giusta
         FROM domande d JOIN categorie c ON c.n = d.categoria JOIN opzioni o ON o.domanda = d.n
         WHERE d.attiva = 1
         ORDER BY d.ordine, o.posizione`,
      )
      .all() as Row[]
    const byId = new Map<string, Question & { right: number[] }>()
    for (const row of rows) {
      let q = byId.get(row.id)
      if (!q) {
        q = {
          id: row.id,
          category: row.categoria.trim().toLowerCase(),
          difficulty: Math.min(3, Math.max(1, Math.round(Number(row.difficolta)) || 2)),
          text: row.testo.trim(),
          explanation: row.spiegazione.trim(),
          fixedOrder: row.ordine_fisso === 1,
          options: [],
          answer: -1,
          right: [],
        }
        byId.set(row.id, q)
      }
      if (row.giusta === 1) q.right.push(q.options.length)
      q.options.push(row.opzione.trim())
    }
    const out: Question[] = []
    for (const { right, ...q } of byId.values()) {
      if (q.options.length < 2 || q.options.length > QUIZZLAND_LETTERS.length || right.length !== 1 || !q.text) {
        console.warn(`[quizzland] ${q.id} left out: it needs 2 to 4 answers and exactly one right`)
        continue
      }
      out.push({ ...q, answer: right[0] })
    }
    return out
  } catch (err) {
    console.warn(`[quizzland] ${dbPath}: ${err instanceof Error ? err.message : String(err)}`)
    return []
  } finally {
    db?.close()
  }
}

export const QUESTIONS = loadQuestions()

// Questions marked as wrong from the dashboard (any overlay key): out of the game until
// unmarked; the CSV export lists them, to be fixed in database/ZeroQuizz.sqlite3.
const flagged = new Set(quizzlandFlags().map((f) => f.question_id))

function setFlag(id: string, on: boolean): void {
  if (on === flagged.has(id)) return
  if (on) {
    flagQuizzland(id)
    flagged.add(id)
  } else {
    unflagQuizzland(id)
    flagged.delete(id)
  }
}

// An answer is a whole comment of one letter A-D or one digit 1-4, ignoring case, spaces and
// punctuation: "b!" answers, "b secondo me" does not. The inputMode setting narrows it to
// letters or numbers; 'auto' takes both. Returns the option's position on screen.
export function parseAnswer(text: string, count: number, mode = 'auto'): number | null {
  const t = text.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')
  if (t.length !== 1) return null
  const letter = mode === 'numbers' ? -1 : 'ABCD'.indexOf(t)
  const digit = mode === 'letters' ? -1 : '1234'.indexOf(t)
  const pick = letter >= 0 ? letter : digit
  return pick >= 0 && pick < count ? pick : null
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const num = (s: GameSettings, id: string, fallback: number) => (typeof s[id] === 'number' ? (s[id] as number) : fallback)
const str = (s: GameSettings, id: string, fallback: string) => (typeof s[id] === 'string' ? (s[id] as string) : fallback)

const playerOf = ({ id, nickname, avatar }: Viewer): QuizzlandPlayer => (avatar ? { id, nickname, avatar } : { id, nickname })

const EMIT_EVERY_MS = 200
const ANSWERERS_SHOWN = 12
const FASTEST_SHOWN = 3
const SCORES_SENT = 10
const EXTRA_TIME_MS = 10_000
const MAX_PHASE_MS = 600_000
// The speed bonus: up to half the points again, for an answer right at the start.
const SPEED_BONUS = 0.5

interface Ballot {
  player: QuizzlandPlayer
  // Position on screen, and in the database (opzioni.posizione).
  pick: number
  choice: number
  ms: number
  // What it is worth if right (base + speed bonus), 0 if wrong.
  points: number
}

class QuizzlandRoom {
  private participants = new RoomParticipants()
  private deck: Question[] = []
  private current: Question | null = null
  // Position on screen -> index of the current question's options.
  private order: number[] = []
  private roundId = ''
  private phase: QuizzlandState['phase'] = 'empty'
  private number = 0
  // Each viewer's first answer, in the order they came.
  private ballots = new Map<string, Ballot>()
  private counts: number[] = []
  private answerers: QuizzlandPlayer[] = []
  private eliminated: number[] = []
  private fiftyBy: QuizzlandPlayer | null = null
  private right = 0
  private fastest: QuizzlandFast[] = []
  private scores = new Map<string, QuizzlandScore>()
  // Time given to the question so far (its seconds plus any extra time): the speed bonus is
  // the share of it still left when the answer came.
  private grantedMs = 0
  // While the timer runs the phase ends at `endsAt`; otherwise `leftMs` is what is left.
  // A phase with leftMs = 0 and no timer waits for the dashboard.
  private durationMs = 0
  private leftMs = 0
  private endsAt = 0
  private timer: NodeJS.Timeout | undefined
  private emitTimer: NodeJS.Timeout | undefined
  private paused = false
  private watched = true

  constructor(
    private key: string,
    private settings: GameSettings,
    private emit: (state: QuizzlandState) => void,
    private emitSolution: (solution: QuizzlandSolution) => void,
    private issue: (message: string) => void,
  ) {
    this.buildDeck()
    this.startRound()
  }

  action(action: string, event: LiveEvent): void {
    if (!this.watched) return
    if (!this.participants.accept(event.user.id, this.issue)) return
    if (action === 'answer') this.answer(event)
    else if (action === 'fifty') this.fifty(playerOf(event.user))
    else if (action === 'extra_time') this.addTime(EXTRA_TIME_MS)
    else if (action === 'next') this.advance()
  }

  control(command: QuizzlandCommand): void {
    switch (command) {
      case 'next':
        return this.advance()
      case 'reveal':
        return this.reveal()
      case 'extra-time':
        return this.addTime(EXTRA_TIME_MS)
      case 'fifty':
        return this.fifty(null)
      case 'pause':
        this.freeze()
        this.paused = true
        return this.emitNow()
      case 'resume':
        this.paused = false
        this.schedule()
        return this.emitNow()
      case 'restart':
        this.number = 0
        this.paused = false
        this.scores.clear()
        this.buildDeck()
        return this.startRound()
      case 'clear-scores':
        this.scores.clear()
        return this.emitNow()
      case 'flag':
      case 'unflag':
        // The round goes on; a flagged question is just not dealt again.
        if (this.current) setFlag(this.current.id, command === 'flag')
        return this.emitNow()
    }
  }

  applySettings(settings: GameSettings): void {
    const prev = this.settings
    this.settings = settings
    if (['categories', 'difficulty'].some((id) => prev[id] !== settings[id])) {
      this.buildDeck()
      if (!this.current || !this.matches(this.current)) return this.startRound()
    }
    const auto = settings.autoNext !== false
    if (this.phase === 'reveal' && auto !== (prev.autoNext !== false)) {
      this.setTimer(auto ? num(settings, 'revealSeconds', 8) * 1000 : 0)
    }
    this.emitNow()
  }

  // Nobody has the dashboard or an overlay open: freeze the round and ignore answers, so no
  // question is played to an empty room.
  suspend(): void {
    this.freeze()
    this.watched = false
  }

  watch(): QuizzlandState {
    if (!this.watched) {
      this.watched = true
      this.schedule()
    }
    return this.snapshot()
  }

  dispose(): void {
    this.watched = false
    this.participants.clear()
    clearTimeout(this.timer)
    clearTimeout(this.emitTimer)
  }

  solution(): QuizzlandSolution | null {
    return this.current ? { roundId: this.roundId, correct: this.order.indexOf(this.current.answer) } : null
  }

  snapshot(): QuizzlandState {
    const q = this.current
    const shown = this.phase === 'reveal' || this.phase === 'break'
    return {
      phase: this.phase,
      paused: this.paused,
      roundId: this.roundId,
      number: this.number,
      available: QUESTIONS.filter((x) => this.matches(x) && !flagged.has(x.id)).length,
      question: q
        ? {
            id: q.id,
            category: q.category,
            difficulty: q.difficulty,
            text: q.text,
            options: this.order.map((i) => q.options[i]),
            flagged: flagged.has(q.id),
          }
        : null,
      correct: q && shown ? this.order.indexOf(q.answer) : null,
      explanation: q && shown ? q.explanation || null : null,
      eliminated: [...this.eliminated],
      fiftyBy: this.fiftyBy,
      answered: this.ballots.size,
      counts: shown || this.settings.liveCounts === true ? [...this.counts] : null,
      answerers: this.answerers,
      right: shown ? this.right : 0,
      fastest: shown ? this.fastest : [],
      scores: this.ranking().slice(0, SCORES_SENT),
      remainingMs: this.timeLeft(),
      durationMs: this.durationMs,
      flagged: flagged.size,
    }
  }

  // Most points first; at a tie, more right answers, then whoever got there first.
  private ranking(): QuizzlandScore[] {
    return [...this.scores.values()].sort((a, b) => b.points - a.points || b.correct - a.correct)
  }

  private matches(q: Question): boolean {
    const categories = str(this.settings, 'categories', '').split(',').filter(Boolean)
    const difficulty = str(this.settings, 'difficulty', 'all')
    return (categories.length === 0 || categories.includes(q.category)) && (difficulty === 'all' || String(q.difficulty) === difficulty)
  }

  // Least-played questions first (shuffled among equals), so every question gets asked
  // before any comes back, across restarts too; never the one just asked twice in a row.
  private buildDeck(): void {
    const rounds = new Map(quizzlandTotalsByQuestion().map((r) => [r.id, r.rounds]))
    this.deck = shuffle(QUESTIONS.filter((q) => this.matches(q) && !flagged.has(q.id))).sort(
      (x, y) => (rounds.get(x.id) ?? 0) - (rounds.get(y.id) ?? 0),
    )
    if (this.deck.length > 1 && this.deck[0].id === this.current?.id) this.deck.push(this.deck.shift()!)
  }

  private startRound(): void {
    if (!this.deck.length) this.buildDeck()
    this.current = this.deck.shift() ?? null
    this.roundId = randomUUID()
    this.ballots.clear()
    this.answerers = []
    this.eliminated = []
    this.fiftyBy = null
    this.right = 0
    this.fastest = []
    const q = this.current
    if (q) {
      const positions = q.options.map((_, i) => i)
      this.order = q.fixedOrder || this.settings.shuffleOptions === false ? positions : shuffle(positions)
      this.counts = q.options.map(() => 0)
      this.phase = 'question'
      this.number++
      this.setTimer(num(this.settings, 'questionSeconds', 20) * 1000)
      this.grantedMs = this.durationMs
      this.emitSolution({ roundId: this.roundId, correct: this.order.indexOf(q.answer) })
    } else {
      this.order = []
      this.counts = []
      this.phase = 'empty'
      this.setTimer(0)
    }
    this.emitNow()
  }

  // "Prossima": after a reveal, the leaderboard; otherwise a new question straight away.
  private advance(): void {
    if (this.phase === 'reveal') this.startBreak()
    else this.startRound()
  }

  // The answers are scored here, all at once: until now nobody (not even the leaderboard)
  // gave away which one was right.
  private reveal(): void {
    if (this.phase !== 'question' || !this.current) return
    const answer = this.current.answer
    this.phase = 'reveal'
    this.right = 0
    this.fastest = []
    for (const s of this.scores.values()) s.last = 0
    for (const b of this.ballots.values()) {
      if (b.choice !== answer) continue
      this.right++
      recordScore(this.key, 'quizzland', b.player, b.points)
      const s = this.scores.get(b.player.id) ?? { ...b.player, points: 0, correct: 0, streak: 0, last: 0 }
      // The latest name and picture.
      Object.assign(s, b.player, { points: s.points + b.points, correct: s.correct + 1, streak: s.streak + 1, last: b.points })
      this.scores.set(b.player.id, s)
      if (this.fastest.length < FASTEST_SHOWN) this.fastest.push({ ...b.player, ms: b.ms, points: b.points })
    }
    // A wrong or missing answer breaks the run.
    for (const s of this.scores.values()) if (s.last === 0) s.streak = 0
    this.setTimer(this.settings.autoNext === false ? 0 : num(this.settings, 'revealSeconds', 8) * 1000)
    this.emitNow()
  }

  // The leaderboard between two questions. It always counts down, also with "Avanza da
  // solo" off (then it comes when the streamer moves on from the answer); 0 seconds skips it.
  private startBreak(): void {
    const ms = num(this.settings, 'breakSeconds', 5) * 1000
    if (ms <= 0) return this.startRound()
    this.phase = 'break'
    this.setTimer(ms)
    this.emitNow()
  }

  private answer(event: LiveEvent): void {
    const q = this.current
    if (event.type !== 'comment' || this.phase !== 'question' || !q) return
    // The first answer counts: no changing it once the others start answering.
    if (this.ballots.has(event.user.id)) return
    const pick = parseAnswer(event.text, this.order.length, str(this.settings, 'inputMode', 'auto'))
    if (pick === null) return
    const choice = this.order[pick]
    const left = this.timeLeft()
    const ms = Math.max(0, this.grantedMs - left)
    const correct = choice === q.answer
    const base = num(this.settings, 'points', 100)
    const bonus = this.settings.speedBonus !== false && this.grantedMs > 0 ? Math.round(base * SPEED_BONUS * (left / this.grantedMs)) : 0
    const player = playerOf(event.user)
    this.ballots.set(player.id, { player, pick, choice, ms, points: correct ? base + bonus : 0 })
    this.counts[pick]++
    this.answerers = [player, ...this.answerers].slice(0, ANSWERERS_SHOWN)
    recordQuizzlandAnswer({
      roundId: this.roundId,
      key: this.key,
      questionId: q.id,
      userId: player.id,
      nickname: player.nickname,
      choice,
      correct,
      ms,
    })
    this.queueEmit()
  }

  // 50:50: wrong answers go, leaving the right one and one wrong one. Once per question.
  private fifty(by: QuizzlandPlayer | null): void {
    const q = this.current
    if (this.phase !== 'question' || !q || this.eliminated.length) return
    const wrong = this.order.map((_, pos) => pos).filter((pos) => this.order[pos] !== q.answer)
    const take = this.order.length - 2
    if (take <= 0) return
    this.eliminated = shuffle(wrong)
      .slice(0, take)
      .sort((a, b) => a - b)
    this.fiftyBy = by
    this.emitNow()
  }

  private addTime(ms: number): void {
    if (this.phase !== 'question') return
    this.freeze()
    const before = this.leftMs
    this.leftMs = Math.min(this.leftMs + ms, MAX_PHASE_MS)
    this.grantedMs += this.leftMs - before
    this.durationMs = Math.max(this.durationMs, this.leftMs)
    this.schedule()
    this.emitNow()
  }

  private setTimer(ms: number): void {
    this.durationMs = ms
    this.leftMs = ms
    this.schedule()
  }

  private schedule(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.leftMs <= 0 || this.paused || !this.watched) return
    this.endsAt = Date.now() + this.leftMs
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.leftMs = 0
      if (this.phase === 'question') this.reveal()
      else if (this.phase === 'reveal') this.startBreak()
      else this.startRound()
    }, this.leftMs)
  }

  private freeze(): void {
    if (this.timer) this.leftMs = Math.max(0, this.endsAt - Date.now())
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private timeLeft(): number {
    return this.timer ? Math.max(0, this.endsAt - Date.now()) : this.leftMs
  }

  // Answers can arrive by the hundred on a busy live: coalesce them into one update.
  private queueEmit(): void {
    this.emitTimer ??= setTimeout(() => this.emitNow(), EMIT_EVERY_MS)
  }

  private emitNow(): void {
    clearTimeout(this.emitTimer)
    this.emitTimer = undefined
    this.emit(this.snapshot())
  }
}

// One room per overlay key, alive while that key has Quizzland selected.
export class QuizzlandRooms {
  private rooms = new Map<string, QuizzlandRoom>()

  constructor(
    private emit: (key: string, state: QuizzlandState) => void,
    private emitSolution: (key: string, solution: QuizzlandSolution) => void,
    private issue: (key: string, message: string) => void = (_key, message) => console.warn('[zeroquizz]', message),
  ) {}

  // Starts the game for a key if needed and wakes it up if it was suspended.
  open(key: string, settings: GameSettings): QuizzlandState {
    let room = this.rooms.get(key)
    if (!room) {
      room = new QuizzlandRoom(
        key,
        settings,
        (state) => this.emit(key, state),
        (solution) => this.emitSolution(key, solution),
        (message) => this.issue(key, message),
      )
      this.rooms.set(key, room)
    }
    return room.watch()
  }

  get(key: string): QuizzlandRoom | undefined {
    return this.rooms.get(key)
  }

  close(key: string): void {
    const room = this.rooms.get(key)
    this.rooms.delete(key)
    room?.dispose()
  }

  closeAll(): void { disposeGameRooms(this.rooms) }
}

// --- Collected answers ---

export function quizzlandStats(): QuizzlandStats {
  const totals = new Map(quizzlandTotalsByQuestion().map((r) => [r.id, r]))
  let totalAnswers = 0
  const questions = QUESTIONS.map((q) => {
    const t = totals.get(q.id)
    totalAnswers += t?.answers ?? 0
    return {
      id: q.id,
      category: q.category,
      text: q.text,
      answer: q.options[q.answer],
      rounds: t?.rounds ?? 0,
      answers: t?.answers ?? 0,
      correct: t?.correct ?? 0,
    }
  })
  return { totalAnswers, questions }
}

// Every question with how the chat did on it: share of right answers, how many picked each
// answer (in the database's order, to spot the wrong answers that fool people) and when it was
// marked as wrong, to be fixed in database/ZeroQuizz.sqlite3. The BOM lets Excel read the accents.
export function quizzlandCsv(): string {
  const totals = new Map(quizzlandTotalsByQuestion().map((r) => [r.id, r]))
  const flaggedAt = new Map(quizzlandFlags().map((f) => [f.question_id, f.flagged_at]))
  const rows: (string | number | null)[][] = [
    [
      'id',
      'categoria',
      'difficolta',
      'domanda',
      'a',
      'b',
      'c',
      'd',
      'giusta',
      'partite',
      'risposte',
      'giuste',
      'perc_giuste',
      'scelte_a',
      'scelte_b',
      'scelte_c',
      'scelte_d',
      'secondi_medi_giuste',
      'segnalata_il',
    ],
  ]
  for (const q of QUESTIONS) {
    const t = totals.get(q.id)
    const answers = t?.answers ?? 0
    const options = [0, 1, 2, 3].map((i) => q.options[i] ?? '')
    const picks = [t?.c0, t?.c1, t?.c2, t?.c3].map((n, i) => (i < q.options.length ? (n ?? 0) : ''))
    rows.push([
      q.id,
      q.category,
      q.difficulty,
      q.text,
      ...options,
      QUIZZLAND_LETTERS[q.answer],
      t?.rounds ?? 0,
      answers,
      t?.correct ?? 0,
      answers ? Math.round(((t?.correct ?? 0) / answers) * 100) : '',
      ...picks,
      t?.avgMs != null ? (t.avgMs / 1000).toFixed(1) : '',
      flaggedAt.get(q.id) ?? '',
    ])
  }
  return toCsv(rows)
}
