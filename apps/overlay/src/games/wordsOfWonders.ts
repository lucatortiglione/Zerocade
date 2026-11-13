import type { GameInstance } from './engine'
import { drawAvatar } from './avatar'
import { addPoints, drawLeaderboard } from './common'
import { roundCheer } from '../audio'

// "Words of Wonders: Guru" — a crossword board of hidden words: viewers find every
// word that can be built from the letters. Longer words score more.

interface Entry {
  word: string
  clue: string
}

interface Level {
  letters: string
  entries: Entry[]
}

const LEVELS: Level[] = [
  {
    letters: 'STREAM',
    entries: [
      { word: 'STREAM', clue: 'A small flowing river' },
      { word: 'MASTER', clue: 'An expert in a skill' },
      { word: 'STAR', clue: 'A bright point in the sky' },
      { word: 'TEAM', clue: 'A group playing together' },
      { word: 'SEAT', clue: 'A place to sit' },
      { word: 'EAST', clue: 'Where the sun rises' },
    ],
  },
  {
    letters: 'PLANET',
    entries: [
      { word: 'PLANET', clue: 'A body that orbits a star' },
      { word: 'PLANE', clue: 'A flying vehicle with wings' },
      { word: 'PLANT', clue: 'A living thing growing in soil' },
      { word: 'PANEL', clue: 'A flat section of a surface' },
      { word: 'LATE', clue: 'After the expected time' },
      { word: 'LEAP', clue: 'To jump into the air' },
    ],
  },
  {
    letters: 'GARDEN',
    entries: [
      { word: 'GARDEN', clue: 'A place where plants grow' },
      { word: 'GRAND', clue: 'Large and impressive' },
      { word: 'GRADE', clue: 'A level of quality' },
      { word: 'RANGE', clue: 'A series or a stove' },
      { word: 'DEAN', clue: 'The head of a college' },
      { word: 'NEAR', clue: 'Close by' },
    ],
  },
  {
    letters: 'ROCKET',
    entries: [
      { word: 'ROCKET', clue: 'A vehicle flying into space' },
      { word: 'ROCK', clue: 'A hard piece of mineral' },
      { word: 'CORE', clue: 'The central part' },
      { word: 'COKE', clue: 'A fizzy dark soft drink' },
      { word: 'TREK', clue: 'A long difficult journey' },
      { word: 'CORK', clue: 'A bottle stopper' },
    ],
  },
  {
    letters: 'FLOWER',
    entries: [
      { word: 'FLOWER', clue: 'A colorful plant bloom' },
      { word: 'LOWER', clue: 'Closer to the ground' },
      { word: 'FLOW', clue: 'To move like water' },
      { word: 'WOLF', clue: 'A wild howling animal' },
      { word: 'FOWL', clue: 'A bird kept for eggs or meat' },
      { word: 'ROLE', clue: 'A part played by an actor' },
    ],
  },
  {
    letters: 'BRIDGE',
    entries: [
      { word: 'BRIDGE', clue: 'A structure over a river' },
      { word: 'BRIDE', clue: 'A woman on her wedding day' },
      { word: 'RIDGE', clue: 'A long narrow hilltop' },
      { word: 'GRID', clue: 'A network of crossing lines' },
      { word: 'BIRD', clue: 'An animal with feathers' },
      { word: 'RIDE', clue: 'To travel on a vehicle or animal' },
    ],
  },
  {
    letters: 'CASTLE',
    entries: [
      { word: 'CASTLE', clue: 'A large fortified building' },
      { word: 'SCALE', clue: 'A device for weighing' },
      { word: 'STALE', clue: 'No longer fresh' },
      { word: 'LEAST', clue: 'The smallest amount' },
      { word: 'CLEAT', clue: 'A stud on a sports shoe' },
      { word: 'SEAL', clue: 'A sea animal or a closure' },
    ],
  },
  {
    letters: 'SILENT',
    entries: [
      { word: 'SILENT', clue: 'Making no sound' },
      { word: 'LISTEN', clue: 'To pay attention to sound' },
      { word: 'STILE', clue: 'Steps over a fence' },
      { word: 'INSET', clue: 'Set into a surface' },
      { word: 'LINES', clue: 'Long narrow marks' },
      { word: 'TILES', clue: 'Square floor pieces' },
    ],
  },
]

const scramble = (s: string) =>
  s
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('')

const pointsFor = (len: number) => (len < 4 ? 1 : len - 2) + (len >= 6 ? 3 : 0)

