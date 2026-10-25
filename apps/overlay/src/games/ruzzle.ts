import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'

// "Ruzzle" — a 4x4 letter grid: find as many hidden words as you can before the
// timer runs out. Longer words score more.

interface Cell {
  r: number
  c: number
}

interface Placed {
  word: string
  cells: Cell[]
}

const DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1]]

export function createRuzzle(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 60
  let breakSecs = 5
  let showBoard = true

  let grid: string[][] = []
  let placed: Placed[] = []
  let found = new Set<string>()
  let timer = 60
  let revealed = false
  const scores = newScores()

  const board = () => {
    const letters = 'ABCDEFGHILMNOPQRSTUVZ'
    grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]))
    placed = []
    const pool = shuffled(wordsFor('word-hunt')).filter((w) => w.length >= 3 && w.length <= 4)
    for (const word of pool.slice(0, 4)) {
      const d = DIRS[Math.floor(Math.random() * DIRS.length)]
      for (let a = 0; a < 60; a++) {
        const r = Math.floor(Math.random() * 4)
        const c = Math.floor(Math.random() * 4)
        const cells: Cell[] = []
        let ok = true
        for (let i = 0; i < word.length; i++) {
          const rr = r + d[0] * i
          const cc = c + d[1] * i
          if (rr < 0 || rr >= 4 || cc < 0 || cc >= 4) {
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
    timer = roundSecs
  }

  const isFound = (r: number, c: number) => placed.some((p) => found.has(p.word) && p.cells.some((cl) => cl.r === r && cl.c === c))

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 60
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
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
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, match.word.length * 10)
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : roundSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) board()
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
      ctx.fillText('RUZZLE', cx, 60)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText('Trova le parole prima che scada il tempo', cx, 96)

      const tile = Math.min(90, height * 0.18)
      const startX = cx - tile * 2
      const startY = 140
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const x = startX + c * tile
          const y = startY + r * tile
          ctx.fillStyle = isFound(r, c) ? '#3ccf7a' : '#16161c'
          ctx.beginPath()
          ctx.roundRect(x + 2, y + 2, tile - 4, tile - 4, 8)
          ctx.fill()
          ctx.fillStyle = isFound(r, c) ? '#ffffff' : '#f0f0f2'
          ctx.font = `bold ${Math.round(tile * 0.5)}px system-ui`
          ctx.textBaseline = 'middle'
          ctx.fillText(grid[r][c], x + tile / 2, y + tile / 2 + 1)
          ctx.textBaseline = 'alphabetic'
        }
      }

      ctx.fillStyle = '#f5b14c'
      ctx.font = 'bold 22px system-ui'
      ctx.fillText(`Parole trovate: ${found.size}/${placed.length}`, cx, startY + tile * 4 + 40)

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#ff5c5c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
