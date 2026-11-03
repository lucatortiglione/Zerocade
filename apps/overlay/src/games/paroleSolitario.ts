import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Parole Solitario" — a chain of associated words, revealed one at a time.
// Viewers guess the next word in the chain to advance.

interface Theme {
  prompt: string
  words: string[]
}

export function createParoleSolitario(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 60
  let breakSecs = 5
  let pts = 5
  let showBoard = true

  let theme: Theme = { prompt: '', words: [] }
  let step = 0
  let timer = 60
  let revealed = false
  let solver: Viewer | null = null
  const scores = newScores()

  const pick = () => {
    theme = shuffled(itemsFor<Theme>('word-association'))[0] ?? { prompt: '', words: [] }
    step = 0
    revealed = false
    timer = roundSecs
    solver = null
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 60
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 5
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const w = normalize(event.text)
      const target = theme.words[step]
      if (!target || normalize(target) !== w) return
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, pts)
      solver = event.user
      step++
      if (step >= theme.words.length) {
        revealed = true
        timer = breakSecs
      }
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
      ctx.font = 'bold 44px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(theme.prompt, cx, 90)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Trova la parola associata', cx, 128)

      // cards of the chain
      const cardW = Math.min(320, width - 240)
      const cardH = 56
      const startY = 180
      theme.words.forEach((word, i) => {
        const y = startY + i * (cardH + 14)
        const done = i < step
        const current = i === step && !revealed
        ctx.fillStyle = done ? '#22c55e' : current ? '#1b1b21' : '#2a2a33'
        ctx.beginPath()
        ctx.roundRect(cx - cardW / 2, y - cardH / 2, cardW, cardH, 12)
        ctx.fill()
        if (current) {
          ctx.strokeStyle = '#f5b14c'
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.fillStyle = done ? '#ffffff' : current ? '#f0f0f2' : '#6a6a78'
        ctx.font = 'bold 22px system-ui'
        ctx.fillText(done ? word : current ? '?' : '_'.repeat(word.length), cx, y + 8)
      })

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 26px system-ui'
        if (solver) fillTextWithAvatar(ctx, `${solver.nickname} ha completato la catena!`, cx, height * 0.78, solver)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
