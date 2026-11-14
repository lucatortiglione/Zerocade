// Synthetic fixtures exercise game mechanics, transport and telemetry, never semantic QA.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import {
  answerKey,
  drawPuzzle,
  guessKey,
  inflections,
  isWordAssociationPool,
  isWordAssociationPuzzle,
  type LiveEvent,
  type WordAssociationPool,
  type WordAssociationRoundReport,
} from '../packages/shared/src/index.ts'
import { loadWordAssociation, poolRef, sanitizeRoundReport } from '../apps/server/src/word-association.ts'
import { loadContent } from '../apps/overlay/src/content.ts'
import { createWordAssociation } from '../apps/overlay/src/games/wordAssociation.ts'

const WORDS = ['forno', 'mozzarella', 'pomodoro', 'impasto', 'lievito', 'basilico', 'margherita']
const answer = (word: string, group = word) => ({ word, group, difficulty: 'medium' as const })
const pool: WordAssociationPool = {
  ref: 'c0123456789abcdef01234567',
  prompt: 'pizza',
  pos: 'NOUN',
  sense: 'Piatto tondo di pasta lievitata e condita',
  category_id: '009',
  answers: WORDS.map((w) => answer(w)),
  group_limits: Object.fromEntries(WORDS.map((w) => [w, 1])),
  conflicts: [],
}
const puzzle = drawPuzzle(pool, 7)!
// A seeded generator, for draws that must cover both sizes.
const random = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

test('pools are checked and every round draws 7 or 8 words within groups and conflicts', () => {
  assert.equal(isWordAssociationPool(pool), true)
  for (const changes of [
    { ref: 'c000' },
    { answers: [...pool.answers, answer('forno')] },
    { answers: [...pool.answers, answer('pizza')] },
    { answers: [{ ...answer('bufala'), difficulty: 'facile' }] },
    { conflicts: [['forno', 'bufala']] },
    { group_limits: { forno: 0 } },
    { pos: 'NOME' },
  ])
    assert.equal(isWordAssociationPool({ ...pool, ...changes }), false, JSON.stringify(changes))

  assert.equal(drawPuzzle(pool, 8), null) // Seven answers cannot make eight.
  assert.equal(drawPuzzle(pool, 'random')?.words.length, 7)
  assert.deepEqual([...puzzle.words].sort(), [...WORDS].sort())
  assert.equal(isWordAssociationPuzzle(puzzle), true)

  // Ten answers: "forno" and "fuoco" are one meaning (at most one), "pala" never with "teglia".
  const big: WordAssociationPool = {
    ...pool,
    answers: [...pool.answers, answer('fuoco', 'forno'), answer('pala'), answer('teglia')],
    group_limits: { ...pool.group_limits, pala: 1, teglia: 1 },
    conflicts: [['pala', 'teglia']],
  }
  const sizes = new Set<number>()
  for (let seed = 1; seed < 60; seed++) {
    const drawn = drawPuzzle(big, 'random', random(seed * 100_003))!
    sizes.add(drawn.words.length)
    assert.ok(!(drawn.words.includes('forno') && drawn.words.includes('fuoco')))
    assert.ok(!(drawn.words.includes('pala') && drawn.words.includes('teglia')))
    assert.equal(new Set(drawn.words).size, drawn.words.length)
    assert.equal(isWordAssociationPuzzle(drawn), true)
  }
  assert.deepEqual([...sizes].sort(), [7, 8])
})

