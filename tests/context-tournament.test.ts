import assert from 'node:assert/strict'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { TOURNAMENT_RULES, type ContextTournamentAdmin, type ContextTournamentState, type TournamentCommand, type Viewer } from '../packages/shared/src/index.ts'
import { parseContextData } from '../packages/shared/src/contextRanking.ts'
import { ContextTournamentStore } from '../apps/server/src/context-tournament-db.ts'
import { ContextTournaments, sanitizeTournamentCommand } from '../apps/server/src/context-tournament.ts'
import type { Corpus } from '../apps/server/src/context-tournament-ranking.ts'

// A synthetic corpus: 9 000 three-letter words. The 7 secrets share one vector, every other word another: for any
// secret, the other secrets come right after it, then the words in index order, so word i (i >= 7) is at position i + 1.
const N = 9000
const letters = 'abcdefghijklmnopqrstuvwxyz'
const words = Array.from({ length: N }, (_, i) => letters[Math.floor(i / 676) % 26] + letters[Math.floor(i / 26) % 26] + letters[i % 26])
const vectors = new Int8Array(N * 2)
for (let i = 0; i < 7; i++) vectors[i * 2] = 127
const corpus: Corpus = { data: parseContextData(words.join('\n'), vectors.buffer, words.slice(0, 7).join('\n')), hash: 'corpus-test' }
const at = (position: number) => words[position - 1] // the word at a position (positions 8 and beyond)
const ROOM = 'room-1'

function setup(opts: { bridge?: boolean; store?: ContextTournamentStore; clock?: Clock; uses?: Record<string, number> } = {}) {
  const clock = opts.clock ?? new Clock()
  const store = opts.store ?? new ContextTournamentStore(new Database(':memory:'))
  const published: (ContextTournamentState | null)[] = []
  const admins: (ContextTournamentAdmin | null)[] = []
  let bridge = opts.bridge ?? true
  const uses = new Map<string, number>(Object.entries(opts.uses ?? {}))
  const recorded: string[] = []
  const tournaments = new ContextTournaments({
    store, corpus: () => corpus, now: () => clock.now, setTimer: (fn, ms) => clock.add(fn, ms), clearTimer: (h) => clock.cancel(h as number),
    random: () => 0, emitPublic: (_k, s) => published.push(s), emitAdmin: (_k, a) => admins.push(a), bridgeReady: () => bridge,
    secretUses: (w) => uses.get(w) ?? 0, recordSecretUse: (_k, w) => { recorded.push(w); uses.set(w, (uses.get(w) ?? 0) + 1) },
  })
  const state = () => tournaments.state(ROOM)!
  const cmd = (c: Record<string, unknown>) =>
    tournaments.command(ROOM, { expectedVersion: state()?.version, ...c } as TournamentCommand, { gameId: 'context', audience: 'all' })
  const say = (id: string, text: string, msg = '') => tournaments.offer(ROOM, viewer(id), text, msg, 'tiktok')
  return { clock, store, tournaments, published, admins, state, cmd, say, recorded, setBridge: (v: boolean) => { bridge = v } }
}

class Clock {
  now = 1_000_000
  private timers: { id: number; at: number; fn: () => void }[] = []
  private next = 1
  add(fn: () => void, ms: number) { const id = this.next++; this.timers.push({ id, at: this.now + ms, fn }); return id }
  cancel(id: number) { this.timers = this.timers.filter((t) => t.id !== id) }
  advance(ms: number) {
    const end = this.now + ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      this.cancel(due.id)
      this.now = due.at
      due.fn()
    }
    this.now = end
  }
}
const viewer = (id: string): Viewer => ({ id: `tiktok:${id}`, nickname: id })
const create = (s: ReturnType<typeof setup>, rounds = 5) =>
  s.tournaments.command(ROOM, { type: 'create', totalRounds: rounds, intermissionSeconds: 15 }, { gameId: 'context', audience: 'all' })
const closeWindow = (s: ReturnType<typeof setup>) => s.clock.advance(TOURNAMENT_RULES.windowMs)
const nextWindow = (s: ReturnType<typeof setup>) => s.clock.advance(TOURNAMENT_RULES.windowMs + TOURNAMENT_RULES.processingMs)

