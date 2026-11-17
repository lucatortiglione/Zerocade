import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import {
  WORDHUNT_RULES, wordHuntPoints, type GameSettings, type Viewer, type WordHuntAdminState, type WordHuntCommand, type WordHuntPublicState,
} from '../packages/shared/src/index.ts'
import { WordHuntRoom, type WordHuntDeps } from '../apps/server/src/wordhunt.ts'
import { WordHuntStore } from '../apps/server/src/wordhunt-db.ts'
import {
  WordHuntGenerationError, auditBoard, cellName, decoyCountFor, fixtureBoard, generateBoard, nextColor, normalizeGuess, seededRandom, DEFAULT_DIRECTIONS,
  type FixtureFile,
} from '../apps/server/src/wordhunt-domain.ts'
import { Clock } from './helpers/tabooHarness.ts'

const fixtureFile = JSON.parse(readFileSync(new URL('../apps/server/src/wordhunt-fixture.json', import.meta.url), 'utf-8')) as FixtureFile
const DICTIONARY = [
  'CASTELLO', 'FINESTRA', 'MONTAGNA', 'BOTTIGLIA', 'CAMMINO', 'GIARDINO', 'LIBRERIA', 'PIANETA', 'SPECCHIO', 'TAVOLINO', 'VIOLINO', 'CANDELA',
  'FIORAIO', 'LAVAGNA', 'MARTELLO', 'NUVOLA', 'OROLOGIO', 'PALLONE', 'RUBINETTO', 'SCARPONE', 'TELEFONO', 'UMBRELLA', 'VALIGIA', 'ZUCCHERO',
]

// ---- The fixture of the reference screenshot (§2.3, §2.4, §13.1) ----

test('the fixture: 20 rows of 15 symbols, eight words on their exact paths, eight avatars and nothing else under an X', () => {
  assert.equal(fixtureFile.grid.length, 20)
  assert.ok(fixtureFile.grid.every((line) => line.length === 15))
  const board = fixtureBoard(fixtureFile)
  assert.deepEqual(auditBoard(board), [])
  assert.equal(board.targets.length, 8)
  const xs = fixtureFile.grid.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === 'X' ? [`${String.fromCharCode(65 + r)}${c + 1}`] : [])))
  assert.deepEqual(xs.sort(), board.targets.map((t) => cellName(t.anchor)).sort()) // every X is an avatar, no avatar is an obstacle
  assert.equal(xs.length, 8)
})

test('the fixture: the exact cells and the colours of §2.3', () => {
  const board = fixtureBoard(fixtureFile)
  const by = Object.fromEntries(board.targets.map((t) => [t.word, t]))
  const cells = (w: string) => `${cellName(by[w]!.cells[0]!)}-${cellName(by[w]!.cells.at(-1)!)}`
  assert.equal(cells('PENSIERO'), 'A2-A9')
  assert.equal(cells('MARINARE'), 'B5-B12')
  assert.equal(cells('OBBLIGO'), 'C7-C13')
  assert.equal(cells('MURATORE'), 'E6-E13')
  assert.equal(cells('STAGNO'), 'C1-H1')
  assert.equal(cells('DIRETTORE'), 'F4-N4')
  assert.equal(cells('RIFLESSO'), 'I2-P2')
  assert.equal(cells('CORONA'), 'B15-G15')
  assert.deepEqual(Object.fromEntries(board.targets.map((t) => [t.word, cellName(t.anchor)])), {
    PENSIERO: 'A1', MARINARE: 'B13', OBBLIGO: 'C14', MURATORE: 'E5', STAGNO: 'B1', DIRETTORE: 'O4', RIFLESSO: 'Q2', CORONA: 'H15',
  })
  assert.equal(by.OBBLIGO!.color, '#22C55E')
  assert.equal(by.CORONA!.color, '#22D3EE')
  assert.equal(by.PENSIERO!.side, 'before')
  assert.equal(by.MARINARE!.side, 'after')
})

