import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard } from './common'
import { roundCheer } from '../audio'

interface Q {
  q: string
  options: string[]
  answer: number
}

const QUESTIONS: Q[] = [
  { q: 'How many legs does a spider have?', options: ['6', '8', '10', '12'], answer: 1 },
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Jupiter', 'Mars', 'Saturn'], answer: 2 },
  { q: 'What is the capital of Italy?', options: ['Milan', 'Rome', 'Naples', 'Turin'], answer: 1 },
  { q: 'How many continents are there?', options: ['5', '6', '7', '8'], answer: 2 },
  { q: 'Blue mixed with yellow makes…', options: ['Green', 'Purple', 'Orange', 'Brown'], answer: 0 },
  { q: 'Which is the largest animal?', options: ['Elephant', 'Blue Whale', 'Giraffe', 'Shark'], answer: 1 },
  { q: 'What is 12 × 8?', options: ['84', '96', '104', '88'], answer: 1 },
  { q: 'Who painted the Mona Lisa?', options: ['Van Gogh', 'Picasso', 'Da Vinci', 'Rembrandt'], answer: 2 },
]

export function createTrivia(): GameInstance {
  let width = 0
  let height = 0
  let seconds = 20
  let count = 5
  let order: number[] = []
  let index = 0
  let timer = 20
  let revealed = false
  let answered: string[] = []
  const scores = new Map<string, { name: string; pts: number; avatar?: string }>()

  const current = () => QUESTIONS[order[index]]

  const shuffle = () => {
    order = QUESTIONS.map((_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, count)
    index = 0
    answered = []
    revealed = false
    timer = seconds
  }

  const next = () => {
    answered = []
    revealed = false
    index++
    if (index >= order.length) shuffle()
    else timer = seconds
  }


  return {
    reset(settings, w, h) {
      width = w
      height = h
      seconds = typeof settings.seconds === 'number' ? settings.seconds : 20
      count = typeof settings.questions === 'number' ? settings.questions : 5
      scores.clear()
      shuffle()
    },
    onAction(action, event) {
      if (action === 'skip') {
        next()
        return
      }
      if (event.type !== 'comment' || revealed) return
      const q = current()
      const ch = event.text.trim().toUpperCase().charAt(0)
      const letters = 'ABCD'.indexOf(ch)
      const digits = '1234'.indexOf(ch)
      const pick = letters >= 0 ? letters : digits
      if (pick < 0 || pick >= q.options.length) return
      if (answered.includes(event.user.id)) return
      answered.push(event.user.id)
      if (pick === q.answer) {
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, 1)
      }
    },
    update(dt, _now, settings) {
      seconds = typeof settings.seconds === 'number' ? settings.seconds : seconds
      count = typeof settings.questions === 'number' ? settings.questions : count
      timer -= dt
      if (timer <= 0) {
        if (revealed) next()
        else {
          revealed = true
          roundCheer()
          timer = 3
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const q = current()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(q.q, cx, height * 0.3)

      const labels = ['A', 'B', 'C', 'D']
      q.options.forEach((opt, i) => {
        const y = height * 0.42 + i * 90
        const isAnswer = revealed && i === q.answer
        ctx.fillStyle = isAnswer ? '#3ccf7a' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - 320, y - 32, 640, 64, 14)
        ctx.fill()
        ctx.fillStyle = isAnswer ? '#ffffff' : '#f0f0f2'
        ctx.font = '28px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(`${labels[i]}. ${opt}`, cx - 300, y + 10)
      })

      const frac = Math.max(0, timer / (revealed ? 3 : seconds))
      ctx.fillStyle = '#00000055'
      ctx.fillRect(40, height - 60, width - 80, 14)
      ctx.fillStyle = revealed ? '#3ccf7a' : '#f5b14c'
      ctx.fillRect(40, height - 60, (width - 80) * frac, 14)

      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(revealed ? 'Correct answer highlighted!' : 'Type A, B, C or D in chat', cx, height - 80)

      drawLeaderboard(ctx, scores)
    },
  }
}