test('a tournament needs ZeroContext and the bridge; one per room, standings at zero (T01)', () => {
  const off = setup({ bridge: false })
  assert.equal(create(off).ok, false)
  const s = setup()
  assert.equal(s.tournaments.command(ROOM, { type: 'create', totalRounds: 6, intermissionSeconds: 15 }, { gameId: 'context', audience: 'all' }).ok, false)
  assert.equal(s.tournaments.command(ROOM, { type: 'create', totalRounds: 5, intermissionSeconds: 15 }, { gameId: 'zerowordle', audience: 'all' }).ok, false)
  assert.deepEqual(create(s), { ok: true })
  assert.equal(create(s).ok, false)
  assert.equal(s.state().phase, 'ready')
  assert.deepEqual(s.state().top10, [])
  assert.equal(s.tournaments.isOpen(ROOM), true)
})

test('one valid word per player and window; invalid words, repeated words and messages cost nothing (T03-T05, T17)', () => {
  const s = setup()
  create(s)
  assert.deepEqual(s.cmd({ type: 'start-round' }), { ok: true })
  assert.equal(s.state().phase, 'window-open')
  assert.equal(s.say('anna', 'non è una parola'), false) // T04: invalid first
  assert.equal(s.say('anna', at(5000), 'm1'), true) //        then valid
  assert.equal(s.say('anna', at(4000)), false) //          T03: a second word in the window
  assert.equal(s.say('bruno', at(5000)), false) //         T05: the same word by another player
  assert.equal(s.say('bruno', at(3000), 'm1'), false) //   T17: the same message again
  assert.equal(s.say('bruno', at(3000), 'm2'), true)
  assert.equal(s.tournaments.offer(ROOM, { id: 'tiktok:anonymous', nickname: 'x' }, at(2000), '', 'tiktok'), false)
  s.clock.advance(300)
  assert.equal(s.state().submissions, 2)
  assert.deepEqual(s.state().lastWindow, []) // ranks hidden until the window closes
  closeWindow(s)
  assert.equal(s.state().phase, 'window-processing')
  assert.deepEqual(s.state().lastWindow.map((g) => [g.author, g.position, g.band, g.pioneer]), [['anna', 5000, 'cyan', 5], ['bruno', 3000, 'cyan', 0]])
  s.clock.advance(TOURNAMENT_RULES.processingMs)
  assert.equal(s.state().phase, 'window-open')
  assert.equal(s.state().window, 2)
  assert.equal(s.say('anna', at(900)), true) // a new window, a new word
})

test('the public state never carries the secret before the round is over; the dashboard has it (T24)', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  const secret = s.tournaments.admin(ROOM)!.secret!
  assert.match(secret, /^[a-z]{3}$/)
  assert.equal(JSON.stringify(s.state()).includes(`"${secret}"`), false)
  assert.equal(s.state().secretLength, 3)
  s.say('anna', secret)
  closeWindow(s)
  assert.equal(s.state().solution, secret)
})

test('the target ends the round: points saved, Top 10 at least 15 s, the next round only on command (T07, T21)', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  const secret = s.tournaments.admin(ROOM)!.secret!
  s.say('anna', at(50))
  s.say('bruno', secret)
  s.say('carla', at(60))
  closeWindow(s)
  const st = s.state()
  assert.equal(st.phase, 'intermission')
  assert.equal(st.solvedBy, 'bruno')
  assert.deepEqual(st.top10.map((r) => [r.nickname, r.points, r.delta]), [['bruno', 85, 85], ['anna', 15, 15], ['carla', 0, 0]])
  assert.equal(s.cmd({ type: 'start-round' }).ok, false) // before 15 s
  s.clock.advance(60_000)
  assert.equal(s.state().phase, 'intermission') // nothing starts by itself
  assert.equal(s.say('dario', at(70)), false) // no guesses between rounds
  assert.deepEqual(s.cmd({ type: 'start-round' }), { ok: true })
  assert.equal(s.state().round, 2)
})

test('70 windows without the target: pioneers stay, no jackpot (T06, T11), and the lifeline after window 30 (T13)', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  s.say('anna', at(8000)) // blue only
  for (let w = 1; w < 30; w++) nextWindow(s)
  closeWindow(s) // window 30 closes
  const buoy = s.state().buoy!
  assert.ok(buoy.position >= TOURNAMENT_RULES.buoyFrom && buoy.position <= TOURNAMENT_RULES.buoyTo, String(buoy.position))
  assert.equal(buoy.author, null)
  s.clock.advance(TOURNAMENT_RULES.processingMs)
  s.say('bruno', at(6000)) // cyan after the lifeline still pays 5
  for (let w = 31; w < TOURNAMENT_RULES.windowsPerRound; w++) nextWindow(s)
  closeWindow(s)
  const st = s.state()
  assert.equal(st.phase, 'intermission')
  assert.equal(st.solvedBy, null)
  assert.deepEqual(st.top10.map((r) => [r.nickname, r.points]), [['bruno', 5], ['anna', 0]])
})

