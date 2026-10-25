import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'

// "Word Hunt" — a word-search grid: viewers find the hidden words (by word or
// by coordinates) in chat. Found words are highlighted on the board.

const BANK = [
  'SOLE', 'MARE', 'LUNA', 'CANE', 'GATTO', 'PIZZA', 'PASTA', 'FIORE', 'STELLA',
  'ALBERO', 'MONTAGNA', 'OCEANO', 'CHITARRA', 'CALCIO', 'ROMA', 'VINO', 'PANE',
  'LATTE', 'MUSICA', 'LIBRO', 'PORTA', 'TRENO', 'SERA', 'NOTTE', 'VERDE', 'ACQUA',
]

interface Cell {
  r: number
  c: number
}

interface Placed {
  word: string
  cells: Cell[]
}

const DIRS: [number, number][] = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
]

export function createWordHunt(): GameInstance {
  let width = 0
  let height = 0
  let size = 12
  let diagonal = true
  let backwards = false
  let breakSecs = 8
  let showHints = true
  let showBoard = true
  let credit = true

  let grid: string[][] = []
  let placed: Placed[] = []
  let found = new Set<string>()
  let timer = 60
  let revealed = false
  let lastFind = ''
  const scores = newScores()

  const fill = () => {
    const letters = 'ABCDEFGHILMNOPQRSTUVZ'
    grid = Array.from({ length: size }, () => Array.from({ length: size }, () => letters[Math.floor(Math.random() * letters.length)]))
  }

  const board = () => {
    fill()
    const pool = shuffled(BANK).filter((w) => w.length >= 3 && w.length <= size - 2)
    placed = []
    const dirs = DIRS.filter((d) => (d[0] !== 0 && d[1] !== 0 ? diagonal : true) && (backwards ? true : d[0] >= 0 && d[1] >= 0))
    for (const word of pool) {
      if (placed.length >= Math.floor(size / 2)) break
      const d = dirs[Math.floor(Math.random() * dirs.length)]
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
          const occupied = placed.some((p) => p.cells.some((cl) => cl.r === rr && cl.c === cc))
          if (occupied && grid[rr][cc] !== word[i]) {
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
    lastFind = ''
  }

  const isFoundCell = (r: number, c: number) => placed.some((p) => found.has(p.word) && p.cells.some((cl) => cl.r === r && cl.c === c))

  return {
    reset(settings, w, h) {
      width = w
      height = h
      size = settings.boardSize === 'quick' ? 8 : settings.boardSize === 'large' ? 16 : 12
      diagonal = settings.allowDiagonal !== false
      backwards = settings.allowBackwards === true
      breakSecs = typeof settings.secondsBetweenBoards === 'number' ? settings.secondsBetweenBoards : 8
      showHints = settings.showHints !== false
      showBoard = settings.showLeaderboard !== false
      credit = settings.creditWords !== false
      scores.clear()
      board()
    },
    onAction(action, event) {
      if (action === 'new_board') {
        board()
        return
      }
      if (action === 'reveal_word') {
        const next = placed.find((p) => !found.has(p.word))
        if (next) {
          found.add(next.word)
          lastFind = next.word
        }
        return
      }
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      const byWord = placed.find((p) => !found.has(p.word) && normalize(p.word) === text)
      if (byWord) {
        found.add(byWord.word)
        lastFind = byWord.word
        if (credit) addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, byWord.word.length)
        return
      }
      const cells = parseCells(event.text.trim().toUpperCase(), size)
      if (cells) {
        const match = placed.find(
          (p) =>
            !found.has(p.word) &&
            p.cells.some((a) => a.r === cells[0].r && a.c === cells[0].c) &&
            p.cells.some((b) => b.r === cells[1].r && b.c === cells[1].c),
        )
        if (match) {
          found.add(match.word)
          lastFind = match.word
          if (credit) addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, match.word.length)
        }
      }
    },
    update(dt, _now, settings) {
      breakSecs = typeof settings.secondsBetweenBoards === 'number' ? settings.secondsBetweenBoards : breakSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) board()
        return
      }
      if (placed.length && found.size >= placed.length) {
        revealed = true
        timer = breakSecs
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cell = Math.min(48, (height - 200) / size)
      const boardW = cell * size
      const startX = cx - boardW / 2
      const startY = 40
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const x = startX + c * cell
          const y = startY + r * cell
          ctx.fillStyle = isFoundCell(r, c) ? '#3ccf7a' : '#16161c'
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 1, cell - 2, cell - 2, 4)
          ctx.fill()
          ctx.fillStyle = isFoundCell(r, c) ? '#ffffff' : '#b9b9c6'
          ctx.font = `bold ${Math.round(cell * 0.6)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(grid[r][c], x + cell / 2, y + cell / 2 + 1)
          ctx.textBaseline = 'alphabetic'
        }
      }

      if (showHints) {
        ctx.fillStyle = '#f0f0f2'
        ctx.font = '20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(placed.map((p) => (found.has(p.word) ? p.word : '_'.repeat(p.word.length))).join('  '), cx, startY + boardW + 40)
      }
      ctx.fillStyle = '#8a8a96'
      ctx.font = '18px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`Trova ${found.size}/${placed.length} parole`, cx, startY + boardW + 70)

      if (lastFind) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 22px system-ui'
        ctx.fillText(`✓ ${lastFind}`, cx, height - 90)
      }

      if (revealed) drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
      if (showBoard) drawLeaderboard(ctx, scores, 6)
    },
  }
}

function parseCells(input: string, size: number): Cell[] | null {
  const m = input.match(/([A-Z])(\d+)[\s\-]*([A-Z])(\d+)/)
  if (!m) return null
  const c1 = m[1].charCodeAt(0) - 65
  const r1 = parseInt(m[2], 10) - 1
  const c2 = m[3].charCodeAt(0) - 65
  const r2 = parseInt(m[4], 10) - 1
  if ([r1, r2, c1, c2].some((v) => v < 0 || v >= size)) return null
  return [
    { r: r1, c: c1 },
    { r: r2, c: c2 },
  ]
}

