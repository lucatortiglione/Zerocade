import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Top 7" — one theme, seven answers. Viewers guess the seven hidden answers.

interface Prompt {
  prompt: string
  answers: string[]
}

export function createTop7(): GameInstance {
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
    prompt = shuffled(itemsFor<Prompt>('top-7'))[0] ?? { prompt: '', answers: [] }
    found = new Set()
    revealed = false
    timer = roundSecs
  }

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
      const match = prompt.answers.find((a) => !found.has(a) && normalize(a) === w)
      if (!match) return
      found.add(match)
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, 10)
      if (prompt.answers.every((a) => found.has(a))) {
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
      ctx.fillText(prompt.prompt, cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Trova le 7 risposte', cx, 122)

      const cellW = Math.min(420, width - 160)
      const cellH = 44
      const startY = 160
      prompt.answers.forEach((a, i) => {
        const y = startY + i * (cellH + 10)
        const isFound = found.has(a)
        ctx.fillStyle = isFound ? '#22c55e' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - cellW / 2, y - cellH / 2, cellW, cellH, 10)
        ctx.fill()
        ctx.fillStyle = isFound ? '#ffffff' : '#8a8a96'
        ctx.font = '20px system-ui'
        ctx.fillText(`${i + 1}. ${isFound ? a : '_'.repeat(a.length)}`, cx - cellW / 2 + 20, y + 7)
      })

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