test('no lifeline once a player reached the cyan band (T14)', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  s.say('anna', at(7000))
  for (let w = 1; w <= 31; w++) nextWindow(s)
  assert.equal(s.state().buoy, null)
})

test('pause keeps the window and its time; a lost bridge suspends; resume needs it back', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  s.clock.advance(2000)
  s.say('anna', at(3000))
  assert.deepEqual(s.cmd({ type: 'pause' }), { ok: true })
  assert.equal(s.state().phase, 'suspended')
  s.clock.advance(60_000)
  assert.equal(s.say('bruno', at(3500)), false) // nothing is accepted while suspended
  assert.deepEqual(s.cmd({ type: 'resume' }), { ok: true })
  assert.equal(s.state().window, 1)
  assert.equal(s.state().remainingMs, 4000)
  assert.equal(s.say('anna', at(3200)), false) // anna already played this window
  s.setBridge(false)
  s.tournaments.bridgeChanged()
  assert.equal(s.state().phase, 'suspended')
  assert.match(s.state().suspendedReason!, /ZeroFollowerBot/)
  assert.equal(s.cmd({ type: 'resume' }).ok, false)
})

test('a restart in the middle of a round suspends it; the round comes back with its guesses, counted once', () => {
  const clock = new Clock()
  const db = new Database(':memory:')
  const first = setup({ clock, store: new ContextTournamentStore(db) })
  create(first)
  first.cmd({ type: 'start-round' })
  first.say('anna', at(300))
  closeWindow(first)
  first.clock.advance(TOURNAMENT_RULES.processingMs)
  first.say('bruno', at(2000)) // window 2, interrupted
  first.tournaments.dispose()
  const second = setup({ clock, store: new ContextTournamentStore(db) })
  second.tournaments.restore()
  assert.equal(second.state().phase, 'suspended')
  assert.match(second.state().suspendedReason!, /riavviato/)
  assert.deepEqual(second.state().board.map((g) => g.author), ['anna'])
  assert.deepEqual(second.cmd({ type: 'resume' }), { ok: true })
  assert.equal(second.state().window, 2)
  assert.equal(second.state().remainingMs, TOURNAMENT_RULES.windowMs)
  assert.equal(second.say('bruno', at(1000)), false) // bruno's word of window 2 is still there
  closeWindow(second)
  assert.deepEqual(second.state().lastWindow.map((g) => g.author), ['bruno'])
})

test('closing a round early counts it as unsolved; voiding the last one removes its points (T20)', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  s.say('anna', at(40))
  assert.equal(s.cmd({ type: 'close-round', reason: '' }).ok, false)
  assert.deepEqual(s.cmd({ type: 'close-round', reason: 'problema audio' }), { ok: true })
  assert.deepEqual(s.state().top10.map((r) => [r.nickname, r.points]), [['anna', 15]])
  assert.deepEqual(s.cmd({ type: 'void-round', reason: 'manche da rifare' }), { ok: true })
  assert.deepEqual(s.state().top10.map((r) => [r.nickname, r.points]), [['anna', 0]])
  assert.equal(s.state().round, 0)
  const log = s.store.auditLog(s.state().tournamentId).map((e) => e.type)
  assert.deepEqual(log, ['create', 'round-start', 'round-settled', 'round-voided'])
})

