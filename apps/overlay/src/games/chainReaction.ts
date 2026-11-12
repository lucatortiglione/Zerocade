import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { drawAvatar, fillTextWithAvatar } from './avatar'
import { addPoints, clamp, drawTimerBar, newScores, topOf } from './common'
import { chainId, nextHint, parseChainId, pickChain, readWord, wordValue } from './chainLogic'
import { fold } from './contextRanking'
import { followSecret, reportSecret } from './roomSecret'

// ZeroReazioniACatena: a chain of words where each one is associated with the next. The first and last
// words are given, the others hide behind their first letter, and the chat finds them in any order;
// more letters appear as the round goes on, and a word found with fewer letters shown is worth more.
// The chains come from the server (/api/chains: walks through ZeroAssociazioni's verified pools); the
// chain in play is shared by the room's overlays (roomSecret.ts) and shown to the creator.

let walks: string[][] | null = null
let loading: Promise<string[][]> | null = null
let failed = false

function loadWalks(): Promise<string[][]> {
  loading ??= fetch('/api/chains')
    .then((r) => (r.ok ? (r.json() as Promise<string[][]>) : Promise.reject(new Error('chains'))))
    .then((list) => (walks = list))
    .catch((err) => {
      failed = true
      loading = null
      throw err
    })
  return loading
}

// Who found a word: a viewer, or null when a hint gave it away.
type Finder = Viewer | null

interface Slot {
  word: string
  given: boolean
  solved: boolean
  by: Finder
  pts: number
  shown: number // letters shown (a given or solved word shows all)
  at: number // when it was solved (performance.now), for its entrance
}