test('inflections are accepted unless another answer or the prompt shares them', () => {
  assert.deepEqual(inflections('pomodoro', 'NOUN'), ['pomodori'])
  assert.deepEqual(inflections('fuoco', 'NOUN').sort(), ['fuochi', 'fuoci'])
  assert.deepEqual(inflections('barca', 'NOUN'), ['barche'])
  assert.deepEqual(inflections('rosso', 'ADJ').sort(), ['rossa', 'rosse', 'rossi'])
  assert.deepEqual(inflections('impastare', 'VERB'), [])
  assert.deepEqual(inflections('tremare', 'NOUN'), []) // Most likely a verb.
  assert.deepEqual(inflections('mare', 'NOUN'), ['mari'])
  assert.deepEqual(inflections('cabina', 'NOUN'), ['cabine'])
  assert.deepEqual(inflections('problema', 'NOUN').sort(), ['probleme', 'problemi'])
  assert.deepEqual(inflections('caffè', 'NOUN'), [])
  assert.deepEqual(puzzle.variants.pomodoro, ['pomodori'])
  assert.deepEqual(puzzle.prompt_variants, ['pizze'])
  assert.equal(puzzle.hint, 'Piatto tondo di pasta lievitata e condita')
  // "canto" -> "canti" is itself an answer: the form stays out.
  const clash = drawPuzzle({ ...pool, answers: [...pool.answers.slice(0, 5), answer('canto'), answer('canti')] }, 7)!
  assert.equal(clash.variants.canto, undefined)
  // A sense naming one of the answers is not shown.
  assert.equal(drawPuzzle({ ...pool, sense: 'Disco di impasto cotto al forno' }, 7)?.hint, null)
})

test('a guess is one word, accents and articles folded', () => {
  assert.equal(answerKey('CAFFÈ'), 'caffe')
  assert.equal(guessKey(' La Mozzarella!! '), 'mozzarella')
  assert.equal(guessKey("l'impasto"), 'impasto')
  assert.equal(guessKey('forno pomodoro basilico'), null)
  assert.equal(guessKey('🍕'), null)
  assert.equal(guessKey('x'), null)
})

