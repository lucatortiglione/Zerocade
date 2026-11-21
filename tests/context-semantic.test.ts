import assert from 'node:assert/strict'
import { test } from 'node:test'
import { semanticMode, specialPoints, thermalScore, type ContextSemanticState, type LiveEvent } from '@zerocade/shared'
import { contextHalf, parseContextData, rankAgainst } from '@zerocade/shared/contextRanking'
import { ContextSemanticGame } from '../apps/server/src/context-semantic.ts'
import { createSemanticContext } from '../apps/overlay/src/games/contextSemanticGame.ts'

const word = (n: number) => `voce${String.fromCharCode(97 + Math.floor(n / 676), 97 + Math.floor(n / 26) % 26, 97 + n % 26)}`
const words = Array.from({ length: 1400 }, (_, i) => word(i))
const vectors = new Float32Array(words.length * 300)
for (let i = 0; i < words.length; i++) {
  const angle = i < 2 ? 0 : i / words.length * Math.PI
  vectors[i * 300] = Math.cos(angle); vectors[i * 300 + 1] = Math.sin(angle)
}
const linked = { boost: 0, links: {}, vector_format: 'float32', dim: 300,
  semantic: { version: 'context-semantic-1', ordinary: [0], special: [1], curatedOrdinary: [0], compatibility: [], domains: { 1: 'emozioni' } } }
const parse = (buffer = vectors.slice().buffer, links: unknown = linked) => parseContextData(words.join('\n'), buffer, `${words[0]}\n${words[1]}`, links)
const data = parse()

function fixture(roundCompleted?: (secret: string, words: string[]) => void) {
  let now = 0
  const states: ContextSemanticState[] = [], awards: number[] = [], secrets: string[] = []
  const game = new ContextSemanticGame({ corpus: { data, hash: 'fixture' }, specialRoundsEnabled: true, settings: { breakSeconds: 0, closestPoints: 'none' },
    roundCompleted, now: () => now, random: () => 0, emit: (s) => states.push(s), award: (_, p) => awards.push(p), secret: (s) => secrets.push(s) })
  return { game, states, awards, secrets, advance(ms: number) { now += ms; game.tick() },
    ninth() { for (let i = 1; i < 9; i++) { game.next(); now++; game.tick() } },
    guess(i: number | string) { const event: LiveEvent = { type: 'comment', text: typeof i === 'number' ? words[i] : i, user: { id: 'p', nickname: 'Giocatore' } }; game.action('guess', event, 'twitch') } }
}

test('reviews receive only accepted live guesses after a round completes, omitting hints, simulator and solution', () => {
  const rounds: { secret: string; words: string[] }[] = []
  const f = fixture((secret, words) => rounds.push({ secret, words }))
  const user = { id: 'sim', nickname: 'Simulatore' }
  f.game.action('guess', { type: 'comment', text: words[1000], user }, 'sim')
  f.guess(1300)
  f.guess(1300)
  f.guess('due parole')
  f.game.action('reveal_closer', { type: 'gift', giftId: 'rose', count: 1, user })
  assert.deepEqual(rounds, [])
  f.guess(f.secrets[0])
  assert.deepEqual(rounds, [{ secret: f.secrets[0], words: [words[1300]] }])
  f.game.dispose()
  assert.equal(rounds.length, 1)
})

test('FP32 rows are normalized, finite and dimensioned explicitly; int8 remains supported', () => {
  assert.ok(data.vectors instanceof Float32Array)
  const r = rankAgainst(data, 1)
  assert.equal(r.rankOf[1], 0); assert.equal(r.similarities![1], 1)
  assert.ok(r.rankOf[1300] > 1000)
  const bad = vectors.slice(); bad[0] = NaN
  assert.throws(() => parse(bad.buffer), /normalizzati/)
  bad[0] = 2
  assert.throws(() => parse(bad.buffer), /normalizzati/)
  assert.throws(() => parse(vectors.buffer, { ...linked, dim: 256 }), /Dimensioni/)
  assert.throws(() => parse(vectors.buffer, { ...linked, vector_format: 'float64' }), /Formato/)
  assert.throws(() => parse(vectors.buffer.slice(1)), /troncati/)
  assert.ok(parseContextData('mare\nonda', new Int8Array([100, 0, 95, 30]).buffer, 'mare').vectors instanceof Int8Array)
})

