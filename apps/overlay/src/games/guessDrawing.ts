import type { GameInstance } from './engine'
import { addPoints, clamp, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'

// "Guess the Drawing" — a simple pictogram is drawn stroke by stroke. Viewers
// guess the word in chat as the drawing reveals itself.

type Stroke = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void

interface Drawing {
  word: string
  aliases: string[]
  strokes: Stroke[]
}

const W = '#f4f4fa'

const PICTOGRAMS: Drawing[] = [
  {
    word: 'CASA', aliases: [], strokes: [
      (c, x, y, s) => { c.strokeStyle = W; c.strokeRect(x - s * 0.5, y - s * 0.1, s, s * 0.7) },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.6, y - s * 0.05); c.lineTo(x, y - s * 0.6); c.lineTo(x + s * 0.6, y - s * 0.05); c.closePath(); c.stroke() },
      (c, x, y, s) => { c.strokeRect(x - s * 0.12, y + s * 0.2, s * 0.24, s * 0.4) },
      (c, x, y, s) => { c.strokeRect(x + s * 0.18, y - s * 0.02, s * 0.2, s * 0.2) },
    ],
  },
  {
    word: 'SOLE', aliases: [], strokes: [
      (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.3, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45); c.lineTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6); c.stroke() } },
      (c, x, y, s) => { c.fillStyle = W; c.beginPath(); c.arc(x - s * 0.1, y - s * 0.1, s * 0.03, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + s * 0.1, y - s * 0.1, s * 0.03, 0, Math.PI * 2); c.fill() },
    ],
  },
  {
    word: 'PESCE', aliases: ['PESCIOLINO'], strokes: [
      (c, x, y, s) => { c.beginPath(); c.ellipse(x - s * 0.1, y, s * 0.5, s * 0.25, 0, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x + s * 0.35, y); c.lineTo(x + s * 0.6, y - s * 0.2); c.lineTo(x + s * 0.6, y + s * 0.2); c.closePath(); c.stroke() },
      (c, x, y, s) => { c.fillStyle = W; c.beginPath(); c.arc(x - s * 0.3, y - s * 0.08, s * 0.03, 0, Math.PI * 2); c.fill() },
    ],
  },
  {
    word: 'ALBERO', aliases: [], strokes: [
      (c, x, y, s) => { c.strokeRect(x - s * 0.08, y + s * 0.1, s * 0.16, s * 0.5) },
      (c, x, y, s) => { c.beginPath(); c.arc(x, y - s * 0.15, s * 0.4, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.arc(x - s * 0.2, y - s * 0.25, s * 0.12, 0, Math.PI * 2); c.stroke() },
    ],
  },
  {
    word: 'BARCA', aliases: ['BARCHE'], strokes: [
      (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.5, y); c.lineTo(x + s * 0.5, y); c.lineTo(x + s * 0.3, y + s * 0.3); c.lineTo(x - s * 0.3, y + s * 0.3); c.closePath(); c.stroke() },
      (c, x, y, s) => { c.strokeRect(x - s * 0.03, y - s * 0.6, s * 0.06, s * 0.6) },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x, y - s * 0.6); c.lineTo(x + s * 0.4, y - s * 0.2); c.lineTo(x, y - s * 0.2); c.stroke() },
    ],
  },
  {
    word: 'GATTO', aliases: [], strokes: [
      (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.35, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.3, y - s * 0.25); c.lineTo(x - s * 0.45, y - s * 0.5); c.moveTo(x + s * 0.3, y - s * 0.25); c.lineTo(x + s * 0.45, y - s * 0.5); c.stroke() },
      (c, x, y, s) => { c.fillStyle = W; c.beginPath(); c.arc(x - s * 0.12, y - s * 0.05, s * 0.03, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + s * 0.12, y - s * 0.05, s * 0.03, 0, Math.PI * 2); c.fill() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.3, y + s * 0.15); c.lineTo(x - s * 0.55, y + s * 0.1); c.moveTo(x + s * 0.3, y + s * 0.15); c.lineTo(x + s * 0.55, y + s * 0.1); c.stroke() },
    ],
  },
  {
    word: 'CUORE', aliases: ['AMORE'], strokes: [
      (c, x, y, s) => { c.beginPath(); c.moveTo(x, y + s * 0.4); c.bezierCurveTo(x - s * 0.8, y - s * 0.1, x - s * 0.4, y - s * 0.5, x, y - s * 0.15); c.bezierCurveTo(x + s * 0.4, y - s * 0.5, x + s * 0.8, y - s * 0.1, x, y + s * 0.4); c.stroke() },
    ],
  },
  {
    word: 'STELLA', aliases: [], strokes: [
      (c, x, y, s) => { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? s * 0.5 : s * 0.22; const a = -Math.PI / 2 + (i / 10) * Math.PI * 2; const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py) } c.closePath(); c.stroke() },
    ],
  },
  {
    word: 'OMBRELLO', aliases: [], strokes: [
      (c, x, y, s) => { c.beginPath(); c.arc(x, y - s * 0.1, s * 0.5, Math.PI, 0); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.1); c.lineTo(x + s * 0.5, y - s * 0.1); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x, y - s * 0.1); c.quadraticCurveTo(x + s * 0.2, y + s * 0.2, x + s * 0.05, y + s * 0.5); c.stroke() },
    ],
  },
  {
    word: 'FIORE', aliases: [], strokes: [
      (c, x, y, s) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.arc(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, s * 0.18, 0, Math.PI * 2); c.stroke() } },
      (c, x, y, s) => { c.fillStyle = W; c.beginPath(); c.arc(x, y, s * 0.15, 0, Math.PI * 2); c.fill() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x, y + s * 0.3); c.lineTo(x, y + s * 0.6); c.stroke() },
    ],
  },
  {
    word: 'MACCHINA', aliases: ['AUTO', 'CAR'], strokes: [
      (c, x, y, s) => { c.beginPath(); c.roundRect(x - s * 0.6, y - s * 0.25, s * 1.2, s * 0.45, s * 0.15); c.stroke() },
      (c, x, y, s) => { c.strokeRect(x - s * 0.25, y - s * 0.55, s * 0.5, s * 0.3) },
      (c, x, y, s) => { c.beginPath(); c.arc(x - s * 0.35, y + s * 0.25, s * 0.15, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.arc(x + s * 0.35, y + s * 0.25, s * 0.15, 0, Math.PI * 2); c.stroke() },
    ],
  },
  {
    word: 'FUNGO', aliases: [], strokes: [
      (c, x, y, s) => { c.strokeRect(x - s * 0.1, y, s * 0.2, s * 0.4) },
      (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.4, Math.PI, 0); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.arc(x - s * 0.15, y - s * 0.2, s * 0.05, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x + s * 0.15, y - s * 0.2, s * 0.05, 0, Math.PI * 2); c.stroke() },
    ],
  },
  {
    word: 'MELA', aliases: [], strokes: [
      (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.35, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.moveTo(x, y - s * 0.35); c.lineTo(x, y - s * 0.55); c.stroke() },
      (c, x, y, s) => { c.beginPath(); c.ellipse(x + s * 0.15, y - s * 0.5, s * 0.15, s * 0.06, -0.4, 0, Math.PI * 2); c.stroke() },
    ],
  },
  {
    word: 'LUNA', aliases: [], strokes: [
      (c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.4, 0, Math.PI * 2); c.stroke() },
      (c, x, y, s) => { c.fillStyle = '#0b1026'; c.beginPath(); c.arc(x + s * 0.2, y - s * 0.1, s * 0.35, 0, Math.PI * 2); c.fill(); c.strokeStyle = W; c.stroke() },
    ],
  },
]
export function createGuessDrawing(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 30
  let breakSecs = 5
  let roundMode = 'timed'
  let showLength = true
  let basePoints = 100
  let showBoard = true

  let drawing = PICTOGRAMS[0]
  let timer = 30
  let revealed = false
  let solver = ''
  const solvedBy = new Set<string>()
  const scores = newScores()

  const pick = () => {
    drawing = shuffled(PICTOGRAMS)[0]
    timer = roundSecs
    revealed = false
    solver = ''
    solvedBy.clear()
  }

  const matches = (text: string) => {
    const t = normalize(text)
    return normalize(drawing.word) === t || drawing.aliases.some((a) => normalize(a) === t)
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.drawSeconds === 'number' ? settings.drawSeconds : 30
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
      roundMode = settings.roundMode === 'untilSolved' ? 'untilSolved' : 'timed'
      showLength = settings.showWordLength !== false
      basePoints = typeof settings.basePoints === 'number' ? settings.basePoints : 100
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_letter') {
        timer = Math.max(1, timer * 0.4)
        return
      }
      if (event.type !== 'comment') return
      if (revealed && roundMode === 'untilSolved') return
      if (!matches(event.text)) return
      if (solvedBy.has(event.user.id)) return
      solvedBy.add(event.user.id)
      if (!solver) solver = event.user.nickname
      const early = roundMode === 'timed' ? Math.round((timer / roundSecs) * basePoints) : basePoints
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, early)
      if (roundMode === 'untilSolved') {
        revealed = true
        timer = breakSecs
      }
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.drawSeconds === 'number' ? settings.drawSeconds : roundSecs
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
      ctx.fillText('GUESS THE DRAWING', cx, 80)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Scrivi la parola in chat', cx, 118)

      const s = Math.min(300, height * 0.4)
      const cy = height * 0.44
      ctx.strokeStyle = '#f4f4fa'
      ctx.lineWidth = Math.max(3, s * 0.05)
      const count = revealed ? drawing.strokes.length : Math.max(1, Math.floor((1 - clamp(timer / roundSecs, 0, 1)) * drawing.strokes.length))
      for (let i = 0; i < count && i < drawing.strokes.length; i++) drawing.strokes[i](ctx, cx, cy, s)

      if (showLength && !revealed) {
        ctx.fillStyle = '#f0f0f2'
        ctx.font = 'bold 24px system-ui'
        ctx.fillText('_ '.repeat(drawing.word.length).trim(), cx, height * 0.68)
      }
      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 32px system-ui'
        ctx.fillText(drawing.word, cx, height * 0.68)
        if (solver) {
          ctx.fillStyle = '#f5b14c'
          ctx.font = 'bold 24px system-ui'
          ctx.fillText(`🏆 ${solver} ha indovinato!`, cx, height * 0.74)
        }
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#17b7a8')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}


