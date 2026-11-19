import assert from 'node:assert/strict'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { TOURNAMENT_RULES, type ContextSemanticState, type TournamentCommand, type Viewer } from '../packages/shared/src/index.ts'
import { parseContextData, rankAgainst, type ContextData, type Ranking } from '../packages/shared/src/contextRanking.ts'
import { ContextTournamentStore } from '../apps/server/src/context-tournament-db.ts'
import { ContextTournaments } from '../apps/server/src/context-tournament.ts'
import { serverCorpus, type Corpus } from '../apps/server/src/context-tournament-ranking.ts'
import { ContextSemanticGame } from '../apps/server/src/context-semantic.ts'
import { ContextCorpora } from '../apps/server/src/context-corpora.ts'

// The rankings come from the server's ranking thread: they arrive later, as promises. Here a "thread" that answers only
// when told to (`answer`), so that the order of events can be checked: nothing is played on a ranking that is not there.

function slowRanker(data: ContextData) {
  const waiting: { secret: number; resolve(r: Ranking): void; reject(e: Error): void }[] = []
  return {
    waiting,
    rank: (secret: number) => new Promise<Ranking>((resolve, reject) => { waiting.push({ secret, resolve, reject }) }),
    answer() { const w = waiting.shift()!; w.resolve(rankAgainst(data, w.secret)) },
    refuse() { waiting.shift()!.reject(new Error('thread caduto')) },
  }
}
const settle = () => new Promise((r) => setImmediate(r))

// ---- the classic game ------------------------------------------------------------------------------------------------

const word = (n: number) => `voce${String.fromCharCode(97 + Math.floor(n / 676), 97 + Math.floor(n / 26) % 26, 97 + n % 26)}`
const words = Array.from({ length: 1400 }, (_, i) => word(i))
const vectors = new Float32Array(words.length * 300)
for (let i = 0; i < words.length; i++) { const a = i < 3 ? 0 : i / words.length * Math.PI; vectors[i * 300] = Math.cos(a); vectors[i * 300 + 1] = Math.sin(a) }
const semantic = parseContextData(words.join('\n'), vectors.buffer, `${words[0]}\n${words[1]}\n${words[2]}`, { boost: 0, links: {}, vector_format: 'float32', dim: 300,
  semantic: { version: 'context-semantic-1', ordinary: [0, 1, 2], special: [], curatedOrdinary: [0, 1, 2], compatibility: [], domains: {} } })
// The main thread's corpus has no vectors: only the ranker has them.
const vocabularyOnly: Corpus = { hash: 'h', data: { words: semantic.words, secrets: semantic.secrets, index: semantic.index, folded: semantic.folded, semantic: semantic.semantic } }

function game() {
  let now = 0
  const ranker = slowRanker(semantic)
  const states: ContextSemanticState[] = [], secrets: string[] = [], failures: string[] = []
  const g = new ContextSemanticGame({ corpus: vocabularyOnly, settings: { breakSeconds: 8 }, now: () => now, random: () => 0,
    emit: (s) => states.push(s), award: () => {}, secret: (w) => secrets.push(w), rank: ranker.rank, failed: (e) => failures.push(e.message) })
  return { g, ranker, states, secrets, failures, advance(ms: number) { now += ms; g.tick() } }
}

test('the first round waits for its ranking, shown as "preparing"; the secret is told only when it starts', async () => {
  const f = game()
  assert.equal(f.g.snapshot().preparing, true)
  assert.equal(f.g.snapshot().round, 0)
  assert.deepEqual(f.secrets, [])
  // a guess while preparing changes nothing
  f.g.action('guess', { type: 'comment', text: words[5], user: { id: 'p', nickname: 'P' } })
  assert.equal(f.g.snapshot().attempts, 0)
  f.ranker.answer(); await settle()
  assert.equal(f.g.snapshot().round, 1)
  assert.equal(f.g.snapshot().phase, 'playing')
  assert.equal(f.g.snapshot().preparing, undefined)
  assert.equal(f.secrets.length, 1)
})

