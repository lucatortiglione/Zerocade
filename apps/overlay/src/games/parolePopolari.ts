import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Parole Popolari" — a prompt is shown and viewers guess the most popular
// answers; each answer is worth its popularity score.

interface Answer {
  text: string
  score: number
}

interface Prompt {
  prompt: string
  answers: Answer[]
}

export function createParolePopolari(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 60
  let breakSecs = 5
  let showBoard = true

  let prompt: Prompt = { prompt: '', answers: [] }
  let found = new Set<string>()
  let timer = 60
  let revealed = false
  const scores = newScores()

  const pick = () => {
    prompt = shuffled(itemsFor<Prompt>('parole-popolari'))[0] ?? { prompt: '', answers: [] }
    found = new Set()
    revealed = false
    timer = roundSecs
  }

  const top = prompt.answers.slice().sort((a, b) => b.score - a.score)

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 60
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const w = normalize(event.text)
      const match = prompt.answers.find((a) => !found.has(a.text) && normalize(a.text) === w)
      if (!match) return
      found.add(match.text)
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, match.score)
      if (prompt.answers.every((a) => found.has(a.text))) {
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
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(prompt.prompt, cx, 80)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText('Scrivi le risposte più popolari', cx, 116)

      const cellW = Math.min(420, width - 160)
      const cellH = 46
      const startY = 160
      top.forEach((a, i) => {
        const y = startY + i * (cellH + 10)
        const isFound = found.has(a.text)
        ctx.fillStyle = isFound ? '#22c55e' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - cellW / 2, y - cellH / 2, cellW, cellH, 10)
        ctx.fill()
        ctx.fillStyle = isFound ? '#ffffff' : '#8a8a96'
        ctx.font = '20px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(`${i + 1}. ${isFound ? a.text : '_'.repeat(a.text.length)}`, cx - cellW / 2 + 20, y + 7)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#f5b14c'
        ctx.fillText(isFound ? `${a.score} pt` : '', cx + cellW / 2 - 20, y + 7)
      })

      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${found.size}/${prompt.answers.length} trovate`, cx, height - 90)

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