test('server reads the familiar sense of each verified prompt from SQLite, read-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'zerocade-associations-'))
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(loadWordAssociation(null).pools, [])
    const path = join(root, 'prompt.sqlite3')
    const db = new Database(path)
    db.exec(`
      CREATE TABLE reviews(id TEXT PRIMARY KEY, decision TEXT NOT NULL);
      CREATE TABLE prompts(lemma TEXT PRIMARY KEY, familiar_sense TEXT NOT NULL);
      CREATE TABLE senses(id TEXT PRIMARY KEY, prompt TEXT, description TEXT, pos TEXT, category_id TEXT, review_id TEXT);
      CREATE TABLE associations(sense_id TEXT, word TEXT, meaning_group TEXT, difficulty TEXT);
      CREATE TABLE group_limits(sense_id TEXT, meaning_group TEXT, maximum INTEGER);
      CREATE TABLE conflicts(sense_id TEXT, word_a TEXT, word_b TEXT);
      INSERT INTO reviews VALUES ('r1', 'verified'), ('r2', 'verified');
      INSERT INTO prompts VALUES ('pizza', 'Piatto tondo'), ('gelato', 'Dolce freddo');
      INSERT INTO senses VALUES ('s1', 'pizza', 'Piatto tondo', 'NOUN', '009', 'r1'),
        ('s1b', 'pizza', 'Altro senso', 'NOUN', '009', 'r1'), ('s2', 'gelato', 'Dolce freddo', 'NOUN', NULL, 'r2');
    `)
    const add = db.prepare('INSERT INTO associations VALUES (?, ?, ?, ?)')
    for (const w of [...WORDS, 'teglia']) add.run('s1', w, w, 'easy')
    for (const w of ['cono', 'panna', 'cialda']) add.run('s2', w, w, 'easy') // Too few: left out.
    add.run('s1b', 'altro', 'altro', 'easy') // Not the familiar sense: not loaded.
    db.prepare('INSERT INTO conflicts VALUES (?, ?, ?)').run('s1', 'forno', 'teglia')
    db.close()

    const loaded = loadWordAssociation(path)
    assert.equal(loaded.pools.length, 1)
    const [read] = loaded.pools
    assert.equal(read.ref, poolRef('s1'))
    assert.equal(read.sense, 'Piatto tondo')
    assert.deepEqual(read.answers.map((a) => a.word).sort(), [...WORDS, 'teglia'].sort())
    assert.deepEqual(read.conflicts, [['forno', 'teglia']])
    assert.equal(drawPuzzle(read, 8), null) // The conflict leaves only seven compatible words.
    assert.equal(drawPuzzle(read, 7)?.words.length, 7)
    assert.match(loaded.contentId, /^[0-9a-f]{16}$/)

    // A fresh clone has only the dump: it is loaded in memory.
    const dump = join(root, 'prompt.sql')
    const copy = new Database(path, { readonly: true })
    const sql = (copy.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table'").all() as { sql: string }[])
      .map((r) => r.sql + ';').join('\n')
    const rows = ['reviews', 'prompts', 'senses', 'associations', 'group_limits', 'conflicts'].flatMap((t) =>
      (copy.prepare(`SELECT * FROM ${t}`).raw().all() as unknown[][]).map((r) =>
        `INSERT INTO ${t} VALUES (${r.map((v) => (v === null ? 'NULL' : typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`)).join(', ')});`))
    copy.close()
    writeFileSync(dump, ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;', sql, ...rows, 'COMMIT;'].join('\n'))
    const fromDump = loadWordAssociation(dump)
    assert.deepEqual(fromDump.pools, loaded.pools)
    assert.equal(fromDump.contentId, loaded.contentId)

    // A prompt the collection discards or defers never plays; an integrated one does.
    const decide = new Database(path)
    decide.exec(`CREATE TABLE inventory_term_decisions(prompt TEXT PRIMARY KEY, decision TEXT NOT NULL);
      INSERT INTO inventory_term_decisions VALUES ('pizza', 'DISCARDED');`)
    decide.close()
    assert.deepEqual(loadWordAssociation(path).pools, [])
    const integrate = new Database(path)
    integrate.exec("UPDATE inventory_term_decisions SET decision = 'INTEGRATED'")
    integrate.close()
    assert.equal(loadWordAssociation(path).pools.length, 1)

    writeFileSync(join(root, 'broken.sqlite3'), 'not a database')
    assert.deepEqual(loadWordAssociation(join(root, 'broken.sqlite3')).pools, [])
  } finally {
    console.warn = warn
    rmSync(root, { recursive: true, force: true })
  }
})

test("the games' database has the prompts, each word once and the links (schema associazioni)", () => {
  const root = mkdtempSync(join(tmpdir(), 'zerocade-associations-'))
  try {
    const file = join(root, 'giochi.sqlite3')
    const db = new Database(file)
    // As database/script/giochi.py writes it: numeric keys, the pool's ref kept with the prompt, the words once.
    db.exec(`
      CREATE TABLE zerodb_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE zerodb_objects(schema TEXT, name TEXT, type TEXT, tbl_name TEXT, rows INTEGER, PRIMARY KEY(schema, name));
      INSERT INTO zerodb_meta VALUES ('verified', '1');
      CREATE TABLE associazioni__prompts(id INTEGER PRIMARY KEY, prompt TEXT UNIQUE, pos TEXT, sense TEXT, category_id TEXT,
        ref TEXT UNIQUE, review_id TEXT);
      CREATE TABLE associazioni__words(id INTEGER PRIMARY KEY, word TEXT UNIQUE);
      CREATE TABLE associazioni__difficulties(id INTEGER PRIMARY KEY, name TEXT UNIQUE);
      CREATE TABLE associazioni__meaning_groups(prompt_id INTEGER, name_id INTEGER, maximum INTEGER,
        PRIMARY KEY(prompt_id, name_id)) WITHOUT ROWID;
      CREATE TABLE associazioni__prompt_words(prompt_id INTEGER, word_id INTEGER, group_name_id INTEGER, difficulty INTEGER,
        PRIMARY KEY(prompt_id, word_id)) WITHOUT ROWID;
      CREATE TABLE associazioni__conflicts(prompt_id INTEGER, word_a INTEGER, word_b INTEGER,
        PRIMARY KEY(prompt_id, word_a, word_b)) WITHOUT ROWID;
      INSERT INTO associazioni__difficulties VALUES (1, 'easy'), (2, 'medium'), (3, 'hard'), (4, 'unrated');
    `)
    db.prepare('INSERT INTO associazioni__prompts VALUES (1, ?, ?, ?, ?, ?, ?)').run('pizza', 'NOUN', 'Piatto tondo', '009', poolRef('s1'), 'r1')
    const words = [...WORDS, 'teglia']
    const id = (w: string) => words.indexOf(w) + 1
    for (const w of words) {
      db.prepare('INSERT INTO associazioni__words VALUES (?, ?)').run(id(w), w)
      db.prepare('INSERT INTO associazioni__meaning_groups VALUES (1, ?, ?)').run(id(w), w === 'forno' ? 1 : null)
      db.prepare('INSERT INTO associazioni__prompt_words VALUES (1, ?, ?, 1)').run(id(w), id(w))
    }
    db.prepare('INSERT INTO associazioni__conflicts VALUES (1, ?, ?)').run(id('forno'), id('teglia'))
    const register = db.prepare("INSERT INTO zerodb_objects VALUES ('associazioni', ?, 'table', ?, NULL)")
    for (const t of ['prompts', 'words', 'difficulties', 'meaning_groups', 'prompt_words', 'conflicts']) register.run(t, t)
    db.close()

    const loaded = loadWordAssociation(`${file}#associazioni`)
    const [read, ...others] = loaded.pools
    assert.equal(others.length, 0)
    assert.equal(read.ref, poolRef('s1'))
    assert.equal(read.sense, 'Piatto tondo')
    assert.deepEqual(read.answers.map((a) => a.word), [...words].sort())
    assert.equal(read.answers[0].difficulty, 'easy')
    assert.deepEqual(read.group_limits, { forno: 1 })
    assert.deepEqual(read.conflicts, [['forno', 'teglia']])
    // The same contentId the working database gives for the same review: the "behind" check compares them.
    assert.equal(loaded.contentId, createHash('sha256').update('r1').digest('hex').slice(0, 16))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('server keeps only round reports that match the pool', () => {
  const content = { contentId: 'abc123', pools: [pool] }
  const report: WordAssociationRoundReport = {
    ref: pool.ref, words: [...puzzle.words],
    found: [{ word: 'forno', ms: 1200, hinted: false }],
    wrong: [{ guess: 'pizzeria', count: 3 }],
    durationMs: 90_000, hints: 1, players: 4, guesses: 9,
  }
  const kept = sanitizeRoundReport(report, content)
  assert.equal(kept?.prompt, 'pizza')
  assert.equal(kept?.content_id, 'abc123')
  for (const bad of [
    { ref: 'cffffffffffffffffffffffff' },
    { words: puzzle.words.slice(1) },
    { words: [...puzzle.words.slice(1), 'bufala'] },
    { found: [{ word: 'bufala', ms: 1, hinted: false }] },
    { found: [{ word: 'forno', ms: 1, hinted: false }, { word: 'forno', ms: 2, hinted: false }] },
    { found: [{ word: 'forno', ms: 999_999, hinted: false }] },
    { wrong: [{ guess: 'pomodori', count: 1 }] },
    { wrong: [{ guess: 'Pizzeria!', count: 1 }] },
    { durationMs: -1 },
  ])
    assert.equal(sanitizeRoundReport({ ...report, ...bad }, content), null, JSON.stringify(bad))
})