test('the next round is ranked during the break; a late ranking makes the break longer, never a round without it', async () => {
  const f = game()
  f.ranker.answer(); await settle()
  f.g.next() // the creator ends round 1: the break begins and round 2 is asked for at once
  assert.equal(f.ranker.waiting.length, 1)
  assert.notEqual(words[f.ranker.waiting[0]!.secret], f.secrets[0], 'not the same secret again')
  f.advance(9000) // the break is over, the ranking is not there yet
  assert.equal(f.g.snapshot().round, 1)
  assert.equal(f.g.snapshot().phase, 'intermission')
  assert.equal(f.secrets.length, 1, 'the dashboard does not learn the next secret early')
  f.ranker.answer(); await settle()
  assert.equal(f.g.snapshot().round, 2)
  assert.equal(f.g.snapshot().phase, 'playing')
})

test('a failed ranking is asked again a little later; a replaced game ignores an answer still on its way', async () => {
  const f = game()
  f.ranker.refuse(); await settle()
  assert.deepEqual(f.failures, ['thread caduto'])
  f.advance(1000)
  assert.equal(f.ranker.waiting.length, 0, 'not at once')
  f.advance(2500)
  assert.equal(f.ranker.waiting.length, 1, 'again after 3 s')
  f.g.dispose()
  const before = f.states.length
  f.ranker.answer(); await settle()
  assert.equal(f.states.length, before)
  assert.equal(f.g.snapshot().round, 0)
})

// ---- the tournament --------------------------------------------------------------------------------------------------

const N = 9000
const letters = 'abcdefghijklmnopqrstuvwxyz'
const twords = Array.from({ length: N }, (_, i) => letters[Math.floor(i / 676) % 26] + letters[Math.floor(i / 26) % 26] + letters[i % 26])
const tvectors = new Int8Array(N * 2)
for (let i = 0; i < 7; i++) tvectors[i * 2] = 127
const tdata = parseContextData(twords.join('\n'), tvectors.buffer, twords.slice(0, 7).join('\n'))
const tcorpus: Corpus = { hash: 'corpus-test', data: { words: tdata.words, secrets: tdata.secrets, index: tdata.index, folded: tdata.folded } }
const ROOM = 'room-1'
const viewer = (id: string): Viewer => ({ id: `tiktok:${id}`, nickname: id })

function tournament(db = new Database(':memory:'), clock = { now: 1_000_000 }) {
  const ranker = slowRanker(tdata)
  const timers: { at: number; fn: () => void }[] = []
  const t = new ContextTournaments({ store: new ContextTournamentStore(db), countdownMs: 0, corpus: () => tcorpus, rank: (_c, secret) => ranker.rank(secret),
    now: () => clock.now, setTimer: (fn, ms) => timers.push({ at: clock.now + ms, fn }), clearTimer: () => {}, random: () => 0,
    emitPublic: () => {}, emitAdmin: () => {}, bridgeReady: () => true })
  const cmd = (c: Record<string, unknown>) => t.command(ROOM, { expectedVersion: t.state(ROOM)?.version, ...c } as TournamentCommand, { gameId: 'context', audience: 'all' })
  return { t, ranker, cmd, clock }
}

test('a tournament round starts on a ranking prepared beforehand; before it is ready «Avvia manche» says to wait', async () => {
  const s = tournament()
  assert.deepEqual(s.t.command(ROOM, { type: 'create', totalRounds: 5, intermissionSeconds: 15 }, { gameId: 'context', audience: 'all' }), { ok: true })
  assert.equal(s.ranker.waiting.length, 1, 'the first round is prepared as soon as the tournament exists')
  const early = s.cmd({ type: 'start-round' })
  assert.equal(early.ok, false)
  assert.match(early.ok ? '' : early.error, /preparando/)
  s.ranker.answer(); await settle()
  assert.deepEqual(s.cmd({ type: 'start-round' }), { ok: true })
  assert.equal(s.t.state(ROOM)!.phase, 'window-open')
  assert.equal(s.ranker.waiting.length, 0, 'no ranking asked while the round is in play')
})

