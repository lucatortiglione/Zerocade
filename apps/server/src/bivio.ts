import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  BIVIO_CROWD_SIZE,
  type BivioChoice,
  type BivioCommand,
  type BivioLang,
  type BivioState,
  type BivioStats,
  type BivioTally,
  type BivioVoter,
  type GameSettings,
  type LiveEvent,
} from '@zerocade/shared'
import { toCsv } from './csv.js'
import { bivioFlags, bivioTotals, bivioTotalsByQuestion, dataDir, flagBivio, recordBivioVote, unflagBivio } from './db.js'

// Bivio ("Preferiresti…?"), the server-driven game. Questions come from the game's
// SQLite file, gioco-dilemmi/data/domande.db (the one tools/to_livecade.py exports from;
// tools/domande.py imports and exports it as CSV), read once at start: a new dilemma only
// needs an edit and a restart. The Windows package ships a copy next to the server;
// ZEROCADE_BIVIO_DB points elsewhere.

interface Dilemma {
  id: string
  category: string
  difficulty: string
  // Language code -> the two options, written as the end of "Preferiresti…".
  text: Record<string, { a: string; b: string }>
}

const here = dirname(fileURLToPath(import.meta.url))
const dbPath = [
  process.env.ZEROCADE_BIVIO_DB,
  join(here, 'domande.db'),
  join(here, '..', '..', '..', 'gioco-dilemmi', 'data', 'domande.db'),
].find((p): p is string => p !== undefined && existsSync(p))

interface TextRow {
  id: string
  categoria: string
  difficolta: string
  lingua: string
  a: string
  b: string
}

// Every language a dilemma has, Italian first: textFor falls back on the first one.
// Explicit dilemmas are left out, as in tools/to_livecade.py.
function loadDilemmas(): Dilemma[] {
  if (!dbPath) {
    console.warn('[bivio] domande.db not found: the game has no questions')
    return []
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const rows = db
      .prepare(
        `SELECT d.id, d.categoria, d.difficolta, t.lingua, t.a, t.b
         FROM dilemmi d JOIN testi t ON t.dilemma = d.id
         WHERE d.esplicita = 0 AND trim(t.a) <> '' AND trim(t.b) <> ''
         ORDER BY d.ordine, t.lingua <> 'it', t.lingua`,
      )
      .all() as TextRow[]
    const byId = new Map<string, Dilemma>()
    for (const row of rows) {
      let dilemma = byId.get(row.id)
      if (!dilemma) {
        dilemma = { id: row.id, category: row.categoria.trim(), difficulty: row.difficolta.trim(), text: {} }
        byId.set(row.id, dilemma)
      }
      dilemma.text[row.lingua] = { a: row.a.trim(), b: row.b.trim() }
    }
    return [...byId.values()]
  } finally {
    db.close()
  }
}

export const DILEMMAS = loadDilemmas()

// Questions marked as wrong from the dashboard (any overlay key): out of the game until
// unmarked, and listed in data/bivio-domande-sbagliate.csv to be fixed in domande.db.
const FLAGS_FILE = join(dataDir, 'bivio-domande-sbagliate.csv')
const flagged = new Set(bivioFlags().map((f) => f.question_id))

