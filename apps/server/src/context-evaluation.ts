import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import {
  HUMAN_VERDICTS,
  type EvaluationMetric,
  type EvaluationRun,
  type EvaluationSample,
  type EvaluationSampleSecret,
  type HumanVerdict,
} from '@zerocade/shared'

// The page «Qualità posizioni»: how good ZeroContext's positions are (docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md).
// The database (database/ZeroContext_Valutazione.sqlite3) is written by gioco-zerocontext/script/evaluate_context_ranking.py; the
// server only reads it and saves the human verdicts, the one thing the page writes. It never computes a metric. The file is opened
// for each request and closed at once: the script rewrites and vacuums it, and a connection kept open would be in its way.

const here = dirname(fileURLToPath(import.meta.url))
const NAME = 'ZeroContext_Valutazione.sqlite3'
const NOT_FOUND = { error: 'Nessuna valutazione: lancia python gioco-zerocontext/script/evaluate_context_ranking.py campione e poi valuta.' }
const PROFILE = /^[A-Za-z0-9_-]{1,64}$/
const WORD_MAX = 100

/** The results database, looked for at every request: it may be created while the server is running. */
export function evaluationFile(explicit?: string): string | undefined {
  const candidates = explicit !== undefined ? [explicit] : [process.env.ZEROCADE_EVALUATION_FILE, join(here, NAME), join(here, '..', '..', '..', 'database', NAME)]
  return candidates.find((p): p is string => p !== undefined && existsSync(p))
}

const clean = (value: string) => value.normalize('NFC').toLowerCase()

export interface EvaluationRouteOptions {
  /** The results database; by default the one in the repository's database folder (or ZEROCADE_EVALUATION_FILE). */
  file?: string
  /** The games' database (giochi.sqlite3), for the gloss of each secret: without it the page shows none. */
  giochi?: string
  /** Is a live connected? The evaluation with Qwen does not start during one. */
  live: () => boolean
}

function reading<T>(file: string, work: (db: Database.Database) => T): T {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    db.pragma('busy_timeout = 5000')
    return work(db)
  } finally {
    db.close()
  }
}

function glosses(file: string | undefined, secrets: string[]): Map<string, string> {
  const found = new Map<string, string>()
  if (!file || !existsSync(file)) return found
  try {
    reading(file, (db) => {
      const one = db.prepare<[string], { sense: string | null }>('SELECT sense FROM associazioni__prompts WHERE prompt = ?')
      for (const secret of secrets) {
        const sense = one.get(secret)?.sense
        if (sense) found.set(secret, sense)
      }
    })
  } catch { /* no such table: the page shows no gloss */ }
  return found
}

