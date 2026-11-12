// ZeroReazioniACatena's three modes, and the room secret that carries a round between the overlays and
// the dashboard: "<mode><round>-word-word-…". In the chain modes the words are the chain in order; in
// "chiave" the first word is the hidden one and the others are its clues.

export type ChainMode = 'domino' | 'catena' | 'chiave'

export const CHAIN_MODES: { id: ChainMode; label: string; rule: string }[] = [
  { id: 'domino', label: 'Effetto domino', rule: 'Le parole si trovano in ordine: ognuna porta alla successiva.' },
  { id: 'catena', label: 'Catena completa', rule: 'Trova le parole nascoste della catena, in qualunque ordine.' },
  { id: 'chiave', label: 'Parola chiave', rule: 'Una parola nascosta, legata a tutti gli indizi: meno indizi servono, più vale.' },
]

const isMode = (value: unknown): value is ChainMode => CHAIN_MODES.some((m) => m.id === value)

export const chainModeLabel = (mode: ChainMode) => CHAIN_MODES.find((m) => m.id === mode)?.label ?? mode

// The mode of round `round` (counted from 1): the one chosen in the settings, or with "rotate" the three
// in turn, `perMode` rounds each.
export function chainModeFor(setting: unknown, round: number, perMode: number): ChainMode {
  if (isMode(setting)) return setting
  const block = Math.floor(Math.max(0, round - 1) / Math.max(1, Math.round(perMode)))
  return CHAIN_MODES[block % CHAIN_MODES.length].id
}

export interface ChainRound {
  mode: ChainMode
  round: number
  words: string[]
}

export const chainSecret = (r: ChainRound) => `${r.mode}${r.round}-${r.words.join('-')}`

// A secret back into its round; one without the "<mode><round>" token (an older overlay) is a
// "catena" round 0.
export function parseChainSecret(secret: string): ChainRound | null {
  const parts = secret.split('-').filter(Boolean)
  const head = /^([a-z]+)(\d+)$/.exec(parts[0] ?? '')
  const tagged = head && isMode(head[1])
  const words = tagged ? parts.slice(1) : parts
  if (words.length < 2) return null
  return tagged ? { mode: head[1] as ChainMode, round: Number(head[2]), words } : { mode: 'catena', round: 0, words }
}

// What the server accepts as a room's secret: one word (ZeroContext, ZeroWordle), or a chain of them
// joined by "-", optionally led by ZeroReazioniACatena's "<mode><round>" token.
export const ROOM_SECRET = /^(?:[a-z]{2,12}\d{1,6}-)?[a-zàèéìòù]{2,20}(?:-[a-zàèéìòù]{2,20})*$/
export const ROOM_SECRET_MAX = 200
