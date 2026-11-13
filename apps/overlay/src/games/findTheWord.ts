import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'
import { roundCheer } from '../audio'

// "Find the Word" — the visible prefix of a hidden word grows as viewers guess.
// Guessing the next letter advances the word; guessing the full word solves it.
// The word bank is loaded from the server's SQLite-backed content store.

export function createFindTheWord(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 24
  let breakSecs = 3
  let perLetter = 1
  let fullBonus = 5
  let showBoard = true

  let word = ''
  let revealed = 0
  let timer = 24
  let done = false
  let solver: Viewer | null = null
  const scores = newScores()

  const pick = () => {
    word = shuffled(wordsFor('find-the-word'))[0] ?? ''
    revealed = 1
    timer = roundSecs
    done = false
    solver = null
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 24
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 3
      perLetter = typeof settings.basePointsPerLetter === 'number' ? settings.basePointsPerLetter : 1
      fullBonus = typeof settings.fullMatchBonus === 'number' ? settings.fullMatchBonus : 5
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_letter') {
        if (!done && revealed < word.length) revealed++
        return
      }
      if (event.type !== 'comment' || done) return
      const text = normalize(event.text)
      if (text === word) {
        done = true
        roundCheer()
        solver = event.user
        timer = breakSecs
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, fullBonus + (word.length - revealed) * perLetter)
        return
      }
      if (text.length === 1 && text === word[revealed]) {
        revealed++
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, perLetter)
        if (revealed >= word.length) {
          done = true
          roundCheer()
          timer = breakSecs
        }
      }
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : roundSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      timer -= dt
      if (timer <= 0) {
        if (done) pick()
        else {
          done = true
          roundCheer()
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
      if (done && solver) fillTextWithAvatar(ctx, `${solver.nickname} ha vinto!`, cx, 84, solver)
      else ctx.fillText(done ? 'La parola era:' : 'FIND THE WORD', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Indovina la parola scrivendo in chat', cx, 122)

      const tile = Math.min(72, (width - 160) / word.length)
      const gap = 10
      const total = word.length * tile + (word.length - 1) * gap
      let x = cx - total / 2 + tile / 2
      const y = height * 0.4
      for (let i = 0; i < word.length; i++) {
        const shown = i < revealed || done
        ctx.fillStyle = shown ? '#3ccf7a' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(x - tile / 2, y - tile / 2, tile, tile, 10)
        ctx.fill()
        if (shown) {
          ctx.fillStyle = '#ffffff'
          ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
          ctx.textBaseline = 'middle'
          ctx.fillText(word[i], x, y + 1)
          ctx.textBaseline = 'alphabetic'
        }
        x += tile + gap
      }

      ctx.fillStyle = '#f0f0f2'
      ctx.font = '20px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(done ? word : `${revealed}/${word.length} lettere rivelate`, cx, height * 0.55)

      drawTimerBar(ctx, width, height, Math.max(0, timer / (done ? breakSecs : roundSecs)), done ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