export function createChainReaction(): GameInstance {
  let width = 0
  let height = 0
  let chainLength = 6
  let givenMode = 'ends'
  let roundSecs = 120
  let breakSecs = 8
  let autoHints = true
  let autoHintSecs = 20
  let basePts = 20
  let penalty = 2
  let chainBonus = 30
  let showBoard = true

  let slots: Slot[] = []
  let id = ''
  let waiting = false
  let finished = false
  let timeUp = false
  let finisher: Viewer | null = null
  let timer = 0
  let roundClock = 0
  let hintClock = 0
  const scores = newScores()

  const read = (settings: Record<string, number | boolean | string>) => {
    const num = (key: string, fallback: number) => (typeof settings[key] === 'number' ? (settings[key] as number) : fallback)
    chainLength = num('chainLength', 6)
    givenMode = String(settings.givenWords ?? 'ends')
    roundSecs = num('roundSeconds', 120)
    breakSecs = num('breakSeconds', 8)
    autoHints = settings.autoHints !== false
    autoHintSecs = num('autoHintSeconds', 20)
    basePts = num('wordPoints', 20)
    penalty = num('letterPenalty', 2)
    chainBonus = num('chainBonus', 30)
    showBoard = settings.showLeaderboard !== false
  }

  // A new round: with the chain the room is playing (`forced`) or a random one, reported to the server.
  const startRound = (forced?: string[]) => {
    if (waiting) return
    if (!walks) {
      if (failed) return
      waiting = true
      void loadWalks()
        .then(() => {
          waiting = false
          startRound(forced)
        })
        .catch(() => {
          waiting = false
        })
      return
    }
    const words = forced ?? pickChain(walks, clamp(chainLength, 3, 9))
    if (!words || words.length < 3) return
    const prev = id || null
    id = chainId(words)
    slots = words.map((word, i) => {
      const given = i === 0 || (givenMode === 'ends' && i === words.length - 1)
      return { word, given, solved: false, by: null, pts: 0, shown: given ? word.length : 1, at: 0 }
    })
    finished = false
    timeUp = false
    finisher = null
    timer = breakSecs
    roundClock = 0
    hintClock = 0
    if (forced === undefined) reportSecret(id, prev)
  }

  const open = () => slots.map((s) => !s.given && !s.solved)

  const finish = (by: Viewer | null, late: boolean) => {
    finished = true
    timeUp = late
    finisher = by
    timer = breakSecs
  }

  // One more letter of the hidden word with the fewest shown.
  const hint = () => {
    const i = nextHint(
      slots.map((s) => s.word),
      slots.map((s) => s.shown),
      open(),
    )
    if (i >= 0) slots[i].shown++
  }

  const revealWord = () => {
    const i = open().indexOf(true)
    if (i < 0) return
    Object.assign(slots[i], { solved: true, by: null, pts: 0, shown: slots[i].word.length, at: performance.now() })
    if (!open().includes(true)) finish(null, false)
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      read(settings)
      scores.clear()
      slots = []
      id = ''
      waiting = false
      followSecret({
        adopt(adopted) {
          if (adopted !== id) startRound(parseChainId(adopted))
        },
      })
      startRound()
    },
    onAction(action, event) {
      if (!slots.length || finished) return
      if (action === 'reveal_letter') return hint()
      if (action === 'reveal_word') return revealWord()
      if (event.type !== 'comment') return
      const guess = readWord(event.text)
      if (!guess) return
      const i = slots.findIndex((s) => !s.given && !s.solved && fold(s.word) === guess)
      if (i < 0) return
      const user = event.user
      const slot = slots[i]
      const pts = wordValue(basePts, slot.shown, penalty)
      Object.assign(slot, { solved: true, by: user, pts, shown: slot.word.length, at: performance.now() })
      let gained = pts
      const complete = !open().includes(true)
      if (complete) gained += chainBonus
      if (gained > 0) addPoints(scores, user.id, user.nickname, user.avatar, gained)
      if (complete) finish(user, false)
    },
    update(dt, _now, settings) {
      read(settings)
      if (!slots.length) return startRound()
      if (finished) {
        timer -= dt
        if (timer <= 0) startRound()
        return
      }
      roundClock += dt
      if (roundSecs > 0 && roundClock >= roundSecs) {
        // The words nobody found are shown as they are.
        slots.forEach((s) => {
          if (!s.given && !s.solved) Object.assign(s, { shown: s.word.length })
        })
        return finish(null, true)
      }
      if (autoHints) {
        hintClock += dt
        if (hintClock >= autoHintSecs) {
          hintClock = 0
          hint()
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
      if (!finished && roundSecs > 0 && slots.length) drawTimerBar(ctx, width, height, 1 - roundClock / roundSecs, '#ff7a45')
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
    bg.addColorStop(0, 'rgba(34,20,30,0.88)')
    bg.addColorStop(1, 'rgba(12,12,24,0.88)')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(left - 18, top, panelW + 36, bottom - top, 28)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Title: ZERO in white, REAZIONE A CATENA in the orange-to-pink gradient.
    ctx.font = '800 32px system-ui'
    const zeroW = ctx.measureText('ZERO').width
    const restW = ctx.measureText('REAZIONE A CATENA').width
    const tx = cx - (zeroW + restW) / 2
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.fillText('ZERO', tx, top + 52)
    const title = ctx.createLinearGradient(tx + zeroW, 0, tx + zeroW + restW, 0)
    title.addColorStop(0, '#ff9a3c')
    title.addColorStop(1, '#ff4f8b')
    ctx.fillStyle = title
    ctx.fillText('REAZIONE A CATENA', tx + zeroW, top + 52)

    if (!slots.length) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#9aa0b8'
      ctx.font = '24px system-ui'
      const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3))
      ctx.fillText(failed ? 'Nessuna catena disponibile (prompt.sqlite3)' : `Carico le catene${dots}`, cx, top + 130)
      return
    }

    const hidden = slots.filter((s) => !s.given)
    const foundCount = hidden.filter((s) => s.solved).length
    const chips = [`${foundCount}/${hidden.length} parole`, roundSecs > 0 && !finished ? `${Math.max(0, Math.ceil(roundSecs - roundClock))} s` : 'scrivi la parola che manca']
    ctx.font = '600 16px system-ui'
    const cw = chips.map((c) => ctx.measureText(c).width + 28)
    let chipX = cx - (cw.reduce((a, b) => a + b, 0) + (chips.length - 1) * 10) / 2
    const chipY = top + 72
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

    // The chain, one card per word with a link between neighbours.
    const boardH = showBoard ? 84 : 0
    const boardTop = bottom - boardH - 12
    const chainTop = chipY + 46
    const messageRoom = finished ? 44 : 0
    const chainBottom = (showBoard ? boardTop - 30 : bottom - 14) - messageRoom
    const n = slots.length
    const link = 16
    const cardH = clamp(Math.floor((chainBottom - chainTop - (n - 1) * link) / n), 36, 76)
    const startY = chainTop
    slots.forEach((slot, i) => {
      const y = startY + i * (cardH + link)
      const e = slot.solved ? 1 - Math.pow(1 - clamp((now - slot.at) / 420, 0, 1), 3) : 1
      const solvedColor = slot.by ? '#2f9e5b' : '#d6a62f'
      ctx.fillStyle = slot.given ? 'rgba(124,92,255,0.22)' : slot.solved ? solvedColor + '33' : 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.roundRect(left, y, panelW, cardH, 16)
      ctx.fill()
      if (slot.solved) {
        ctx.strokeStyle = solvedColor
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // The letters as tiles: shown ones filled, hidden ones empty.
      const len = slot.word.length
      const tile = Math.min(cardH - 16, 40, Math.floor((panelW * 0.58 - (len - 1) * 6) / len))
      const tx0 = left + 18
      for (let c = 0; c < len; c++) {
        const x = tx0 + c * (tile + 6)
        const shown = c < slot.shown
        const pop = slot.solved ? Math.sin(clamp((now - slot.at - c * 50) / 240, 0, 1) * Math.PI) * 6 : 0
        const ty = y + (cardH - tile) / 2 - pop
        ctx.fillStyle = shown ? (slot.given ? '#5b46c9' : slot.solved ? solvedColor : '#3b3f66') : 'rgba(255,255,255,0.07)'
        ctx.beginPath()
        ctx.roundRect(x, ty, tile, tile, 8)
        ctx.fill()
        if (shown) {
          ctx.fillStyle = '#ffffff'
          ctx.font = `800 ${Math.round(tile * 0.58)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(slot.word[c].toUpperCase(), x + tile / 2, ty + tile / 2 + 1)
          ctx.textBaseline = 'alphabetic'
        }
      }

      // Who found it: the picture beside the name, and what it was worth.
      ctx.globalAlpha = e
      ctx.textBaseline = 'middle'
      const mid = y + cardH / 2
      const rightX = left + panelW - 18
      if (slot.solved) {
        ctx.textAlign = 'right'
        ctx.font = '800 20px system-ui'
        ctx.fillStyle = slot.by ? '#7ff0ac' : '#f2c14e'
        ctx.fillText(slot.by ? `+${slot.pts}` : 'svelta', rightX, mid)
        if (slot.by) {
          ctx.font = '600 16px system-ui'
          ctx.fillStyle = '#d6daf0'
          const nameRight = rightX - 56
          const nameW = ctx.measureText(slot.by.nickname).width
          drawAvatar(ctx, slot.by.avatar, nameRight - nameW - 18, mid, 12, slot.by.nickname)
          ctx.fillText(slot.by.nickname, nameRight, mid)
        }
      } else if (slot.given) {
        ctx.textAlign = 'right'
        ctx.font = '700 14px system-ui'
        ctx.fillStyle = '#a99cff'
        ctx.fillText(i === 0 ? 'PARTENZA' : 'ARRIVO', rightX, mid)
      }
      ctx.globalAlpha = 1
      ctx.textBaseline = 'alphabetic'

      // The link to the next word.
      if (i < n - 1) {
        const lx = cx
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(lx, y + cardH + 2)
        ctx.lineTo(lx, y + cardH + link - 2)
        ctx.stroke()
      }
    })

    // The end of the round, under the chain.
    if (finished) {
      ctx.textAlign = 'center'
      const my = chainBottom + 30
      ctx.font = '800 24px system-ui'
      if (finisher) {
        ctx.fillStyle = '#3ccf7a'
        fillTextWithAvatar(ctx, `${finisher.nickname} ha completato la catena! +${chainBonus}`, cx, my, finisher)
      } else {
        ctx.fillStyle = '#E0A022'
        ctx.fillText(timeUp ? 'Tempo scaduto: ecco la catena' : 'Catena svelata', cx, my)
      }
    }

    // The ranking of the five best scorers, in the bottom of the panel.
    if (showBoard) {
      const best5 = topOf(scores, 5)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#7f86a8'
      ctx.font = '700 14px system-ui'
      ctx.fillText('CLASSIFICA', left + 6, boardTop - 6)
      const slotW = (panelW - 4 * 8) / 5
      const medals = ['#f5c542', '#c0c6d4', '#d08a4e', '#6f78a8', '#6f78a8']
      for (let i = 0; i < 5; i++) {
        const x = left + i * (slotW + 8)
        const mid = boardTop + (boardH - 12) / 2
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        ctx.beginPath()
        ctx.roundRect(x, boardTop, slotW, boardH - 12, 14)
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
        while (name.length > 3 && ctx.measureText(name).width > slotW - 84) name = name.slice(0, -2) + '…'
        ctx.fillText(name, x + 74, mid - 9)
        ctx.fillStyle = medals[i]
        ctx.font = '800 15px system-ui'
        ctx.fillText(`${entry.pts} pt`, x + 74, mid + 11)
      }
      ctx.textBaseline = 'alphabetic'
    }
  }
}