test('the fixture: the cell under an avatar gets a fixed filler, the same every time', () => {
  const a = fixtureBoard(fixtureFile)
  const b = fixtureBoard(fixtureFile)
  assert.equal(a.checksum, b.checksum)
  assert.ok(a.letters.every((row) => row.every((ch) => /^[A-Z]$/.test(ch) && ch !== 'X' || ch === 'X')))
  assert.notEqual(a.letters[0]![0], undefined)
})

test('a fixture with an X that is not an avatar, or a word that does not read along its path, is refused', () => {
  const bad = structuredClone(fixtureFile)
  bad.grid[5] = bad.grid[5]!.slice(0, 7) + 'X' + bad.grid[5]!.slice(8)
  assert.throws(() => fixtureBoard(bad), WordHuntGenerationError)
  const wrong = structuredClone(fixtureFile)
  wrong.grid[0] = wrong.grid[0]!.replace('PENSIERO', 'PENSIERA')
  assert.throws(() => fixtureBoard(wrong), WordHuntGenerationError)
})

// ---- The guess (§3.2, §7.2) ----

test('normalizeGuess: whole words only, accents kept, no substrings, no punctuation around', () => {
  assert.equal(normalizeGuess('  Pensiero! '), 'PENSIERO')
  assert.equal(normalizeGuess('«obbligo»'), 'OBBLIGO')
  assert.equal(normalizeGuess('città'), 'CITTÀ')
  assert.equal(normalizeGuess('ho trovato pensiero'), null)
  assert.equal(normalizeGuess('pensiero123'), null)
  assert.equal(normalizeGuess('https://x.it'), null)
  assert.equal(normalizeGuess('a'), null)
  assert.equal(normalizeGuess('x'.repeat(200)), null)
})

// ---- The generator (§6, §13.4) ----

test('the generator: a sound board, anchors beside their words, the same output for the same seed', () => {
  const a = generateBoard(DICTIONARY, { seed: 'uno', targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS })
  const b = generateBoard(DICTIONARY, { seed: 'uno', targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS })
  assert.deepEqual(auditBoard(a), [])
  assert.equal(a.checksum, b.checksum)
  assert.equal(a.targets.length, 8)
  assert.notEqual(a.checksum, generateBoard(DICTIONARY, { seed: 'due', targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS }).checksum)
  const wordCells = new Set(a.targets.flatMap((t) => t.cells.map(cellName)))
  for (const t of a.targets) assert.equal(wordCells.has(cellName(t.anchor)), false) // an avatar never covers a letter of a word
})

test('the generator: many seeds, with every direction on, never break an invariant', () => {
  const directions = ['RIGHT', 'DOWN', 'LEFT', 'UP', 'DOWN_RIGHT', 'DOWN_LEFT', 'UP_RIGHT', 'UP_LEFT'] as const
  for (let i = 0; i < 60; i++) {
    const board = generateBoard(DICTIONARY, { seed: `s${i}`, targetCount: 8, minWordLength: 5, maxWordLength: 12, directions })
    assert.deepEqual(auditBoard(board), [], `seed s${i}`)
  }
})

test('the generator: no board is published when the words do not fit, or there are too few', () => {
  assert.throws(() => generateBoard(DICTIONARY.slice(0, 3), { seed: 'x', targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS }), WordHuntGenerationError)
  assert.throws(
    () => generateBoard(['ABCDEFGHIJKL', 'MNOPQRSTUVWX'], { seed: 'x', targetCount: 2, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS, rows: 2, cols: 12 }),
    WordHuntGenerationError,
  )
})

test('colours: not repeated while the palette lasts, and not the look-alike of the last one', () => {
  const used: string[] = []
  for (let i = 0; i < 8; i++) used.push(nextColor(used))
  assert.equal(new Set(used).size, 8)
  assert.equal(nextColor(['#22C55E']) === '#4ADE80', false)
  assert.ok(typeof nextColor(used) === 'string') // past the palette it starts again
  assert.ok(seededRandom('a')() !== seededRandom('b')())
})