test('ending the session closes its last paused round once, while changing games discards unfinished guesses', () => {
  const rounds: string[][] = []
  const f = fixture((_, words) => rounds.push(words))
  f.guess(1300)
  f.guess(1299)
  f.game.pause(true)
  f.game.endSession()
  f.game.endSession()
  assert.deepEqual(rounds, [[words[1300], words[1299]]])
  const abandoned = fixture((_, words) => rounds.push(words))
  abandoned.guess(1301)
  abandoned.game.dispose()
  assert.equal(rounds.length, 1)
})

test('pools must cover all secrets and the special pool must have actual domains', () => {
  assert.throws(() => parse(vectors.buffer, { ...linked, semantic: { ...linked.semantic, special: [] } }), /incompleti/)
  assert.throws(() => parse(vectors.buffer, { ...linked, semantic: { ...linked.semantic, domains: {} } }), /incompleti/)
  assert.throws(() => parse(vectors.buffer, { ...linked, semantic: { ...linked.semantic, ordinary: [1399] } }), /fuori/)
  assert.throws(() => parse(vectors.buffer, { ...linked, boost: .1 }), /incompleti/)
})

test('float16 remains compact, normalizes cosine after rounding and rejects non-finite rows', () => {
  const half = new Uint16Array(3 * 300)
  half[0] = 0x3c00
  half[300] = 0x39a8; half[301] = 0x39a8
  half[600] = 0xbc00
  const links = { boost: 0, links: {}, vector_format: 'float16', dim: 300,
    semantic: { version: 'context-semantic-1', ordinary: [0], special: [], curatedOrdinary: [0], compatibility: [], domains: {} } }
  const parsed = parseContextData('mare\nonda\nterra', half.buffer, 'mare', links)
  assert.ok(parsed.vectors instanceof Uint16Array)
  assert.equal(parsed.vectors.byteLength, 3 * 300 * 2)
  const ranks = rankAgainst(parsed, 0)
  assert.deepEqual([...ranks.order], [0, 1, 2])
  assert.ok(Math.abs(ranks.similarities![1] - Math.SQRT1_2) < 1e-6)
  assert.equal(contextHalf(1), 2 ** -24)
  assert.equal(contextHalf(0x7c00), Infinity)
  assert.ok(Number.isNaN(contextHalf(0x7c01)))
  half[0] = 0x7c00
  assert.throws(() => parseContextData('mare\nonda\nterra', half.buffer, 'mare', links), /normalizzati/)
  assert.throws(() => parseContextData('mare\nonda\nterra', half.buffer.slice(1), 'mare', links), /troncati/)
})

test('the ninth and eighteenth rounds use special targets, ordinary rounds have no deadline', () => {
  const f = fixture()
  f.advance(1e8)
  assert.equal(f.game.snapshot().remainingMs, null)
  assert.equal(f.game.snapshot().phase, 'playing')
  f.ninth()
  assert.equal(f.game.snapshot().round, 9); assert.equal(f.game.snapshot().mode, 'special')
  assert.equal(f.secrets.at(-1), words[1])
  for (let i = 9; i < 18; i++) { f.game.next(); f.advance(1) }
  assert.equal(f.game.snapshot().round, 18); assert.equal(f.game.snapshot().mode, 'special')
  assert.equal(semanticMode(0), 'ordinary')
})

test('invalid, duplicate and hinted guesses do not consume attempts; the hundredth winning guess wins once', () => {
  const f = fixture(); f.ninth()
  f.guess('due parole'); f.guess('inesistente'); assert.equal(f.game.snapshot().attempts, 0)
  f.guess(2); f.guess(2); assert.equal(f.game.snapshot().attempts, 1)
  for (let i = 3; i <= 100; i++) f.guess(i)
  assert.equal(f.game.snapshot().attempts, 99)
  f.advance(60000)
  f.guess(1)
  assert.equal(f.game.snapshot().reason, 'found'); assert.equal(f.game.snapshot().attempts, 100)
  assert.deepEqual(f.awards, [3500])
  f.guess(1); f.game.next(); assert.deepEqual(f.awards, [3500])
})