function harness(settings: Record<string, number | boolean | string>) {
  const texts: string[] = []
  const context = new Proxy({
    font: '', fillText: (text: string) => texts.push(text),
    measureText: (text: string) => ({ width: text.length * 10 }),
  }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
  const reports: WordAssociationRoundReport[] = []
  const game = createWordAssociation((r) => reports.push(r))
  const draw = () => { texts.length = 0; game.draw(context, 0); return texts.join('\n') }
  const say = (text: string, id = 'a', nickname = 'Tester') =>
    game.onAction('guess', { type: 'comment', text, user: { id, nickname } } as LiveEvent, 0)
  const act = (action: string) => game.onAction(action, { type: 'gift' } as LiveEvent, 0)
  const tick = (seconds: number) => game.update(seconds, 0, settings)
  game.reset(settings, 1080, 1920)
  return { draw, say, act, tick, reports }
}

const base = {
  answerCount: '7', roundMode: 'timed', roundSeconds: 60, breakSeconds: 5, matchEnd: 'endless', showSessionLeaderboard: false,
  longWordHeadStart: false, dripRevealEnabled: true, giftRevealLetters: 1, showSenseHint: true, specialRoundEnabled: false,
}

test('game shows the prompt, hides the words, credits each one once and reports the round', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ 'word-association': [pool] }))
  try { await loadContent() } finally { globalThis.fetch = originalFetch }
  const { draw, say, act, tick, reports } = harness(base)

  let shown = draw()
  assert.match(shown, /PIZZA/)
  assert.match(shown, /Piatto tondo di pasta lievitata/)
  assert.match(shown, /0\/7/)
  assert.ok(!/FORNO|MOZZARELLA/.test(shown))

  say('pomodori!') // An inflected form finds the word.
  // The solver's picture (here the initial: no avatar) right before the word, then the name.
  assert.match(draw(), /\nT\nPOMODORO\nTester\n/)
  assert.match(draw(), /Tester \+3/) // 1 point + speed bonus 2.
  say('forno') // The same viewer again, quickly: combo.
  assert.match(draw(), /combo x2/)
  say('forno', 'b', 'Other') // Already found: no credit, not a wrong guess.
  assert.ok(!draw().includes('Other'))
  say('pizzeria', 'b', 'Other')
  say('pizzeria', 'c', 'Third')
  say('pizza', 'c', 'Third') // The prompt itself is neither right nor a wrong guess.
  act('reveal_letter')
  assert.match(draw(), /M _ _ _ _ _ _ _ _ _/) // One of the longest hidden words gets a letter.

  tick(30) // Half the round: every hidden word uncovers a letter.
  assert.match(draw(), /I _ _ _ _ _ _/)
  assert.match(draw(), /M [OA] _ _ _ _ _ _ _ _/) // The gift's letter, plus the drip's.
  tick(30)
  shown = draw()
  assert.match(shown, /Tempo scaduto · 2\/7/)
  assert.match(shown, /MOZZARELLA/) // Missed words are revealed.
  assert.equal(reports.length, 1)
  const [round] = reports
  assert.equal(round.ref, pool.ref)
  assert.deepEqual(round.found.map((f) => f.word).sort(), ['forno', 'pomodoro'])
  assert.deepEqual(round.wrong, [{ guess: 'pizzeria', count: 2 }])
  assert.equal(round.players, 3)
  assert.equal(round.guesses, 6)
  assert.equal(round.hints, 1)
  assert.equal(round.durationMs, 60_000)
  assert.equal(sanitizeRoundReport(round, { contentId: 'x', pools: [pool] })?.found.length, 2)

  tick(5) // Next round.
  assert.match(draw(), /0\/7/)
  for (const word of WORDS) say(word)
  assert.match(draw(), /Tutte trovate!/)
  assert.equal(reports.length, 2)
  assert.equal(reports[1].found.length, 7)

  tick(5)
  tick(60) // A round nobody played is not reported.
  assert.equal(reports.length, 2)
})

