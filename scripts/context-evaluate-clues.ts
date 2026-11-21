// Dalla radice del progetto: node --import tsx scripts/context-evaluate-clues.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { lookup, rankAgainst } from '@zerocade/shared/contextRanking'
import { serverCorpus } from '../apps/server/src/context-tournament-ranking.ts'
import { PIPELINE_MIN_PINNED, RIORDINO_MIN_PINNED } from '../apps/server/src/context-pipeline.ts'
import { rerankRiordino } from '../apps/server/src/context-relations.ts'

const corpus = serverCorpus('original')
if (!corpus) throw new Error('Corpus originale indisponibile')
const { data } = corpus
function readCases(name: string, misura: boolean) {
  const input = readFileSync(`gioco-zerocontext/resources/${name}.csv`, 'utf8')
  return input.trim().split(/\r?\n/).slice(1).map(line => {
    const [ambito, segreta, indizio, categoria] = line.split(',')
    const secret = data.index.get(segreta)
    if (secret === undefined) throw new Error(`Segreta assente: ${segreta}`)
    const clue = lookup(data, indizio, secret)
    const peer = lookup(data, categoria, secret)
    if (clue < 0 || peer < 0 || new Set([secret, clue, peer]).size !== 3) throw new Error(line)
    const split = BigInt('0x' + createHash('sha256').update(segreta).digest('hex')) % 5n === 0n
    if (misura && !split) throw new Error(`La segreta non appartiene al blocco di misura: ${segreta}`)
    return { ambito, segreta, indizio, categoria, secret, clue, peer, misura }
  })
}
const cases = [...readCases('confronti_indizi', false), ...readCases('confronti_indizi_misura', true)]
if (new Set(cases.map(c => c.segreta)).size !== cases.length) throw new Error('Segreta duplicata tra i confronti')

function evaluate(file: string, relational = false) {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const version = db.prepare<[], { value: string }>("SELECT value FROM pipeline_meta WHERE name = 'model_version'").get()?.value
    if (!version) throw new Error(`Versione assente: ${file}`)
    const neighbors = db.prepare<[string, string], { lemma: string }>(`
      SELECT target.lemma FROM lexemes AS source
      JOIN semantic_pair_scores AS score ON score.source_lexeme_id = source.lexeme_id
      JOIN lexemes AS target ON target.lexeme_id = score.target_lexeme_id
      WHERE source.lemma = ? AND score.model_version = ? ORDER BY score.rank`)
    const pins = new Map<number, number[]>()
    for (const { segreta, secret } of cases) {
      const pinned = new Set<number>()
      for (const { lemma } of neighbors.iterate(segreta, version)) {
        const word = data.index.get(lemma)
        if (word !== undefined && word !== secret) pinned.add(word)
      }
      pins.set(secret, [...pinned])
    }
    let signature = version
    if (relational) {
      const playable = new Map([...pins].filter(([, list]) => list.length >= RIORDINO_MIN_PINNED))
      signature += `+relazioni-campione:${rerankRiordino(data.words, playable)}`
      for (const [secret, list] of playable) pins.set(secret, list)
    }
    const positions = cases.map(({ secret, clue, peer }) => {
      const { rankOf } = rankAgainst({ ...data, pinned: pins }, secret)
      return { posizione_indizio: rankOf[clue] + 1, posizione_categoria: rankOf[peer] + 1,
        associazioni_giocabili: pins.get(secret)!.length }
    })
    return { version: signature, positions }
  } finally {
    db.close()
  }
}

const { values } = parseArgs({ options: {
  standard: { type: 'string', default: 'database/ZeroContext_Associazioni_Riordino.sqlite3' },
  pilota: { type: 'string' },
  out: { type: 'string', default: 'gioco-zerocontext/reports/confronti_indizi.json' },
} })
const profiles = [
  { key: 'pipeline_b', minimum: PIPELINE_MIN_PINNED, result: evaluate('database/ZeroContext_Associazioni_PipelineB.sqlite3') },
  { key: 'riordino_precedente', minimum: RIORDINO_MIN_PINNED, result: evaluate(values.standard) },
  { key: 'riordino', minimum: RIORDINO_MIN_PINNED, result: evaluate(values.standard, true) },
]
if (values.pilota) profiles.push({ key: 'pilota', minimum: 40, result: evaluate(values.pilota) })
const common = cases.map((_, i) => profiles.every(p => p.result.positions[i].associazioni_giocabili >= p.minimum))
function summary(misura: boolean) {
  const included = cases.map((c, i) => c.misura === misura && common[i])
  return { confronti: cases.filter(c => c.misura === misura).length,
    per_profilo: Object.fromEntries(profiles.map(p => {
      const eligible = p.result.positions.filter((row, i) => cases[i].misura === misura && row.associazioni_giocabili >= p.minimum)
      return [p.key, { giocabili: eligible.length, preferenze_rispettate: eligible.filter(
        row => row.posizione_indizio < row.posizione_categoria).length }]
    })),
    confronti_giocabili_comuni: included.filter(Boolean).length,
    preferenze_rispettate_sui_comuni: Object.fromEntries(profiles.map(p => [p.key, p.result.positions.filter(
      (row, i) => included[i] && row.posizione_indizio < row.posizione_categoria).length])) }
}
const report = {
  corpus: corpus.hash,
  versioni: Object.fromEntries(profiles.map(p => [p.key, p.result.version])),
  soglie_associazioni_giocabili: Object.fromEntries(profiles.map(p => [p.key, p.minimum])),
  ...summary(false),
  misura_separata: summary(true),
  metodo: '50 confronti editoriali preesistenti e un blocco separato fissato prima della misura. Tutte le segrete del nuovo blocco rispettano la divisione SHA-256 della misura, esclusa dall’addestramento del Riordino di base. Il riordino lessicale usa fonti di dizionario indipendenti dai giudizi. Posizione 1 = segreta. Le righe sotto soglia sono simulate ed escluse dal conteggio comune.',
  casi: cases.map(({ ambito, segreta, indizio, categoria, misura }, i) => ({
    ambito, segreta, indizio, categoria, misura_separata: misura, ...Object.fromEntries(profiles.map(p => [p.key, p.result.positions[i]])),
  })),
}
writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n')
console.log(report.preferenze_rispettate_sui_comuni, 'su', report.confronti_giocabili_comuni, 'segrete comuni.', values.out)
console.log('Misura separata', report.misura_separata)
