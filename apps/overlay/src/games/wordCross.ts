import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'

// "Word Cross" — a small crossword built from a set of letters. Viewers type the
// words in chat to fill the intersecting grid.

interface Entry {
  word: string
  clue: string
}

interface Placed {
  word: string
  clue: string
  r: number
  c: number
  dir: 'across' | 'down'
  number: number
}

interface Board {
  letters: Map<string, string>
  placed: Placed[]
  minR: number
  maxR: number
  minC: number
  maxC: number
}

const PUZZLES: Entry[][] = [
  [
    { word: 'AMORE', clue: 'Un sentimento' },
    { word: 'CANE', clue: 'Il migliore amico' },
    { word: 'MARE', clue: 'Acqua salata' },
    { word: 'GATTO', clue: 'Fa le fusa' },
    { word: 'PANE', clue: 'Si compra dal fornaio' },
    { word: 'LATTE', clue: 'Bevanda bianca' },
  ],
  [
    { word: 'SOLE', clue: 'Stella del giorno' },
    { word: 'ROMA', clue: 'Capitale d’Italia' },
    { word: 'VINO', clue: 'Bevanda dall’uva' },
    { word: 'PORTO', clue: 'Approdo delle navi' },
    { word: 'MONDO', clue: 'Il pianeta' },
    { word: 'ORO', clue: 'Metallo prezioso' },
  ],
  [
    { word: 'VERDE', clue: 'Colore della natura' },
    { word: 'PERA', clue: 'Un frutto' },
    { word: 'NEVE', clue: 'Fiocchi bianchi' },
    { word: 'TRENO', clue: 'Mezzo su rotaia' },
    { word: 'SERA', clue: 'Dopo il pomeriggio' },
    { word: 'TERRA', clue: 'Il nostro pianeta' },
  ],
]

const key = (r: number, c: number) => `${r},${c}`

