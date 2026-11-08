import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'
import { buildCrossword, cellKey, cellSolved, type CrosswordBoard, type CrosswordEntry } from './crossword'

// "Cross World" — a crossword built from intersecting words. Viewers type the
// words to fill the board.

export function createCrossWorld(): GameInstance {
  let width = 0
  let height = 0
  let breakSecs = 8
  let credit = true
  let showBoard = true

  let board: CrosswordBoard = buildCrossword([])
  let found = new Set<string>()
  let revealed = false
  let timer = breakSecs
  let last = ''
  const scores = newScores()

  const pick = () => {
    board = buildCrossword(shuffled(itemsFor<{ entries: CrosswordEntry[] }>('word-cross'))[0]?.entries ?? [])
    found = new Set()
    revealed = false
    timer = breakSecs
    last = ''
  }

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
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      const match = board.placed.find((p) => !found.has(p.word) && normalize(p.word) === text)
      if (!match) return
      found.add(match.word)
      last = match.word
      if (credit) addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, match.word.length)
      if (board.placed.every((p) => found.has(p.word))) {
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
      ctx.fillText('CROSS WORLD', cx, 60)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText('Scrivi le parole in chat', cx, 96)

      const rows = board.maxR - board.minR + 1
      const cols = board.maxC - board.minC + 1
      const tile = Math.min(46, (height - 220) / rows)
      const startX = cx - (cols * tile) / 2
      const startY = 130

      for (let r = board.minR; r <= board.maxR; r++) {
        for (let c = board.minC; c <= board.maxC; c++) {
          const ch = board.letters.get(cellKey(r, c))
          if (ch === undefined) continue
          const x = startX + (c - board.minC) * tile
          const y = startY + (r - board.minR) * tile
          ctx.fillStyle = cellSolved(board, found, r, c) ? '#3ccf7a' : '#1b1b21'
          ctx.beginPath()
          ctx.roundRect(x + 1, y + 1, tile - 2, tile - 2, 5)
          ctx.fill()
          ctx.fillStyle = cellSolved(board, found, r, c) ? '#ffffff' : '#f0f0f2'
          ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(ch, x + tile / 2, y + tile / 2 + 1)
          ctx.textBaseline = 'alphabetic'
        }
      }

      ctx.textAlign = 'left'
      ctx.font = '16px system-ui'
      board.placed.forEach((p, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = 60 + col * (width / 2 - 40)
        const y = startY + rows * tile + 30 + row * 24
        ctx.fillStyle = found.has(p.word) ? '#3ccf7a' : '#8a8a96'
        ctx.fillText(`${p.number}. ${found.has(p.word) ? p.word : p.clue}`, x, y)
      })

      if (last) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 22px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`✓ ${last}`, cx, height - 70)
      }

      if (revealed) drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
