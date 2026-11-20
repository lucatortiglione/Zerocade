// Dalla radice del progetto: node --import tsx scripts/context-evaluate-clues.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { lookup, rankAgainst } from '@zerocade/shared/contextRanking'
import { serverCorpus } from '../apps/server/src/context-tournament-ranking.ts'
import { PIPELINE_MIN_PINNED } from '../apps/server/src/context-pipeline.ts'

const corpus = serverCorpus('original')
if (!corpus) throw new Error('Corpus originale indisponibile')
const { data } = corpus
const input = readFileSync('gioco-zerocontext/resources/confronti_indizi.csv', 'utf8')
const cases = input.trim().split(/\r?\n/).slice(1).map(line => {
  const [ambito, segreta, indizio, categoria] = line.split(',')
  const secret = data.index.get(segreta)
  if (secret === undefined) throw new Error(`Segreta assente: ${segreta}`)
  const clue = lookup(data, indizio, secret)
  const peer = lookup(data, categoria, secret)
  if (clue < 0 || peer < 0 || new Set([secret, clue, peer]).size !== 3) throw new Error(line)
  return { ambito, segreta, indizio, categoria, secret, clue, peer }
})

function evaluate(file: string) {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const version = db.prepare<[], { value: string }>("SELECT value FROM pipeline_meta WHERE name = 'model_version'").get()?.value
    if (!version) throw new Error(`Versione assente: ${file}`)
    const neighbors = db.prepare<[string, string], { lemma: string }>(`
      SELECT target.lemma FROM lexemes AS source
      JOIN semantic_pair_scores AS score ON score.source_lexeme_id = source.lexeme_id
      JOIN lexemes AS target ON target.lexeme_id = score.target_lexeme_id
      WHERE source.lemma = ? AND score.model_version = ? ORDER BY score.rank`)
    const positions = cases.map(({ segreta, secret, clue, peer }) => {
      const pinned = new Set<number>()
      for (const { lemma } of neighbors.iterate(segreta, version)) {
        const word = data.index.get(lemma)
        if (word !== undefined && word !== secret) pinned.add(word)
      }
      const { rankOf } = rankAgainst({ ...data, pinned: new Map([[secret, [...pinned]]]) }, secret)
      return { posizione_indizio: rankOf[clue] + 1, posizione_categoria: rankOf[peer] + 1,
        associazioni_giocabili: pinned.size }
    })
    return { version, positions }
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
  { key: 'riordino', minimum: 40, result: evaluate(values.standard) },
]
if (values.pilota) profiles.push({ key: 'pilota', minimum: 40, result: evaluate(values.pilota) })
const common = cases.map((_, i) => profiles.every(p => p.result.positions[i].associazioni_giocabili >= p.minimum))
const report = {
  corpus: corpus.hash,
  versioni: Object.fromEntries(profiles.map(p => [p.key, p.result.version])),
  soglie_associazioni_giocabili: Object.fromEntries(profiles.map(p => [p.key, p.minimum])),
  confronti_giocabili_comuni: common.filter(Boolean).length,
  preferenze_rispettate_sui_comuni: Object.fromEntries(profiles.map(p => [p.key, p.result.positions.filter(
    (row, i) => common[i] && row.posizione_indizio < row.posizione_categoria).length])),
  metodo: 'Casi editoriali di sviluppo. Posizione 1 = segreta. Le parole giocabili elencate da ciascun export precedono le altre, ordinate dal motore originale. Sotto la soglia del server le posizioni sono simulate.',
  casi: cases.map(({ ambito, segreta, indizio, categoria }, i) => ({
    ambito, segreta, indizio, categoria, ...Object.fromEntries(profiles.map(p => [p.key, p.result.positions[i]])),
  })),
}
writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n')
console.log(report.preferenze_rispettate_sui_comuni, 'su', report.confronti_giocabili_comuni, 'segrete comuni.', values.out)