test('100 accepted guesses end an unsolved special round', () => {
  const f = fixture(); f.ninth()
  for (let i = 2; i <= 101; i++) f.guess(i)
  assert.equal(f.game.snapshot().reason, 'attempts')
  assert.equal(f.game.snapshot().solution, words[1]); assert.deepEqual(f.awards, [])
})

test('hints and guesses repeating a hint do not consume attempts', () => {
  const f = fixture(); f.ninth()
  f.game.action('reveal_closer', { type: 'gift', giftId: 'rose', count: 1, user: { id: 'p', nickname: 'Giocatore' } })
  const hint = f.game.snapshot().last!
  assert.equal(hint.by, null); assert.equal(f.game.snapshot().attempts, 0)
  f.guess(hint.word)
  assert.equal(f.game.snapshot().attempts, 0)
  f.guess(1)
  assert.equal(f.game.snapshot().attempts, 1); assert.equal(f.game.snapshot().reason, 'found')
})

test('server time ends a round without chat, and a guess at the deadline cannot score', () => {
  const f = fixture(); f.ninth(); f.advance(179999)
  assert.equal(f.game.snapshot().phase, 'playing')
  f.advance(1)
  assert.equal(f.game.snapshot().reason, 'time'); assert.deepEqual(f.awards, [])
  f.guess(1); assert.deepEqual(f.awards, [])
})

test('pause freezes the server clock, snapshots do not reveal the word, rescue milestones happen once', () => {
  const f = fixture(); f.ninth(); f.guess(1300)
  assert.equal(f.game.snapshot().solution, null)
  f.advance(90000)
  assert.equal(f.game.snapshot().notes.length, 1)
  f.game.pause(true); f.advance(1e6)
  assert.equal(f.game.snapshot().remainingMs, 90000)
  f.guess(1); assert.deepEqual(f.awards, [])
  f.game.pause(false); f.advance(60000)
  assert.equal(f.game.snapshot().notes.length, 2)
  f.advance(1000); assert.equal(f.game.snapshot().notes.length, 2)
  f.advance(29000); assert.equal(f.game.snapshot().reason, 'time')
})

test('thermal curves and bonus are bounded and follow the specification', () => {
  assert.equal(thermalScore(1, false), 100); assert.equal(thermalScore(-1, true), 0)
  assert.equal(thermalScore(.1, false), 0)
  assert.ok(thermalScore(.5, true) > thermalScore(.5, false))
  assert.equal(specialPoints(0, 0), 5000); assert.equal(specialPoints(180, 100), 2500)
  assert.equal(specialPoints(-3, -5), 5000)
})

test('production disables specials, including the ninth round, and keeps former special secrets playable', () => {
  let now = 0
  const secrets: string[] = []
  const game = new ContextSemanticGame({ corpus: { data, hash: 'fixture' }, settings: { breakSeconds: 0 },
    emit() {}, award() {}, secret: (w) => secrets.push(w), uses: (w) => w === words[0] ? 1 : 0, now: () => now, random: () => 0 })
  assert.equal(secrets[0], words[1], 'a former special-only target is still selected')
  for (let i = 1; i < 18; i++) { game.next(); now++; game.tick() }
  assert.equal(game.snapshot().round, 18)
  assert.equal(game.snapshot().mode, 'ordinary')
  assert.equal(game.snapshot().remainingMs, null)
  assert.equal(semanticMode(9), 'ordinary')
})

test('the director can release one contextual clue only after five distinct guesses without a record', () => {
  const f = fixture()
  const hint = () => f.game.snapshot().contextHint!
  f.guess(100)
  for (const guess of [101, 102, 103, 104, 104, 'inesistente', 'due parole']) f.guess(guess)
  assert.equal(hint()?.stalled, 4)
  f.game.releaseContextHint(1)
  assert.equal(hint().text, null)
  f.guess(90)
  assert.equal(hint().stalled, 0)
  for (const guess of [110, 111, 112, 113, 114]) f.guess(guess)
  assert.equal(hint().available, true)
  assert.equal(hint().text, null)
  f.game.pause(true)
  f.game.releaseContextHint(1)
  f.guess(87)
  assert.equal(hint().text, null)
  f.game.pause(false)
  f.game.releaseContextHint(2)
  assert.equal(hint().text, null)
  f.game.releaseContextHint(1)
  assert.ok(hint().text)
  assert.ok(!hint().text!.includes(words[0]))
  assert.equal(hint().available, false)
  f.guess(115)
  f.game.releaseContextHint(1)
  f.guess(115); f.guess('inesistente')
  assert.equal(hint().guessesAfterRelease, 1)
  f.guess(80); f.guess(75)
  assert.equal(hint().guessesToImprovement, 2)
  f.game.next()
  assert.equal(hint().guessesToImprovement, 2)
  f.advance(1)
  assert.equal(hint().text, null)
  assert.equal(hint().guessesAfterRelease, null)
  assert.deepEqual(f.game.snapshot().lastHintResult, { round: 1, guesses: 2, improved: true })
})

