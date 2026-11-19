import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { CONTEXT_LIMITS, CONTEXT_PROFILES, type ContextProfile } from '@zerocade/shared'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { giochiDb, openSchema, openOptionalSchema } from './schema-db.js'
import { loadPipelineAssociations, pipelineBFile } from './context-pipeline.js'

// ZeroContext's data: the playable words (vocab.txt), their vectors (vectors.bin, float32/float16 or legacy int8, one row per word, in the
// words' order) and the words that can be secret (secrets.txt). The words live in the games' database, schema
// context (database/giochi.sqlite3), with the words ZeroAssociazioni ties to each secret (links.json); the vectors,
// 36 MB, in a file of their own. gioco-zerocontext/script/build_context_data.py
// writes both; the overlay downloads them once and ranks every guess by closeness to the secret.
// The vectors' folder (and, without the schema, the old text files): ZEROCADE_CONTEXT_DATA, zerocontext/ next to
// the server (the Windows package's copy), then gioco-zerocontext/data of the repository.

const here = dirname(fileURLToPath(import.meta.url))
const FILES = ['vocab.txt', 'vectors.bin', 'secrets.txt', 'meta.json', 'links.json'] as const
export type ContextFile = (typeof FILES)[number]
const budgets: Record<ContextFile, number> = { 'vocab.txt': CONTEXT_LIMITS.vocab, 'vectors.bin': CONTEXT_LIMITS.vectors,
  'secrets.txt': CONTEXT_LIMITS.secrets, 'links.json': CONTEXT_LIMITS.links, 'meta.json': 64 * 1024 }
export const contextFileBudget = (name: ContextFile) => budgets[name]
const unavailable = new Set<ContextProfile>()

// The words ZeroAssociazioni ties to each secret (table links, indices into the vocabulary) and how much they rise
// in that secret's ranking (meta.link_boost, in the vectors' own scale): { boost, links: { secretIdx: [wordIdx…] } }.
// A database built before the table existed has none: no word rises.
function linksOf(db: ReturnType<typeof openSchema>, boost: number, wordCount: number): { boost: number; links: Record<string, number[]> } {
  const links: Record<string, number[]> = {}
  if (!db.prepare("SELECT 1 FROM sqlite_temp_master WHERE name = 'links'").get()) return { boost: 0, links: {} }
  let count = 0
  for (const { secret_idx: secret, word_idx: word } of db.prepare<[], { secret_idx: number; word_idx: number }>('SELECT secret_idx, word_idx FROM links ORDER BY 1, 2').iterate()) {
    if (++count > CONTEXT_LIMITS.linkCount || !Number.isInteger(secret) || !Number.isInteger(word) || secret < 0 || word < 0 || secret >= wordCount || word >= wordCount) throw new Error('invalid links')
    const list = links[secret] ??= []
    if (list.length >= CONTEXT_LIMITS.linksPerSecret) throw new Error('too many links for one secret')
    list.push(word)
  }
  return { boost, links }
}

// Each word's genericity penalty (table hubs, in the order of the vocabulary), or none: a database built before it
// existed has no such table, and no word is penalised.
function hubsOf(db: ReturnType<typeof openSchema>, wordCount: number): number[] | undefined {
  if (!db.prepare("SELECT 1 FROM sqlite_temp_master WHERE name = 'hubs'").get()) return undefined
  const hubs: number[] = []
  for (const { idx, penalty } of db.prepare<[], { idx: number; penalty: number }>('SELECT idx, penalty FROM hubs ORDER BY idx').iterate()) {
    if (idx !== hubs.length || !Number.isInteger(penalty) || penalty < 0 || penalty > CONTEXT_LIMITS.maxBoost) throw new Error('invalid hubs')
    hubs.push(penalty)
  }
  if (hubs.length !== wordCount) throw new Error('hubs do not match vocabulary')
  return hubs
}

