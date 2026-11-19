import { drawAvatar } from './avatar'
import { reportScore } from './scoreReport'
import { COLORS, UI_FONT, textSize } from './kit'

// Small helpers shared by the quiz/word games: normalisation, scoreboards,
// leaderboard rendering and the timer bar.

export interface Score {
  name: string
  pts: number
  avatar?: string
}

export type Scores = Map<string, Score>

export const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

export const newScores = (): Scores => new Map()

export function addPoints(map: Scores, id: string, name: string, avatar: string | undefined, pts: number) {
  const cur = map.get(id)
  map.set(id, { name, pts: (cur?.pts ?? 0) + pts, avatar: avatar ?? cur?.avatar })
  reportScore(id, name, avatar ?? cur?.avatar, pts)
}

export const topOf = (map: Scores, n: number) =>
  [...map.entries()].sort((a, b) => b[1].pts - a[1].pts).slice(0, n)

const tickerStarted = new WeakMap<Scores, number>()

// La classifica in onda: una fascia in cima al palco, con avatar, posizione e nome, poi i punti. Con molti giocatori scorre (ferma
// con «riduci animazioni»).
export function drawLeaderboard(ctx: CanvasRenderingContext2D, map: Scores) {
  const top = topOf(map, map.size)
  if (!top.length) return
  const now = performance.now()
  if (!tickerStarted.has(map)) tickerStarted.set(map, now)
  const { width, height: canvasHeight } = ctx.canvas
  const size = textSize(width, canvasHeight, 'min')
  const height = Math.round(size * 1.6)
  const y = Math.round(size * 0.25)
  const radius = size * 0.42
  const gap = size * 0.4
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y, width, height)
  ctx.clip()
  ctx.fillStyle = COLORS.slate
  ctx.fillRect(0, y, width, height)
  ctx.font = `600 ${size}px ${UI_FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const entries = top.map(([, player], i) => {
    const name = `${i + 1}. ${player.name.length > 28 ? `${player.name.slice(0, 27)}…` : player.name}`
    const points = `${player.pts} pt`
    const nameWidth = ctx.measureText(name).width
    return { player, name, points, nameWidth, width: radius * 2 + gap + nameWidth + gap + ctx.measureText(points).width + size * 1.2 }
  })
  const groupWidth = Math.max(width, entries.reduce((sum, e) => sum + e.width, 0))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const offset = reduced ? 0 : ((now - tickerStarted.get(map)!) / 1000 * width * 0.055) % groupWidth
  const middle = y + height / 2
  for (let copy = 0; copy < 2; copy++) {
    let x = copy * groupWidth - offset + size * 0.5
    for (const entry of entries) {
      if (x + entry.width > 0 && x < width) {
        drawAvatar(ctx, entry.player.avatar, x + radius, middle, radius, entry.player.name)
        ctx.fillStyle = COLORS.paper
        ctx.fillText(entry.name, x + radius * 2 + gap, middle)
        ctx.fillStyle = COLORS.points
        ctx.fillText(entry.points, x + radius * 2 + gap + entry.nameWidth + gap, middle)
      }
      x += entry.width
    }
  }
  ctx.restore()
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function drawTimerBar(ctx: CanvasRenderingContext2D, width: number, height: number, frac: number, color: string) {
  ctx.fillStyle = '#00000055'
  ctx.fillRect(40, height - 56, width - 80, 14)
  ctx.fillStyle = color
  ctx.fillRect(40, height - 56, (width - 80) * clamp(frac, 0, 1), 14)
}

// Fisher–Yates shuffle that never mutates the source array.
export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Draw a row of blank/letter tiles for "guess the word" games.
export function drawWordTiles(
  ctx: CanvasRenderingContext2D,
  word: string,
  cx: number,
  y: number,
  tile: number,
  gap: number,
  revealed: string,
  shownColor: string,
  hiddenColor: string,
) {
  const total = word.length * tile + (word.length - 1) * gap
  let x = cx - total / 2 + tile / 2
  for (const ch of word) {
    const known = revealed.includes(ch)
    ctx.fillStyle = known ? shownColor : hiddenColor
    ctx.beginPath()
    ctx.roundRect(x - tile / 2, y - tile / 2, tile, tile, 8)
    ctx.fill()
    if (known) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ch, x, y + 1)
      ctx.textBaseline = 'alphabetic'
    }
    x += tile + gap
  }
}
