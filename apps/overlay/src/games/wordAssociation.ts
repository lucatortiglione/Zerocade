import {
  WORD_ASSOCIATION_WRONG_SENT,
  answerKey,
  drawPuzzle,
  guessKey,
  isWordAssociationPool,
  type GameSettings,
  type WordAssociationPool,
  type WordAssociationPuzzle,
  type WordAssociationRoundReport,
} from '@zerocade/shared'
import type { GameInstance } from './engine'
import { drawAvatar, fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled, topOf } from './common'
import { itemsFor } from '../content'
import { roundCheer } from '../audio'

// ZeroAssociazioni (Word Association v3.6.0): the prompt is shown, the chat guesses its 7 or 8 hidden words, drawn
// each round from the prompt's verified pool (schema associazioni of database/giochi.sqlite3).
// Each word goes to the first viewer who writes it (an inflected form counts too: "pomodori"),
// with a speed bonus and a combo for words found quickly one after the other. Long words can
// start with a letter or two, more letters show as the round goes on, and a gift uncovers some.
// A round is timed (ending early when every word is found) or lasts until they are all found.
// Every few rounds a special round turns it around: the words appear one at a time and the
// first viewer to guess the prompt wins, more points the fewer words were out.
// The match never ends (one leaderboard for the whole live), or ends after some rounds or when
// someone reaches a score, with a podium. After each normal round `report` gets what the chat did.

interface Finder {
  name: string
  avatar?: string
}

interface Slot {
  word: string
  keys: Set<string>
  // Letters shown while hidden (head start, drip, gifts).
  shown: number
  found: (Finder & { ms: number; hinted: boolean }) | null
}

const MAX_COMBO_BONUS = 3
// A combo needs the same viewer's next word within this many seconds.
const COMBO_WINDOW_SECONDS = 10
// Drip reveal: a timed round uncovers a letter at these shares of its time; a round without a
// timer, after this many seconds with nothing found.
const DRIP_AT = [0.5, 0.7, 0.85]
const UNTIMED_DRIP_SECONDS = 20
// A round without a timer still ends after this long, so the game never stalls.
const UNTIMED_MAX_SECONDS = 600
// The speed bonus of a round without a timer fades over this many seconds.
const UNTIMED_SPEED_SECONDS = 60
const MATCH_OVER_SECONDS = 10
// A special round lasts this many reveal intervals more once every word is out.
const SPECIAL_LAST_INTERVALS = 2

// The most letters drip and head start show: two stay hidden (one in very short words).
const softCap = (word: string) => Math.max(1, word.length - 2)
// Gifts may go further, but never show the whole word.
const hardCap = (word: string) => Math.max(0, word.length - 1)
const headStart = (word: string) => (word.length >= 11 ? 2 : word.length >= 8 ? 1 : 0)
const masked = (word: string, shown: number) =>
  [...word.toLocaleUpperCase('it')].map((c, j) => (j < shown ? c : '_')).join(' ')

// The longest start of `text` that fits in `max` pixels, with an ellipsis when cut.
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  for (let n = text.length - 1; n > 0; n--) {
    const cut = text.slice(0, n) + '…'
    if (ctx.measureText(cut).width <= max) return cut
  }
  return ''
}

// A found word in its slot: the solver's picture right next to it, then their name, smaller.
function drawSolved(ctx: CanvasRenderingContext2D, word: string, who: Finder, cx: number, top: number, cellW: number, cellH: number) {
  const text = word.toLocaleUpperCase('it')
  const wordFont = `bold ${Math.min(28, cellH * 0.48)}px system-ui`
  const nameFont = `${Math.min(20, cellH * 0.34)}px system-ui`
  const r = cellH * 0.36
  const pad = r * 0.5
  const baseline = top + cellH * 0.66
  ctx.font = wordFont
  const wordW = ctx.measureText(text).width
  ctx.font = nameFont
  const name = fitText(ctx, who.name, cellW - 32 - (r * 2 + pad + wordW + pad * 2))
  const nameW = name ? ctx.measureText(name).width : 0
  let x = cx - (r * 2 + pad + wordW + (name ? pad * 2 + nameW : 0)) / 2
  drawAvatar(ctx, who.avatar, x + r, top + cellH / 2, r, who.name)
  x += r * 2 + pad
  ctx.save()
  ctx.textAlign = 'left'
  ctx.font = wordFont
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x, baseline)
  if (name) {
    ctx.font = nameFont
    ctx.fillStyle = '#bfe8d0'
    ctx.fillText(name, x + wordW + pad * 2, baseline)
  }
  ctx.restore()
}