test('resetting the standings: between rounds only, the points go, the tournament starts again from round 1', () => {
  const s = setup()
  create(s)
  assert.equal(s.cmd({ type: 'reset-standings', reason: 'prova' }).ok, false) // nothing to reset yet
  s.cmd({ type: 'start-round' })
  const first = s.tournaments.admin(ROOM)!.secret!
  s.say('anna', at(50))
  assert.equal(s.cmd({ type: 'reset-standings', reason: 'prova' }).ok, false) // a round in play
  s.say('bruno', first)
  closeWindow(s)
  assert.equal(s.state().top10.length, 2)
  assert.equal(s.cmd({ type: 'reset-standings', reason: '' }).ok, false) // the reason is required
  assert.deepEqual(s.cmd({ type: 'reset-standings', reason: 'prova tecnica' }), { ok: true })
  const st = s.state()
  assert.equal(st.phase, 'ready')
  assert.equal(st.round, 0)
  assert.deepEqual(st.top10, [])
  assert.equal(st.players, 0)
  assert.equal(st.solution, null)
  assert.deepEqual(st.achievements, [])
  assert.equal(s.tournaments.standingsOf(st.tournamentId)!.length, 0)
  // Round 1 again, at once (no Top 10 to wait for), with a secret not played yet.
  assert.deepEqual(s.cmd({ type: 'start-round' }), { ok: true })
  assert.equal(s.state().round, 1)
  assert.notEqual(s.tournaments.admin(ROOM)!.secret, first)
  s.say('carla', at(70))
  closeWindow(s)
  s.cmd({ type: 'close-round', reason: 'fine prova' })
  assert.deepEqual(s.state().top10.map((r) => [r.nickname, r.points]), [['carla', 15]])
  const log = s.store.auditLog(st.tournamentId).find((e) => e.type === 'standings-reset')!
  assert.deepEqual(log.payload, { reason: 'prova tecnica', voidedRounds: 1, removedScores: 2, players: 2,
    standings: [{ place: 1, nickname: 'bruno', points: 85 }, { place: 2, nickname: 'anna', points: 15 }] })
})

test('the standings of an ended tournament are not reset', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  s.say('anna', s.tournaments.admin(ROOM)!.secret!)
  closeWindow(s)
  s.cmd({ type: 'finish' })
  assert.equal(s.cmd({ type: 'reset-standings', reason: 'prova' }).ok, false)
  assert.equal(s.state().top10.length, 1)
})

test('endless rounds: the tournament goes on after round 7, until the organiser ends it', () => {
  const s = setup()
  const endless = { type: 'create', totalRounds: null, intermissionSeconds: 15 } as const
  assert.deepEqual(sanitizeTournamentCommand(endless), endless)
  assert.deepEqual(s.tournaments.command(ROOM, endless, { gameId: 'context', audience: 'all' }), { ok: true })
  assert.equal(s.state().totalRounds, null)
  for (let round = 1; round <= 7; round++) {
    assert.deepEqual(s.cmd({ type: 'start-round' }), { ok: true }, `round ${round}`)
    s.say('anna', s.tournaments.admin(ROOM)!.secret!)
    closeWindow(s)
    assert.equal(s.state().phase, 'intermission', `round ${round}`)
    assert.equal(s.state().round, round)
    s.clock.advance(15_000)
  }
  // Only the test corpus runs out of secrets (it has 7): the tournament stays open until "Concludi torneo".
  assert.equal(s.cmd({ type: 'start-round' }).ok, false)
  assert.equal(s.tournaments.isOpen(ROOM), true)
  assert.deepEqual(s.cmd({ type: 'finish' }), { ok: true })
  assert.equal(s.state().phase, 'completed')
  assert.deepEqual(s.state().top10.map((r) => [r.nickname, r.solved]), [['anna', 7]])
  assert.deepEqual(s.store.history(ROOM).map((t) => [t.totalRounds, t.roundsPlayed, t.winners]), [[null, 7, ['anna']]])
})

test('a database from before the endless rounds keeps its tournaments and accepts the new ones', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`CREATE TABLE context_tournaments (id TEXT PRIMARY KEY, room_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','intermission','suspended','completed','cancelled')),
      total_rounds INTEGER NOT NULL CHECK(total_rounds IN (5,7)), intermission_ms INTEGER NOT NULL CHECK(intermission_ms >= 15000),
      audience TEXT NOT NULL, corpus_hash TEXT NOT NULL, rules_version TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER,
      suspended_reason TEXT, intermission_since INTEGER);
    CREATE UNIQUE INDEX context_one_open_tournament_per_room ON context_tournaments(room_key) WHERE status IN ('active','intermission','suspended');
    CREATE TABLE context_tournament_players (tournament_id TEXT NOT NULL REFERENCES context_tournaments(id), player_id TEXT NOT NULL,
      nickname TEXT NOT NULL, avatar TEXT, joined_at INTEGER NOT NULL, PRIMARY KEY (tournament_id, player_id)) WITHOUT ROWID;
    INSERT INTO context_tournaments VALUES ('old', 'room-0', 'completed', 7, 15000, 'all', 'h', 'r', 1, 2, NULL, 2);
    INSERT INTO context_tournament_players VALUES ('old', 'tiktok:anna', 'anna', NULL, 1);`)
  const store = new ContextTournamentStore(db)
  assert.equal(store.tournament('old')!.totalRounds, 7)
  assert.deepEqual(store.players('old').map((p) => p.nickname), ['anna'])
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
  assert.deepEqual(db.pragma('foreign_key_check'), [])
  assert.ok(db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'context_one_open_tournament_per_room'").get())
  const s = setup({ store })
  assert.deepEqual(s.tournaments.command(ROOM, { type: 'create', totalRounds: null, intermissionSeconds: 15 }, { gameId: 'context', audience: 'all' }), { ok: true })
  assert.equal(store.tournament(s.state().tournamentId)!.totalRounds, null)
  assert.throws(() => db.prepare(`INSERT INTO context_tournaments (id, room_key, status, total_rounds, intermission_ms, audience, corpus_hash,
    rules_version, created_at) VALUES ('x', 'room-9', 'completed', 6, 15000, 'all', 'h', 'r', 1)`).run(), /CHECK/)
  new ContextTournamentStore(db) // a second start finds nothing to migrate
  assert.equal(store.tournament('old')!.totalRounds, 7)
})

