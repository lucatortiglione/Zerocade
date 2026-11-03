import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, clamp, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Guess the Logo" — a brand logo is progressively revealed (blur / zoom /
// scramble / none). Viewers guess the brand name (aliases accepted).

interface Brand {
  name: string
  aliases: string[]
  emoji: string
  color: string
  difficulty: 'easy' | 'medium' | 'hard'
}

// Brands are loaded from the server's SQLite-backed content store.
export function createGuessLogo(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 20
  let breakSecs = 4
  let mode: 'blur' | 'zoom' | 'scramble' | 'none' = 'zoom'
  let roundMode = 'timedCollect'
  let pts = 3
  let winnerBonus = 5
  let showBoard = true

  let brand: Brand = { name: '', aliases: [], emoji: '❓', color: '#333333', difficulty: 'easy' }
  let timer = 20
  let revealed = false
  let solver: Viewer | null = null
  const solvedBy = new Set<string>()
  const scores = newScores()

  const pick = () => {
    brand = shuffled(itemsFor<Brand>('guess-logo'))[0] ?? { name: '', aliases: [], emoji: '❓', color: '#333333', difficulty: 'easy' }
    timer = roundSecs
    revealed = false
    solver = null
    solvedBy.clear()
  }

  const progress = () => (mode === 'none' ? 1 : clamp(1 - timer / roundSecs, 0, 1))

  const matches = (text: string) => {
    const t = normalize(text)
    if (normalize(brand.name) === t) return true
    return brand.aliases.some((a) => normalize(a) === t)
  }

  const solve = (name: string, id: string, avatar: string | undefined) => {
    if (solvedBy.has(id)) return
    solvedBy.add(id)
    const first = !solver
    if (first) solver = { id, nickname: name, avatar }
    addPoints(scores, id, name, avatar, pts + (first ? winnerBonus : 0))
    if (roundMode === 'firstWins' && first) {
      revealed = true
      timer = breakSecs
    }
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 20
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 4
      mode = (['blur', 'zoom', 'scramble', 'none'] as const).includes(settings.obscureMode as never) ? (settings.obscureMode as 'blur') : 'zoom'
      roundMode = settings.roundMode === 'firstWins' ? 'firstWins' : 'timedCollect'
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 3
      winnerBonus = typeof settings.winnerBonus === 'number' ? settings.winnerBonus : 5
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_hint') {
        timer = Math.max(2, timer * 0.5)
        return
      }
      if (event.type !== 'comment') return
      if (revealed && roundMode === 'firstWins') return
      if (matches(event.text)) solve(event.user.nickname, event.user.id, event.user.avatar)
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : roundSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) pick()
        return
      }
      timer -= dt
      if (timer <= 0) {
        revealed = true
        timer = breakSecs
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('GUESS THE LOGO', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Scrivi il nome del brand in chat', cx, 122)

      const size = Math.min(360, height * 0.5)
      const t = revealed ? 1 : progress()
      drawBadge(ctx, brand, cx, height * 0.42, size, t, revealed ? 'none' : mode)

      if (revealed) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 30px system-ui'
        ctx.fillText(`${brand.name} — ${brand.emoji}`, cx, height * 0.64)
        if (solver) {
          ctx.fillStyle = '#3ccf7a'
          ctx.font = 'bold 26px system-ui'
          fillTextWithAvatar(ctx, `🏆 ${solver.nickname} ha indovinato!`, cx, height * 0.7, solver)
        }
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#6b8aff')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
function drawBadge(
  ctx: CanvasRenderingContext2D,
  brand: Brand,
  cx: number,
  cy: number,
  size: number,
  t: number,
  mode: 'blur' | 'zoom' | 'scramble' | 'none',
) {
  const half = size / 2
  if (mode === 'zoom') {
    const scale = 1 + 2 * (1 - t)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - half, cy - half, size, size, 24)
    ctx.clip()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    drawCore(ctx, brand, 0, 0, size)
    ctx.restore()
    return
  }
  drawCore(ctx, brand, cx, cy, size)
  if (mode === 'blur') {
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - half, cy - half, size, size, 24)
    ctx.clip()
    ctx.fillStyle = `rgba(10,10,16,${1 - t})`
    ctx.fillRect(cx - half, cy - half, size, size)
    ctx.restore()
  } else if (mode === 'scramble') {
    const n = 6
    const total = n * n
    const hidden = Math.round((1 - t) * total)
    const order = scrambleOrder(brand.name, total)
    const cell = size / n
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - half, cy - half, size, size, 24)
    ctx.clip()
    ctx.fillStyle = '#0a0a10'
    for (let i = 0; i < hidden; i++) {
      const p = order[i]
      const gx = p % n
      const gy = Math.floor(p / n)
      ctx.fillRect(cx - half + gx * cell, cy - half + gy * cell, cell + 1, cell + 1)
    }
    ctx.restore()
  }
}

function drawCore(ctx: CanvasRenderingContext2D, brand: Brand, x: number, y: number, size: number) {
  const half = size / 2
  ctx.fillStyle = brand.color
  ctx.beginPath()
  ctx.roundRect(x - half, y - half, size, size, 24)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `${Math.round(size * 0.45)}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(brand.emoji, x, y - size * 0.02)
  ctx.font = `bold ${Math.round(size * 0.2)}px system-ui`
  ctx.fillText(brand.name.split(' ')[0].charAt(0), x, y + size * 0.24)
  ctx.textBaseline = 'alphabetic'
}

function scrambleOrder(seedText: string, total: number): number[] {
  let seed = 0
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const arr = Array.from({ length: total }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const j = seed % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}