export function createWordAssociation(report?: (round: WordAssociationRoundReport) => void): GameInstance {
  let width = 0
  let height = 0
  // Settings (see the catalog in @zerocade/shared).
  let answerCount: 7 | 8 | 'random' = 'random'
  let timed = true
  let roundSecs = 60
  let breakSecs = 5
  let matchEnd: 'endless' | 'rounds' | 'points' = 'endless'
  let matchRounds = 10
  let matchPoints = 100
  let pts = 1
  let speedBonus = true
  let combos = true
  let longWordHeadStart = true
  let drip = true
  let giftLetters = 2
  let guessCap = 0
  let specialEvery = 10
  let specialSecs = 6
  let showHint = false
  let showBoard = true

  let deck: WordAssociationPool[] = []
  let puzzle: WordAssociationPuzzle | null = null
  let slots: Slot[] = []
  let phase: 'play' | 'summary' | 'match' = 'play'
  let endedBy: 'all' | 'time' | 'other' = 'other'
  // Seconds into the round, and left in the round (timed) or in the summary / podium.
  let elapsed = 0
  let timer = 60
  let dripSteps = 0
  let lastProgressAt = 0
  // This round, for the report and the guess limit.
  let wrong = new Map<string, number>()
  let attempts = new Map<string, number>()
  let guesses = 0
  let hints = 0
  // Combo: the same viewer finding words one after the other, quickly.
  let lastFinder = ''
  let lastFindAt = 0
  let combo = 0
  let flash = 0
  let last = { name: '', avatar: undefined as string | undefined, pts: 0, combo: 0 }
  // The special round: words out so far, letters of the prompt shown, and who guessed it.
  let special = false
  let normalSinceSpecial = 0
  let wordsOut = 0
  let promptShown = 0
  let promptKeys = new Set<string>()
  let winner: (Finder & { pts: number }) | null = null
  // The match: rounds played in it, and its final standings once over.
  let roundsPlayed = 0
  let podium: { name: string; pts: number; avatar?: string }[] = []
  const scores = newScores()

  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const foundCount = () => slots.filter((s) => s.found).length
  const bestScore = () => topOf(scores, 1)[0]?.[1].pts ?? 0
  const specialLength = () => (slots.length - 1 + SPECIAL_LAST_INTERVALS) * specialSecs
  // What guessing the prompt is worth now: one step less for every word out.
  const specialValue = () => pts * Math.max(1, slots.length - wordsOut + 1)

  const read = (settings: GameSettings) => {
    answerCount = settings.answerCount === '7' ? 7 : settings.answerCount === '8' ? 8 : 'random'
    timed = settings.roundMode !== 'untilSolved'
    roundSecs = num(settings.roundSeconds, 60)
    breakSecs = num(settings.breakSeconds, 5)
    matchEnd = settings.matchEnd === 'rounds' || settings.matchEnd === 'points' ? settings.matchEnd : 'endless'
    matchRounds = Math.round(num(settings.matchRounds, 10))
    matchPoints = num(settings.matchPoints, 100)
    pts = num(settings.pointsPerCorrect, 1)
    speedBonus = settings.speedBonusEnabled !== false
    combos = settings.comboEnabled !== false
    longWordHeadStart = settings.longWordHeadStart !== false
    drip = settings.dripRevealEnabled !== false
    giftLetters = Math.round(num(settings.giftRevealLetters, 2))
    guessCap = settings.guessCapEnabled === true ? Math.round(num(settings.guessesPerUser, 10)) : 0
    specialEvery = settings.specialRoundEnabled === false ? 0 : Math.round(num(settings.specialRoundEvery, 10))
    specialSecs = num(settings.specialRevealSeconds, 6)
    showHint = settings.showSenseHint === true
    showBoard = settings.showSessionLeaderboard !== false
  }

  // The next pool of the shuffled deck that can give the words asked for (8 needs a big pool).
  const nextPuzzle = (): WordAssociationPuzzle | null => {
    const pools = itemsFor<unknown>('word-association').filter(isWordAssociationPool)
    for (let tries = 0; tries < pools.length; tries++) {
      if (!deck.length) deck = shuffled(pools)
      const drawn = drawPuzzle(deck.pop() as WordAssociationPool, answerCount)
      if (drawn) return drawn
    }
    return null
  }

  const pick = () => {
    puzzle = nextPuzzle()
    special = specialEvery > 0 && normalSinceSpecial >= specialEvery
    normalSinceSpecial = special ? 0 : normalSinceSpecial + 1
    slots = (puzzle?.words ?? []).map((word) => ({
      word,
      keys: new Set([word, ...(puzzle?.variants[word] ?? [])].map(answerKey)),
      shown: longWordHeadStart && !special ? headStart(word) : 0,
      found: null,
    }))
    promptKeys = new Set([puzzle?.prompt ?? '', ...(puzzle?.prompt_variants ?? [])].filter(Boolean).map(answerKey))
    phase = 'play'
    endedBy = 'other'
    elapsed = 0
    timer = special ? specialSecs : roundSecs
    dripSteps = 0
    lastProgressAt = 0
    wrong = new Map()
    attempts = new Map()
    guesses = 0
    hints = 0
    lastFinder = ''
    lastFindAt = 0
    combo = 0
    flash = 0
    wordsOut = special ? 1 : 0
    promptShown = 0
    winner = null
  }

  const matchOver = () =>
    (matchEnd === 'rounds' && roundsPlayed >= matchRounds) || (matchEnd === 'points' && bestScore() >= matchPoints)

  const endRound = (by: 'all' | 'time' | 'other') => {
    if (!puzzle || phase !== 'play') return
    phase = 'summary'
    roundCheer()
    endedBy = by
    timer = breakSecs
    roundsPlayed++
    // The special round asks the other way round: its data is not the words'. A round nobody
    // played says nothing about the words either.
    if (special || !report || guesses === 0) return
    report({
      ref: puzzle.ref,
      words: [...puzzle.words],
      found: slots.flatMap((s) => (s.found ? [{ word: s.word, ms: s.found.ms, hinted: s.found.hinted }] : [])),
      wrong: [...wrong]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, WORD_ASSOCIATION_WRONG_SENT)
        .map(([guess, count]) => ({ guess, count })),
      durationMs: Math.round(elapsed * 1000),
      hints,
      players: attempts.size,
      guesses,
    })
  }

  const afterSummary = () => {
    if (matchEnd !== 'endless' && matchOver()) {
      podium = topOf(scores, 3).map(([, s]) => ({ name: s.name, pts: s.pts, avatar: s.avatar }))
      phase = 'match'
      timer = MATCH_OVER_SECONDS
      return
    }
    pick()
  }

  const newMatch = () => {
    scores.clear()
    roundsPlayed = 0
    podium = []
    pick()
  }

  // One more letter on each hidden word, up to `cap`.
  const uncoverAll = (cap: (word: string) => number) => {
    for (const s of slots) if (!s.found && s.shown < cap(s.word)) s.shown++
  }

  // A gift: letters on the words with the fewest shown (between equals, the longest); in the
  // special round, letters of the prompt.
  const revealLetters = (count: number) => {
    for (let i = 0; i < count; i++) {
      if (special) {
        if (!puzzle || promptShown >= hardCap(puzzle.prompt)) return
        promptShown++
        hints++
        continue
      }
      const hidden = slots.filter((s) => !s.found && s.shown < hardCap(s.word))
      if (!hidden.length) return
      hidden.sort((a, b) => a.shown - b.shown || b.word.length - a.word.length)
      hidden[0].shown++
      hints++
    }
  }

  const speedShare = () => (timed ? Math.max(0, timer / roundSecs) : Math.max(0, 1 - elapsed / UNTIMED_SPEED_SECONDS))

  const guess = (key: string, user: { id: string; nickname: string; avatar?: string }) => {
    if (!puzzle) return
    if (special) {
      if (!promptKeys.has(key)) return
      const gain = specialValue()
      winner = { name: user.nickname, avatar: user.avatar, pts: gain }
      addPoints(scores, user.id, user.nickname, user.avatar, gain)
      last = { name: user.nickname, avatar: user.avatar, pts: gain, combo: 0 }
      flash = 2.5
      endRound('all')
      return
    }
    const slot = slots.find((s) => s.keys.has(key))
    if (!slot) {
      if (!promptKeys.has(key)) wrong.set(key, (wrong.get(key) ?? 0) + 1)
      return
    }
    if (slot.found) return
    const quick = lastFinder === user.id && elapsed - lastFindAt <= COMBO_WINDOW_SECONDS
    combo = combos && quick ? combo + 1 : 1
    lastFinder = user.id
    lastFindAt = elapsed
    lastProgressAt = elapsed
    const gain = pts + (speedBonus ? Math.round(speedShare() * 2) : 0) + Math.min(combo - 1, MAX_COMBO_BONUS)
    slot.found = { name: user.nickname, avatar: user.avatar, ms: Math.round(elapsed * 1000), hinted: slot.shown > 0 }
    addPoints(scores, user.id, user.nickname, user.avatar, gain)
    last = { name: user.nickname, avatar: user.avatar, pts: gain, combo }
    flash = 2.5
    if (slots.every((s) => s.found)) endRound('all')
    else if (matchEnd === 'points' && bestScore() >= matchPoints) endRound('other')
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      read(settings)
      deck = []
      normalSinceSpecial = 0
      newMatch()
    },
    onAction(action, event) {
      if (!puzzle) return
      if (action === 'next_round') {
        if (phase === 'play') endRound('other')
        else if (phase === 'summary') afterSummary()
        else newMatch()
        return
      }
      if (phase !== 'play') return
      if (action === 'reveal_letter') {
        revealLetters(giftLetters)
        return
      }
      if (action !== 'guess' || event.type !== 'comment') return
      const key = guessKey(event.text)
      if (!key) return
      const used = attempts.get(event.user.id) ?? 0
      if (guessCap && used >= guessCap) return
      attempts.set(event.user.id, used + 1)
      guesses++
      guess(key, event.user)
    },
    update(dt, _now, settings) {
      if (!puzzle) return
      read(settings)
      if (flash > 0) flash -= dt
      if (phase !== 'play') {
        timer -= dt
        if (timer > 0) return
        if (phase === 'summary') afterSummary()
        else newMatch()
        return
      }
      elapsed += dt
      if (special) {
        // One more word every few seconds; once all are out, a little more time, then the answer.
        while (wordsOut < slots.length && elapsed >= wordsOut * specialSecs) wordsOut++
        timer = (wordsOut < slots.length ? wordsOut * specialSecs : specialLength()) - elapsed
        if (elapsed >= specialLength()) endRound('time')
      } else if (timed) {
        timer = roundSecs - elapsed
        while (drip && dripSteps < DRIP_AT.length && elapsed >= roundSecs * DRIP_AT[dripSteps]) {
          dripSteps++
          uncoverAll(softCap)
        }
        if (timer <= 0) endRound('time')
      } else {
        if (drip && elapsed - lastProgressAt >= UNTIMED_DRIP_SECONDS) {
          lastProgressAt = elapsed
          uncoverAll(softCap)
        }
        if (elapsed >= UNTIMED_MAX_SECONDS) endRound('time')
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.textAlign = 'center'
      // The overlay's bar already names the game; the session leaderboard runs just below it.
      if (!puzzle) {
        ctx.fillStyle = '#ffffff'
        ctx.font = `${Math.min(24, width / 28)}px system-ui`
        ctx.fillText('Nessun prompt verificato disponibile', cx, height * 0.4)
        return
      }
      if (phase === 'match') drawPodium(ctx, cx)
      else if (special) drawSpecial(ctx, cx)
      else drawRound(ctx, cx)
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }

  function matchText() {
    if (matchEnd === 'rounds')
      return ` · round ${Math.min(roundsPlayed + (phase === 'play' ? 1 : 0), matchRounds)}/${matchRounds}`
    return matchEnd === 'points' ? ` · vince chi arriva a ${matchPoints}` : ''
  }

  function slotGeometry(top: number) {
    const cellW = Math.min(width * 0.8, 700)
    const cellH = Math.min(64, height * 0.058)
    const gap = Math.min(12, height * 0.011)
    return { cellW, cellH, gap, y: (i: number) => top + i * (cellH + gap), bottom: top + slots.length * (cellH + gap) }
  }

  function drawSlot(ctx: CanvasRenderingContext2D, cx: number, sy: number, cellW: number, cellH: number, fill: string) {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(cx - cellW / 2, sy, cellW, cellH, 12)
    ctx.fill()
    ctx.font = `bold ${Math.min(28, cellH * 0.48)}px system-ui`
    return sy + cellH * 0.66
  }

  function drawFlash(ctx: CanvasRenderingContext2D, cx: number, y: number) {
    if (flash <= 0 || !last.name) return
    ctx.fillStyle = '#5be09b'
    ctx.font = `bold ${Math.min(28, width / 26)}px system-ui`
    const comboText = last.combo > 1 ? ` · combo x${last.combo}` : ''
    fillTextWithAvatar(ctx, `${last.name} +${last.pts}${comboText}`, cx, y, { nickname: last.name, avatar: last.avatar })
  }

  function drawRound(ctx: CanvasRenderingContext2D, cx: number) {
    if (!puzzle) return
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.min(64, width / 12)}px system-ui`
    ctx.fillText(puzzle.prompt.toLocaleUpperCase('it'), cx, height * 0.16)
    let y = height * 0.2
    if (showHint && puzzle.hint) {
      ctx.fillStyle = '#8991a3'
      ctx.font = `italic ${Math.min(22, width / 32)}px system-ui`
      ctx.fillText(puzzle.hint, cx, y)
      y += height * 0.035
    }
    const progress = `${foundCount()}/${slots.length}`
    const status = phase === 'play'
      ? `Scrivi in chat le parole collegate · ${progress}`
      : endedBy === 'all' ? `Tutte trovate! · ${progress}` : endedBy === 'time' ? `Tempo scaduto · ${progress}` : `Round finito · ${progress}`
    ctx.fillStyle = '#b3bacb'
    ctx.font = `${Math.min(24, width / 28)}px system-ui`
    ctx.fillText(status + matchText(), cx, y)

    const g = slotGeometry(y + height * 0.025)
    slots.forEach((slot, i) => {
      const missed = phase === 'summary' && !slot.found
      const baseline = drawSlot(ctx, cx, g.y(i), g.cellW, g.cellH, slot.found ? '#1f6f46' : missed ? '#5a3a14' : '#1b2233')
      if (slot.found) {
        drawSolved(ctx, slot.word, slot.found, cx, g.y(i), g.cellW, g.cellH)
      } else if (missed) {
        ctx.fillStyle = '#f5b14c'
        ctx.fillText(slot.word.toLocaleUpperCase('it'), cx, baseline)
      } else {
        ctx.fillStyle = '#8991a3'
        ctx.fillText(masked(slot.word, slot.shown), cx, baseline)
      }
    })
    drawFlash(ctx, cx, g.bottom + height * 0.04)
    if (phase === 'summary') drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
    else if (timed) drawTimerBar(ctx, width, height, Math.max(0, timer / roundSecs), '#f5b14c')
  }

  // The special round: the hidden prompt on top, the words appearing one at a time below.
  function drawSpecial(ctx: CanvasRenderingContext2D, cx: number) {
    if (!puzzle) return
    ctx.fillStyle = '#f5b14c'
    ctx.font = `bold ${Math.min(30, width / 26)}px system-ui`
    ctx.fillText('★ ROUND SPECIALE ★', cx, height * 0.12)
    ctx.fillStyle = '#b3bacb'
    ctx.font = `${Math.min(24, width / 28)}px system-ui`
    ctx.fillText(phase === 'play' ? 'Indovina la parola da cui partono gli indizi' : 'La parola era', cx, height * 0.155)
    ctx.font = `bold ${Math.min(60, width / 13)}px system-ui`
    if (phase === 'play') {
      ctx.fillStyle = '#ffffff'
      ctx.fillText(masked(puzzle.prompt, promptShown), cx, height * 0.215)
    } else {
      ctx.fillStyle = winner ? '#5be09b' : '#f5b14c'
      ctx.fillText(puzzle.prompt.toLocaleUpperCase('it'), cx, height * 0.215)
    }
    ctx.font = `${Math.min(24, width / 28)}px system-ui`
    if (phase === 'play') {
      ctx.fillStyle = '#f5b14c'
      const value = specialValue()
      ctx.fillText(`Vale ${value} ${value === 1 ? 'punto' : 'punti'} · indizi ${wordsOut}/${slots.length}${matchText()}`, cx, height * 0.26)
    } else if (winner) {
      ctx.fillStyle = '#5be09b'
      fillTextWithAvatar(ctx, `Indovinata da ${winner.name} +${winner.pts}`, cx, height * 0.26, { nickname: winner.name, avatar: winner.avatar })
    } else {
      ctx.fillStyle = '#f5b14c'
      ctx.fillText('Nessuno l’ha indovinata', cx, height * 0.26)
    }
    const g = slotGeometry(height * 0.29)
    slots.forEach((slot, i) => {
      const out = i < wordsOut || phase !== 'play'
      const baseline = drawSlot(ctx, cx, g.y(i), g.cellW, g.cellH, out ? '#23304d' : '#151925')
      ctx.fillStyle = out ? '#ffffff' : '#8991a3'
      ctx.fillText(out ? slot.word.toLocaleUpperCase('it') : '?', cx, baseline)
    })
    if (phase === 'summary') drawTimerBar(ctx, width, height, Math.max(0, timer / breakSecs), '#3ccf7a')
    else drawTimerBar(ctx, width, height, Math.max(0, Math.min(1, timer / specialSecs)), '#f5b14c')
  }

  // The end of a match: the top three, then a new match starts from zero.
  function drawPodium(ctx: CanvasRenderingContext2D, cx: number) {
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.min(56, width / 14)}px system-ui`
    ctx.fillText('Partita finita!', cx, height * 0.22)
    ctx.font = `bold ${Math.min(34, width / 22)}px system-ui`
    const medals = ['🥇', '🥈', '🥉']
    if (!podium.length) {
      ctx.fillStyle = '#b3bacb'
      ctx.fillText('Nessun punto in questa partita', cx, height * 0.32)
    }
    podium.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#f5b14c' : '#ffffff'
      fillTextWithAvatar(ctx, `${medals[i]} ${p.name} · ${p.pts}`, cx, height * (0.32 + i * 0.08), { nickname: p.name, avatar: p.avatar })
    })
    ctx.fillStyle = '#b3bacb'
    ctx.font = `${Math.min(24, width / 28)}px system-ui`
    ctx.fillText(`Nuova partita tra ${Math.max(0, Math.ceil(timer))} s`, cx, height * 0.62)
    drawTimerBar(ctx, width, height, Math.max(0, timer / MATCH_OVER_SECONDS), '#3ccf7a')
  }
}
