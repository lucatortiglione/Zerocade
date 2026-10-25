import type { GameInstance } from './engine'
import { drawAvatar } from './avatar'
import { imageProviderById, type ImageProvider } from './imageProviders'

// Generic "guess the word(s) from pictures" game.
// - 4 Pics 1 Word: a round is ONE word with 4 pictures sharing it.
// - Picwords 2: a round is ONE picture with 3 words to guess.

export interface PicPuzzle {
  keys: string[]
  emojis: string[]
  words: string[][]
}

const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '')
const pointsFor = (len: number) => (len < 4 ? 1 : len - 2) + (len >= 6 ? 3 : 0)

const imageCache = new Map<string, HTMLImageElement>()

function drawPic(ctx: CanvasRenderingContext2D, url: string, emoji: string, x: number, y: number, w: number, h: number, radius: number) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.clip()
  if (!url) {
    ctx.fillStyle = '#1b1b21'
    ctx.fillRect(x, y, w, h)
    ctx.font = `${Math.round(Math.min(w, h) * 0.5)}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, x + w / 2, y + h / 2)
    ctx.textBaseline = 'alphabetic'
    ctx.restore()
    return
  }
  let img = imageCache.get(url)
  if (!img) {
    img = new Image()
    img.src = url
    imageCache.set(url, img)
  }
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, w, h)
  } else {
    ctx.fillStyle = '#1b1b21'
    ctx.fillRect(x, y, w, h)
    ctx.font = `${Math.round(Math.min(w, h) * 0.5)}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, x + w / 2, y + h / 2)
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
}

interface WordState {
  answers: string[]
  solved: boolean
}

