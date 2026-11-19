import type { EvaluationMetric, EvaluationRun, EvaluationSampleSecret, EvaluationSampleWord } from '@zerocade/shared'

// La logica della pagina «Qualità posizioni», senza React: i numeri della tabella di confronto, i formati italiani e le regole
// della revisione. La pagina (pages/ContextQualityPage.tsx) la usa soltanto.

export interface Cell { value: number | null; low: number | null; high: number | null; n: number }
export interface ComparisonRow {
  profile: string
  runId: number
  cells: { precisionVerified: Cell; precisionJudged: Cell; ndcg: Cell; sense: Cell; human: Cell }
  /** Segrete su cui valgono i numeri: l'n di nDCG@20, che le conta tutte (la Precision verificata solo quelle con associazioni). */
  segrete: number | null
}

export const DEFAULT_SUBSET = 'misura:tutte'
const EMPTY: Cell = { value: null, low: null, high: null, n: 0 }

const formatter = (digits: number) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function formatValue(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? '—' : formatter(digits).format(value)
}

export function formatInterval(low: number | null, high: number | null): string {
  return low === null || high === null ? '' : `${formatValue(low)}–${formatValue(high)}`
}

const cell = (metrics: EvaluationMetric[], name: string, subset: string): Cell => {
  const found = metrics.find((m) => m.metric === name && m.subset === subset)
  return found ? { value: found.value, low: found.low, high: found.high, n: found.n } : EMPTY
}

export function comparisonRows(runs: EvaluationRun[], subset: string): ComparisonRow[] {
  return runs
    .map((run): ComparisonRow => {
      const ndcg = cell(run.metrics, 'ndcg_20', subset)
      return {
        profile: run.profile, runId: run.id,
        cells: {
          precisionVerified: cell(run.metrics, 'precision_10_verificata', subset), precisionJudged: cell(run.metrics, 'precision_10_giudicata', subset),
          ndcg, sense: cell(run.metrics, 'accezione', subset), human: cell(run.metrics, 'valutazione_umana', subset),
        },
        segrete: run.metrics.some((m) => m.metric === 'ndcg_20' && m.subset === subset) ? ndcg.n : null,
      }
    })
    .sort((a, b) => a.profile.localeCompare(b.profile, 'it'))
}

/** I sottoinsiemi tra cui scegliere: la misura per prima (è quella che conta), poi gli altri in ordine. */
export function subsetNames(runs: EvaluationRun[]): string[] {
  const names = new Set<string>()
  for (const run of runs) for (const m of run.metrics) names.add(m.subset)
  names.delete(DEFAULT_SUBSET)
  return [DEFAULT_SUBSET, ...[...names].sort((a, b) => a.localeCompare(b, 'it'))]
}

/** Qwen e Luca discordano solo se entrambi hanno dato un giudizio netto: «non so» e l'assenza di un verdetto non contano. */
export function disagrees(word: EvaluationSampleWord): boolean {
  if (!word.judge || (word.human !== 'naturale' && word.human !== 'non_naturale')) return false
  return word.judge.grade >= 1 ? word.human === 'non_naturale' : word.human === 'naturale'
}

/** Una segreta è rivista quando ogni parola che non è una variante ha un verdetto (anche «non so»). */
export function reviewProgress(secrets: EvaluationSampleSecret[]): { done: number; total: number; words: { done: number; total: number } } {
  let done = 0
  const words = { done: 0, total: 0 }
  for (const secret of secrets) {
    const toJudge = secret.words.filter((w) => !w.variant)
    const judged = toJudge.filter((w) => w.human !== null).length
    words.total += toJudge.length
    words.done += judged
    if (judged === toJudge.length) done++
  }
  return { done, total: secrets.length, words }
}