test('after a restart the round in play gets its ranking from the thread: resume waits for it', async () => {
  const db = new Database(':memory:')
  const clock = { now: 1_000_000 }
  const first = tournament(db, clock)
  first.t.command(ROOM, { type: 'create', totalRounds: 5, intermissionSeconds: 15 }, { gameId: 'context', audience: 'all' })
  first.ranker.answer(); await settle()
  first.cmd({ type: 'start-round' })
  first.t.offer(ROOM, viewer('anna'), twords[299]!, '', 'tiktok')
  clock.now += TOURNAMENT_RULES.windowMs + TOURNAMENT_RULES.processingMs
  first.t.dispose()
  const second = tournament(db, clock)
  second.t.restore()
  assert.equal(second.t.state(ROOM)!.phase, 'suspended')
  const early = second.cmd({ type: 'resume' })
  assert.equal(early.ok, false)
  assert.match(early.ok ? '' : early.error, /preparando/)
  second.ranker.answer(); await settle()
  assert.deepEqual(second.cmd({ type: 'resume' }), { ok: true })
})

// ---- the real thread -------------------------------------------------------------------------------------------------

test('the ranking thread gives the same corpus identity and the same ranking as the main thread did', async () => {
  const local = serverCorpus('original')
  if (!local) return // no game data in this checkout
  const corpora = new ContextCorpora()
  try {
    const corpus = await corpora.load('original')
    assert.ok(corpus)
    assert.equal(corpus.hash, local.hash, 'tournaments saved before keep their corpus')
    assert.equal(corpus.data.words.length, local.data.words.length)
    assert.ok(!('vectors' in corpus.data), 'the main thread has no vectors')
    const secret = local.data.secrets[42]!
    const remote = await corpora.rank(corpus, secret)
    const mine = rankAgainst(local.data, secret)
    assert.deepEqual([...remote.order.subarray(0, 2000)], [...mine.order.subarray(0, 2000)])
    assert.deepEqual([...remote.rankOf.subarray(0, 2000)], [...mine.rankOf.subarray(0, 2000)])
    assert.equal(corpora.status('original'), 'ready')
    // A ranking for a corpus the thread does not know is refused, not answered with other data.
    await assert.rejects(corpora.rank({ ...corpus, hash: 'other' }, secret), /sconosciuto/)
  } finally {
    corpora.close()
  }
})

test('a reload from the publisher reads again every corpus that was ready before it resolves, and keeps the known ones', async () => {
  const { EventEmitter } = await import('node:events')
  const asked: string[] = []
  // A thread that answers at once: every corpus keeps its hash (the reload changed nothing for it).
  const fake = () => {
    const w = new EventEmitter() as EventEmitter & { postMessage(m: { id: number; kind: string; profile?: string }): void; unref(): void; terminate(): Promise<number> }
    w.unref = () => {}
    w.terminate = async () => 0
    w.postMessage = (m) => {
      asked.push(`${m.kind}:${m.profile ?? ''}`)
      const result = m.kind === 'load' ? { hash: `hash-${m.profile}`, words: ['mare', 'onda'], secrets: [0] }
        : m.kind === 'rank' ? { secret: 0, order: new Uint32Array([0, 1]), rankOf: new Uint32Array([0, 1]) } : { revision: 'r', words: 2, dim: 300 }
      setImmediate(() => w.emit('message', { id: m.id, ok: true, result }))
    }
    return w as unknown as import('node:worker_threads').Worker
  }
  const corpora = new ContextCorpora(fake)
  const abtt = (await corpora.load('abtt'))!
  await corpora.load('original')
  asked.length = 0
  await corpora.reload('a'.repeat(64))
  assert.deepEqual(asked.sort(), ['load:abtt', 'load:original', 'reload:original'])
  assert.equal(corpora.status('abtt'), 'ready', 'a tournament on the other associations finds its corpus, and is not suspended')
  assert.equal(corpora.get('abtt')!.hash, abtt.hash)
  // A game still holding the corpus of before can rank: its hash is still known.
  await corpora.rank(abtt, 0)
  corpora.close()
})