test('a round is settled once, even if asked twice (T19)', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  const round = s.store.playing(s.state().tournamentId)!
  s.say('anna', s.tournaments.admin(ROOM)!.secret!)
  closeWindow(s)
  const outcome = { solved: false, solvedBy: null, solvedSeq: null, pioneerTotal: 0, jackpot: 0, pioneerBySeq: new Map(), players: new Map(),
    best: null, achievements: { holeInOne: null, supremePioneers: [], fireUnderIce: null } }
  assert.equal(s.store.settle(round.id, outcome, 0, 'test', null, []), false)
  assert.deepEqual(s.state().top10.map((r) => [r.nickname, r.points]), [['anna', 100]])
})

test('after the last round the tournament is over, with its final Top 10, kept in the history', () => {
  const s = setup()
  create(s, 5)
  for (let r = 1; r <= 5; r++) {
    assert.deepEqual(s.cmd({ type: 'start-round' }), { ok: true }, `round ${r}`)
    s.say('anna', s.tournaments.admin(ROOM)!.secret!)
    closeWindow(s)
    s.clock.advance(15_000)
  }
  assert.equal(s.state().phase, 'completed')
  assert.equal(s.state().status, 'completed')
  assert.equal(s.cmd({ type: 'start-round' }).ok, false)
  assert.equal(s.tournaments.isOpen(ROOM), false)
  assert.deepEqual(s.store.history(ROOM).map((h) => [h.status, h.roundsPlayed, h.winners]), [['completed', 5, ['anna']]])
  assert.deepEqual(s.cmd({ type: 'dismiss' }), { ok: true })
  assert.equal(s.tournaments.state(ROOM), null)
})

test('a command on an old state is refused (double click, two dashboards)', () => {
  const s = setup()
  create(s)
  const old = s.state().version
  s.cmd({ type: 'start-round' })
  assert.equal(s.tournaments.command(ROOM, { type: 'close-round', reason: 'x', expectedVersion: old }, { gameId: 'context', audience: 'all' }).ok, false)
})

test('"Chi può giocare" is frozen when the tournament is created', () => {
  const s = setup()
  s.tournaments.command(ROOM, { type: 'create', totalRounds: 5, intermissionSeconds: 15 }, { gameId: 'context', audience: 'followers' })
  s.cmd({ type: 'start-round' })
  assert.equal(s.say('anna', at(3000)), false)
  assert.equal(s.tournaments.offer(ROOM, { ...viewer('bruno'), follower: true }, at(3000), '', 'tiktok'), true)
})

test('each round counts its secret once, and picks a word that never came out', () => {
  // words[0..5] came out already; words[6] never did: with random() = 0 it is the only choice
  const s = setup({ uses: Object.fromEntries(words.slice(0, 6).map((w) => [w, 1])) })
  create(s)
  s.cmd({ type: 'start-round' })
  assert.deepEqual(s.recorded, [words[6]])
  assert.equal(s.tournaments.admin(ROOM)!.secret, words[6])
})

test('stopping Zerocade in the middle of a round suspends it with the restart as the reason', () => {
  const s = setup()
  create(s)
  s.cmd({ type: 'start-round' })
  s.tournaments.shutdown()
  assert.equal(s.state().phase, 'suspended')
  assert.match(s.state().suspendedReason!, /riavviato/)
})