function setFlag(id: string, lang: string, on: boolean): void {
  if (on === flagged.has(id)) return
  if (on) {
    flagBivio(id, lang)
    flagged.add(id)
  } else {
    unflagBivio(id)
    flagged.delete(id)
  }
  try {
    writeFileSync(FLAGS_FILE, bivioFlagsCsv())
  } catch (err) {
    console.warn(`[bivio] ${FLAGS_FILE}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const textFor = (d: Dilemma, lang: string) => d.text[lang] ?? Object.values(d.text)[0]

// A vote is a whole comment of A or B, 1 or 2 (or 🅰️ 🅱️), ignoring case, spaces and
// punctuation: "a!!" votes, "a me piace la pizza" does not. The inputMode setting narrows
// it to letters or numbers; 'auto' takes all of them.
export function parseVote(text: string, mode = 'auto'): BivioChoice | null {
  const t = text.toUpperCase().replace(/[^\p{L}\p{N}\u{1F170}\u{1F171}]/gu, '')
  const accepted: Record<BivioChoice, string[]> =
    mode === 'letters'
      ? { a: ['A'], b: ['B'] }
      : mode === 'numbers'
        ? { a: ['1'], b: ['2'] }
        : { a: ['A', '1', '\u{1F170}'], b: ['B', '2', '\u{1F171}'] }
  if (accepted.a.includes(t)) return 'a'
  if (accepted.b.includes(t)) return 'b'
  return null
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

const EMIT_EVERY_MS = 200
const VOTERS_SHOWN = 6
const EXTRA_TIME_MS = 10_000
// Voters kept per side; the overlay gets the newest BIVIO_CROWD_SIZE of them, so a viewer
// who switches side is replaced by an older voter instead of leaving a gap.
const CROWD_KEPT = BIVIO_CROWD_SIZE * 4
const MAX_PHASE_MS = 600_000

class BivioRoom {
  private deck: Dilemma[] = []
  private current: Dilemma | null = null
  private roundId = ''
  private phase: BivioState['phase'] = 'empty'
  private ballots = new Map<string, BivioChoice>()
  private votes: BivioTally = { a: 0, b: 0 }
  private allTime: BivioTally | null = null
  private voters: BivioVoter[] = []
  private crowd: Record<BivioChoice, BivioVoter[]> = { a: [], b: [] }
  private played = 0
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
    private emit: (state: BivioState) => void,
  ) {
    this.buildDeck()
    this.startRound()
  }

  action(action: string, event: LiveEvent): void {
    if (!this.watched) return
    if (action === 'vote') this.vote(event)
    else if (action === 'extra_time') this.addTime(EXTRA_TIME_MS)
    else if (action === 'next') this.startRound()
  }

  control(command: BivioCommand): void {
    switch (command) {
      case 'next':
        return this.startRound()
      case 'reveal':
        return this.reveal()
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
        this.played = 0
        this.paused = false
        this.buildDeck()
        return this.startRound()
      case 'flag':
      case 'unflag':
        // The round goes on; a flagged question is just not dealt again.
        if (this.current) setFlag(this.current.id, this.lang, command === 'flag')
        return this.emitNow()
    }
  }

  applySettings(settings: GameSettings): void {
    const prev = this.settings
    this.settings = settings
    if (['lang', 'categories', 'difficulty'].some((id) => prev[id] !== settings[id])) {
      this.buildDeck()
      if (!this.current || !this.matches(this.current)) return this.startRound()
    }
    const auto = settings.autoNext !== false
    if (this.phase === 'reveal' && auto !== (prev.autoNext !== false)) {
      this.setTimer(auto ? num(settings, 'revealSeconds', 8) * 1000 : 0)
    }
    this.emitNow()
  }

  // Nobody has the dashboard or an overlay open: freeze the round and ignore votes,
  // so no dilemma is played to an empty room.
  suspend(): void {
    this.freeze()
    this.watched = false
  }

  watch(): BivioState {
    if (!this.watched) {
      this.watched = true
      this.schedule()
    }
    return this.snapshot()
  }

  dispose(): void {
    clearTimeout(this.timer)
    clearTimeout(this.emitTimer)
  }

  snapshot(): BivioState {
    const q = this.current
    const text = q && textFor(q, this.lang)
    return {
      phase: this.phase,
      paused: this.paused,
      lang: this.lang,
      roundId: this.roundId,
      question:
        q && text
          ? { id: q.id, category: q.category, difficulty: q.difficulty, a: text.a, b: text.b, flagged: flagged.has(q.id) }
          : null,
      flagged: flagged.size,
      votes: { ...this.votes },
      allTime: this.allTime,
      remainingMs: this.timeLeft(),
      durationMs: this.durationMs,
      liveCounts: this.settings.liveCounts !== false,
      voters: this.voters,
      crowd: { a: this.crowd.a.slice(0, BIVIO_CROWD_SIZE), b: this.crowd.b.slice(0, BIVIO_CROWD_SIZE) },
      played: this.played,
    }
  }

  private get lang(): BivioLang {
    return str(this.settings, 'lang', 'it') === 'en' ? 'en' : 'it'
  }

  private matches(d: Dilemma): boolean {
    const categories = str(this.settings, 'categories', '').split(',').filter(Boolean)
    const difficulty = str(this.settings, 'difficulty', 'all')
    return (
      (categories.length === 0 || categories.includes(d.category)) &&
      (difficulty === 'all' || d.difficulty === difficulty) &&
      Boolean(d.text[this.lang])
    )
  }

  // Least-played dilemmas first (shuffled among equals), so every question collects
  // votes before any of them comes back, across restarts too.
  private buildDeck(): void {
    const rounds = new Map(bivioTotalsByQuestion().map((r) => [r.id, r.rounds]))
    this.deck = shuffle(DILEMMAS.filter((d) => this.matches(d) && !flagged.has(d.id))).sort(
      (x, y) => (rounds.get(x.id) ?? 0) - (rounds.get(y.id) ?? 0),
    )
    if (this.deck.length > 1 && this.deck[0].id === this.current?.id) this.deck.push(this.deck.shift()!)
  }

  private startRound(): void {
    if (!this.deck.length) this.buildDeck()
    this.current = this.deck.shift() ?? null
    this.roundId = randomUUID()
    this.ballots.clear()
    this.votes = { a: 0, b: 0 }
    this.allTime = null
    this.voters = []
    this.crowd = { a: [], b: [] }
    if (this.current) {
      this.phase = 'voting'
      this.played++
      this.setTimer(num(this.settings, 'voteSeconds', 30) * 1000)
    } else {
      this.phase = 'empty'
      this.setTimer(0)
    }
    this.emitNow()
  }

  private reveal(): void {
    if (this.phase !== 'voting' || !this.current) return
    this.phase = 'reveal'
    // Votes are written as they arrive, so this already includes the round just closed.
    this.allTime = bivioTotals(this.current.id)
    this.setTimer(this.settings.autoNext === false ? 0 : num(this.settings, 'revealSeconds', 8) * 1000)
    this.emitNow()
  }

  // The gap between a result and the next dilemma; skipped when set to 0.
  private startBreak(): void {
    const ms = num(this.settings, 'breakSeconds', 2) * 1000
    if (ms <= 0) return this.startRound()
    this.phase = 'break'
    this.setTimer(ms)
    this.emitNow()
  }

  private vote(event: LiveEvent): void {
    if (event.type !== 'comment' || this.phase !== 'voting' || !this.current) return
    const choice = parseVote(event.text, str(this.settings, 'inputMode', 'auto'))
    if (!choice) return
    const prev = this.ballots.get(event.user.id)
    if (prev === choice || (prev && this.settings.allowChange === false)) return
    if (prev) this.votes[prev]--
    this.votes[choice]++
    this.ballots.set(event.user.id, choice)
    const { id: userId, nickname, avatar } = event.user
    recordBivioVote({ roundId: this.roundId, key: this.key, questionId: this.current.id, lang: this.lang, userId, nickname, choice })
    const voter: BivioVoter = { id: userId, nickname, avatar, choice }
    this.voters = [voter, ...this.voters.filter((v) => v.id !== userId)].slice(0, VOTERS_SHOWN)
    // A viewer who changes side leaves the other option's crowd.
    if (prev) this.crowd[prev] = this.crowd[prev].filter((v) => v.id !== userId)
    this.crowd[choice] = [voter, ...this.crowd[choice]].slice(0, CROWD_KEPT)
    this.queueEmit()
  }

  private addTime(ms: number): void {
    if (this.phase !== 'voting') return
    this.freeze()
    this.leftMs = Math.min(this.leftMs + ms, MAX_PHASE_MS)
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
      if (this.phase === 'voting') this.reveal()
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

  // Votes can arrive by the hundred on a busy live: coalesce them into one update.
  private queueEmit(): void {
    this.emitTimer ??= setTimeout(() => this.emitNow(), EMIT_EVERY_MS)
  }

  private emitNow(): void {
    clearTimeout(this.emitTimer)
    this.emitTimer = undefined
    this.emit(this.snapshot())
  }
}

// One room per overlay key, alive while that key has Bivio selected.
export class BivioRooms {
  private rooms = new Map<string, BivioRoom>()

  constructor(private emit: (key: string, state: BivioState) => void) {}

  // Starts the game for a key if needed and wakes it up if it was suspended.
  open(key: string, settings: GameSettings): BivioState {
    let room = this.rooms.get(key)
    if (!room) {
      room = new BivioRoom(key, settings, (state) => this.emit(key, state))
      this.rooms.set(key, room)
    }
    return room.watch()
  }

  get(key: string): BivioRoom | undefined {
    return this.rooms.get(key)
  }

  close(key: string): void {
    this.rooms.get(key)?.dispose()
    this.rooms.delete(key)
  }
}

// --- Collected answers ---

function totalsById() {
  return new Map(bivioTotalsByQuestion().map((r) => [r.id, r]))
}

export function bivioStats(lang: BivioLang): BivioStats {
  const totals = totalsById()
  let totalVotes = 0
  const questions = DILEMMAS.map((d) => {
    const t = totals.get(d.id)
    const { a, b } = textFor(d, lang)
    const votesA = t?.a ?? 0
    const votesB = t?.b ?? 0
    totalVotes += votesA + votesB
    return { id: d.id, category: d.category, a, b, votesA, votesB, rounds: t?.rounds ?? 0 }
  })
  return { totalVotes, questions }
}

// The questions marked as wrong, oldest first, with their texts in every language of
// domande.db: the list to fix there. Excel-friendly like bivioCsv.
export function bivioFlagsCsv(): string {
  const byId = new Map(DILEMMAS.map((d) => [d.id, d]))
  const langs = [...new Set(DILEMMAS.flatMap((d) => Object.keys(d.text)))]
  const header = ['id', 'categoria', 'difficolta', 'segnalata_il', 'lingua_in_gioco', ...langs.flatMap((l) => [`${l}_a`, `${l}_b`])]
  const rows: string[][] = [header]
  for (const f of bivioFlags()) {
    const d = byId.get(f.question_id)
    const texts = langs.flatMap((l) => [d?.text[l]?.a ?? '', d?.text[l]?.b ?? ''])
    rows.push([f.question_id, d?.category ?? '', d?.difficulty ?? '', f.flagged_at, f.lang, ...texts])
  }
  return toCsv(rows)
}

// Results per dilemma, with every language of domande.db, to spot the lopsided
// ones (beyond 90/10) worth rewriting. The BOM lets Excel read the accents.
export function bivioCsv(): string {
  const totals = totalsById()
  const langs = [...new Set(DILEMMAS.flatMap((d) => Object.keys(d.text)))]
  const header = ['id', 'categoria', 'difficolta', ...langs.flatMap((l) => [`${l}_a`, `${l}_b`])]
  const rows: (string | number)[][] = [[...header, 'voti_a', 'voti_b', 'totale', 'perc_a', 'partite']]
  for (const d of DILEMMAS) {
    const t = totals.get(d.id)
    const a = t?.a ?? 0
    const b = t?.b ?? 0
    const texts = langs.flatMap((l) => [d.text[l]?.a ?? '', d.text[l]?.b ?? ''])
    rows.push([d.id, d.category, d.difficulty, ...texts, a, b, a + b, a + b ? Math.round((a / (a + b)) * 100) : '', t?.rounds ?? 0])
  }
  return toCsv(rows)
}
