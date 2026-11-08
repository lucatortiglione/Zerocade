import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Associations" — a prompt word is shown and viewers type associated words.
// Every hidden word found is revealed and scores points.

interface Theme {
  prompt: string
  words: string[]
}

export function createAssociations(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 60
  let breakSecs = 5
  let pts = 1
  let showBoard = true

  let theme: Theme = { prompt: '', words: [] }
  let found = new Set<string>()
  let timer = 60
  let revealed = false
  const scores = newScores()

  const pick = () => {
    theme = shuffled(itemsFor<Theme>('association-themes'))[0] ?? { prompt: '', words: [] }
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
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 1
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const w = normalize(event.text)
      const match = theme.words.find((word) => !found.has(word) && normalize(word) === w)
      if (!match) return
      found.add(match)
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, pts)
      if (theme.words.every((word) => found.has(word))) {
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
      ctx.fillText('Scrivi una parola associata in chat', cx, 128)

      const cols = 2
      const cellW = Math.min(340, (width - 200) / cols)
      const cellH = 54
      theme.words.forEach((word, i) => {
        const gx = i % cols
        const gy = Math.floor(i / cols)
        const x = cx - (cols * cellW + 20) / 2 + gx * (cellW + 20) + cellW / 2
        const y = height * 0.3 + gy * (cellH + 14)
        const isFound = found.has(word)
        ctx.fillStyle = isFound ? '#22c55e' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(x - cellW / 2, y - cellH / 2, cellW, cellH, 12)
        ctx.fill()
        ctx.fillStyle = isFound ? '#ffffff' : '#8a8a96'
        ctx.font = 'bold 20px system-ui'
        ctx.fillText(isFound ? word : '_'.repeat(word.length), x, y + 7)
      })

      ctx.fillStyle = '#f5b14c'
      ctx.font = 'bold 22px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${found.size}/${theme.words.length} trovate`, cx, height * 0.72)

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#3258d4')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
