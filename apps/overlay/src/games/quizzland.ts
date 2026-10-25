import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled } from './common'
import { itemsFor } from '../content'

// "Quizzland" — an intelligence quiz: riddles and logic questions with 4 answers.

interface Q {
  q: string
  options: string[]
  answer: number
}

export function createQuizzland(): GameInstance {
  let width = 0
  let height = 0
  let qSecs = 20
  let revealSecs = 8
  let breakSecs = 3
  let showBoard = true

  let bank: Q[] = []
  let order: number[] = []
  let index = 0
  let timer = 20
  let revealed = false
  let answered = new Map<string, number>()
  const scores = newScores()

  const current = () => bank[order[index]]

  const shuffle = () => {
    bank = itemsFor<Q>('quizzland')
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
      qSecs = typeof settings.questionSeconds === 'number' ? settings.questionSeconds : 20
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : 8
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 3
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
      if (pick === q.answer) addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, 10)
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
      ctx.fillText('QUIZZLAND', cx, 80)
      ctx.fillStyle = '#f0f0f2'
      ctx.font = '30px system-ui'
      wrap(ctx, q.q, cx, height * 0.28, 820, 44)

      const labels = ['A', 'B', 'C', 'D']
      q.options.forEach((opt, i) => {
        const y = height * 0.44 + i * 76
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

      if (!revealed) {
        ctx.fillStyle = '#8a8a96'
        ctx.font = '20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Scrivi A, B, C o D in chat', cx, height * 0.78)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? revealSecs : qSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ')
  let line = ''
  let ly = y
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, ly)
      line = w
      ly += lineH
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, cx, ly)
}
