import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import Database from 'better-sqlite3'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerContextEvaluationRoutes } from '../apps/server/src/context-evaluation.ts'

// Le rotte della pagina «Qualità posizioni»: leggono il database scritto da gioco-zerocontext/script/evaluate_context_ranking.py
// (schema in tests/fixtures/context-evaluation-schema.sql, controllato da test_store.py) e salvano solo i verdetti umani.
const root = mkdtempSync(join(tmpdir(), 'zerocade-valutazione-'))
const schema = readFileSync(new URL('./fixtures/context-evaluation-schema.sql', import.meta.url), 'utf8')
const T = (minute: number) => `2026-11-19T${String(10 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00.000000+00:00`
let counter = 0
const apps: FastifyInstance[] = []
after(async () => { for (const app of apps) await app.close() })

function database(): string {
  const file = join(root, `valutazione-${++counter}.sqlite3`)
  const db = new Database(file)
  db.exec(schema)
  const id = (word: string) => {
    db.prepare('INSERT OR IGNORE INTO words(word) VALUES (?)').run(word)
    return (db.prepare('SELECT id FROM words WHERE word = ?').get(word) as { id: number }).id
  }
  const profile = db.prepare('INSERT INTO profiles(name, origin, vectors_sha256, dim, words) VALUES (?,?,?,?,?)')
  profile.run('original', 'x', 'a', 300, 10)
  profile.run('abtt', 'x', 'b', 1024, 10)
  const run = db.prepare('INSERT INTO runs(id, profile_id, created_at, finished_at, status, evaluator_version, judge_version, split_rule, reference_sha256, gold_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)')
  run.run(1, 1, T(0), T(5), 'completa', 'valutatore-1', 'giudice-1-x', 'r', 'h', 'g')      // vecchia, sostituita dalla 2
  run.run(2, 1, T(60), T(65), 'completa', 'valutatore-1', 'giudice-1-x', 'r', 'h', 'g')
  run.run(3, 1, T(120), null, 'in_corso', 'valutatore-1', 'giudice-1-x', 'r', 'h', 'g')   // non compare
  run.run(4, 2, T(30), T(35), 'completa', 'valutatore-1', null, 'r', 'h', 'g')
  const metric = db.prepare('INSERT INTO run_metrics VALUES (?,?,?,?,?,?,?)')
  const name = (table: string, value: string) => {
    db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`).run(value)
    return (db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(value) as { id: number }).id
  }
  metric.run(1, name('metric_names', 'precision_10_verificata'), name('subset_names', 'misura:tutte'), 0.99, 0.9, 1, 5)
  metric.run(2, name('metric_names', 'precision_10_verificata'), name('subset_names', 'misura:tutte'), 0.21, 0.18, 0.24, 620)
  metric.run(2, name('metric_names', 'ndcg_20'), name('subset_names', 'misura:tutte'), null, null, null, 0)
  metric.run(4, name('metric_names', 'precision_10_verificata'), name('subset_names', 'misura:tutte'), 0.04, 0.02, 0.06, 620)
  const sample = db.prepare('INSERT INTO sample VALUES (?,?,?,?)')
  sample.run(id('cane'), 1, 1, 7)
  sample.run(id('gatto'), 0, 2, 7)
  const top = db.prepare('INSERT INTO run_top VALUES (?,?,?,?,?,?)')
  const words = ['cani', 'gatto', 'guinzaglio', 'coda', 'osso', 'cuccia', 'fiuto', 'zampa', 'collare', 'beach', 'tavolo', 'sedia']
  words.forEach((word, i) => top.run(2, id('cane'), 2 + i, id(word), word === 'guinzaglio' || word === 'coda' ? 1 : 0, word === 'cani' ? 1 : 0))
  top.run(2, id('gatto'), 2, id('micio'), 0, 0)
  top.run(4, id('cane'), 2, id('dog'), 0, 0)
  top.run(3, id('cane'), 2, id('in-corso'), 0, 0)
  db.prepare('INSERT INTO judge_verdicts VALUES (?,?,?,?,?,?,?,?)').run(id('cane'), id('gatto'), 'giudice-1-x', 'qwen', 2, null, 'sinonimo', T(61))
  db.prepare('INSERT INTO judge_verdicts VALUES (?,?,?,?,?,?,?,?)').run(id('cane'), id('beach'), 'giudice-1-x', 'qwen', 0, 0, 'inglese', T(61))
  db.prepare('INSERT INTO human_verdicts VALUES (?,?,?,?)').run(id('cane'), id('osso'), 'naturale', T(62))        // prima della fine: già nei numeri
  db.prepare('INSERT INTO human_verdicts VALUES (?,?,?,?)').run(id('cane'), id('guinzaglio'), 'non_naturale', T(200))  // dopo: da ricalcolare
  db.close()
  return file
}

function giochi(): string {
  const file = join(root, `giochi-${++counter}.sqlite3`)
  const db = new Database(file)
  db.exec('CREATE TABLE associazioni__prompts(id INTEGER PRIMARY KEY, prompt TEXT, pos TEXT, sense TEXT)')
  db.prepare('INSERT INTO associazioni__prompts VALUES (1, ?, ?, ?)').run('cane', 'NOUN', 'Animale domestico della specie canina')
  db.close()
  return file
}

async function server(options: { file?: string; giochi?: string; live?: () => boolean } = {}) {
  const app = Fastify()
  registerContextEvaluationRoutes(app, { live: () => false, ...options })
  apps.push(app)
  await app.ready()
  return app
}

const get = async (app: FastifyInstance, url: string) => {
  const response = await app.inject({ method: 'GET', url })
  return { status: response.statusCode, body: response.statusCode === 204 ? null : response.json() }
}
const post = (app: FastifyInstance, payload: unknown) => app.inject({ method: 'POST', url: '/api/context/evaluation/verdict', payload: payload as object })
const humanRows = (file: string) => {
  const db = new Database(file, { readonly: true })
  try {
    return db.prepare('SELECT s.word AS secret, w.word AS word, h.verdict FROM human_verdicts h JOIN words s ON s.id = h.secret_id JOIN words w ON w.id = h.word_id ORDER BY s.word, w.word').all()
  } finally { db.close() }
}

test('senza database: 404 con il comando da lanciare', async () => {
  const app = await server({ file: join(root, 'non-esiste.sqlite3') })
  for (const url of ['/api/context/evaluation/runs', '/api/context/evaluation/sample?profile=original']) {
    const { status, body } = await get(app, url)
    assert.equal(status, 404, url)
    assert.match((body as { error: string }).error, /evaluate_context_ranking\.py/)
  }
  const response = await post(app, { secret: 'cane', word: 'osso', verdict: 'naturale' })
  assert.equal(response.statusCode, 404)
})

test('runs mostra solo le esecuzioni complete, l\'ultima per profilo', async () => {
  const app = await server({ file: database() })
  const { status, body } = await get(app, '/api/context/evaluation/runs')
  assert.equal(status, 200)
  const runs = body as { id: number; profile: string; createdAt: string; finishedAt: string | null; judgeVersion: string | null; metrics: unknown[] }[]
  assert.deepEqual(runs.map((r) => [r.id, r.profile]).sort(), [[2, 'original'], [4, 'abtt']])
  const original = runs.find((r) => r.id === 2)!
  assert.equal(original.judgeVersion, 'giudice-1-x')
  assert.equal(original.finishedAt, T(65))
  assert.deepEqual(original.metrics, [
    { metric: 'ndcg_20', subset: 'misura:tutte', value: null, low: null, high: null, n: 0 },
    { metric: 'precision_10_verificata', subset: 'misura:tutte', value: 0.21, low: 0.18, high: 0.24, n: 620 },
  ])
  assert.equal(runs.find((r) => r.id === 4)!.judgeVersion, null)
})

test('sample: le prime 10 con verdetti umani e del giudice, e la glossa', async () => {
  const app = await server({ file: database(), giochi: giochi() })
  const { status, body } = await get(app, '/api/context/evaluation/sample?profile=original')
  assert.equal(status, 200)
  const sample = body as { runId: number; profile: string; humanAfterRun: number; secrets: { secret: string; block: number; hasGold: boolean; gloss: string | null; words: Record<string, unknown>[] }[] }
  assert.equal(sample.runId, 2)
  assert.equal(sample.profile, 'original')
  assert.deepEqual(sample.secrets.map((s) => [s.secret, s.block, s.hasGold]), [['cane', 1, true], ['gatto', 2, false]])
  const cane = sample.secrets[0]
  assert.equal(cane.gloss, 'Animale domestico della specie canina')
  assert.equal(sample.secrets[1].gloss, null)
  assert.equal(cane.words.length, 10)                                    // posizioni 2..11, non le successive
  assert.deepEqual(cane.words.map((w) => w.position), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  const byWord = Object.fromEntries(cane.words.map((w) => [w.word as string, w]))
  assert.deepEqual(byWord.cani, { position: 2, word: 'cani', verified: false, variant: true, judge: null, human: null })
  assert.deepEqual(byWord.gatto.judge, { grade: 2, senseOk: null, reason: 'sinonimo' })
  assert.equal(byWord.guinzaglio.verified, true)
  assert.equal(byWord.guinzaglio.human, 'non_naturale')
  assert.equal(byWord.osso.human, 'naturale')
  assert.deepEqual(byWord.beach.judge, { grade: 0, senseOk: false, reason: 'inglese' })   // la decima parola, posizione 11
  assert.equal(byWord.tavolo, undefined)                                 // posizione 12: oltre le prime 10
  assert.equal(sample.humanAfterRun, 1)                                  // solo il verdetto dato dopo la fine dell'esecuzione
})

test('sample di un profilo senza esecuzione completa: 404; nome non valido: 400', async () => {
  const app = await server({ file: database() })
  assert.equal((await get(app, '/api/context/evaluation/sample?profile=pipeline_b')).status, 404)
  assert.equal((await get(app, '/api/context/evaluation/sample?profile=' + encodeURIComponent("x'; DROP TABLE words;--"))).status, 400)
  assert.equal((await get(app, '/api/context/evaluation/sample')).status, 400)
})

test('verdict salva e sovrascrive', async () => {
  const file = database()
  const app = await server({ file })
  assert.equal((await post(app, { secret: 'cane', word: 'coda', verdict: 'naturale' })).statusCode, 204)
  assert.deepEqual(humanRows(file).find((r) => (r as { word: string }).word === 'coda'), { secret: 'cane', word: 'coda', verdict: 'naturale' })
  assert.equal((await post(app, { secret: 'cane', word: 'coda', verdict: 'non_so' })).statusCode, 204)
  assert.equal(humanRows(file).filter((r) => (r as { word: string }).word === 'coda').length, 1)
  assert.equal((humanRows(file).find((r) => (r as { word: string }).word === 'coda') as { verdict: string }).verdict, 'non_so')
  const { body } = await get(app, '/api/context/evaluation/sample?profile=original')
  const coda = (body as { secrets: { words: { word: string; human: string }[] }[] }).secrets[0].words.find((w) => w.word === 'coda')!
  assert.equal(coda.human, 'non_so')
})

test('verdict con maiuscole o accenti scomposti trova la stessa parola', async () => {
  const file = database()
  const app = await server({ file })
  assert.equal((await post(app, { secret: 'Cane', word: 'FIUTO', verdict: 'naturale' })).statusCode, 204)
  assert.ok(humanRows(file).some((r) => (r as { word: string }).word === 'fiuto'))
})

test('verdict fuori campione o con valore errato: 400 e niente scritto', async () => {
  const file = database()
  const app = await server({ file })
  const before = humanRows(file)
  const bad: unknown[] = [
    { secret: 'cane', word: 'tavolo', verdict: 'naturale' },      // non è tra le prime 10 del campione (posizione 12)
    { secret: 'cane', word: 'sedia', verdict: 'naturale' },       // idem (posizione 13)
    { secret: 'luna', word: 'osso', verdict: 'naturale' },        // segreta fuori dal campione
    { secret: 'cane', word: 'osso', verdict: 'forse' },
    { secret: 'cane', word: 'osso' },
    { secret: 7, word: 'osso', verdict: 'naturale' },
    { secret: 'cane', word: 'x'.repeat(300), verdict: 'naturale' },
    null,
  ]
  for (const payload of bad) assert.equal((await post(app, payload)).statusCode, 400, JSON.stringify(payload))
  assert.deepEqual(humanRows(file), before)
})

test('verdict con JSON non valido: 400 e niente scritto', async () => {
  const file = database()
  const app = await server({ file })
  const before = humanRows(file)
  const response = await app.inject({ method: 'POST', url: '/api/context/evaluation/verdict', payload: '{non json', headers: { 'content-type': 'application/json' } })
  assert.equal(response.statusCode, 400)
  assert.deepEqual(humanRows(file), before)
})

test('verdict: il corpo è limitato', async () => {
  const app = await server({ file: database() })
  const response = await post(app, { secret: 'cane', word: 'osso', verdict: 'naturale', filler: 'x'.repeat(5000) })
  assert.equal(response.statusCode, 413)
})

test('il database si apre a ogni richiesta: una nuova esecuzione compare senza riavviare', async () => {
  const file = database()
  const app = await server({ file })
  assert.equal(((await get(app, '/api/context/evaluation/runs')).body as unknown[]).length, 2)
  const db = new Database(file)
  db.prepare("INSERT INTO runs(id, profile_id, created_at, finished_at, status, evaluator_version, judge_version, split_rule, reference_sha256, gold_sha256) VALUES (9, 2, ?, ?, 'completa', 'v', NULL, 'r', 'h', 'g')").run(T(300), T(305))
  db.close()
  const runs = (await get(app, '/api/context/evaluation/runs')).body as { id: number; profile: string }[]
  assert.deepEqual(runs.map((r) => r.id).sort(), [2, 9])
})

test('live riflette le sorgenti collegate', async () => {
  let live = false
  const app = await server({ file: database(), live: () => live })
  assert.deepEqual((await get(app, '/api/context/evaluation/live')).body, { live: false })
  live = true
  assert.deepEqual((await get(app, '/api/context/evaluation/live')).body, { live: true })
})

test('live risponde anche senza database dei risultati', async () => {
  const app = await server({ file: join(root, 'non-esiste.sqlite3'), live: () => true })
  assert.deepEqual((await get(app, '/api/context/evaluation/live')).body, { live: true })
})
