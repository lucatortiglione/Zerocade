import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Word Association" — a prompt is shown and several connected words are hidden.
// Viewers type any connected word in chat; the first solver of each slot scores.

interface Theme {
  prompt: string
  words: string[]
}
export function createWordAssociation(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 60
  let breakSecs = 5
  let pts = 1
  let speedBonus = true
  let comboEnabled = true
  let drip = true
  let showBoard = true

  let theme: Theme = { prompt: '', words: [] }
  let found = new Set<string>()
  let revealed = false
  let timer = 60
  let flash = 0
  let last = { name: '', pts: 0, avatar: undefined as string | undefined, word: '' }
  const scores = newScores()
  const combos = new Map<string, number>()

  const allFound = () => theme.words.every((w) => found.has(w))

  const pick = () => {
    theme = shuffled(itemsFor<Theme>('word-association'))[0] ?? { prompt: '', words: [] }
    found = new Set()
    revealed = false
    timer = roundSecs
    flash = 0
    combos.clear()
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 60
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 1
      speedBonus = settings.speedBonusEnabled !== false
      comboEnabled = settings.comboEnabled !== false
      drip = settings.dripRevealEnabled !== false
      showBoard = settings.showSessionLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_letter') return
      if (event.type !== 'comment' || revealed) return
      const w = normalize(event.text)
      const match = theme.words.find((word) => !found.has(word) && normalize(word) === w)
      if (!match) return
      found.add(match)
      let gain = pts
      if (speedBonus) gain += Math.round((timer / roundSecs) * 2)
      if (comboEnabled) {
        combos.set(event.user.id, (combos.get(event.user.id) ?? 0) + 1)
        gain += combos.get(event.user.id)! - 1
      }
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, gain)
      flash = 2
      last = { name: event.user.nickname, pts: gain, avatar: event.user.avatar, word: match }
      if (allFound()) {
        revealed = true
        timer = breakSecs
      }
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : roundSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : pts
      if (flash > 0) flash -= dt
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
      ctx.fillText('Scrivi una parola collegata in chat', cx, 128)

      const cols = 2
      const cellW = Math.min(340, (width - 200) / cols)
      const cellH = 54
      const startY = height * 0.3
      theme.words.forEach((word, i) => {
        const gx = i % cols
        const gy = Math.floor(i / cols)
        const x = cx - (cols * cellW + (cols - 1) * 20) / 2 + gx * (cellW + 20) + cellW / 2
        const y = startY + gy * (cellH + 14)
        const isFound = found.has(word)
        const letterCount = isFound || revealed ? word.length : drip ? Math.min(1 + Math.floor((roundSecs - timer) / 10), word.length) : 0
        ctx.fillStyle = isFound ? '#22c55e' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(x - cellW / 2, y - cellH / 2, cellW, cellH, 12)
        ctx.fill()
        if (isFound) {
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 22px system-ui'
          ctx.fillText(word, x, y + 8)
        } else {
          const shown = revealed ? word : word.slice(0, letterCount)
          const hidden = word.length - (revealed ? 0 : letterCount)
          ctx.fillStyle = '#f0f0f2'
          ctx.font = 'bold 22px system-ui'
          ctx.fillText(shown + '_'.repeat(hidden), x, y + 8)
        }
      })

      if (flash > 0 && last.name) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 26px system-ui'
        ctx.fillText(`${last.name} +${last.pts} — ${last.word}`, cx, height * 0.7)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}

