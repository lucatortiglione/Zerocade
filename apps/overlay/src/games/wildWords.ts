import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'

// "Wild Words" — a word with one hidden letter (a wildcard). Viewers type the
// complete word to solve it.

export function createWildWords(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 45
  let breakSecs = 5
  let showBoard = true

  let word = ''
  let hiddenIdx = 0
  let timer = 45
  let revealed = false
  let solver: Viewer | null = null
  const scores = newScores()

  const pick = () => {
    word = shuffled(wordsFor('find-the-word')).filter((w) => w.length >= 5)[0] ?? 'GATTO'
    hiddenIdx = Math.floor(Math.random() * word.length)
    timer = roundSecs
    revealed = false
    solver = null
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 45
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      if (normalize(event.text) !== normalize(word)) return
      revealed = true
      solver = event.user
      timer = breakSecs
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, word.length)
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : roundSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      timer -= dt
      if (timer <= 0) {
        if (revealed) pick()
        else {
          revealed = true
          timer = breakSecs
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('WILD WORDS', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Completa la parola mancante', cx, 122)

      const tile = Math.min(70, (width - 160) / Math.max(1, word.length))
      const total = word.length * tile + (word.length - 1) * 10
      let x = cx - total / 2 + tile / 2
      const y = height * 0.42
      word.split('').forEach((ch, i) => {
        const isHidden = i === hiddenIdx && !revealed
        ctx.fillStyle = isHidden ? '#3a2a0a' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(x - tile / 2, y - tile / 2, tile, tile, 10)
        ctx.fill()
        ctx.strokeStyle = isHidden ? '#f5b14c' : '#4cc3ff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
        ctx.textBaseline = 'middle'
        ctx.fillText(isHidden ? '?' : ch, x, y + 1)
        ctx.textBaseline = 'alphabetic'
        x += tile + 10
      })

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 28px system-ui'
        if (solver) fillTextWithAvatar(ctx, `${solver.nickname} ha indovinato: ${word}`, cx, height * 0.62, solver)
        else ctx.fillText(`La parola era: ${word}`, cx, height * 0.62)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
