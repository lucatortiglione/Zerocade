import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled } from './common'
import { itemsFor } from '../content'

// "Quiz Blitz" — rapid-fire quiz with a short timer and a speed bonus.

interface Q {
  q: string
  options: string[]
  answer: number
}

export function createQuizBlitz(): GameInstance {
  let width = 0
  let height = 0
  let qSecs = 10
  let revealSecs = 5
  let breakSecs = 2
  let pts = 10
  let showBoard = true

  let bank: Q[] = []
  let order: number[] = []
  let index = 0
  let timer = 10
  let revealed = false
  let answered = new Map<string, number>()
  const scores = newScores()

  const current = () => bank[order[index]]

  const shuffle = () => {
    bank = itemsFor<Q>('trivia-time')
    order = shuffled(bank.map((_, i) => i))
    index = 0
    timer = qSecs
    revealed = false
    answered = new Map()
  }

  const next = () => {
    index++
    if (index >= order.length) {
      shuffle()
      return
    }
    timer = qSecs
    revealed = false
    answered = new Map()
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      qSecs = typeof settings.questionSeconds === 'number' ? settings.questionSeconds : 10
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : 5
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 2
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 10
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      shuffle()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const q = current()
      const ch = event.text.trim().toUpperCase().charAt(0)
      const letters = 'ABCD'.indexOf(ch)
      const digits = '1234'.indexOf(ch)
      const pick = letters >= 0 ? letters : digits
      if (pick < 0 || pick >= q.options.length) return
      if (answered.has(event.user.id)) return
      answered.set(event.user.id, pick)
      if (pick === q.answer) {
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, Math.round((timer / qSecs) * pts) + pts)
      }
    },
    update(dt, _now, settings) {
      qSecs = typeof settings.questionSeconds === 'number' ? settings.questionSeconds : qSecs
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : revealSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      timer -= dt
      if (timer <= 0) {
        if (revealed) next()
        else {
          revealed = true
          timer = revealSecs
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const q = current()
      if (!q) return
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(q.q, cx, height * 0.24)

      const labels = ['A', 'B', 'C', 'D']
      q.options.forEach((opt, i) => {
        const y = height * 0.32 + i * 78
        const isAnswer = revealed && i === q.answer
        ctx.fillStyle = isAnswer ? '#3ccf7a' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - 340, y - 28, 680, 56, 12)
        ctx.fill()
        ctx.fillStyle = isAnswer ? '#ffffff' : '#f0f0f2'
        ctx.font = '24px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(`${labels[i]}. ${opt}`, cx - 320, y + 9)
      })

      if (revealed) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 26px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`Risposta: ${labels[q.answer]}`, cx, height * 0.72)
      } else {
        ctx.fillStyle = '#8a8a96'
        ctx.font = '20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Rispondi in fretta: A, B, C o D', cx, height * 0.72)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? revealSecs : qSecs)), revealed ? '#3ccf7a' : '#ff5c5c')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