export function createPicQuiz(rounds: (wordsPerRound: number) => PicPuzzle, title: string, subtitle: string): GameInstance {
  let width = 0
  let height = 0
  let seconds = 30
  let timer = 30
  let wordsPerRound = 1
  let revealed = false
  let flash = 0
  let solver: { name: string; pts: number; avatar?: string; word: string } | null = null
  const scores = new Map<string, { name: string; pts: number; avatar?: string }>()
  let provider: ImageProvider = imageProviderById('loremflickr')
  let current: PicPuzzle = rounds(1)
  let words: WordState[] = []

  const buildWords = () => current.words.map((answers) => ({ answers, solved: false }))
  const allSolved = () => words.length > 0 && words.every((w) => w.solved)
  const revealTotal = () => (words.length > 1 ? 6 : 4)
  const picUrl = (i: number, size: number) => provider.build(current.keys[i], current.emojis[i] ?? '', i + 1, size)

  const next = () => {
    current = rounds(wordsPerRound)
    words = buildWords()
    revealed = false
    solver = null
    flash = 0
    timer = seconds
  }

  const top = () => [...scores.entries()].sort((a, b) => b[1].pts - a[1].pts).slice(0, 5)

  return {
    reset(settings, w, h) {
      width = w
      height = h
      seconds = typeof settings.seconds === 'number' ? settings.seconds : 30
      wordsPerRound = typeof settings.wordsPerRound === 'number' ? settings.wordsPerRound : 1
      provider = imageProviderById(typeof settings.imageProvider === 'string' ? settings.imageProvider : 'loremflickr')
      current = rounds(wordsPerRound)
      words = buildWords()
      scores.clear()
      revealed = false
      solver = null
      flash = 0
      timer = seconds
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      if (!text) return
      for (const st of words) {
        if (st.solved) continue
        if (!st.answers.includes(text)) continue
        st.solved = true
        const pts = pointsFor(text.length)
        const cur = scores.get(event.user.id)
        scores.set(event.user.id, { name: event.user.nickname, pts: (cur?.pts ?? 0) + pts, avatar: event.user.avatar })
        solver = { name: event.user.nickname, pts, avatar: event.user.avatar, word: text }
        flash = 3
        if (allSolved()) timer = 4
        return
      }
    },
    update(dt, _now, settings) {
      seconds = typeof settings.seconds === 'number' ? settings.seconds : seconds
      if (typeof settings.wordsPerRound === 'number') wordsPerRound = settings.wordsPerRound
      if (typeof settings.imageProvider === 'string') provider = imageProviderById(settings.imageProvider)
      timer -= dt
      flash = Math.max(0, flash - dt)
      if (timer <= 0) {
        if (allSolved() || revealed) next()
        else {
          revealed = true
          timer = revealTotal()
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 44px system-ui'
      ctx.fillText(title, cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText(subtitle, cx, 122)

      const p = current
      if (p.keys.length > 1) {
        // 4 Pics 1 Word: a 2x2 grid sharing one answer.
        const cell = Math.min(width * 0.3, 200)
        const gap = 20
        const gridW = cell * 2 + gap
        const startX = cx - gridW / 2
        const startY = height * 0.18
        const pos = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]
        pos.forEach(([gx, gy], i) => {
          if (i >= p.keys.length) return
          drawPic(ctx, picUrl(i, 400), p.emojis[i] ?? '', startX + gx * (cell + gap), startY + gy * (cell + gap), cell, cell, 16)
        })
        const shown = words[0].solved || revealed
        const answer = p.words[0][0]
        ctx.font = 'bold 46px system-ui'
        ctx.fillStyle = words[0].solved ? '#3ccf7a' : revealed ? '#ff5c5c' : '#f0f0f2'
        ctx.fillText(shown ? answer : '_ '.repeat(answer.length).trim(), cx, height * 0.58)
      } else {
        // Picwords: one picture, 3 words to guess.
        const size = Math.min(width * 0.5, 400)
        const imgY = height * 0.15
        drawPic(ctx, picUrl(0, 500), p.emojis[0] ?? '', cx - size / 2, imgY, size, size, 24)
        const n = words.length
        const gap = 40
        const slotW = Math.min((width - 160) / n, 240)
        const totalW = slotW * n + gap * (n - 1)
        const startX = (width - totalW) / 2
        const wy = imgY + size + 64
        words.forEach((st, i) => {
          const answer = st.answers[0]
          const shown = st.solved || revealed
          const x = startX + i * (slotW + gap)
          ctx.font = 'bold 32px system-ui'
          ctx.fillStyle = st.solved ? '#3ccf7a' : revealed ? '#ff5c5c' : '#f0f0f2'
          ctx.fillText(shown ? `${i + 1}. ${answer}` : `${i + 1}. ${'_'.repeat(answer.length)}`, x + slotW / 2, wy)
        })
      }

      if (flash > 0 && solver) {
        const text = `${solver.name} +${solver.pts} — ${solver.word}`
        ctx.font = 'bold 26px system-ui'
        const tw = ctx.measureText(text).width
        const pw = tw + 92
        const px = cx - pw / 2
        const py = height * 0.68
        ctx.fillStyle = '#1b1b21ee'
        ctx.beginPath()
        ctx.roundRect(px, py - 24, pw, 48, 24)
        ctx.fill()
        drawAvatar(ctx, solver.avatar, px + 36, py, 20)
        ctx.fillStyle = '#3ccf7a'
        ctx.textAlign = 'left'
        ctx.fillText(text, px + 66, py + 8)
        ctx.textAlign = 'center'
      }

      const total = revealed ? revealTotal() : allSolved() ? 4 : seconds
      const frac = Math.max(0, timer / total)
      ctx.fillStyle = '#00000055'
      ctx.fillRect(40, height - 56, width - 80, 14)
      ctx.fillStyle = revealed ? '#ff5c5c' : allSolved() ? '#3ccf7a' : '#f5b14c'
      ctx.fillRect(40, height - 56, (width - 80) * frac, 14)

      const topPlayers = top()
      if (topPlayers.length) {
        ctx.textAlign = 'left'
        ctx.font = 'bold 20px system-ui'
        ctx.fillStyle = '#ffffff'
        ctx.fillText('Top players', 40, 60)
        topPlayers.forEach(([, pl], i) => {
          const y = 88 + i * 26
          drawAvatar(ctx, pl.avatar, 52, y - 8, 11)
          ctx.font = '18px system-ui'
          ctx.fillStyle = i === 0 ? '#f5b14c' : '#f0f0f2'
          ctx.fillText(`${i + 1}. ${pl.name} — ${pl.pts}`, 70, y)
        })
      }
    },
  }
}