import { CHAIN_MODES, chainModeFor, chainModeLabel, chainSecret, type ChainMode, type ChainRound, parseChainSecret, type Viewer } from '@zerocade/shared'
import { retryDue } from './retry'
import type { GameInstance } from './engine'
import { drawAvatar, fillTextWithAvatar } from './avatar'
import { addPoints, clamp, drawTimerBar, newScores, topOf } from './common'
import { KEY_START_CLUES, dominoOpen, keyValue, nextHint, pickChain, pickKey, readWord, wordValue } from './chainLogic'
import { fold } from './contextRanking'
import { followSecret, reportSecret } from './roomSecret'
import { roundCheer } from '../audio'

// ZeroReazioniACatena: words linked by verified associations, in three modes that take turns (by default
// every 5 rounds, in this order):
// - Effetto domino: a chain where only the first word is given and the others are found in order, each
//   one opening the next.
// - Catena completa: a chain with its first (and last) word given; the others are found in any order.
// - Parola chiave: one hidden word and the words associated with it, shown one by one as clues.
// Hidden words show their first letter and gain more as the round goes on; a word found with less shown
// is worth more. The chains and the clues come from the server (/api/chains, /api/chains/keys: built from
// ZeroAssociazioni's verified pools); the round in play, with its mode and number, is shared by the room's
// overlays (roomSecret.ts) and shown to the creator.

type ListKind = 'walks' | 'keys'
const URLS: Record<ListKind, string> = { walks: '/api/chains', keys: '/api/chains/keys' }
// failedAt: when the last download failed (performance.now()), null if none did; it is tried again after RETRY_MS.
const lists: Record<ListKind, { data: string[][] | null; loading: Promise<string[][]> | null; failedAt: number | null }> = {
  walks: { data: null, loading: null, failedAt: null },
  keys: { data: null, loading: null, failedAt: null },
}

function load(kind: ListKind): Promise<string[][]> {
  const list = lists[kind]
  list.loading ??= fetch(URLS[kind])
    .then((r) => (r.ok ? (r.json() as Promise<string[][]>) : Promise.reject(new Error(kind))))
    .then((data) => {
      list.failedAt = null
      return (list.data = data)
    })
    .catch((err) => {
      list.failedAt = performance.now()
      list.loading = null
      throw err
    })
  return list.loading
}

