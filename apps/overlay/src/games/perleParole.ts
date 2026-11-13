import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'
import { roundCheer } from '../audio'

// "Perle Parole" — the letters are beads arranged in a circle; the word is read
// clockwise starting from an unknown bead. Viewers type the word.

export function createPerleParole(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 45
  let breakSecs = 5
  let showBoard = true

  let word = ''
  let rotation = 0
  let timer = 45
  let revealed = false
  let solver: Viewer | null = null
  const scores = newScores()

  const pick = () => {
    word = shuffled(wordsFor('find-the-word')).filter((w) => w.length >= 4)[0] ?? 'PERLE'
    rotation = Math.floor(Math.random() * word.length)
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
      roundCheer()
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
          roundCheer()
          timer = breakSecs
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height * 0.42
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('PERLE PAROLE', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Trova la parola nelle perle', cx, 122)

      const n = word.length
      const R = Math.min(width * 0.3, 160)
      const bead = Math.min(52, R * 0.7)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * ((2 * Math.PI) / n)
        const x = cx + Math.cos(a) * R
        const y = cy + Math.sin(a) * R
        ctx.fillStyle = '#1b1b21'
        ctx.beginPath()
        ctx.arc(x, y, bead / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.round(bead * 0.55)}px system-ui`
        ctx.textBaseline = 'middle'
        ctx.fillText(word[(i + rotation) % n], x, y + 1)
        ctx.textBaseline = 'alphabetic'
      }

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 28px system-ui'
        if (solver) fillTextWithAvatar(ctx, `${solver.nickname} ha indovinato: ${word}`, cx, height * 0.72, solver)
        else ctx.fillText(`La parola era: ${word}`, cx, height * 0.72)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