test('points: longer words are worth more (§8.2)', () => {
  assert.deepEqual(['STAGNO', 'OBBLIGO', 'PENSIERO', 'DIRETTORE'].map((w) => wordHuntPoints(w.length)), [14, 16, 18, 20])
})

// ---- The room (§7.3, §7.4, §8, §10.3) ----

const viewer = (id: string, over: Partial<Viewer> = {}): Viewer => ({ id: `tiktok:${id}`, nickname: id, avatar: `https://img.test/${id}.png`, ...over })

function setup(opts: { settings?: GameSettings; dictionary?: readonly string[] | null; store?: WordHuntStore; allow?: (u: Viewer) => boolean } = {}) {
  const clock = new Clock()
  const db = new Database(':memory:')
  const store = opts.store ?? new WordHuntStore(db)
  const publics: WordHuntPublicState[] = []
  const admins: WordHuntAdminState[] = []
  const issues: string[] = []
  let ids = 0
  const settings: GameSettings = opts.settings ?? { wordhuntCountdown: 0 }
  const deps: WordHuntDeps = {
    store, dictionary: () => (opts.dictionary === undefined ? DICTIONARY : opts.dictionary), fixture: () => fixtureFile,
    monotonicNow: () => clock.now, wallNow: () => 1_700_000_000_000 + clock.now,
    setTimer: (fn, ms) => clock.add(fn, ms), clearTimer: (h) => clock.cancel(h),
    newId: () => `round-${++ids}`, newSeed: () => `seed-${ids}`,
    emitPublic: (_k, s) => publics.push(s), emitAdmin: (_k, a) => admins.push(a),
    allowed: (_k, u) => (opts.allow ? opts.allow(u) : true), settings: () => settings, issue: (_k, m) => issues.push(m), log: () => undefined,
  }
  const room = new WordHuntRoom('room', deps)
  const cmd = (c: Omit<WordHuntCommand, 'expectedVersion'>) => room.control({ ...c, expectedVersion: room.state().version } as WordHuntCommand)
  const say = (user: Viewer, text: string, messageId = '') => room.offer({ user, text, messageId, platform: 'tiktok' })
  const begin = (mode: 'fixture' | 'generated' = 'fixture', extra: Record<string, unknown> = {}) => {
    assert.deepEqual(cmd({ type: 'create-round', mode, ...extra } as never), { ok: true })
    assert.deepEqual(cmd({ type: 'start' }), { ok: true })
  }
  return { room, clock, store, db, publics, admins, issues, cmd, say, begin, state: () => room.state(), admin: () => room.admin() }
}

test('a round: create, start (no countdown), the first valid message takes the word, colour and avatar come with it', () => {
  const h = setup()
  assert.equal(h.state().phase, 'idle')
  h.begin()
  assert.equal(h.state().phase, 'active')
  h.say(viewer('anna'), 'obbligo')
  const s = h.state()
  assert.equal(s.found, 1)
  assert.equal(s.claims[0]!.word, 'OBBLIGO')
  assert.deepEqual(s.claims[0]!.cells, ['C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13'])
  assert.equal(s.claims[0]!.avatarCell, 'C14')
  assert.equal(s.claims[0]!.color, '#22C55E')
  assert.equal(s.claims[0]!.winner.nickname, 'anna')
  assert.equal(s.claims[0]!.winner.avatar, 'https://img.test/anna.png')
  assert.equal(s.claims[0]!.points, wordHuntPoints(7))
  assert.equal(s.leaders[0]!.points, 16)
})