function semanticOf(db: ReturnType<typeof openSchema>, meta: Record<string, unknown>, vocab: string[]) {
  if (meta.pipeline !== 'context-semantic-1') return {}
  const index = new Map(vocab.map((w, i) => [w, i]))
  const ordinary: number[] = [], special: number[] = [], curatedOrdinary: number[] = [], compatibility: number[] = []
  const domains: Record<string, string> = {}
  for (const row of db.prepare<[], { word: string; ordinary: number; special: number; details: string }>(
    'SELECT word,ordinary,special,details FROM targets ORDER BY word').iterate()) {
    const i = index.get(row.word)
    if (i === undefined) throw new Error('target outside vocabulary')
    const detail = JSON.parse(row.details)
    if (row.ordinary) {
      ordinary.push(i)
      if (detail.legacy_exception) compatibility.push(i)
      else curatedOrdinary.push(i)
    }
    if (row.special) { special.push(i); domains[i] = detail.domain }
  }
  return { vector_format: meta.vector_format, dim: meta.dim,
    semantic: { version: 'context-semantic-1', ordinary, special, curatedOrdinary, compatibility, domains } }
}

function fromDatabase(profile: ContextProfile = 'original'): Map<string, Buffer> | null {
  if (!giochiDb) return null
  try {
    const schema = CONTEXT_PROFILES.find((p) => p.id === profile)!.schema
    const db = openOptionalSchema(giochiDb, schema) ?? (profile === 'original' ? openSchema(giochiDb, 'context') : null)
    if (!db) return null
    try {
      return db.transaction(() => {
        const vocab: string[] = []
        let vocabBytes = 0
        for (const { idx, word } of db.prepare<[], { idx: number; word: string }>('SELECT idx, word FROM vocab ORDER BY idx').iterate()) {
          if (vocab.length >= CONTEXT_LIMITS.words || idx !== vocab.length || typeof word !== 'string' || !/^[a-zàèéìòù]{2,20}$/.test(word)) throw new Error('invalid vocabulary')
          if ((vocabBytes += Buffer.byteLength(word) + 1) > budgets['vocab.txt']) throw new Error('vocabulary too large')
          vocab.push(word)
        }
        const secrets: string[] = []
        let secretBytes = 0
        for (const { word } of db.prepare<[], { word: string }>('SELECT word FROM secrets ORDER BY word').iterate()) {
          if (secrets.length >= CONTEXT_LIMITS.words || typeof word !== 'string' || !/^[a-zàèéìòù]{2,20}$/.test(word)) throw new Error('invalid secrets')
          if ((secretBytes += Buffer.byteLength(word) + 1) > budgets['secrets.txt']) throw new Error('secrets too large')
          secrets.push(word)
        }
        const metadata = new Map<string, unknown>()
        let metaBytes = 0
        for (const { name, value } of db.prepare<[], { name: string; value: string }>('SELECT name, value FROM meta').iterate()) {
          if (metadata.size >= 32 || (metaBytes += 2 * (name.length + value.length)) > budgets['meta.json']) throw new Error('metadata too large')
          metadata.set(name, JSON.parse(value))
        }
        const meta = Object.fromEntries(metadata)
        if (meta.words !== vocab.length || typeof meta.dim !== 'number' || !Number.isInteger(meta.dim) || meta.dim < 1 || meta.dim > CONTEXT_LIMITS.dimensions) throw new Error('metadata does not match vocabulary')
        const boost = meta.link_boost ?? 0 // absent in legacy builds without links
        if (typeof boost !== 'number' || !Number.isFinite(boost) || boost < 0 || boost > CONTEXT_LIMITS.maxBoost) throw new Error('invalid link boost')
        const files = new Map<ContextFile, Buffer>([
          ['vocab.txt', Buffer.from(vocab.join('\n') + '\n', 'utf-8')],
          ['secrets.txt', Buffer.from(secrets.join('\n') + '\n', 'utf-8')],
          ['meta.json', Buffer.from(JSON.stringify(meta, null, 2) + '\n', 'utf-8')],
          ['links.json', Buffer.from(JSON.stringify({ ...linksOf(db, boost, vocab.length), hubs: hubsOf(db, vocab.length),
            ...semanticOf(db, meta, vocab), ...(meta.vector_format ? { vector_format: meta.vector_format, dim: meta.dim } : {}) }), 'utf-8')],
        ])
        for (const [name, buffer] of files) if (buffer.byteLength > budgets[name]) throw new Error(`${name} too large`)
        return files
      })()
    } finally {
      db.close()
    }
  } catch (error) {
    // Legacy files are supported only when the schema is absent. A corrupt or
    // unverified present schema must never silently switch to different words.
    if (error instanceof Error && error.message.endsWith('has no schema context')) return null
    unavailable.add(profile)
    console.error('[context] Dati non disponibili; fallback disabilitato:', error instanceof Error ? error.message : String(error))
    return null
  }
}

