import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { drawAvatar, fillTextWithAvatar } from './avatar'
import { addPoints, clamp, drawTimerBar, newScores, shuffled, topOf } from './common'
import { followSecret, reportSecret, type RoomSecret } from './roomSecret'
import { feedback, keyStates, newInfo, readGuess, type Row, type Tile, type WordleData } from './wordleLogic'
import { GAME_BANK_LIMITS, loadWordleBank } from './gameBanks'
import { retryDue } from './retry'
import { roundCheer } from '../audio'

// ZeroWordle: the chat plays one word together, of 5 to 8 letters (the creator's choice, or random). Every valid word written in chat is a row
// of green (right place), gold (elsewhere) and grey (not in the word) tiles. The words come from the
// server (/api/wordle/*, a list per length, schema wordle of database/giochi.sqlite3, built by gioco-zerowordle from the lexical inventory); the secret is shared by
// the room's overlays (roomSecret.ts) and shown to the creator in the dashboard.

const LENGTHS = [5, 6, 7, 8]

interface Guess extends Row {
  by: Viewer
  at: number // when it appeared (performance.now), for the tiles' flip
}

const COLORS: Record<Tile, string> = { green: '#2f9e5b', gold: '#d6a62f', grey: '#3a3d55' }
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const FLIP_MS = 380
const STAGGER_MS = 150

