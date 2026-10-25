import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'

// "Word Merge" — two halves of a word are shown as tile groups; viewers merge
// them by typing the complete word.

export function createWordMerge(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 45
  let breakSecs = 5
  let showBoard = true

  let word = ''
  let splitAt = 0
  let timer = 45
  let revealed = false
  let solver = ''
  const scores = newScores()

  const pick = () => {
    word = shuffled(wordsFor('find-the-word')).filter((w) => w.length >= 6)[0] ?? 'MERGE'
    splitAt = Math.floor(word.length / 2)
    timer = roundSecs
    revealed = false
    solver = ''
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
      solver = event.user.nickname
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
      ctx.fillText('WORD MERGE', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Unisci le due parti in chat', cx, 122)

      const parts = [word.slice(0, splitAt), word.slice(splitAt)]
      const tile = Math.min(64, (width - 240) / Math.max(1, word.length))
      const y = height * 0.42
      const drawPart = (part: string, startX: number) => {
        let x = startX
        part.split('').forEach((ch) => {
          ctx.fillStyle = '#1b1b21'
          ctx.beginPath()
          ctx.roundRect(x, y - tile / 2, tile, tile, 10)
          ctx.fill()
          ctx.strokeStyle = '#3ccf7a'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.fillStyle = '#ffffff'
          ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
          ctx.textBaseline = 'middle'
          ctx.fillText(ch, x + tile / 2, y + 1)
          ctx.textBaseline = 'alphabetic'
          x += tile + 8
        })
        return x
      }

      const partW = (w: string) => w.length * tile + (w.length - 1) * 8
      const totalW = partW(parts[0]) + partW(parts[1]) + 80
      let x = cx - totalW / 2
      x = drawPart(parts[0], x) + 40
      ctx.fillStyle = '#f5b14c'
      ctx.font = 'bold 40px system-ui'
      ctx.textBaseline = 'middle'
      ctx.fillText('+', x + 10, y + 1)
      ctx.textBaseline = 'alphabetic'
      drawPart(parts[1], x + 50)

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 28px system-ui'
        ctx.fillText(`${solver ? solver + ' ha unito: ' : 'La parola era: '}${word}`, cx, height * 0.62)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
