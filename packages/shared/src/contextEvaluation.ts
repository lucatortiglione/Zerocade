// Tipi della pagina «Qualità posizioni» (dashboard) e delle rotte /api/context/evaluation del server.
// Il database che le rotte leggono lo scrive gioco-zerocontext/script/evaluate_context_ranking.py
// (progetto: docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md).

/** Il giudizio di Luca su una parola nelle prime 10 di una segreta. */
export type HumanVerdict = 'naturale' | 'non_naturale' | 'non_so'
export const HUMAN_VERDICTS: readonly HumanVerdict[] = ['naturale', 'non_naturale', 'non_so']

export interface EvaluationMetric { metric: string; subset: string; value: number | null; low: number | null; high: number | null; n: number }

/** L'ultima esecuzione completa di un profilo, con tutte le sue metriche. */
export interface EvaluationRun {
  id: number
  profile: string
  createdAt: string
  finishedAt: string | null
  judgeVersion: string | null
  metrics: EvaluationMetric[]
}

export interface EvaluationSampleWord {
  position: number
  word: string
  /** La parola è tra le associazioni verificate di ZeroAssociazioni. */
  verified: boolean
  /** È una forma o un derivato della segreta (cani per cane): non conta come successo né come errore. */
  variant: boolean
  judge: { grade: 0 | 1 | 2; senseOk: boolean | null; reason: string } | null
  human: HumanVerdict | null
}

export interface EvaluationSampleSecret {
  secret: string
  block: number
  hasGold: boolean
  /** Il senso della parola-guida in ZeroAssociazioni, se c'è. */
  gloss: string | null
  words: EvaluationSampleWord[]
}

export interface EvaluationSample {
  runId: number
  profile: string
  secrets: EvaluationSampleSecret[]
  /** Verdetti umani dati dopo la fine dell'esecuzione: non sono ancora nei numeri, serve `ricalcola`. */
  humanAfterRun: number
}
