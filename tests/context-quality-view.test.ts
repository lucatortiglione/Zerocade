import assert from 'node:assert/strict'
import test from 'node:test'
import type { EvaluationRun, EvaluationSampleSecret, EvaluationSampleWord } from '../packages/shared/src/contextEvaluation.ts'
import { comparisonRows, disagrees, formatInterval, formatValue, reviewProgress, subsetNames } from '../apps/dashboard/src/qualityView.ts'

const metric = (name: string, subset: string, value: number | null, low: number | null = null, high: number | null = null, n = 0) =>
  ({ metric: name, subset, value, low, high, n })
const run = (id: number, profile: string, metrics: ReturnType<typeof metric>[]): EvaluationRun =>
  ({ id, profile, createdAt: '2026-11-19T10:00:00+00:00', finishedAt: '2026-11-19T10:05:00+00:00', judgeVersion: null, metrics })
const word = (over: Partial<EvaluationSampleWord> = {}): EvaluationSampleWord =>
  ({ position: 2, word: 'gatto', verified: false, variant: false, judge: null, human: null, ...over })

test('formatValue usa la virgola italiana e il trattino per un valore che non c\'è', () => {
  assert.equal(formatValue(0.2147), '0,21')
  assert.equal(formatValue(1), '1,00')
  assert.equal(formatValue(0), '0,00')
  assert.equal(formatValue(null), '—')
  assert.equal(formatValue(Number.NaN), '—')
  assert.equal(formatValue(1234.5, 1), '1234,5')          // l'italiano di Intl non mette il punto delle migliaia sotto 10.000
  assert.equal(formatValue(12345.5, 1), '12.345,5')
})

test('formatInterval mostra i due estremi o niente', () => {
  assert.equal(formatInterval(0.18, 0.24), '0,18–0,24')
  assert.equal(formatInterval(null, 0.24), '')
  assert.equal(formatInterval(0.18, null), '')
})

test('comparisonRows: una riga per profilo, con i valori del sottoinsieme scelto', () => {
  const runs = [
    run(2, 'original', [metric('precision_10_verificata', 'misura:tutte', 0.21, 0.18, 0.24, 620), metric('precision_10_giudicata', 'misura:tutte', 0.58, 0.5, 0.6, 1900),
      metric('ndcg_20', 'misura:tutte', 0.44, 0.4, 0.48, 1900), metric('valutazione_umana', 'misura:tutte', 0.7, 0.5, 0.9, 50), metric('ndcg_20', 'misura:con_associazioni', 0.9)]),
    run(4, 'abtt', [metric('precision_10_verificata', 'misura:tutte', 0.04, 0.02, 0.06, 620)]),
  ]
  const rows = comparisonRows(runs, 'misura:tutte')
  assert.deepEqual(rows.map((r) => r.profile), ['abtt', 'original'])            // in ordine alfabetico, stabile
  const original = rows[1]
  assert.deepEqual(original.cells.precisionVerified, { value: 0.21, low: 0.18, high: 0.24, n: 620 })
  assert.equal(original.cells.ndcg.value, 0.44)                                   // non 0,9: è un altro sottoinsieme
  assert.equal(original.cells.human.n, 50)
  assert.equal(original.segrete, 1900)                                            // il numero di segrete è l'n di nDCG@20
  const abtt = rows[0]
  assert.equal(abtt.cells.ndcg.value, null)                                       // metrica assente: nessun valore, nessun errore
  assert.equal(abtt.segrete, null)
})

test('subsetNames: la misura per prima, poi gli altri in ordine', () => {
  const runs = [run(1, 'a', [metric('x', 'sviluppo:tutte', 1), metric('x', 'misura:senza_associazioni', 1), metric('x', 'misura:tutte', 1)]),
    run(2, 'b', [metric('x', 'misura:con_associazioni', 1), metric('x', 'misura:tutte', 1), metric('x', 'tutte', 1)])]
  assert.deepEqual(subsetNames(runs), ['misura:tutte', 'misura:con_associazioni', 'misura:senza_associazioni', 'sviluppo:tutte', 'tutte'])
  assert.deepEqual(subsetNames([]), ['misura:tutte'])                              // la scelta predefinita esiste sempre
})

test('disagrees: Qwen e Luca discordano solo con un giudizio netto da entrambe le parti', () => {
  const judge = (grade: 0 | 1 | 2) => ({ grade, senseOk: null, reason: '' })
  assert.equal(disagrees(word({ judge: judge(2), human: 'non_naturale' })), true)
  assert.equal(disagrees(word({ judge: judge(1), human: 'non_naturale' })), true)
  assert.equal(disagrees(word({ judge: judge(0), human: 'naturale' })), true)
  assert.equal(disagrees(word({ judge: judge(2), human: 'naturale' })), false)
  assert.equal(disagrees(word({ judge: judge(0), human: 'non_naturale' })), false)
  assert.equal(disagrees(word({ judge: judge(2), human: 'non_so' })), false)
  assert.equal(disagrees(word({ judge: judge(2), human: null })), false)
  assert.equal(disagrees(word({ judge: null, human: 'naturale' })), false)       // senza Qwen non c'è nessuno con cui discordare
})

test('reviewProgress: una segreta è rivista quando ogni parola che non è una variante ha un verdetto', () => {
  const secret = (words: EvaluationSampleWord[]): EvaluationSampleSecret => ({ secret: 's', block: 1, hasGold: true, gloss: null, words })
  const secrets = [
    secret([word({ human: 'naturale' }), word({ human: 'non_so' }), word({ variant: true })]),   // rivista: la variante non si giudica
    secret([word({ human: 'naturale' }), word({ human: null })]),                                // a metà
    secret([word({ variant: true })]),                                                          // niente da giudicare: conta come rivista
    secret([]),
  ]
  assert.deepEqual(reviewProgress(secrets), { done: 3, total: 4, words: { done: 3, total: 4 } })
  assert.deepEqual(reviewProgress([]), { done: 0, total: 0, words: { done: 0, total: 0 } })
})
