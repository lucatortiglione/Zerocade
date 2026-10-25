import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled } from './common'
import { itemsFor } from '../content'

// "Million Quiz" — a Who-Wants-To-Be-A-Millionaire style game. The crowd votes
// A/B/C/D and the majority answer is locked in. Correct answers climb the prize
// ladder; a wrong answer drops back to the last safe milestone.

interface Q {
  q: string
  options: string[]
  answer: number
  difficulty: 1 | 2 | 3
}

// Questions are loaded from the server's SQLite-backed content store.
const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000]
const SAFE = [4, 9, 14]

const UNIT_SYMBOL: Record<string, string> = {
  dollar: '$', euro: '€', pound: '£', lei: 'lei', lira: '₺', ruble: '₽', real: 'R$', coin: '🪙', points: 'pt',
}
export function createMillionQuiz(): GameInstance {
  let width = 0
  let height = 0
  let voteSecs = 30
  let finaleSecs = 20
  let restartSecs = 5
  let prizeUnit = 'points'
  let fiftyMax = 3
  let skipMax = 3
  let showBoard = true
  let bank: Q[] = []

  let level = 0
  let question: Q = { q: '', options: [], answer: 0, difficulty: 1 }
  let timer = 30
  let phase: 'voting' | 'locked' | 'finale' | 'break' = 'voting'
  let removed: number[] = []
  let votes = new Map<string, number>()
  const voters = new Map<string, { name: string; avatar?: string }>()
  let outcome: 'correct' | 'wrong' = 'correct'
  let majority = 0
  let fifties = 0
  let skips = 0
  let wonPrize = 0
  const scores = newScores()

  const pickQuestion = () => {
    bank = itemsFor<Q>('million-quiz')
    const diff: 1 | 2 | 3 = level <= 4 ? 1 : level <= 9 ? 2 : 3
    const pool = bank.filter((q) => q.difficulty === diff)
    question = shuffled(pool)[0] ?? { q: '', options: [], answer: 0, difficulty: 1 }
  }

  const resetVotes = () => {
    votes = new Map()
    voters.clear()
    removed = []
    majority = 0
  }

  const newGame = () => {
    level = 0
    fifties = 0
    skips = 0
    wonPrize = 0
    resetVotes()
    pickQuestion()
    phase = 'voting'
    timer = voteSecs
  }

  const lastSafe = () => {
    let prize = 0
    for (const s of SAFE) if (s < level) prize = LADDER[s]
    return prize
  }

  const lock = () => {
    const counts = [0, 0, 0, 0]
    for (const v of votes.values()) counts[v]++
    majority = counts.indexOf(Math.max(...counts))
    outcome = majority === question.answer ? 'correct' : 'wrong'
    if (outcome === 'correct') {
      for (const [id, v] of votes) {
        if (v === question.answer) {
          const user = voters.get(id)
          addPoints(scores, id, user?.name ?? id, user?.avatar, (level + 1) * 10)
        }
      }
      wonPrize = LADDER[level]
      phase = 'locked'
      timer = 8
    } else {
      wonPrize = lastSafe()
      phase = 'finale'
      timer = finaleSecs
    }
  }

  const fmt = (n: number) => `${UNIT_SYMBOL[prizeUnit] ?? ''}${n.toLocaleString('it-IT')}`

  return {
    reset(settings, w, h) {
      width = w
      height = h
      voteSecs = typeof settings.votingDuration === 'number' ? settings.votingDuration : 30
      finaleSecs = typeof settings.finaleDuration === 'number' ? settings.finaleDuration : 20
      restartSecs = typeof settings.restartDelay === 'number' ? settings.restartDelay : 5
      prizeUnit = typeof settings.prizeUnit === 'string' ? settings.prizeUnit : 'points'
      fiftyMax = typeof settings.fiftyMaxPerGame === 'number' ? settings.fiftyMaxPerGame : 3
      skipMax = typeof settings.skipMaxPerGame === 'number' ? settings.skipMaxPerGame : 3
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      newGame()
    },
    onAction(action, event) {
      if (action === 'fifty_fifty') {
        if (phase === 'voting' && !removed.length && fifties < fiftyMax) {
          fifties++
          const wrong = question.options.map((_, i) => i).filter((i) => i !== question.answer)
          removed = shuffled(wrong).slice(0, 2)
        }
        return
      }
      if (action === 'skip_question') {
        if (phase === 'voting' && skips < skipMax) {
          skips++
          level = Math.min(LADDER.length - 1, level + 1)
          resetVotes()
          pickQuestion()
          timer = voteSecs
        }
        return
      }
      if (event.type !== 'comment' || phase !== 'voting') return
      const ch = event.text.trim().toUpperCase().charAt(0)
      const letters = 'ABCD'.indexOf(ch)
      const digits = '1234'.indexOf(ch)
      const pick = letters >= 0 ? letters : digits
      if (pick < 0 || pick >= question.options.length) return
      if (removed.includes(pick)) return
      if (votes.has(event.user.id)) return
      votes.set(event.user.id, pick)
      voters.set(event.user.id, { name: event.user.nickname, avatar: event.user.avatar })
    },
    update(dt, _now, settings) {
      voteSecs = typeof settings.votingDuration === 'number' ? settings.votingDuration : voteSecs
      finaleSecs = typeof settings.finaleDuration === 'number' ? settings.finaleDuration : finaleSecs
      restartSecs = typeof settings.restartDelay === 'number' ? settings.restartDelay : restartSecs
      timer -= dt
      if (timer <= 0) {
        if (phase === 'voting') {
          lock()
        } else if (phase === 'locked') {
          level++
          if (level >= LADDER.length) {
            wonPrize = LADDER[LADDER.length - 1]
            phase = 'finale'
            timer = finaleSecs
          } else {
            resetVotes()
            pickQuestion()
            phase = 'voting'
            timer = voteSecs
          }
        } else if (phase === 'finale') {
          phase = 'break'
          timer = restartSecs
        } else {
          newGame()
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.textAlign = 'right'
      for (let i = LADDER.length - 1; i >= 0; i--) {
        const y = 40 + (LADDER.length - 1 - i) * 34
        ctx.fillStyle = i === level && phase !== 'finale' ? '#f5b14c' : SAFE.includes(i) ? '#ffffff' : '#6a6a78'
        ctx.font = i === level ? 'bold 18px system-ui' : '16px system-ui'
        ctx.fillText(`${i + 1}. ${fmt(LADDER[i])}`, 200, y)
      }

      if (phase === 'finale' || phase === 'break') {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 44px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(outcome === 'wrong' ? 'GAME OVER' : '🎉 VITTORIA!', cx, height * 0.4)
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 32px system-ui'
        ctx.fillText(`Premio vinto: ${fmt(wonPrize)}`, cx, height * 0.5)
      } else {
        const q = question
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 30px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`Livello ${level + 1} — ${fmt(LADDER[level])}`, cx, 70)
        ctx.font = 'bold 32px system-ui'
        ctx.fillText(q.q, cx, height * 0.3)

        const labels = ['A', 'B', 'C', 'D']
        const counts = [0, 0, 0, 0]
        for (const v of votes.values()) counts[v]++
        q.options.forEach((opt, i) => {
          const y = height * 0.4 + i * 72
          const isRemoved = removed.includes(i)
          const isAnswer = phase === 'locked' && i === q.answer
          ctx.fillStyle = isAnswer ? '#3ccf7a' : isRemoved ? '#3a3a44' : '#1b1b21'
          ctx.beginPath()
          ctx.roundRect(cx - 320, y - 28, 640, 56, 12)
          ctx.fill()
          ctx.fillStyle = isAnswer ? '#ffffff' : isRemoved ? '#7a7a86' : '#f0f0f2'
          ctx.font = '24px system-ui'
          ctx.textAlign = 'left'
          ctx.fillText(`${labels[i]}. ${isRemoved ? '———' : opt}`, cx - 300, y + 9)
          ctx.textAlign = 'right'
          ctx.fillText(`${counts[i]} voti`, cx + 300, y + 9)
        })

        if (phase === 'locked') {
          ctx.fillStyle = outcome === 'correct' ? '#3ccf7a' : '#ff5c5c'
          ctx.font = 'bold 28px system-ui'
          ctx.textAlign = 'center'
          ctx.fillText(outcome === 'correct' ? 'Risposta esatta!' : 'Risposta sbagliata!', cx, height * 0.76)
        } else {
          ctx.fillStyle = '#8a8a96'
          ctx.font = '20px system-ui'
          ctx.textAlign = 'center'
          ctx.fillText('Vota A, B, C o D in chat', cx, height * 0.76)
        }
        drawTimerBar(ctx, width, height, Math.max(0, timer / voteSecs), '#f6c945')
      }

      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },

  }
}