// Seconds the new mode's card stays up before its first round starts.
const INTRO_SECS = 4

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
  let modeSetting = 'rotate'
  let perMode = 5
  let chainLength = 6
  let givenMode = 'ends'
  let roundSecs = 120
  let breakSecs = 8
  let autoHints = true
  let autoHintSecs = 20
  let basePts = 20
  let penalty = 2
  let chainBonus = 30
  let keyPts = 60
  let keyPenalty = 6
  let showBoard = true

  let mode: ChainMode = 'catena'
  let round = 0
  let slots: Slot[] = []
  let clues: string[] = [] // "Parola chiave" only
  let cluesShown = 0
  let clueAt: number[] = [] // when each clue appeared, for its entrance
  let id = ''
  let waiting = false
  let finished = false
  let timeUp = false
  let finisher: Viewer | null = null
  let finishPts = 0
  let timer = 0
  let roundClock = 0
  let hintClock = 0
  let intro = 0
  const scores = newScores()

  const read = (settings: Record<string, number | boolean | string>) => {
    const num = (key: string, fallback: number) => (typeof settings[key] === 'number' ? (settings[key] as number) : fallback)
    modeSetting = String(settings.chainMode ?? 'rotate')
    perMode = num('roundsPerMode', 5)
    chainLength = num('chainLength', 6)
    givenMode = String(settings.givenWords ?? 'ends')
    roundSecs = num('roundSeconds', 120)
    breakSecs = num('breakSeconds', 8)
    autoHints = settings.autoHints !== false
    autoHintSecs = num('autoHintSeconds', 20)
    basePts = num('wordPoints', 20)
    penalty = num('letterPenalty', 2)
    chainBonus = num('chainBonus', 30)
    keyPts = num('keyPoints', 60)
    keyPenalty = num('keyPenalty', 6)
    showBoard = settings.showLeaderboard !== false
  }

  // A new round: the one the room is playing (`forced`), or the next of this overlay's count in the mode
  // the settings give it, reported to the server.
  const startRound = (forced?: ChainRound) => {
    if (waiting) return
    const nextRound = forced ? forced.round : round + 1
    let nextMode = forced ? forced.mode : chainModeFor(modeSetting, nextRound, perMode)
    // Without the clues (the server could not build them) a "Parola chiave" round plays a chain, until they can be
    // asked for again.
    if (!forced && nextMode === 'chiave' && !retryDue(lists.keys.failedAt, performance.now())) nextMode = 'catena'
    const kind: ListKind = nextMode === 'chiave' ? 'keys' : 'walks'
    if (!forced && !lists[kind].data) {
      // update calls again every frame: retryDue spaces the downloads after a failure.
      if (!retryDue(lists[kind].failedAt, performance.now())) return
      waiting = true
      void load(kind)
        .then(() => {
          waiting = false
          startRound()
        })
        .catch(() => {
          waiting = false
        })
      return
    }
    const words = forced?.words ?? (kind === 'keys' ? pickKey(lists.keys.data ?? []) : pickChain(lists.walks.data ?? [], clamp(chainLength, 3, 9)))
    if (!words || words.length < 3) return
    const prev = id || null
    const switched = nextMode !== mode || round === 0
    mode = nextMode
    round = nextRound
    id = chainSecret({ mode, round, words })
    if (mode === 'chiave') {
      slots = [{ word: words[0], given: false, solved: false, by: null, pts: 0, shown: 1, at: 0 }]
      clues = words.slice(1)
      cluesShown = Math.min(KEY_START_CLUES, clues.length)
      clueAt = clues.map(() => 0)
    } else {
      slots = words.map((word, i) => {
        const given = i === 0 || (mode === 'catena' && givenMode === 'ends' && i === words.length - 1)
        return { word, given, solved: false, by: null, pts: 0, shown: given ? word.length : 1, at: 0 }
      })
      clues = []
      cluesShown = 0
      clueAt = []
    }
    finished = false
    timeUp = false
    finisher = null
    finishPts = 0
    timer = breakSecs
    roundClock = 0
    hintClock = 0
    intro = switched ? INTRO_SECS : 0
    if (!forced) reportSecret(id, prev)
  }

  // The words a guess or a letter can go to: in "Effetto domino" only the next one of the chain.
  const open = () =>
    mode === 'domino'
      ? dominoOpen(
          slots.map((s) => s.given),
          slots.map((s) => s.solved),
        )
      : slots.map((s) => !s.given && !s.solved)
  const left = () => slots.some((s) => !s.given && !s.solved)

  const showClues = (n: number) => {
    for (let i = cluesShown; i < n; i++) clueAt[i] = performance.now()
    cluesShown = Math.max(cluesShown, n)
  }

  const finish = (by: Viewer | null, late: boolean, pts = 0) => {
    finished = true
    roundCheer()
    timeUp = late
    finisher = by
    finishPts = pts
    timer = breakSecs
    if (mode === 'chiave') showClues(clues.length)
  }

  // One more clue ("Parola chiave", until they are all out), or one more letter of the open word with the
  // fewest shown.
  const hint = () => {
    if (mode === 'chiave' && cluesShown < clues.length) return showClues(cluesShown + 1)
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
    if (!left()) finish(null, false)
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      read(settings)
      scores.clear()
      slots = []
      id = ''
      round = 0
      waiting = false
      followSecret({
        adopt(adopted) {
          const r = adopted !== id ? parseChainSecret(adopted) : null
          if (r) startRound(r)
        },
      })
      startRound()
    },
    onAction(action, event) {
      if (!slots.length || finished) return
      if (action === 'reveal_letter') return hint()
      if (action === 'reveal_word') return revealWord()
      // Nobody can read the words while the new mode's card covers them.
      if (event.type !== 'comment' || intro > 0) return
      const guess = readWord(event.text)
      if (!guess) return
      const openNow = open()
      const i = slots.findIndex((s, j) => openNow[j] && fold(s.word) === guess)
      if (i < 0) return
      const user = event.user
      const slot = slots[i]
      const pts = mode === 'chiave' ? keyValue(keyPts, keyPenalty, cluesShown, slot.shown) : wordValue(basePts, slot.shown, penalty)
      Object.assign(slot, { solved: true, by: user, pts, shown: slot.word.length, at: performance.now() })
      const complete = !left()
      const bonus = complete && mode !== 'chiave' ? chainBonus : 0
      if (pts + bonus > 0) addPoints(scores, user.id, user.nickname, user.avatar, pts + bonus)
      if (complete) finish(user, false, mode === 'chiave' ? pts : bonus)
    },
    update(dt, _now, settings) {
      read(settings)
      if (!slots.length) return startRound()
      if (finished) {
        timer -= dt
        if (timer <= 0) startRound()
        return
      }
      if (intro > 0) {
        intro = Math.max(0, intro - dt)
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
    ctx.fillStyle = brand(ctx, tx + zeroW, tx + zeroW + restW)
    ctx.fillText('REAZIONE A CATENA', tx + zeroW, top + 52)

    if (!slots.length) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#9aa0b8'
      ctx.font = '24px system-ui'
      const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3))
      ctx.fillText(lists.walks.failedAt !== null ? 'Nessuna catena disponibile (schema associazioni)' : `Carico le catene${dots}`, cx, top + 130)
      return
    }

    // The chips: the mode (and where the round is in its turn), the progress, the time.
    const rotating = modeSetting === 'rotate' && round > 0
    const modeChip = chainModeLabel(mode) + (rotating ? ` · ${((round - 1) % Math.max(1, perMode)) + 1}/${Math.max(1, perMode)}` : '')
    const hidden = slots.filter((s) => !s.given)
    const progress =
      mode === 'chiave'
        ? `${cluesShown}/${clues.length} indizi` + (finished ? '' : ` · vale ${keyValue(keyPts, keyPenalty, cluesShown, slots[0].shown)} pt`)
        : `${hidden.filter((s) => s.solved).length}/${hidden.length} parole`
    const prompt = mode === 'chiave' ? 'scrivi la parola chiave' : mode === 'domino' ? 'scrivi la prossima parola' : 'scrivi la parola che manca'
    const chips = [modeChip, progress, roundSecs > 0 && !finished ? `${Math.max(0, Math.ceil(roundSecs - roundClock))} s` : prompt]
    ctx.font = '600 16px system-ui'
    const cw = chips.map((c) => ctx.measureText(c).width + 28)
    let chipX = cx - (cw.reduce((a, b) => a + b, 0) + (chips.length - 1) * 10) / 2
    const chipY = top + 72
    chips.forEach((c, i) => {
      ctx.fillStyle = i === 0 ? brand(ctx, chipX, chipX + cw[i]) : 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(chipX, chipY, cw[i], 30, 15)
      ctx.fill()
      ctx.fillStyle = i === 0 ? '#ffffff' : '#c4c9e0'
      ctx.font = i === 0 ? '700 16px system-ui' : '600 16px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(c, chipX + cw[i] / 2, chipY + 20)
      chipX += cw[i] + 10
    })

    const boardH = showBoard ? 84 : 0
    const boardTop = bottom - boardH - 12
    const bodyTop = chipY + 46
    const messageRoom = finished ? 44 : 0
    const bodyBottom = (showBoard ? boardTop - 30 : bottom - 14) - messageRoom
    if (mode === 'chiave') paintKey(ctx, now, left, panelW, cx, bodyTop, bodyBottom)
    else paintChain(ctx, now, left, panelW, cx, bodyTop, bodyBottom)

    // The end of the round, under the words.
    if (finished) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const my = bodyBottom + 30
      ctx.font = '800 24px system-ui'
      if (finisher) {
        ctx.fillStyle = '#3ccf7a'
        const text = mode === 'chiave' ? `${finisher.nickname} ha trovato la parola chiave! +${finishPts}` : `${finisher.nickname} ha completato la catena! +${finishPts}`
        fillTextWithAvatar(ctx, text, cx, my, finisher)
      } else {
        ctx.fillStyle = '#E0A022'
        const what = mode === 'chiave' ? 'la parola chiave' : 'la catena'
        ctx.fillText(timeUp ? `Tempo scaduto: ecco ${what}` : mode === 'chiave' ? 'Parola chiave svelata' : 'Catena svelata', cx, my)
      }
    }

    // The ranking of the five best scorers, in the bottom of the panel.
    if (showBoard) paintBoard(ctx, left, panelW, boardTop, boardH)

    // A new mode: its name and rule over the panel, before its first round.
    if (intro > 0) paintIntro(ctx, left, panelW, cx, top + 66, bottom)
  }

  // Effetto domino and Catena completa: one card per word with a link between neighbours.
  function paintChain(ctx: CanvasRenderingContext2D, now: number, left: number, panelW: number, cx: number, chainTop: number, chainBottom: number) {
    const n = slots.length
    const link = 16
    const cardH = clamp(Math.floor((chainBottom - chainTop - (n - 1) * link) / n), 36, 76)
    const openNow = open()
    slots.forEach((slot, i) => {
      const y = chainTop + i * (cardH + link)
      const e = slot.solved ? 1 - Math.pow(1 - clamp((now - slot.at) / 420, 0, 1), 3) : 1
      // In Effetto domino the word to find now is lit, the ones after it wait in the dark.
      const current = mode === 'domino' && !finished && openNow[i]
      const locked = mode === 'domino' && !finished && !slot.given && !slot.solved && !openNow[i]
      const solvedColor = slot.by ? '#2f9e5b' : '#d6a62f'
      ctx.globalAlpha = locked ? 0.4 : 1
      ctx.fillStyle = slot.given ? 'rgba(124,92,255,0.22)' : slot.solved ? solvedColor + '33' : current ? 'rgba(255,122,69,0.14)' : 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.roundRect(left, y, panelW, cardH, 16)
      ctx.fill()
      if (slot.solved || current) {
        ctx.strokeStyle = slot.solved ? solvedColor : '#ff9a3c'
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
      ctx.globalAlpha = locked ? 0.4 : e
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
      } else if (current) {
        ctx.textAlign = 'right'
        ctx.font = '800 14px system-ui'
        ctx.fillStyle = '#ff9a3c'
        ctx.fillText('TOCCA A QUESTA', rightX, mid)
      }
      ctx.globalAlpha = 1
      ctx.textBaseline = 'alphabetic'

      // The link to the next word.
      if (i < n - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx, y + cardH + 2)
        ctx.lineTo(cx, y + cardH + link - 2)
        ctx.stroke()
      }
    })
  }

  // Parola chiave: the hidden word on top, its clues in two columns below.
  function paintKey(ctx: CanvasRenderingContext2D, now: number, left: number, panelW: number, cx: number, bodyTop: number, bodyBottom: number) {
    const slot = slots[0]
    const solvedColor = slot.by ? '#2f9e5b' : '#d6a62f'
    const len = slot.word.length
    const tile = Math.min(56, Math.floor((panelW - 60 - (len - 1) * 8) / len))
    const cardH = tile + 58
    ctx.fillStyle = slot.solved ? solvedColor + '33' : 'rgba(255,122,69,0.14)'
    ctx.beginPath()
    ctx.roundRect(left, bodyTop, panelW, cardH, 18)
    ctx.fill()
    ctx.strokeStyle = slot.solved ? solvedColor : 'rgba(255,154,60,0.7)'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = '800 14px system-ui'
    ctx.fillStyle = slot.solved ? (slot.by ? '#7ff0ac' : '#f2c14e') : '#ff9a3c'
    ctx.fillText('PAROLA CHIAVE', left + 18, bodyTop + 20)
    if (slot.solved) {
      const e = 1 - Math.pow(1 - clamp((now - slot.at) / 420, 0, 1), 3)
      ctx.globalAlpha = e
      ctx.textAlign = 'right'
      const rightX = left + panelW - 18
      ctx.font = '800 18px system-ui'
      ctx.fillText(slot.by ? `+${slot.pts}` : 'svelata', rightX, bodyTop + 20)
      if (slot.by) {
        ctx.font = '600 15px system-ui'
        ctx.fillStyle = '#d6daf0'
        const nameRight = rightX - 52
        const nameW = ctx.measureText(slot.by.nickname).width
        drawAvatar(ctx, slot.by.avatar, nameRight - nameW - 16, bodyTop + 20, 11, slot.by.nickname)
        ctx.fillText(slot.by.nickname, nameRight, bodyTop + 20)
      }
      ctx.globalAlpha = 1
    }

    const total = len * tile + (len - 1) * 8
    const tx0 = cx - total / 2
    for (let c = 0; c < len; c++) {
      const x = tx0 + c * (tile + 8)
      const shown = c < slot.shown
      const pop = slot.solved ? Math.sin(clamp((now - slot.at - c * 50) / 240, 0, 1) * Math.PI) * 8 : 0
      const ty = bodyTop + 38 - pop
      ctx.fillStyle = shown ? (slot.solved ? solvedColor : '#3b3f66') : 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(x, ty, tile, tile, 10)
      ctx.fill()
      if (shown) {
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 ${Math.round(tile * 0.58)}px system-ui`
        ctx.textAlign = 'center'
        ctx.fillText(slot.word[c].toUpperCase(), x + tile / 2, ty + tile / 2 + 1)
      }
    }

    // The clues: shown ones with their number, the others still waiting.
    const gridTop = bodyTop + cardH + 16
    const cols = 2
    const rows = Math.ceil(clues.length / cols)
    const gap = 10
    const cellW = (panelW - gap) / cols
    const cellH = clamp(Math.floor((bodyBottom - gridTop - (rows - 1) * gap) / Math.max(1, rows)), 34, 64)
    clues.forEach((clue, i) => {
      const x = left + (i % cols) * (cellW + gap)
      const y = gridTop + Math.floor(i / cols) * (cellH + gap)
      const mid = y + cellH / 2
      const shown = i < cluesShown
      const e = shown ? 1 - Math.pow(1 - clamp((now - clueAt[i]) / 380, 0, 1), 3) : 1
      ctx.fillStyle = shown ? 'rgba(124,92,255,0.22)' : 'rgba(255,255,255,0.05)'
      ctx.beginPath()
      ctx.roundRect(x, y, cellW, cellH, 14)
      ctx.fill()
      ctx.fillStyle = shown ? '#7c5cff' : 'rgba(255,255,255,0.10)'
      ctx.beginPath()
      ctx.arc(x + 26, mid, 13, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 14px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), x + 26, mid + 1)
      ctx.textAlign = 'left'
      if (shown) {
        ctx.globalAlpha = e
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 ${Math.round(clamp(cellH * 0.42, 16, 26))}px system-ui`
        ctx.fillText(clue.toUpperCase(), x + 50 + (1 - e) * 12, mid + 1)
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.28)'
        ctx.font = '700 18px system-ui'
        ctx.fillText('?', x + 50, mid + 1)
      }
    })
    ctx.textBaseline = 'alphabetic'
  }

  function paintBoard(ctx: CanvasRenderingContext2D, left: number, panelW: number, boardTop: number, boardH: number) {
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

  function paintIntro(ctx: CanvasRenderingContext2D, left: number, panelW: number, cx: number, coverTop: number, bottom: number) {
    const fade = clamp(intro / 0.4, 0, 1) * clamp((INTRO_SECS - intro) / 0.3, 0, 1)
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(10,8,18,0.9)'
    ctx.beginPath()
    ctx.roundRect(left - 18, coverTop, panelW + 36, bottom - coverTop, [0, 0, 28, 28])
    ctx.fill()

    const info = CHAIN_MODES.find((m) => m.id === mode)
    const cy = (coverTop + bottom) / 2 - 40
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '800 16px system-ui'
    ctx.fillStyle = '#ff9a3c'
    ctx.fillText(modeSetting === 'rotate' ? `NUOVA MODALITÀ · ${Math.max(1, perMode)} ROUND` : 'MODALITÀ', cx, cy - 56)
    ctx.font = '800 52px system-ui'
    const label = chainModeLabel(mode).toUpperCase()
    const lw = ctx.measureText(label).width
    ctx.fillStyle = brand(ctx, cx - lw / 2, cx + lw / 2)
    ctx.fillText(label, cx, cy)
    ctx.font = '600 22px system-ui'
    ctx.fillStyle = '#d6daf0'
    wrap(ctx, info?.rule ?? '', panelW - 80).forEach((line, i) => ctx.fillText(line, cx, cy + 56 + i * 30))
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
  }
}

// The orange-to-pink of the title, across [x0, x1].
function brand(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, '#ff9a3c')
  g.addColorStop(1, '#ff4f8b')
  return g
}

// A text broken into lines no wider than `max` in the current font.
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > max) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}