function buildBoard(entries: Entry[]): Board {
  const letters = new Map<string, string>()
  const placed: Placed[] = []
  const sorted = [...entries].sort((a, b) => b.word.length - a.word.length)

  const placeWord = (word: string, r: number, c: number, dir: 'across' | 'down'): boolean => {
    const cells: [number, number][] = []
    for (let i = 0; i < word.length; i++) {
      const rr = dir === 'across' ? r : r + i
      const cc = dir === 'across' ? c + i : c
      const existing = letters.get(key(rr, cc))
      if (existing !== undefined && existing !== word[i]) return false
      cells.push([rr, cc])
    }
    cells.forEach(([rr, cc], i) => letters.set(key(rr, cc), word[i]))
    return true
  }

  sorted.forEach((entry, idx) => {
    if (idx === 0) {
      placeWord(entry.word, 0, 0, 'across')
      placed.push({ word: entry.word, clue: entry.clue, r: 0, c: 0, dir: 'across', number: 1 })
      return
    }
    for (const p of placed) {
      let done = false
      for (let j = 0; j < p.word.length && !done; j++) {
        const pr = p.dir === 'across' ? p.r : p.r + j
        const pc = p.dir === 'across' ? p.c + j : p.c
        for (let i = 0; i < entry.word.length && !done; i++) {
          if (entry.word[i] !== p.word[j]) continue
          const dir: 'across' | 'down' = p.dir === 'across' ? 'down' : 'across'
          const r = dir === 'across' ? pr : pr - i
          const c = dir === 'across' ? pc - i : pc
          if (placeWord(entry.word, r, c, dir)) {
            placed.push({ word: entry.word, clue: entry.clue, r, c, dir, number: 0 })
            done = true
          }
        }
      }
      if (done) break
    }
  })

  const minR = Math.min(...[...letters.keys()].map((k) => parseInt(k.split(',')[0], 10)))
  const maxR = Math.max(...[...letters.keys()].map((k) => parseInt(k.split(',')[0], 10)))
  const minC = Math.min(...[...letters.keys()].map((k) => parseInt(k.split(',')[1], 10)))
  const maxC = Math.max(...[...letters.keys()].map((k) => parseInt(k.split(',')[1], 10)))

  // number the cells that start a word
  let n = 0
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const startsAcross = placed.some((p) => p.dir === 'across' && p.r === r && p.c === c)
      const startsDown = placed.some((p) => p.dir === 'down' && p.r === r && p.c === c)
      if (startsAcross || startsDown) {
        n++
        placed.forEach((p) => {
          if (p.dir === 'across' && p.r === r && p.c === c) p.number = n
          if (p.dir === 'down' && p.r === r && p.c === c) p.number = n
        })
      }
    }
  }

  return { letters, placed, minR, maxR, minC, maxC }
}
export function createWordCross(): GameInstance {
  let width = 0
  let height = 0
  let breakSecs = 8
  let credit = true
  let showBoard = true

  let board: Board = buildBoard(PUZZLES[0])
  let found = new Set<string>()
  let revealed = false
  let timer = breakSecs
  let last = ''
  const scores = newScores()

  const pick = () => {
    board = buildBoard(shuffled(PUZZLES)[0])
    found = new Set()
    revealed = false
    timer = breakSecs
    last = ''
  }

  const allFound = () => board.placed.every((p) => found.has(p.word))

  return {
    reset(settings, w, h) {
      width = w
      height = h
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 8
      credit = settings.creditWords !== false
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'shuffle') {
        pick()
        return
      }
      if (action === 'hint') {
        const next = board.placed.find((p) => !found.has(p.word))
        if (next) {
          found.add(next.word)
          last = next.word
        }
        return
      }
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      const match = board.placed.find((p) => !found.has(p.word) && normalize(p.word) === text)
      if (!match) return
      found.add(match.word)
      last = match.word
      if (credit) addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, match.word.length)
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
      ctx.fillText('WORD CROSS', cx, 60)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText('Scrivi le parole in chat', cx, 96)

      const tile = Math.min(46, (height - 220) / (board.maxR - board.minR + 1))
      const rows = board.maxR - board.minR + 1
      const cols = board.maxC - board.minC + 1
      const boardW = cols * tile
      const boardH = rows * tile
      const startX = cx - boardW / 2
      const startY = 130

      for (let r = board.minR; r <= board.maxR; r++) {
        for (let c = board.minC; c <= board.maxC; c++) {
          const ch = board.letters.get(key(r, c))
          const x = startX + (c - board.minC) * tile
          const y = startY + (r - board.minR) * tile
          if (ch === undefined) continue
          const solvedHere = board.placed.some((p) => found.has(p.word) && p.dir === 'across' && p.r === r && p.c <= c && c < p.c + p.word.length)
            || board.placed.some((p) => found.has(p.word) && p.dir === 'down' && p.c === c && p.r <= r && r < p.r + p.word.length)
          ctx.fillStyle = solvedHere ? '#3ccf7a' : '#1b1b21'
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 1, tile - 2, tile - 2, 5)
          ctx.fill()
          ctx.fillStyle = solvedHere ? '#ffffff' : '#f0f0f2'
          ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(ch, x + tile / 2, y + tile / 2 + 1)
          ctx.textBaseline = 'alphabetic'
          const numbered = board.placed.find((p) => p.r === r && p.c === c && p.number)
          if (numbered) {
            ctx.fillStyle = '#f5b14c'
            ctx.font = '10px system-ui'
            ctx.textAlign = 'left'
            ctx.fillText(String(numbered.number), x + 3, y + 11)
          }
        }
      }

      // clues
      ctx.textAlign = 'left'
      ctx.font = '16px system-ui'
      board.placed.forEach((p, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = 60 + col * (width / 2 - 40)
        const y = startY + boardH + 30 + row * 24
        ctx.fillStyle = found.has(p.word) ? '#3ccf7a' : '#8a8a96'
        ctx.fillText(`${p.number}. ${p.dir === 'across' ? 'Orizz.' : 'Vert.'} ${found.has(p.word) ? p.word : p.clue}`, x, y)
      })

      if (last) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 22px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`✓ ${last}`, cx, height - 70)
      }

      if (revealed) drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}