export function registerContextEvaluationRoutes(app: FastifyInstance, options: EvaluationRouteOptions): void {
  app.get('/api/context/evaluation/live', async () => ({ live: options.live() }))

  app.get('/api/context/evaluation/runs', async (_req, reply) => {
    const file = evaluationFile(options.file)
    if (!file) return reply.code(404).send(NOT_FOUND)
    const runs: EvaluationRun[] = reading(file, (db) => {
      const latest = db.prepare<[], { id: number; profilo: string; created_at: string; finished_at: string | null; judge_version: string | null }>(
        "SELECT id, profilo, created_at, finished_at, judge_version FROM v_runs WHERE status = 'completa' AND id IN " +
        "(SELECT MAX(id) FROM runs WHERE status = 'completa' GROUP BY profile_id) ORDER BY id").all()
      const metrics = db.prepare<[number], EvaluationMetric>(
        'SELECT metrica AS metric, sottoinsieme AS subset, value, low, high, n FROM v_run_metrics WHERE run_id = ? ORDER BY metrica, sottoinsieme')
      return latest.map((r) => ({ id: r.id, profile: r.profilo, createdAt: r.created_at, finishedAt: r.finished_at, judgeVersion: r.judge_version, metrics: metrics.all(r.id) }))
    })
    return runs
  })

  app.get('/api/context/evaluation/sample', async (req, reply) => {
    const profile = (req.query as { profile?: unknown }).profile
    if (typeof profile !== 'string' || !PROFILE.test(profile)) return reply.code(400).send({ error: 'Profilo non valido.' })
    const file = evaluationFile(options.file)
    if (!file) return reply.code(404).send(NOT_FOUND)
    const sample = reading(file, (db): EvaluationSample | null => {
      const run = db.prepare<[string], { id: number; finished_at: string | null }>(
        "SELECT id, finished_at FROM v_runs WHERE profilo = ? AND status = 'completa' ORDER BY id DESC LIMIT 1").get(profile)
      if (!run) return null
      type Row = { secret: string; block: number; has_gold: number; position: number; word: string; verified: number; variant: number
        human: HumanVerdict | null; judge_grade: 0 | 1 | 2 | null; judge_sense_ok: number | null; judge_reason: string | null }
      const rows = db.prepare<[number], Row>('SELECT secret, block, has_gold, position, word, verified, variant, human, judge_grade, judge_sense_ok, judge_reason ' +
        'FROM v_sample_top WHERE run_id = ? ORDER BY block, secret, position').all(run.id)
      const secrets = new Map<string, EvaluationSampleSecret>()
      for (const r of rows) {
        if (!secrets.has(r.secret)) secrets.set(r.secret, { secret: r.secret, block: r.block, hasGold: r.has_gold === 1, gloss: null, words: [] })
        secrets.get(r.secret)!.words.push({
          position: r.position, word: r.word, verified: r.verified === 1, variant: r.variant === 1,
          judge: r.judge_grade === null ? null : { grade: r.judge_grade, senseOk: r.judge_sense_ok === null ? null : r.judge_sense_ok === 1, reason: r.judge_reason ?? '' },
          human: r.human,
        })
      }
      const after = run.finished_at === null ? 0 : (db.prepare<[string, number], { n: number }>(
        'SELECT COUNT(*) AS n FROM human_verdicts h JOIN words s ON s.id = h.secret_id JOIN words w ON w.id = h.word_id WHERE h.updated_at > ? ' +
        'AND EXISTS (SELECT 1 FROM v_sample_top t WHERE t.run_id = ? AND t.secret = s.word AND t.word = w.word)').get(run.finished_at, run.id)?.n ?? 0)
      return { runId: run.id, profile, secrets: [...secrets.values()], humanAfterRun: after }
    })
    if (!sample) return reply.code(404).send({ error: 'Nessuna valutazione completa per questo profilo.' })
    const gloss = glosses(options.giochi, sample.secrets.map((s) => s.secret))
    for (const secret of sample.secrets) secret.gloss = gloss.get(secret.secret) ?? null
    return sample
  })

  app.post('/api/context/evaluation/verdict', { bodyLimit: 1024 }, async (req, reply) => {
    const file = evaluationFile(options.file)
    if (!file) return reply.code(404).send(NOT_FOUND)
    const body = req.body as { secret?: unknown; word?: unknown; verdict?: unknown } | null | undefined
    const verdict = body?.verdict
    if (typeof body?.secret !== 'string' || typeof body.word !== 'string' || !body.secret.trim() || !body.word.trim() ||
        body.secret.length > WORD_MAX || body.word.length > WORD_MAX || typeof verdict !== 'string' || !(HUMAN_VERDICTS as readonly string[]).includes(verdict))
      return reply.code(400).send({ error: 'Verdetto non valido.' })
    const secret = clean(body.secret.trim())
    const word = clean(body.word.trim())
    const db = new Database(file, { fileMustExist: true })
    try {
      db.pragma('busy_timeout = 5000')
      db.pragma('foreign_keys = ON')
      const saved = db.transaction(() => {
        // Only the words the page shows can be judged: the first 10 of a sample secret, in a completed run.
        if (!db.prepare('SELECT 1 FROM v_sample_top WHERE secret = ? AND word = ? LIMIT 1').get(secret, word)) return false
        db.prepare('INSERT INTO human_verdicts(secret_id, word_id, verdict, updated_at) SELECT s.id, w.id, ?, ? FROM words s, words w WHERE s.word = ? AND w.word = ? ' +
          'ON CONFLICT(secret_id, word_id) DO UPDATE SET verdict = excluded.verdict, updated_at = excluded.updated_at')
          .run(verdict, new Date().toISOString().replace('Z', '000+00:00'), secret, word)
        return true
      })()
      if (!saved) return reply.code(400).send({ error: 'Questa parola non è tra le prime 10 di una segreta del campione.' })
      return reply.code(204).send()
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_BUSY') return reply.code(503).send({ error: 'Il database dei risultati è occupato: riprova tra poco.' })
      throw error
    } finally {
      db.close()
    }
  })
}
