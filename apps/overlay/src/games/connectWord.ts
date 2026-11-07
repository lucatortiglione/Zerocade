import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'

// "Connect Word" — a grid of letters with hidden words. Viewers type the words
// they can spot (horizontal / vertical). No word list is shown.

interface Cell {
  r: number
  c: number
}

interface Placed {
  word: string
  cells: Cell[]
}

const DIRS: [number, number][] = [[0, 1], [1, 0]]

export function createConnectWord(): GameInstance {
  let width = 0
  let height = 0
  let size = 9
  let breakSecs = 8
  let showBoard = true

  let grid: string[][] = []
  let placed: Placed[] = []
  let found = new Set<string>()
  let timer = 60
  let revealed = false
  let last = ''
  const scores = newScores()

  const board = () => {
    const letters = 'ABCDEFGHILMNOPQRSTUVZ'
    grid = Array.from({ length: size }, () => Array.from({ length: size }, () => letters[Math.floor(Math.random() * letters.length)]))
    placed = []
    const pool = shuffled(wordsFor('word-hunt')).filter((w) => w.length >= 3 && w.length <= size - 2)
    for (const word of pool) {
      if (placed.length >= 5) break
      const d = DIRS[Math.floor(Math.random() * DIRS.length)]
      for (let a = 0; a < 80; a++) {
        const r = Math.floor(Math.random() * size)
        const c = Math.floor(Math.random() * size)
        const cells: Cell[] = []
        let ok = true
        for (let i = 0; i < word.length; i++) {
          const rr = r + d[0] * i
          const cc = c + d[1] * i
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) {
            ok = false
            break
          }
          cells.push({ r: rr, c: cc })
        }
        if (ok) {
          cells.forEach((cl, i) => {
            grid[cl.r][cl.c] = word[i]
          })
          placed.push({ word, cells })
          break
        }
      }
    }
    found = new Set()
    revealed = false
    timer = 60
    last = ''
  }

  const isFound = (r: number, c: number) => placed.some((p) => found.has(p.word) && p.cells.some((cl) => cl.r === r && cl.c === c))

  return {
    reset(settings, w, h) {
      width = w
      height = h
      breakSecs = typeof settings.secondsBetweenBoards === 'number' ? settings.secondsBetweenBoards : 8
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      board()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      const match = placed.find((p) => !found.has(p.word) && normalize(p.word) === text)
      if (!match) return
      found.add(match.word)
      last = match.word
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, match.word.length)
      if (found.size >= placed.length) {
        revealed = true
        timer = breakSecs
      }
    },
    update(dt, _now, settings) {
      breakSecs = typeof settings.secondsBetweenBoards === 'number' ? settings.secondsBetweenBoards : breakSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) board()
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('CONNECT WORD', cx, 60)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText('Trova le parole nascoste', cx, 96)

      const cell = Math.min(48, (height - 160) / size)
      const boardW = cell * size
      const startX = cx - boardW / 2
      const startY = 130
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const x = startX + c * cell
          const y = startY + r * cell
          ctx.fillStyle = isFound(r, c) ? '#3ccf7a' : '#16161c'
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 1, cell - 2, cell - 2, 4)
          ctx.fill()
          ctx.fillStyle = isFound(r, c) ? '#ffffff' : '#b9b9c6'
          ctx.font = `bold ${Math.round(cell * 0.6)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(grid[r][c], x + cell / 2, y + cell / 2 + 1)
          ctx.textBaseline = 'alphabetic'
        }
      }

      ctx.fillStyle = '#f5b14c'
      ctx.font = 'bold 22px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${found.size}/${placed.length} trovate${last ? ' — ✓ ' + last : ''}`, cx, startY + boardW + 40)

      if (revealed) drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