test('a disabled clue stays hidden and a round without a subsequent record is counted separately', () => {
  const f = fixture()
  f.game.settingsChanged({ disableAllHints: true })
  for (let i = 10; i <= 20; i++) f.guess(i)
  f.game.releaseContextHint(1)
  assert.equal(f.game.snapshot().contextHint?.stalled, 0)
  f.game.settingsChanged({ disableAllHints: false })
  for (let i = 21; i <= 25; i++) f.guess(i)
  f.game.releaseContextHint(1)
  assert.ok(f.game.snapshot().contextHint!.text)
  f.game.settingsChanged({ disableAllHints: true })
  assert.equal(f.game.snapshot().contextHint!.text, null)
  f.guess(26); f.game.next()
  assert.deepEqual(f.game.snapshot().lastHintResult, { round: 1, guesses: 1, improved: false })
})

test('an overlay reconnecting mid-round draws the released clue in portrait and landscape', () => {
  const f = fixture()
  for (let i = 10; i <= 15; i++) f.guess(i)
  f.game.releaseContextHint(1)
  const contextSemantic = f.game.snapshot()
  const clue = contextSemantic.contextHint!.text!
  for (const [width, height] of [[1080, 1920], [1920, 1080]]) {
    const renderer = createSemanticContext(() => ({ contextSemantic, contextSemanticAt: 0 }))
    renderer.reset({}, width, height)
    const lines: { text: string; x: number; y: number; font: string; maxWidth: number }[] = []
    const canvas = new Proxy({
      font: '',
      fillText(text: string, x: number, y: number, maxWidth: number) { lines.push({ text, x, y, font: this.font, maxWidth }) },
      measureText: (text: string) => ({ width: text.length * 12 }),
      createLinearGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => key in target ? Reflect.get(target, key) : () => {} }) as unknown as CanvasRenderingContext2D
    renderer.draw(canvas, 100)
    const line = lines.find(l => l.text.includes(clue))
    assert.ok(line, 'the reconnect snapshot supplies the public clue')
    assert.equal(line.x, width / 2)
    assert.ok(line.y > 56 && line.y < height - 132)
    assert.ok(line.maxWidth <= width - 48)
    assert.match(line.font, /2[0-9]px/)
    const nextGuess = lines.find(l => l.text === contextSemantic.last!.word)
    assert.ok(nextGuess && nextGuess.y > line.y + 30, 'the guess card stays below the clue')
  }
})

test('the pittore clue suggests tools without giving a ranked word and the winning plural counts as the next record', () => {
  const vocab = [...words]
  vocab[0] = 'pittore'
  vocab[1] = 'cavalletto'
  const corpus = parseContextData(vocab.join('\n'), vectors.slice().buffer, 'pittore\ncavalletto', linked)
  const game = new ContextSemanticGame({ corpus: { data: corpus, hash: 'pittore' }, settings: {}, random: () => 0,
    emit() {}, secret() {}, award() {} })
  const guess = (text: string) => game.action('guess', { type: 'comment', text, user: { id: 'p', nickname: 'P' } })
  for (let i = 10; i <= 15; i++) guess(words[i])
  game.releaseContextHint(1)
  assert.match(game.snapshot().contextHint!.text!, /strument/i)
  assert.doesNotMatch(game.snapshot().contextHint!.text!, /pittor|cavalletto|tavolozza/i)
  guess('pittori')
  assert.equal(game.snapshot().reason, 'found')
  assert.deepEqual(game.snapshot().lastHintResult, { round: 1, guesses: 1, improved: true })
})
