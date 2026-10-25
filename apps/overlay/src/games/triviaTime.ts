import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled } from './common'

// "Trivia Time" — four-answer quiz with leaderboard, speed bonus and a 50/50 help.

interface Q {
  q: string
  options: string[]
  answer: number
}

const QUESTIONS: Q[] = [
  { q: 'Quante zampe ha un ragno?', options: ['6', '8', '10', '12'], answer: 1 },
  { q: 'Quale pianeta è detto Pianeta Rosso?', options: ['Venere', 'Giove', 'Marte', 'Saturno'], answer: 2 },
  { q: 'Qual è la capitale d’Italia?', options: ['Milano', 'Roma', 'Napoli', 'Torino'], answer: 1 },
  { q: 'Quanti continenti ci sono?', options: ['5', '6', '7', '8'], answer: 2 },
  { q: 'Blu mescolato al giallo forma…', options: ['Verde', 'Viola', 'Arancione', 'Marrone'], answer: 0 },
  { q: 'Qual è l’animale più grande?', options: ['Elefante', 'Balena azzurra', 'Giraffa', 'Squalo'], answer: 1 },
  { q: 'Quanto fa 12 × 8?', options: ['84', '96', '104', '88'], answer: 1 },
  { q: 'Chi ha dipinto la Gioconda?', options: ['Van Gogh', 'Picasso', 'Da Vinci', 'Rembrandt'], answer: 2 },
  { q: 'Quale animale è il re della savana?', options: ['Tigre', 'Leone', 'Ghepardo', 'Iena'], answer: 1 },
  { q: 'Quanti minuti ci sono in un’ora?', options: ['30', '60', '90', '120'], answer: 1 },
  { q: 'Quale frutto è noto per la vitamina C?', options: ['Mela', 'Banana', 'Arancia', 'Pera'], answer: 2 },
  { q: 'Quale strumento ha 88 tasti?', options: ['Chitarra', 'Violino', 'Pianoforte', 'Flauto'], answer: 2 },
  { q: 'Qual è il fiume più lungo del mondo?', options: ['Nilo', 'Rio delle Amazzoni', 'Mississippi', 'Po'], answer: 1 },
  { q: 'Quante settimane ci sono in un anno?', options: ['48', '50', '52', '54'], answer: 2 },
  { q: 'Quale gas respiriamo?', options: ['Anidride carbonica', 'Ossigeno', 'Idrogeno', 'Elio'], answer: 1 },
  { q: 'Qual è la valuta dell’Italia?', options: ['Lira', 'Euro', 'Dollaro', 'Sterlina'], answer: 1 },
  { q: 'Quanti lati ha un esagono?', options: ['5', '6', '7', '8'], answer: 1 },
  { q: 'Quale animale produce il miele?', options: ['Vespa', 'Ape', 'Mosca', 'Farfalla'], answer: 1 },
  { q: 'In quale stagione cadono le foglie?', options: ['Primavera', 'Estate', 'Autunno', 'Inverno'], answer: 2 },
  { q: 'Qual è l’oceano più grande?', options: ['Atlantico', 'Indiano', 'Pacifico', 'Artico'], answer: 2 },
]
export function createTriviaTime(): GameInstance {
  let width = 0
  let height = 0
  let qSecs = 20
  let revealSecs = 8
  let breakSecs = 3
  let pts = 10
  let speedBonus = true
  let showBoard = true
  let showVotes = true

  let order: number[] = []
  let index = 0
  let timer = 20
  let revealed = false
  let removed: number[] = []
  let answers = new Map<string, number>()
  const scores = newScores()

  const current = () => QUESTIONS[order[index]]

  const shuffle = () => {
    order = shuffled(QUESTIONS.map((_, i) => i))
    index = 0
    timer = qSecs
    revealed = false
    removed = []
    answers = new Map()
  }

  const next = () => {
    index++
    if (index >= order.length) {
      shuffle()
      return
    }
    timer = qSecs
    revealed = false
    removed = []
    answers = new Map()
  }

  const fiftyFifty = () => {
    const q = current()
    if (revealed || removed.length) return
    const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer)
    removed = shuffled(wrong).slice(0, 2)
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      qSecs = typeof settings.questionSeconds === 'number' ? settings.questionSeconds : 20
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : 8
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 3
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 10
      speedBonus = settings.speedBonus !== false
      showBoard = settings.showLeaderboard !== false
      showVotes = settings.showVoteCounts !== false
      scores.clear()
      shuffle()
    },
    onAction(action, event) {
      if (action === 'skip_question') {
        if (!revealed) {
          revealed = true
          timer = breakSecs
        }
        return
      }
      if (action === 'fifty_fifty') {
        fiftyFifty()
        return
      }
      if (event.type !== 'comment' || revealed) return
      const q = current()
      const ch = event.text.trim().toUpperCase().charAt(0)
      const letters = 'ABCD'.indexOf(ch)
      const digits = '1234'.indexOf(ch)
      const pick = letters >= 0 ? letters : digits
      if (pick < 0 || pick >= q.options.length) return
      if (answers.has(event.user.id)) return
      answers.set(event.user.id, pick)
      if (pick === q.answer) {
        const bonus = speedBonus ? Math.round((timer / qSecs) * pts) : pts
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, bonus)
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
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(q.q, cx, height * 0.26)

      const labels = ['A', 'B', 'C', 'D']
      const count = (i: number) => [...answers.values()].filter((v) => v === i).length
      q.options.forEach((opt, i) => {
        const y = height * 0.34 + i * 82
        const isAnswer = revealed && i === q.answer
        const isRemoved = removed.includes(i)
        ctx.fillStyle = isAnswer ? '#3ccf7a' : isRemoved ? '#3a3a44' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - 340, y - 30, 680, 60, 14)
        ctx.fill()
        ctx.fillStyle = isAnswer ? '#ffffff' : isRemoved ? '#7a7a86' : '#f0f0f2'
        ctx.font = '26px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(`${labels[i]}. ${isRemoved ? '———' : opt}`, cx - 320, y + 9)
        if (showVotes && !isRemoved) {
          ctx.textAlign = 'right'
          ctx.font = '20px system-ui'
          ctx.fillStyle = '#8a8a96'
          ctx.fillText(`${count(i)} voti`, cx + 320, y + 9)
        }
      })

      if (revealed) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 30px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`Risposta corretta: ${labels[q.answer]}`, cx, height * 0.72)
      } else {
        ctx.fillStyle = '#8a8a96'
        ctx.font = '22px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Scrivi A, B, C o D in chat', cx, height * 0.72)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? revealSecs : qSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}