test('the first one wins and nobody takes it afterwards: colour, avatar and score stay (§7.4)', () => {
  const h = setup()
  h.begin()
  h.say(viewer('anna'), 'obbligo')
  h.clock.advance(5000)
  h.say(viewer('bruno'), 'OBBLIGO')
  assert.equal(h.state().claims.length, 1)
  assert.equal(h.state().claims[0]!.winner.nickname, 'anna')
  assert.equal(h.state().leaders.length, 1)
  assert.equal(h.admin().metrics.ignored['already-claimed'], 1)
  assert.equal(h.store.claims('round-1').length, 1)
  assert.equal(h.store.guessCount('round-1'), 2) // the second hit is kept for the audit, with its outcome
})

test('100 users send the same word at once: one claim, one score, one avatar (§13.3)', () => {
  const h = setup()
  h.begin()
  for (let i = 0; i < 100; i++) h.say(viewer(`u${i}`), 'pensiero')
  const s = h.state()
  assert.equal(s.claims.length, 1)
  assert.equal(s.claims[0]!.winner.nickname, 'u0') // the order of arrival decides
  assert.equal(s.leaders.length, 1)
  assert.equal(h.store.claims('round-1').length, 1)
  assert.equal(h.store.events('round-1').filter((e) => e.type === 'WORD_CLAIMED').length, 1)
})

test('the same user may find four words: four colours, the same avatar (§1.1)', () => {
  const h = setup()
  h.begin()
  const a = viewer('anna')
  for (const w of ['pensiero', 'marinare', 'obbligo', 'stagno']) { h.say(a, w); h.clock.advance(1000) }
  const s = h.state()
  assert.equal(s.claims.length, 4)
  assert.equal(new Set(s.claims.map((c) => c.winner.avatar)).size, 1)
  assert.equal(s.leaders[0]!.words, 4)
})

test('a word the grid reads by chance, a message with other words and a substring are not answers (§3.2)', () => {
  const h = setup()
  h.begin()
  h.say(viewer('a'), 'pensieroso')
  h.say(viewer('b'), 'ho trovato pensiero')
  h.say(viewer('c'), 'gatto')
  assert.equal(h.state().found, 0)
})

test('a duplicate message is processed once; a user over three guesses in two seconds is limited (§7.4, §7.5)', () => {
  const h = setup()
  h.begin()
  h.say(viewer('a'), 'xxxxx', 'm1')
  h.say(viewer('a'), 'xxxxx', 'm1')
  assert.equal(h.admin().metrics.ignored.duplicate, 1)
  h.say(viewer('b'), 'aaaaa'); h.say(viewer('b'), 'bbbbb'); h.say(viewer('b'), 'ccccc'); h.say(viewer('b'), 'pensiero')
  assert.equal(h.state().found, 0) // the fourth guess in two seconds does not count
  assert.equal(h.admin().metrics.ignored.rate, 1)
  h.clock.advance(WORDHUNT_RULES.guessWindowMs + 1)
  h.say(viewer('b'), 'pensiero')
  assert.equal(h.state().found, 1)
})

test('the streamer, a viewer the game leaves out and anonymous messages do not play', () => {
  const h = setup({ allow: (u) => u.id !== 'tiktok:blocked' })
  h.begin()
  h.say(viewer('boss', { host: true }), 'pensiero')
  h.say(viewer('blocked'), 'pensiero')
  h.say({ id: 'tiktok:anonymous', nickname: 'x' }, 'pensiero')
  assert.equal(h.state().found, 0)
  h.say(viewer('ok'), 'pensiero')
  assert.equal(h.state().found, 1)
})

test('the deadline is the clock, not the timer: a message at the deadline is late and the round then ends (§8.1)', () => {
  const h = setup()
  h.begin('fixture', { durationSeconds: 60 })
  h.clock.now += 60_000 // the clock passes the deadline but the timer has not run
  h.say(viewer('late'), 'pensiero')
  assert.equal(h.state().found, 0)
  assert.equal(h.admin().metrics.ignored.late, 1)
  h.clock.advance(1)
  assert.equal(h.state().phase, 'finished')
  assert.equal(h.state().end, 'timeout')
  h.say(viewer('later'), 'pensiero')
  assert.equal(h.state().found, 0)
  assert.equal(h.clock.pending, 0)
})