let words = fromDatabase()
const variants = new Map<ContextProfile, Map<string, Buffer> | null>()

// Pipeline B: the original words and vectors, the secrets and the ordered associations of the export (context-pipeline.ts). It is not
// stored: it is derived from the original files and from the export file, and rebuilt when that file changes. A failure is
// remembered for the same file (no repeated reads) and shown in the dashboard, never silently replaced by other words.
const pinnedBy = new Map<ContextProfile, Map<number, number[]>>()
const problems = new Map<ContextProfile, string>()
let pipelineTried: string | null = null
function fromPipelineB(): Map<string, Buffer> | null {
  const base = words
  if (!base) { problems.set('pipeline_b', 'Mancano le associazioni originali (parole e vettori).'); return null }
  if (!pipelineBFile) { problems.set('pipeline_b', 'Export non trovato: esegui il task «ZeroContext : Associazione Parole PipelineB».'); return null }
  const stamp = `${pipelineBFile}:${statSync(pipelineBFile).size}:${statSync(pipelineBFile).mtimeMs}`
  if (stamp === pipelineTried) return null
  try {
    const vocab = base.get('vocab.txt')!.toString('utf8').split('\n').filter(Boolean)
    const found = loadPipelineAssociations(pipelineBFile, vocab)
    if (!found.pinned.size) throw new Error('nessuna segreta dell\'export è una parola del vocabolario del gioco')
    const secrets = [...found.pinned.keys()].sort((a, b) => a - b)
    const meta = JSON.parse(base.get('meta.json')!.toString('utf8'))
    const links = JSON.parse(base.get('links.json')!.toString('utf8'))
    if (!links.semantic) throw new Error('le associazioni originali non hanno i pool semantici')
    links.associations_fingerprint = found.fingerprint // makes the corpus hash (tournaments) follow the export
    links.semantic = { ...links.semantic, ordinary: secrets, special: [], curatedOrdinary: secrets, compatibility: [], domains: {} }
    const revision = createHash('sha256').update(`${meta.corpus_revision}|pipeline_b|${found.fingerprint}`).digest('hex')
    const next = { ...meta, secrets: secrets.length, ordinary: secrets.length, special: 0, legacy_preserved: 0, corpus_revision: revision,
      associations: { source: 'pipeline_b', model_version: found.version, secrets: secrets.length, skipped: found.skipped, fingerprint: found.fingerprint } }
    const files = new Map<string, Buffer>([
      ['vocab.txt', base.get('vocab.txt')!],
      ['secrets.txt', Buffer.from(secrets.map((i) => vocab[i]).join('\n') + '\n', 'utf-8')],
      ['meta.json', Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf-8')],
      ['links.json', Buffer.from(JSON.stringify(links), 'utf-8')],
    ])
    for (const [name, buffer] of files) if (buffer.byteLength > budgets[name as ContextFile]) throw new Error(`${name} too large`)
    pinnedBy.set('pipeline_b', found.pinned)
    problems.delete('pipeline_b')
    console.log(`[context] Pipeline B: ${secrets.length} segrete giocabili (${found.skipped.tooFew} con troppe poche associazioni nel vocabolario, ${found.skipped.notInVocabulary} fuori vocabolario)`)
    return files
  } catch (error) {
    pipelineTried = stamp
    const message = error instanceof Error ? error.message : String(error)
    problems.set('pipeline_b', `Export non utilizzabile: ${message}`)
    console.error('[context] Pipeline B non disponibile:', message)
    return null
  }
}

function wordsFor(profile: ContextProfile) {
  if (profile === 'original') return words
  if (profile === 'pipeline_b') {
    // Derived from the original files and built once per run (a new export is read at the next start); a failure is retried
    // only when the export file has changed.
    const current = variants.get(profile)
    if (current) return current
    const built = fromPipelineB()
    if (built) variants.set(profile, built)
    return built
  }
  if (!variants.has(profile)) variants.set(profile, fromDatabase(profile))
  return variants.get(profile) ?? null
}
export const contextPinned = (profile: ContextProfile) => (wordsFor(profile) ? pinnedBy.get(profile) : undefined)
export const contextProblem = (profile: ContextProfile) => problems.get(profile)
const dir = [process.env.ZEROCADE_CONTEXT_DATA, join(here, 'zerocontext'), join(here, '..', '..', '..', 'gioco-zerocontext', 'data')].find(
  (d): d is string => d !== undefined && existsSync(join(d, 'vectors.bin')),
)

function vectorPath(files = words): string | null {
  if (!dir) return null
  const metadata = files?.get('meta.json')
  const name: unknown = metadata ? JSON.parse(metadata.toString('utf8')).vectors_file ?? 'vectors.bin' : 'vectors.bin'
  if (typeof name !== 'string' || !/^vectors(?:\.[a-f0-9]{64})?\.bin$/.test(name)) throw new Error('File vettori ZeroContext non valido')
  return join(dir, name)
}

export function contextRevision(profile: ContextProfile = 'original'): string {
  const metadata = wordsFor(profile)?.get('meta.json')
  return metadata ? JSON.parse(metadata.toString('utf8')).corpus_revision ?? JSON.parse(metadata.toString('utf8')).vectors_sha256 ?? 'legacy' : 'legacy'
}

// Called only after the publisher committed a schema referencing an already complete immutable vector file.
export function reloadContext(expectedRevision: string, profile: ContextProfile = 'original'): { revision: string; words: number; dim: number } {
  const previousUnavailable = unavailable.has(profile)
  unavailable.delete(profile)
  try {
    const next = fromDatabase(profile)
    if (!next || unavailable.has(profile)) throw new Error('Il nuovo corpus ZeroContext non è disponibile')
    const meta = JSON.parse(next.get('meta.json')!.toString('utf8'))
    if (meta.corpus_revision !== expectedRevision) throw new Error('La revisione pubblicata non corrisponde alla richiesta')
    const path = vectorPath(next)
    if (meta.vector_format !== undefined && !['int8', 'float32', 'float16'].includes(meta.vector_format)) throw new Error('Formato vettori non valido')
    if (!path || statSync(path).size !== meta.words * meta.dim * (meta.vector_format === 'float32' ? 4 : meta.vector_format === 'float16' ? 2 : 1) || statSync(path).size > budgets['vectors.bin'])
      throw new Error('Vettori e parole del nuovo corpus non sono allineati')
    if (profile === 'original') { words = next; variants.delete('pipeline_b'); pipelineTried = null }
    else variants.set(profile, next)
    return { revision: expectedRevision, words: meta.words, dim: meta.dim }
  } catch (error) {
    if (previousUnavailable) unavailable.add(profile)
    else unavailable.delete(profile)
    throw error
  }
}

if (!words || !dir) console.warn('[context] words (database/giochi.sqlite3, schema context) or vectors.bin missing: run gioco-zerocontext/script/build_context_data.py')

export const isContextFile = (name: string): name is ContextFile => (FILES as readonly string[]).includes(name)

// Hosting only: the HTTP adapter streams large files with backpressure. The
// game's word/vector format and the synchronous reader used by tools stay intact.
export function contextResource(name: ContextFile, profile: ContextProfile = 'original'): Buffer | string | null {
  const files = wordsFor(profile)
  if (unavailable.has(profile) || (profile !== 'original' && !files)) return null
  if (files && name !== 'vectors.bin') return files.get(name) ?? null
  return name === 'vectors.bin' ? vectorPath(files) : dir ? join(dir, name) : null
}

export function contextFile(name: ContextFile, profile: ContextProfile = 'original'): Buffer | null {
  const files = wordsFor(profile)
  if (unavailable.has(profile) || (profile !== 'original' && !files)) return null
  if (files && name !== 'vectors.bin') return files.get(name) ?? null
  if (!dir) return null
  const path = name === 'vectors.bin' ? vectorPath(files) : join(dir, name)
  if (!path) return null
  return existsSync(path) && statSync(path).size <= budgets[name] ? readFileSync(path) : null
}

export function availableContextProfiles() {
  return CONTEXT_PROFILES.map(({ id, label }) => {
    const metadata = wordsFor(id)?.get('meta.json')
    const meta = metadata ? JSON.parse(metadata.toString('utf8')) : {}
    const path = vectorPath(wordsFor(id))
    const expected = meta.words * meta.dim * (meta.vector_format === 'float32' ? 4 : meta.vector_format === 'float16' ? 2 : 1)
    const available = !unavailable.has(id) && Boolean(metadata && path && existsSync(path) && statSync(path).size === expected)
    return { id, label, available, words: meta.words ?? 0, secrets: meta.secrets ?? 0, dim: meta.dim ?? 0, revision: contextRevision(id), ...(available ? {} : { problem: problems.get(id) }) }
  })
}
