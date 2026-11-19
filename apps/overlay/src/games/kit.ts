import { STAGE_INSETS } from '../stage'

// Il kit di disegno in onda: le stesse misure e gli stessi colori per tutti i giochi su canvas (piano di design dell'overlay).

/** Il lato corto della scena intera, ricavato dal palco su cui il gioco disegna (il palco esclude le fasce di marchio e istruzioni). */
export function sceneUnit(width: number, height: number): number {
  return Math.round(Math.min(width, height / (1 - STAGE_INSETS.top - STAGE_INSETS.bottom)))
}

const SIZES = { min: 0.037, mid: 0.048, big: 0.067, huge: 0.11 } as const
export type TextSize = keyof typeof SIZES

/** Le misure del testo: «min» è il minimo leggibile su telefono (40 px su una scena da 1080). */
export function textSize(width: number, height: number, size: TextSize): number {
  return Math.round(sceneUnit(width, height) * SIZES[size])
}

export const COLORS = {
  slate: '#1e2a44',
  slateDeep: '#141c30',
  paper: '#f4f6fa',
  paperMuted: '#c3cbdb',
  points: '#f0b444',
} as const

export const UI_FONT = "'Barlow Semi Condensed', system-ui, sans-serif"
export const BOARD_FONT = "'Atkinson Hyperlegible', system-ui, sans-serif"