test('the round ends when every word is found; later messages assign nothing', () => {
  const h = setup()
  h.begin()
  const targets = h.admin().targets.map((t) => t.word)
  targets.forEach((w, i) => { h.say(viewer(`u${i}`), w); h.clock.advance(3000) })
  assert.equal(h.state().phase, 'finished')
  assert.equal(h.state().end, 'completed')
  assert.equal(h.state().found, 8)
  assert.equal(h.clock.pending, 0)
})

test('the countdown comes before the round, and nothing counts during it', () => {
  const h = setup({ settings: { wordhuntCountdown: 5 } })
  assert.deepEqual(h.cmd({ type: 'create-round', mode: 'fixture' }), { ok: true })
  assert.deepEqual(h.cmd({ type: 'start' }), { ok: true })
  assert.equal(h.state().phase, 'countdown')
  h.say(viewer('early'), 'pensiero')
  assert.equal(h.state().found, 0)
  h.clock.advance(5000)
  assert.equal(h.state().phase, 'active')
  h.say(viewer('on-time'), 'pensiero')
  assert.equal(h.state().found, 1)
})

test('§10.3: the public state never holds a word that is not found, its path or its avatar cell', () => {
  const h = setup()
  h.begin()
  h.say(viewer('anna'), 'obbligo')
  // The letters of the grid are public by design (the words are in them, hidden among the others); what must not travel is the list of
  // the words, their paths and the cells of their avatars.
  const wire = JSON.stringify(h.publics.map(({ letters: _letters, ...rest }) => rest))
  for (const hidden of ['PENSIERO', 'MARINARE', 'MURATORE', 'STAGNO', 'DIRETTORE', 'RIFLESSO', 'CORONA']) assert.equal(wire.includes(hidden), false, hidden)
  assert.equal(wire.includes('OBBLIGO'), true) // the word that is found is shown
  for (const cell of ['A1', 'A2', 'B13', 'O4', 'Q2', 'H15']) assert.equal(wire.includes(`"${cell}"`), false, cell) // nor the cells of the others
  assert.equal(h.state().letters.length, 20)
  assert.ok(h.state().letters.every((line) => line.length === 15))
  const admin = h.admin()
  assert.equal(admin.targets.length, 8)
  assert.equal(admin.targets.find((t) => t.word === 'PENSIERO')!.found, false)
})

test('pause stops the clock and the answers; resume gives the time that was left', () => {
  const h = setup()
  h.begin('fixture', { durationSeconds: 60 })
  h.clock.advance(20_000)
  h.room.pause(true)
  assert.equal(h.state().paused, true)
  h.say(viewer('a'), 'pensiero')
  assert.equal(h.state().found, 0)
  h.clock.advance(120_000)
  assert.equal(h.state().phase, 'active')
  assert.equal(h.state().remainingMs, 40_000)
  h.room.pause(false)
  h.clock.advance(39_999)
  assert.equal(h.state().phase, 'active')
  h.clock.advance(1)
  assert.equal(h.state().phase, 'finished')
})

test('a correction frees a word with a reason, in the log; the next valid message takes it', () => {
  const h = setup()
  h.begin()
  h.say(viewer('anna'), 'obbligo')
  const target = h.state().claims[0]!.target
  assert.equal((h.cmd({ type: 'revoke', target, reason: '   ' }) as { error: string }).error, 'bad-input')
  assert.deepEqual(h.cmd({ type: 'revoke', target, reason: 'messaggio inoltrato per errore' }), { ok: true })
  assert.equal(h.state().found, 0)
  assert.equal(h.store.events('round-1').filter((e) => e.type === 'ADMIN_CORRECTION').length, 1)
  h.clock.advance(3000)
  h.say(viewer('bruno'), 'obbligo')
  assert.equal(h.state().claims[0]!.winner.nickname, 'bruno')
  assert.equal(h.store.claims('round-1').length, 1)
})