test('head start, gift letters, guess limit and rounds without a timer', () => {
  const { draw, say, act, tick, reports } = harness({
    ...base, roundMode: 'untilSolved', longWordHeadStart: true, giftRevealLetters: 3, guessCapEnabled: true, guessesPerUser: 2,
  })
  let shown = draw()
  assert.match(shown, /M _ _ _ _ _ _ _ _ _/) // 10 letters: one shown from the start.
  assert.ok(!/F _ _ _ _/.test(shown)) // Short words start hidden.
  act('reveal_letter') // Three letters, each on the word with the fewest shown.
  shown = draw()
  assert.match(shown, /F _ _ _ _/)
  assert.match(shown, /I _ _ _ _ _ _/)
  assert.match(shown, /L _ _ _ _ _ _/)
  say('sbagliata')
  say('altra')
  say('forno') // Third guess: over the limit of two, ignored.
  assert.match(draw(), /0\/7/)
  say('forno', 'b', 'Other')
  assert.match(draw(), /1\/7/)
  tick(25) // No timer: after 20 s with nothing found, another letter.
  assert.match(draw(), /M O _ _ _ _ _ _ _ _/)
  assert.ok(!draw().includes('Tempo scaduto'))
  act('next_round') // The streamer ends it.
  assert.match(draw(), /Round finito · 1\/7/)
  assert.equal(reports.length, 1)
  assert.equal(reports[0].guesses, 3)
})

