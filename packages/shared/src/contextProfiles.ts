export const CONTEXT_PROFILES = [
  { id: 'original', label: 'Associazioni originali', schema: 'context_original' },
  { id: 'abtt', label: 'Associazioni ABTT', schema: 'context_abtt' },
  // Not a schema of its own: the words and vectors of the original ones, with the secrets and the top-1000 associations of each
  // secret read from the export of Pipeline B (database/ZeroContext_Associazioni_PipelineB.sqlite3, apps/server/src/context-pipeline.ts).
  { id: 'pipeline_b', label: 'Pipeline B (fastText + PMI-SVD + ConceptNet)', schema: 'context_original' },
] as const

export type ContextProfile = (typeof CONTEXT_PROFILES)[number]['id']
export const isContextProfile = (value: unknown): value is ContextProfile =>
  CONTEXT_PROFILES.some((p) => p.id === value)
export const contextProfile = (value: unknown): ContextProfile => isContextProfile(value) ? value : 'original'