test('commands: an old version is refused, the wrong phase is typed, nothing throws', () => {
  const h = setup()
  assert.equal((h.room.control({ type: 'start', expectedVersion: 99 }) as { error: string }).error, 'stale-version')
  assert.equal((h.cmd({ type: 'start' }) as { error: string }).error, 'wrong-phase')
  assert.equal((h.cmd({ type: 'finish' }) as { error: string }).error, 'wrong-phase')
  h.begin()
  assert.equal((h.cmd({ type: 'create-round', mode: 'fixture' }) as { error: string }).error, 'wrong-phase')
  assert.equal((h.cmd({ type: 'reset' }) as { error: string }).error, 'wrong-phase')
  assert.deepEqual(h.cmd({ type: 'finish' }), { ok: true })
  assert.equal(h.state().end, 'stopped')
  assert.deepEqual(h.cmd({ type: 'reset' }), { ok: true })
  assert.equal(h.state().phase, 'idle')
})

test('a generated round needs the dictionary; without it only the reference board is offered', () => {
  const h = setup({ dictionary: null })
  assert.equal((h.cmd({ type: 'create-round', mode: 'generated' }) as { error: string }).error, 'no-dictionary')
  assert.equal(h.admin().dictionaryReady, false)
  assert.deepEqual(h.cmd({ type: 'create-round', mode: 'fixture' }), { ok: true })
})

test('a generated round plays like the fixture one, with colours given as the words are found', () => {
  const h = setup()
  h.begin('generated', { seed: 'prova' })
  const words = h.admin().targets.map((t) => t.word)
  assert.equal(words.length, 8)
  h.say(viewer('a'), words[0]!)
  h.say(viewer('b'), words[1]!)
  const colors = h.state().claims.map((c) => c.color)
  assert.equal(new Set(colors).size, 2)
  assert.equal(h.admin().seed, 'prova')
})

test('a failed write does not give the word away: it is reported and nobody has it (§9.4)', () => {
  const h = setup()
  h.begin()
  h.db.exec('DROP VIEW wordhunt_claims_report; DROP TABLE wordhunt_claims') // the table the claim needs is gone
  h.say(viewer('anna'), 'obbligo')
  assert.equal(h.state().found, 0)
  assert.equal(h.admin().metrics.ignored.storage, 1)
  assert.equal(h.issues.length >= 1, true)
})

test('closing a room with a round open marks it abandoned; a restart abandons what was left open', () => {
  const h = setup()
  h.begin()
  h.room.dispose()
  const status = h.db.prepare('SELECT s.name FROM wordhunt_rounds r JOIN wordhunt_statuses s ON s.n = r.status').pluck().get()
  assert.equal(status, 'abandoned')
  const h2 = setup()
  h2.begin()
  assert.equal(h2.store.abandonOpenRounds(5), 1)
})

// ---- The store (§9) ----

test('the store: one holder per target, whatever the room says; the log keeps the order; the old data goes away', () => {
  const db = new Database(':memory:')
  const store = new WordHuntStore(db)
  const board = fixtureBoard(fixtureFile)
  const row = store.createRound({ id: 'r1', roomKey: 'k', mode: 'fixture', board, durationMs: 60_000, now: 1 })
  const base = { roundRow: row, targetSeq: 1, platform: 'tiktok', messageKey: null, guess: 'PENSIERO', receivedMs: 10, color: '#F97316', points: 18, wallMs: 100 }
  assert.equal(store.claim({ ...base, viewer: { id: 'tiktok:1', nickname: 'a' }, receiveSeq: 1 }), true)
  assert.equal(store.claim({ ...base, viewer: { id: 'tiktok:2', nickname: 'b' }, receiveSeq: 2 }), false)
  assert.equal(store.claims('r1').length, 1)
  assert.equal(store.claims('r1')[0]!.nickname, 'a')
  assert.throws(() => db.prepare('INSERT INTO wordhunt_claims (target, participant, guess, color, points, claimed_ms, receive_seq) VALUES (1, 1, 1, ?, 1, 1, 9)').run('#fff'))
  assert.equal(store.purgeExpired(1 + WORDHUNT_RULES.retentionDays * 86_400_000 + 10), 1)
  assert.equal(db.prepare('SELECT COUNT(*) FROM wordhunt_targets').pluck().get(), 0)
  assert.equal(db.prepare('SELECT COUNT(*) FROM wordhunt_participants').pluck().get(), 0)
})

