// Il palco dei giochi su canvas: tra la fascia del marchio in alto e quella delle istruzioni in basso (styles.css, .overlay__top e
// .overlay__guide). Le fasce sono in vmin, quindi si misurano sul lato corto della scena.
export const STAGE_INSETS = { top: 0.11, bottom: 0.16 } as const

export function stageBox(width: number, height: number): { top: number; bottom: number; width: number; height: number } {
  const short = Math.min(width, height)
  const top = Math.round(short * STAGE_INSETS.top)
  const bottom = Math.round(short * STAGE_INSETS.bottom)
  return { top, bottom, width, height: Math.max(0, height - top - bottom) }
}
