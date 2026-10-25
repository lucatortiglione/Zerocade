import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Crostic" — solve the clue answers; their first letters spell a hidden phrase.
// Each correct answer reveals its first letter in the phrase.

interface Puzzle {
  phrase: string
  answers: { clue: string; word: string }[]
}

export function createCrostic(): GameInstance {
  let width = 0
  let height = 0
  let breakSecs = 8
  let perWord = 5
  let phraseBonus = 20
  let showBoard = true

  let puzzle: Puzzle = { phrase: '', answers: [] }
  let found = new Set<string>()
  let revealed = false
  let timer = breakSecs
  const scores = newScores()

  const pick = () => {
    puzzle = shuffled(itemsFor<Puzzle>('crostic'))[0] ?? { phrase: '', answers: [] }
    found = new Set()
    revealed = false
    timer = breakSecs
  }

  const allFound = () => puzzle.answers.every((a) => found.has(a.word))

  return {
    reset(settings, w, h) {
      width = w
      height = h
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 8
      perWord = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 5
      phraseBonus = typeof settings.solveBonus === 'number' ? settings.solveBonus : 20
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const w = normalize(event.text)
      const match = puzzle.answers.find((a) => !found.has(a.word) && normalize(a.word) === w)
      if (!match) return
      found.add(match.word)
      const gain = allFound() ? perWord + phraseBonus : perWord
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, gain)
      if (allFound()) {
        revealed = true
        timer = breakSecs
      }
    },
    update(dt, _now, settings) {
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) pick()
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('CROSTIC', cx, 60)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText('Risolvi gli indizi per svelare la frase', cx, 96)

      // phrase row
      const tile = Math.min(52, (width - 160) / Math.max(1, puzzle.phrase.length))
      const total = puzzle.phrase.length * tile + (puzzle.phrase.length - 1) * 8
      let px = cx - total / 2 + tile / 2
      const py = 150
      puzzle.phrase.split('').forEach((ch, i) => {
        const known = revealed || puzzle.answers.some((a, j) => j === i && found.has(a.word))
        ctx.fillStyle = known ? '#f5b14c' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(px - tile / 2, py - tile / 2, tile, tile, 8)
        ctx.fill()
        if (known) {
          ctx.fillStyle = '#ffffff'
          ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
          ctx.textBaseline = 'middle'
          ctx.fillText(ch, px, py + 1)
          ctx.textBaseline = 'alphabetic'
        }
        px += tile + 8
      })

      // clues + answer slots
      const startY = 240
      const rowH = 64
      puzzle.answers.forEach((a, i) => {
        const y = startY + i * rowH
        const isFound = found.has(a.word)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 22px system-ui'
        ctx.fillText(`${i + 1}.`, 80, y)
        ctx.fillStyle = '#f0f0f2'
        ctx.font = '20px system-ui'
        ctx.fillText(a.clue, 120, y)

        const slotW = Math.min(40, (width - 300) / Math.max(1, a.word.length))
        const wTotal = a.word.length * slotW
        const x0 = width - 140 - wTotal
        for (let j = 0; j < a.word.length; j++) {
          const x = x0 + j * slotW
          ctx.fillStyle = isFound ? '#3ccf7a' : revealed ? '#ff5c5c' : '#2a2a33'
          ctx.beginPath()
          ctx.roundRect(x, y - slotW / 2, slotW - 2, slotW - 2, 4)
          ctx.fill()
          if (isFound || revealed) {
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 20px system-ui'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(a.word[j], x + slotW / 2 - 1, y + 1)
            ctx.textBaseline = 'alphabetic'
            ctx.textAlign = 'left'
          }
        }
      })

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 28px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`La frase era: ${puzzle.phrase}`, cx, height - 70)
      }

      if (revealed) drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
