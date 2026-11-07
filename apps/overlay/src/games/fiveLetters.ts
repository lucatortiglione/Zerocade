import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, clamp, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { wordsFor } from '../content'

// "Five Letters" — Wordle-style: viewers guess a 5-letter word in chat and get
// green / gold / grey feedback per letter, with correct handling of repeats.
// The word bank is loaded from the server's SQLite-backed content store.

type Tile = 'green' | 'gold' | 'grey'

interface Guess {
  word: string
  tiles: Tile[]
  user: string
}

const feedback = (guess: string, target: string): Tile[] => {
  const tiles: Tile[] = Array(5).fill('grey')
  const remaining: (string | null)[] = target.split('')
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      tiles[i] = 'green'
      remaining[i] = null
    }
  }
  for (let i = 0; i < 5; i++) {
    if (tiles[i] !== 'green') {
      const idx = remaining.indexOf(guess[i])
      if (idx >= 0) {
        tiles[i] = 'gold'
        remaining[idx] = null
      }
    }
  }
  return tiles
}


export function createFiveLetters(): GameInstance {
  let width = 0
  let height = 0
  let seconds = 180
  let timed = false
  let timer = 180
  let breakSecs = 6
  let autoHints = true
  let maxRevealed = 3
  let ptsGreen = 2
  let ptsGold = 1
  let solveBonus = 15
  let showBoard = true

  let target = ''
  let guesses: Guess[] = []
  let revealedIdx: number[] = []
  let ruledOut: string[] = []
  let solved = false
  let revealed = false
  let solver: Viewer | null = null
  let hintClock = 0
  const scores = newScores()

  const pick = () => {
    target = shuffled(wordsFor('five-letters'))[0] ?? ''
    guesses = []
    revealedIdx = []
    ruledOut = []
    solved = false
    revealed = false
    solver = null
    hintClock = 0
    timer = seconds
  }

  const revealLetter = (positional: boolean) => {
    if (solved || revealed) return
    const hidden = target.split('').map((_, i) => i).filter((i) => !revealedIdx.includes(i))
    if (!hidden.length) return
    const i = positional ? hidden[0] : hidden[Math.floor(Math.random() * hidden.length)]
    if (!revealedIdx.includes(i)) revealedIdx.push(i)
    if (revealedIdx.length >= target.length) {
      solved = true
      revealed = true
      timer = breakSecs
    }
  }

  const ruleOut = () => {
    if (solved || revealed) return
    const alphabet = 'ABCDEFGHILMNOPQRSTUVZ'
    const candidates = alphabet.split('').filter((c) => !target.includes(c) && !ruledOut.includes(c))
    if (candidates.length) ruledOut.push(candidates[Math.floor(Math.random() * candidates.length)])
  }

  const finish = () => {
    revealed = true
    timer = breakSecs
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      seconds = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 180
      timed = settings.roundMode === 'timed'
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 6
      autoHints = settings.autoHints !== false
      maxRevealed = typeof settings.maxRevealed === 'number' ? settings.maxRevealed : 3
      ptsGreen = typeof settings.pointsPerGreen === 'number' ? settings.pointsPerGreen : 2
      ptsGold = typeof settings.pointsPerGold === 'number' ? settings.pointsPerGold : 1
      solveBonus = typeof settings.solveBonus === 'number' ? settings.solveBonus : 15
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_letter') {
        revealLetter(true)
        return
      }
      if (action === 'find_letter') {
        revealLetter(false)
        return
      }
      if (action === 'rule_out') {
        ruleOut()
        return
      }
      if (event.type !== 'comment') return
      if (solved || revealed) return
      const w = normalize(event.text)
      if (w.length !== 5) return
      const tiles = feedback(w, target)
      guesses.push({ word: w, tiles, user: event.user.id })
      if (guesses.length > 9) guesses.shift()
      if (w === target) {
        solved = true
        revealed = true
        solver = event.user
        timer = breakSecs
        let pts = solveBonus
        for (const t of tiles) pts += t === 'green' ? ptsGreen : t === 'gold' ? ptsGold : 0
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, pts)
      } else {
        let pts = 0
        for (const t of tiles) pts += t === 'green' ? ptsGreen : t === 'gold' ? ptsGold : 0
        if (pts > 0) addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, pts)
      }
    },
    update(dt, _now, settings) {
      seconds = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : seconds
      timed = settings.roundMode === 'timed'
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      autoHints = settings.autoHints !== false
      if (revealed) {
        timer -= dt
        if (timer <= 0) pick()
        return
      }
      if (timed) {
        timer -= dt
        if (timer <= 0) finish()
      }
      if (autoHints && revealedIdx.length < maxRevealed) {
        hintClock += dt
        if (hintClock >= 60) {
          hintClock = 0
          revealLetter(true)
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(revealed ? (solved ? 'SOLVED!' : 'La parola era:') : 'FIVE LETTERS', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Scrivi una parola di 5 lettere in chat', cx, 122)

      const tile = 56
      const gap = 8
      const rowH = tile + gap
      const startY = height * 0.26
      guesses.forEach((g, r) => {
        const total = 5 * tile + 4 * gap
        let x = cx - total / 2 + tile / 2
        const y = startY + r * rowH + tile / 2
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = g.tiles[i] === 'green' ? '#4FA05A' : g.tiles[i] === 'gold' ? '#D1A93A' : '#3B3D42'
          ctx.beginPath()
          ctx.roundRect(x - tile / 2, y - tile / 2, tile, tile, 8)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(g.word[i], x, y + 1)
          ctx.textBaseline = 'alphabetic'
          x += tile + gap
        }
      })

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 34px system-ui'
        ctx.textAlign = 'center'
        if (solved && solver) fillTextWithAvatar(ctx, `${solver.nickname} ha indovinato!`, cx, height * 0.68, solver)
        else ctx.fillText(target, cx, height * 0.68)
      }
      if (revealedIdx.length) {
        ctx.fillStyle = '#f0f0f2'
        ctx.font = '20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Lettere rivelate: ' + revealedIdx.map((i) => target[i]).join(' '), cx, height * 0.6)
      }
      if (ruledOut.length) {
        ctx.fillStyle = '#8a8a96'
        ctx.font = '20px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Escluse: ' + ruledOut.join(' '), cx, height * 0.64)
      }

      if (timed) drawTimerBar(ctx, width, height, revealed ? 1 : clamp(timer / seconds, 0, 1), solved ? '#3ccf7a' : '#3E8BFF')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}

