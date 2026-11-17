export const CONTEXT_PROFILES = [
  { id: 'original', label: 'Associazioni originali', schema: 'context_original' },
  { id: 'abtt', label: 'Associazioni ABTT', schema: 'context_abtt' },
] as const

export type ContextProfile = (typeof CONTEXT_PROFILES)[number]['id']
export const isContextProfile = (value: unknown): value is ContextProfile =>
  CONTEXT_PROFILES.some((p) => p.id === value)
export const contextProfile = (value: unknown): ContextProfile => isContextProfile(value) ? value : 'original'