test('the store: the same message cannot be saved twice, and the schema is created again without harm', () => {
  const db = new Database(':memory:')
  const first = new WordHuntStore(db)
  new WordHuntStore(db)
  const board = fixtureBoard(fixtureFile)
  const row = first.createRound({ id: 'r1', roomKey: 'k', mode: 'fixture', board, durationMs: 60_000, now: 1 })
  const input = { roundRow: row, targetSeq: 1, viewer: { id: 'tiktok:1', nickname: 'a' }, platform: 'tiktok', messageKey: 'tiktok:m1', guess: 'PENSIERO', receivedMs: 1, color: '#F97316', points: 18, wallMs: 1 }
  assert.equal(first.claim({ ...input, receiveSeq: 1 }), true)
  assert.throws(() => first.claim({ ...input, receiveSeq: 2, targetSeq: 2 }))
})

// ---- The decoys: real words in the grid that are not answers ----

test('decoys: 6 for 8 targets, real words, off every word and avatar cell, and the chat cannot take them', () => {
  assert.equal(decoyCountFor(8), 6)
  assert.equal(decoyCountFor(12), 9)
  assert.equal(decoyCountFor(1), 1)
  const board = generateBoard(DICTIONARY, { seed: 'esche', targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS })
  assert.deepEqual(auditBoard(board), [])
  assert.equal(board.decoys.length, 6)
  const targets = new Set(board.targets.map((t) => t.word))
  for (const d of board.decoys) {
    assert.ok(DICTIONARY.includes(d.word) && !targets.has(d.word))
    assert.equal(d.cells.map((c) => board.letters[c.row]![c.col]).join(''), d.word)
  }
  const h = setup()
  h.begin('generated', { seed: 'esche' })
  const admin = h.admin()
  assert.equal(admin.decoys.length, 6)
  h.say(viewer('anna'), admin.decoys[0]!.word)
  assert.equal(h.state().found, 0) // a decoy is simply a wrong answer
  assert.equal(h.admin().metrics.ignored.wrong, 1)
  const wire = JSON.stringify(h.publics.map(({ letters: _l, ...rest }) => rest))
  assert.equal(wire.includes(admin.decoys[0]!.word), false) // and the public state does not name the decoys either
})

test('decoys: the audit refuses one that covers a word or an avatar, or is a target; the fixture has none', () => {
  const board = generateBoard(DICTIONARY, { seed: 'esche', targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS })
  const onWord = structuredClone(board)
  onWord.decoys[0]!.cells[0] = onWord.targets[0]!.cells[0]!
  assert.ok(auditBoard(onWord).length > 0)
  const onAvatar = structuredClone(board)
  onAvatar.decoys[0]!.cells[0] = onAvatar.targets[0]!.anchor
  assert.ok(auditBoard(onAvatar).some((p) => p.includes('avatar')))
  assert.equal(fixtureBoard(fixtureFile).decoys.length, 0)
})

test('decoys: many seeds keep every invariant, and the decoys are always found in the grid', () => {
  for (let i = 0; i < 30; i++) {
    const board = generateBoard(DICTIONARY, { seed: `e${i}`, targetCount: 8, minWordLength: 5, maxWordLength: 12, directions: DEFAULT_DIRECTIONS })
    assert.deepEqual(auditBoard(board), [], `seed e${i}`)
    assert.ok(board.decoys.length >= 5, `seed e${i}: ${board.decoys.length} esche`)
  }
})