export function createWordsOfWonders(): GameInstance {
  let width = 0
  let height = 0
  let seconds = 60
  let timer = 60
  let letters = ''
  let entries: Entry[] = []
  let found = new Set<string>()
  let revealed = false
  let flash = 0
  let last: { name: string; pts: number; avatar?: string; word: string } | null = null
  const scores = new Map<string, { name: string; pts: number; avatar?: string }>()

  const allFound = () => found.size === entries.length

  const newRound = () => {
    const level = LEVELS[Math.floor(Math.random() * LEVELS.length)]
    letters = scramble(level.letters)
    entries = [...level.entries].sort((a, b) => a.word.length - b.word.length)
    found = new Set()
    revealed = false
    flash = 0
    last = null
    timer = seconds
  }


  return {
    reset(settings, w, h) {
      width = w
      height = h
      seconds = typeof settings.seconds === 'number' ? settings.seconds : 60
      scores.clear()
      newRound()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const word = event.text.trim().toUpperCase().replace(/[^A-Z]/g, '')
      if (!word || found.has(word)) return
      if (!entries.some((e) => e.word === word)) return
      found.add(word)
      const pts = pointsFor(word.length)
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, pts)
      last = { name: event.user.nickname, pts, avatar: event.user.avatar, word }
      flash = 3
      if (allFound()) {
        timer = 4
        roundCheer()
      }
    },
    update(dt, _now, settings) {
      seconds = typeof settings.seconds === 'number' ? settings.seconds : seconds
      timer -= dt
      flash = Math.max(0, flash - dt)
      if (timer <= 0) {
        if (allFound() || revealed) newRound()
        else {
          revealed = true
          roundCheer()
          timer = 7
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 44px system-ui'
      ctx.fillText('WORDS OF WONDERS', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText('Guru — answer the clues', cx, 122)

      // Letter hint
      const tile = 44
      const gap = 8
      const poolW = letters.length * tile + (letters.length - 1) * gap
      const lx = cx - poolW / 2
      const ly = 168
      letters.split('').forEach((ch, i) => {
        const x = lx + i * (tile + gap)
        ctx.fillStyle = '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(x, ly - tile / 2, tile, tile, 10)
        ctx.fill()
        ctx.strokeStyle = '#4cc3ff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 24px system-ui'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, x + tile / 2, ly + 1)
      })
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#8a8a96'
      ctx.font = '18px system-ui'
      ctx.fillText('LETTERS', cx, 204)

      ctx.fillStyle = '#f5b14c'
      ctx.font = 'bold 26px system-ui'
      ctx.fillText(`Found ${found.size} / ${entries.length}`, cx, 250)

      // Clues + answers (crossword style)
      const startY = 300
      const rowH = 76
      const wTile = 34
      const wGap = 4
      entries.forEach((e, i) => {
        const y = startY + i * rowH
        ctx.textAlign = 'left'
        ctx.fillStyle = '#4cc3ff'
        ctx.font = 'bold 24px system-ui'
        ctx.fillText(`${i + 1}.`, 90, y)
        ctx.fillStyle = '#f0f0f2'
        ctx.font = '22px system-ui'
        ctx.fillText(e.clue, 128, y)

        const isFound = found.has(e.word)
        const wTotal = e.word.length * wTile + (e.word.length - 1) * wGap
        const x0 = width - 120 - wTotal
        e.word.split('').forEach((ch, j) => {
          const x = x0 + j * (wTile + wGap)
          ctx.fillStyle = isFound ? '#3ccf7a' : revealed ? '#ff5c5c' : '#2a2a33'
          ctx.beginPath()
          ctx.roundRect(x, y - wTile / 2, wTile, wTile, 6)
          ctx.fill()
          if (isFound || revealed) {
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 22px system-ui'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(ch, x + wTile / 2, y + 1)
            ctx.textBaseline = 'alphabetic'
            ctx.textAlign = 'left'
          }
        })
      })

      if (flash > 0 && last) {
        const text = `${last.name} +${last.pts} — ${last.word}`
        ctx.font = 'bold 26px system-ui'
        const tw = ctx.measureText(text).width
        const pw = tw + 92
        const px = cx - pw / 2
        const py = height * 0.82
        ctx.fillStyle = '#1b1b21ee'
        ctx.beginPath()
        ctx.roundRect(px, py - 24, pw, 48, 24)
        ctx.fill()
        drawAvatar(ctx, last.avatar, px + 36, py, 20, last.name)
        ctx.fillStyle = '#3ccf7a'
        ctx.textAlign = 'left'
        ctx.fillText(text, px + 66, py + 8)
        ctx.textAlign = 'center'
      }

      const total = revealed ? 7 : allFound() ? 4 : seconds
      const frac = Math.max(0, timer / total)
      ctx.fillStyle = '#00000055'
      ctx.fillRect(40, height - 56, width - 80, 14)
      ctx.fillStyle = revealed ? '#ff5c5c' : allFound() ? '#3ccf7a' : '#f5b14c'
      ctx.fillRect(40, height - 56, (width - 80) * frac, 14)

      drawLeaderboard(ctx, scores)
    },
  }
}