export function createFiveLetters(secret: RoomSecret = { follow: followSecret, report: reportSecret }, loadBank = loadWordleBank): GameInstance {
  const lists = new Map<number, WordleData>()
  const failures = new Map<number, { at: number; count: number }>()
  let failed = false
  let disposed = false
  let revision = 0
  let request: AbortController | null = null
  let detach: (() => void) | undefined
  let paused = false
  let deferred: (() => void) | undefined
  let pendingWord: string | undefined
  let width = 0
  let height = 0
  let timed = false
  let seconds = 180
  let breakSecs = 6
  let autoHints = true
  let autoHintSecs = 60
  let maxRevealed = 3
  let maxGuesses = 6
  let lengthSetting = '5'
  let ptsGreen = 2
  let ptsGold = 1
  let solveBonus = 15
  let showBoard = true

  let data: WordleData | null = null // the lists of the word in play
  let target = ''
  let waiting = false // a round is waiting for its lists
  const bags = new Map<number, string[]>()
  let guesses: Guess[] = []
  let revealedIdx: number[] = []
  let ruledOut: string[] = []
  let solved = false
  let revealed = false
  let solver: Viewer | null = null
  let timer = 0
  let roundClock = 0
  let hintClock = 0
  const scores = newScores()

  // The dashboard's settings, read again every frame so a change applies at once.
  const read = (settings: Record<string, number | boolean | string>) => {
    const num = (key: string, fallback: number) => (typeof settings[key] === 'number' ? (settings[key] as number) : fallback)
    timed = settings.roundMode === 'timed'
    seconds = num('roundSeconds', 180)
    breakSecs = num('breakSeconds', 6)
    autoHints = settings.autoHints !== false
    autoHintSecs = num('autoHintSeconds', 60)
    maxRevealed = num('maxRevealed', 3)
    maxGuesses = num('maxGuesses', 6)
    lengthSetting = String(settings.wordLength ?? '5')
    ptsGreen = num('pointsPerGreen', 2)
    ptsGold = num('pointsPerGold', 1)
    solveBonus = num('solveBonus', 15)
    showBoard = settings.showLeaderboard !== false
  }

  const roundLength = () => {
    const n = Number(lengthSetting)
    return LENGTHS.includes(n) ? n : LENGTHS[Math.floor(Math.random() * LENGTHS.length)]
  }

  // A new round: with the word the room is playing (`forced`) or a random one of the chosen length,
  // reported to the server. The lists of that length are downloaded first, the first time.
  const startRound = (forced?: string) => {
    if (disposed) return
    if (forced !== undefined) {
      revision++
      request?.abort()
      waiting = false
      deferred = undefined
      // A different room secret invalidates the old round immediately, even
      // while the new length's bank is still in flight.
      data = null
      target = ''
    } else if (waiting) return
    if (paused) { deferred = () => startRound(forced); return }
    const length = forced ? forced.length : roundLength()
    const lists_ = lists.get(length)
    if (!lists_) {
      const failure = failures.get(length)
      if (failure && (failure.count >= GAME_BANK_LIMITS.attempts || !retryDue(failure.at, performance.now()))) return
      const ticket = ++revision
      const controller = new AbortController()
      request = controller
      pendingWord = forced
      waiting = true
      void loadBank(length, controller.signal)
        .then((bank) => {
          if (disposed || revision !== ticket || controller.signal.aborted) return
          lists.set(length, bank)
          failures.delete(length)
          failed = false
          const apply = () => { waiting = false; startRound(forced) }
          if (paused) deferred = apply
          else apply()
        })
        .catch((error: unknown) => {
          if (disposed || revision !== ticket || controller.signal.aborted) return
          controller.abort()
          failed = true
          pendingWord = undefined
          failures.set(length, { at: performance.now(), count: (failure?.count ?? 0) + 1 })
          waiting = false
          console.warn('[zerowordle] Caricamento della banca fallito', error)
        })
      return
    }
    if (forced !== undefined && !lists_.words.has(forced)) forced = undefined
    if (forced === undefined && lists_.solutions.length === 0) return
    const prev = target || null
    let bag = bags.get(length) ?? []
    if (forced === undefined && bag.length === 0) bag = shuffled(lists_.solutions)
    if (forced === undefined) bags.set(length, bag)
    data = lists_
    pendingWord = undefined
    target = forced ?? bag.pop()!
    guesses = []
    revealedIdx = []
    ruledOut = []
    solved = false
    revealed = false
    solver = null
    timer = seconds
    roundClock = 0
    hintClock = 0
    if (forced === undefined) secret.report(target, prev)
  }

  const finish = (by: Viewer | null) => {
    revealed = true
    roundCheer()
    solved = by !== null
    solver = by
    timer = breakSecs
  }

  const revealLetter = (positional: boolean) => {
    if (!target || revealed) return
    const hidden = [...target].map((_, i) => i).filter((i) => !revealedIdx.includes(i))
    if (hidden.length <= 1) return // never give the whole word away
    revealedIdx.push(positional ? hidden[0] : hidden[Math.floor(Math.random() * hidden.length)])
  }

  const ruleOut = () => {
    if (!target || revealed) return
    const known = keyStates(guesses)
    const absent = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !target.includes(c) && !ruledOut.includes(c) && !known.has(c))
    if (absent.length) ruledOut.push(absent[Math.floor(Math.random() * absent.length)])
  }

  return {
    dispose() {
      disposed = true
      revision++
      request?.abort()
      detach?.()
      detach = undefined
      deferred = undefined
      lists.clear()
      bags.clear()
    },
    setPaused(value) {
      paused = value
      if (!paused && !disposed) { const apply = deferred; deferred = undefined; apply?.() }
    },
    reset(settings, w, h) {
      revision++
      request?.abort()
      detach?.()
      disposed = false
      failed = false
      failures.clear()
      deferred = undefined
      pendingWord = undefined
      width = w
      height = h
      read(settings)
      scores.clear()
      bags.clear()
      target = ''
      data = null
      waiting = false
      detach = secret.follow({
        adopt(word) {
          if (word !== target && word !== pendingWord) startRound(word)
        },
      })
      startRound()
    },
    onAction(action, event) {
      if (disposed || paused || !data || !target || revealed) return
      if (action === 'reveal_letter') return revealLetter(true)
      if (action === 'find_letter') return revealLetter(false)
      if (action === 'rule_out') return ruleOut()
      if (event.type !== 'comment') return
      const word = readGuess(event.text, target.length)
      if (!word || !data.words.has(word) || guesses.some((g) => g.word === word)) return
      const tiles = feedback(word, target)
      const row: Guess = { word, tiles, by: event.user, at: performance.now() }
      const gain = newInfo(guesses, row)
      guesses.push(row)
      const user = event.user
      const pts = gain.greens * ptsGreen + gain.golds * ptsGold + (word === target ? solveBonus : 0)
      if (pts > 0) addPoints(scores, user.id, user.nickname, user.avatar, pts)
      if (word === target) finish(user)
      else if (maxGuesses > 0 && guesses.length >= maxGuesses) finish(null)
    },
    update(dt, _now, settings) {
      if (disposed || paused) return
      read(settings)
      if (!target) return startRound()
      if (revealed) {
        timer -= dt
        if (timer <= 0) startRound()
        return
      }
      roundClock += dt
      if (timed && roundClock >= seconds) return finish(null)
      if (autoHints && revealedIdx.length < maxRevealed) {
        hintClock += dt
        if (hintClock >= autoHintSecs) {
          hintClock = 0
          revealLetter(true)
        }
      }
    },
    // Laid out for a canvas 840 wide, and scaled down on a narrower one (the dashboard's preview).
    draw(ctx, now) {
      ctx.clearRect(0, 0, width, height)
      const k = clamp((width - 16) / 840, 0.3, 1)
      ctx.save()
      ctx.scale(k, k)
      paint(ctx, now, width / k, height / k, k)
      ctx.restore()
      if (timed && !revealed && data && target) drawTimerBar(ctx, width, height, 1 - roundClock / seconds, '#2f9e5b')
    },
  }

  function paint(ctx: CanvasRenderingContext2D, now: number, width: number, height: number, k: number) {
    ctx.textBaseline = 'alphabetic'
    const cx = width / 2
    const panelW = Math.min(width - 48, 800)
    const left = cx - panelW / 2
    const top = Math.round(56 / k)
    const bottom = height - Math.round(72 / k)
    if (bottom - top < 420) return

    // One glass panel behind everything, so the game reads over any stream background.
    const bg = ctx.createLinearGradient(0, top, 0, bottom)
    bg.addColorStop(0, 'rgba(16,30,28,0.88)')
    bg.addColorStop(1, 'rgba(10,14,22,0.88)')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(left - 18, top, panelW + 36, bottom - top, 28)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Title: ZERO in white, WORDLE in the green-to-gold gradient.
    ctx.font = '800 40px system-ui'
    const zeroW = ctx.measureText('ZERO').width
    const wordleW = ctx.measureText('WORDLE').width
    const tx = cx - (zeroW + wordleW) / 2
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('ZERO', tx, top + 58)
    const title = ctx.createLinearGradient(tx + zeroW, 0, tx + zeroW + wordleW, 0)
    title.addColorStop(0, '#34d17a')
    title.addColorStop(1, '#f2c14e')
    ctx.fillStyle = title
    ctx.fillText('WORDLE', tx + zeroW, top + 58)

    if (!data || !target) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#9aa0b8'
      ctx.font = '24px system-ui'
      const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3))
      ctx.fillText(failed ? 'Caricamento delle parole non riuscito.' : `Carico le parole${dots}`, cx, top + 130)
      return
    }

    const chips = [
      maxGuesses > 0 ? `${guesses.length}/${maxGuesses} tentativi` : `${guesses.length} tentativi`,
      `${target.length} lettere`,
    ]
    ctx.font = '600 16px system-ui'
    const cw = chips.map((c) => ctx.measureText(c).width + 28)
    let chipX = cx - (cw.reduce((a, b) => a + b, 0) + (chips.length - 1) * 10) / 2
    const chipY = top + 76
    chips.forEach((c, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(chipX, chipY, cw[i], 30, 15)
      ctx.fill()
      ctx.fillStyle = '#c4c9e0'
      ctx.textAlign = 'center'
      ctx.fillText(c, chipX + cw[i] / 2, chipY + 20)
      chipX += cw[i] + 10
    })

    // Space: the board, the keyboard and the ranking share what is left under the chips.
    const boardH = showBoard ? 84 : 0
    const keyH = 40
    const keyGap = 8
    const keysH = 3 * keyH + 2 * keyGap
    const boardTop = bottom - boardH - 12
    const keysTop = (showBoard ? boardTop - 30 : bottom - 14) - keysH
    const gridTop = chipY + 46
    const rows = maxGuesses > 0 ? maxGuesses : 8
    const gap = 8
    const messageRoom = revealed ? 44 : 0
    const n = target.length
    // Tall enough for every row, and narrow enough for the longest word with the names beside it.
    const fitH = Math.floor((keysTop - messageRoom - 32 - gridTop - (rows - 1) * gap) / rows)
    const fitW = Math.floor((panelW - 200 - (n - 1) * gap) / n)
    const tile = clamp(Math.min(fitH, fitW), 18, 64)

    // The hints: letters shown to the chat, above the board.
    let y = gridTop
    if (revealedIdx.length) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#9aa0b8'
      ctx.font = '600 15px system-ui'
      ctx.fillText(`Lettere rivelate: ${revealedIdx.map((i) => `${target[i].toUpperCase()}${i + 1}`).join('  ')}`, cx, y + 4)
    }

    // The board: one row per guess; empty rows show the room left. Tiles flip in one after the other.
    const rowW = n * tile + (n - 1) * gap
    const shownRows = guesses.slice(-rows)
    for (let r = 0; r < rows; r++) {
      const g = shownRows[r]
      const ry = y + 14 + r * (tile + gap)
      for (let i = 0; i < n; i++) {
        const x = cx - rowW / 2 + i * (tile + gap)
        const t = g ? clamp((now - g.at - i * STAGGER_MS) / FLIP_MS, 0, 1) : 0
        const flip = g ? Math.abs(Math.cos(t * Math.PI)) : 1
        const showColor = g && t >= 0.5
        ctx.save()
        ctx.translate(x + tile / 2, ry + tile / 2)
        ctx.scale(1, Math.max(0.04, flip))
        ctx.fillStyle = showColor ? COLORS[g.tiles[i]] : g ? '#2a2d46' : 'rgba(255,255,255,0.05)'
        ctx.beginPath()
        ctx.roundRect(-tile / 2, -tile / 2, tile, tile, 10)
        ctx.fill()
        if (!g) {
          ctx.strokeStyle = 'rgba(255,255,255,0.10)'
          ctx.lineWidth = 2
          ctx.stroke()
        } else {
          ctx.fillStyle = '#ffffff'
          ctx.font = `800 ${Math.round(tile * 0.56)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(g.word[i].toUpperCase(), 0, 2)
        }
        ctx.restore()
      }
      // Who wrote it: the picture beside the name.
      if (g && now - g.at > n * STAGGER_MS) {
        ctx.font = '600 15px system-ui'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#d6daf0'
        const nx = cx + rowW / 2 + 26
        if (nx + 120 < left + panelW + 18) {
          drawAvatar(ctx, g.by.avatar, nx, ry + tile / 2, 11, g.by.nickname)
          ctx.fillText(g.by.nickname, nx + 18, ry + tile / 2)
        }
        ctx.textBaseline = 'alphabetic'
      }
    }

    // The end of the round, under the board.
    if (revealed) {
      ctx.textAlign = 'center'
      const my = keysTop - 16
      if (solved && solver) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = '800 26px system-ui'
        fillTextWithAvatar(ctx, `${solver.nickname} ha indovinato: ${target.toUpperCase()}`, cx, my, solver)
      } else {
        ctx.fillStyle = '#E0A022'
        ctx.font = '800 26px system-ui'
        ctx.fillText(`Era ${target.toUpperCase()}`, cx, my)
      }
    }

    // The keyboard: each key shows the best thing its letter has revealed.
    const states = keyStates(guesses)
    KEYS.forEach((row, r) => {
      const kw = Math.min(54, (panelW - 9 * 6) / 10)
      const total = row.length * kw + (row.length - 1) * 6
      row.split('').forEach((letter, i) => {
        const state = states.get(letter)
        const out = !state && ruledOut.includes(letter)
        const x = cx - total / 2 + i * (kw + 6)
        const ky = keysTop + r * (keyH + keyGap)
        ctx.fillStyle = state ? COLORS[state] : out ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.roundRect(x, ky, kw, keyH, 8)
        ctx.fill()
        ctx.fillStyle = out ? 'rgba(255,255,255,0.25)' : '#ffffff'
        ctx.font = '700 18px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letter.toUpperCase(), x + kw / 2, ky + keyH / 2 + 1)
        ctx.textBaseline = 'alphabetic'
      })
    })

    // The ranking of the five best scorers, in the bottom of the panel.
    if (showBoard) {
      const best5 = topOf(scores, 5)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#7f86a8'
      ctx.font = '700 14px system-ui'
      ctx.fillText('CLASSIFICA', left + 6, boardTop - 6)
      const slot = (panelW - 4 * 8) / 5
      const medals = ['#f5c542', '#c0c6d4', '#d08a4e', '#6f78a8', '#6f78a8']
      for (let i = 0; i < 5; i++) {
        const x = left + i * (slot + 8)
        const mid = boardTop + (boardH - 12) / 2
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        ctx.beginPath()
        ctx.roundRect(x, boardTop, slot, boardH - 12, 14)
        ctx.fill()
        const entry = best5[i]?.[1]
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.fillStyle = medals[i]
        ctx.font = '800 20px system-ui'
        ctx.fillText(String(i + 1), x + 12, mid)
        if (!entry) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)'
          ctx.font = '600 16px system-ui'
          ctx.fillText('—', x + 34, mid)
          continue
        }
        drawAvatar(ctx, entry.avatar, x + 52, mid, 15, entry.name)
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 15px system-ui'
        let name = entry.name
        while (name.length > 3 && ctx.measureText(name).width > slot - 84) name = name.slice(0, -2) + '…'
        ctx.fillText(name, x + 74, mid - 9)
        ctx.fillStyle = medals[i]
        ctx.font = '800 15px system-ui'
        ctx.fillText(`${entry.pts} pt`, x + 74, mid + 11)
      }
      ctx.textBaseline = 'alphabetic'
    }
  }
}