test('a match ends after its rounds with a podium, then starts again from zero', () => {
  const { draw, say, tick } = harness({ ...base, matchEnd: 'rounds', matchRounds: 3 })
  assert.match(draw(), /round 1\/3/)
  for (let round = 0; round < 3; round++) {
    say(WORDS[round], 'a', 'Luna')
    tick(60)
    tick(5)
  }
  let shown = draw()
  assert.match(shown, /Partita finita!/)
  assert.match(shown, /🥇 \nLuna · 9/) // Picture between the medal and the name.
  tick(10)
  shown = draw()
  assert.match(shown, /round 1\/3/)
})

test('a match by points ends as soon as someone reaches them', () => {
  const { draw, say, tick } = harness({ ...base, matchEnd: 'points', matchPoints: 10 })
  for (const word of WORDS.slice(0, 2)) say(word, 'a', 'Luna')
  assert.match(draw(), /vince chi arriva a 10/)
  say(WORDS[2], 'a', 'Luna') // 3 + 4 (combo x2) + 5 (combo x3) = 12 points.
  assert.match(draw(), /Round finito · 3\/7/)
  tick(5)
  assert.match(draw(), /Partita finita!/)
})

test('every few rounds a special round: the words come out one by one, the prompt is worth less each time', () => {
  const { draw, say, act, tick, reports } = harness({ ...base, specialRoundEnabled: true, specialRoundEvery: 3, specialRevealSeconds: 5 })
  for (let round = 0; round < 3; round++) {
    say('sbagliata')
    tick(60)
    tick(5)
  }
  assert.equal(reports.length, 3)
  const out = () => WORDS.filter((w) => draw().includes(w.toUpperCase())).length
  let shown = draw()
  assert.match(shown, /ROUND SPECIALE/)
  assert.match(shown, /_ _ _ _ _/) // The prompt is hidden.
  assert.equal(out(), 1) // The first word is out at once.
  assert.match(shown, /Vale 7 punti · indizi 1\/7/)
  act('reveal_letter') // A gift shows a letter of the prompt.
  assert.match(draw(), /P _ _ _ _/)
  tick(5)
  assert.equal(out(), 2)
  assert.match(draw(), /Vale 6 punti · indizi 2\/7/)
  say('mozzarella', 'b', 'Other') // A word is not the answer.
  say('Pizze!', 'a', 'Luna') // The prompt's plural counts.
  shown = draw()
  assert.match(shown, /La parola era/)
  assert.match(shown, /PIZZA/)
  assert.match(shown, /Indovinata da \nLuna \+6/) // Picture before the winner's name.
  assert.equal(reports.length, 3) // The special round sends no word telemetry.
  tick(5)
  assert.ok(!draw().includes('ROUND SPECIALE')) // Back to normal rounds.
})

test('a special round nobody solves shows the prompt when its time is up', () => {
  const { draw, tick } = harness({ ...base, specialRoundEnabled: true, specialRoundEvery: 3, specialRevealSeconds: 5 })
  for (let round = 0; round < 3; round++) { tick(60); tick(5) }
  assert.match(draw(), /ROUND SPECIALE/)
  tick(30) // 7 words: the last one out at 30 s.
  assert.match(draw(), /Vale 1 punto · indizi 7\/7/)
  tick(10)
  const shown = draw()
  assert.match(shown, /Nessuno l’ha indovinata/)
  assert.match(shown, /PIZZA/)
})
