import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'

// "Context" — a Semantle-style game: find the hidden word by semantic closeness.
// Every guess is ranked closer/farther using a local thesaurus-like bank.

interface Target {
  word: string
  hint: string
  close: string[]
  medium: string[]
}

const TARGETS: Target[] = [
  { word: 'SPIAGGIA', hint: 'Ci vai d’estate per nuotare', close: ['MARE', 'SABBIA', 'ONDA', 'BAGNINO'], medium: ['SOLE', 'COSTUME', 'OMBRELLONE', 'BARCHE'] },
  { word: 'PIZZA', hint: 'Piatto italiano tondo', close: ['MOZZARELLA', 'FORNO', 'IMPASTO', 'MARINARA'], medium: ['PASTA', 'ITALIA', 'POMODORO', 'FARINA'] },
  { word: 'CALCIO', hint: 'Sport con il pallone', close: ['PALLA', 'GOL', 'PORTIERE', 'STADIO'], medium: ['SQUADRA', 'CAMPIONATO', 'TIFOSI', 'ARBITRO'] },
  { word: 'MUSICA', hint: 'Suoni e melodie', close: ['CANZONE', 'CONCERTO', 'NOTA', 'MELODIA'], medium: ['CHITARRA', 'PIANO', 'BATTERIA', 'CANTANTE'] },
  { word: 'INVERNO', hint: 'La stagione più fredda', close: ['NEVE', 'GELO', 'FREDDO', 'SCI'], medium: ['GUANTI', 'CAMINO', 'BABBO NATALE', 'SCIARPA'] },
  { word: 'OSPEDALE', hint: 'Ci si va quando si sta male', close: ['MEDICO', 'INFERMIERE', 'PAZIENTE', 'CURA'], medium: ['AMBULANZA', 'FARMACIA', 'SALA', 'CHIRURGO'] },
  { word: 'SCUOLA', hint: 'Si impara in classe', close: ['MAESTRA', 'LEZIONE', 'BANCO', 'ZAINO'], medium: ['LIBRO', 'PENNA', 'COMPITI', 'ALUNNO'] },
  { word: 'AEREO', hint: 'Vola nel cielo', close: ['VOLO', 'PILOTA', 'PISTA', 'AEROPORTO'], medium: ['ALI', 'CIELO', 'PASSEGGERO', 'TURBOLENZA'] },
  { word: 'RISTORANTE', hint: 'Ci si mangia fuori', close: ['MENU', 'CAMERIERE', 'TAVOLO', 'CUCINA'], medium: ['PIATTO', 'CONTO', 'CHEF', 'PRENOTAZIONE'] },
  { word: 'FORESTA', hint: 'Piena di alberi', close: ['ALBERO', 'BOSCO', 'FOGLIE', 'SELVA'], medium: ['NATURA', 'ANIMALI', 'RADICI', 'VERDE'] },
  { word: 'FOTOGRAFIA', hint: 'Si scatta con la macchina', close: ['FOTO', 'OBIETTIVO', 'SCATTO', 'IMMAGINE'], medium: ['CAMERA', 'ALBUM', 'LUCE', 'RITRATTO'] },
  { word: 'CIOCCOLATO', hint: 'Dolce e fondente', close: ['CACAO', 'TAVOLETTA', 'DOLCE', 'FONDENTE'], medium: ['LATTE', 'ZUCCHERO', 'DESSERT', 'PRALINA'] },
]
export function createContext(): GameInstance {
  let width = 0
  let height = 0
  let breakSecs = 8
  let finderPts = 100
  let autoHints = true
  let autoHintSecs = 45
  let maxHints = 5
  let showBoard = true

  let target = TARGETS[0]
  let timer = 45
  let revealed = false
  let solver = ''
  let hintCount = 0
  let hintClock = 0
  let bestRank = Infinity
  const guesses: { text: string; rank: number }[] = []
  const scores = newScores()

  const pick = () => {
    target = shuffled(TARGETS)[0]
    timer = autoHintSecs
    revealed = false
    solver = ''
    hintCount = 0
    hintClock = 0
    bestRank = Infinity
    guesses.length = 0
  }

  // 0 = solved; 1..close.length = closest to farthest; larger = medium/far bands.
  const rank = (text: string): number => {
    const t = normalize(text)
    if (t === normalize(target.word)) return 0
    const ci = target.close.map(normalize).indexOf(t)
    if (ci >= 0) return ci + 1
    const mi = target.medium.map(normalize).indexOf(t)
    if (mi >= 0) return target.close.length + 10 + mi
    return 1000
  }

  const colorFor = (r: number) => (r === 0 ? '#1FA35B' : r <= target.close.length ? '#1FA35B' : r <= 100 ? '#E07A22' : '#D9435E')

  return {
    reset(settings, w, h) {
      width = w
      height = h
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 8
      finderPts = typeof settings.finderPoints === 'number' ? settings.finderPoints : 100
      autoHints = settings.autoHints !== false
      autoHintSecs = typeof settings.autoHintSeconds === 'number' ? settings.autoHintSeconds : 45
      maxHints = typeof settings.maxHintsPerRound === 'number' ? settings.maxHintsPerRound : 5
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_closer') {
        if (!revealed && hintCount < maxHints && bestRank > 1) {
          const next = target.close[Math.max(0, Math.min(bestRank - 2, target.close.length - 1))]
          guesses.unshift({ text: next, rank: target.close.map(normalize).indexOf(normalize(next)) + 1 })
          bestRank = Math.min(bestRank, target.close.map(normalize).indexOf(normalize(next)) + 1)
          hintCount++
        }
        return
      }
      if (action === 'small_hint') return
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      if (!text || text.length < 2) return
      const r = rank(text)
      if (!guesses.some((g) => g.text === text)) guesses.unshift({ text, rank: r })
      if (r === 0) {
        revealed = true
        solver = event.user.nickname
        timer = breakSecs
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, finderPts)
      } else if (r < bestRank) {
        bestRank = r
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, Math.max(1, Math.round(finderPts / (r + 1))))
      }
      if (guesses.length > 12) guesses.pop()
    },
    update(dt, _now, settings) {
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) pick()
        return
      }
      if (autoHints) {
        hintClock += dt
        if (hintClock >= autoHintSecs && hintCount < maxHints) {
          hintClock = 0
          const idx = Math.min(hintCount, target.close.length - 1)
          guesses.unshift({ text: target.close[idx], rank: idx + 1 })
          bestRank = Math.min(bestRank, idx + 1)
          hintCount++
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 44px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('CONTEXT', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText(`Indizio: ${target.hint}`, cx, 122)

      ctx.fillStyle = '#2D3642'
      ctx.beginPath()
      ctx.roundRect(cx - 300, 150, 600, 52, 26)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 26px system-ui'
      ctx.fillText(bestRank === 0 ? target.word : `Vicino: ${bestRank === Infinity ? '—' : bestRank}`, cx, 184)

      const list = [...guesses].sort((a, b) => a.rank - b.rank).slice(0, 9)
      list.forEach((g, i) => {
        const y = 230 + i * 46
        ctx.fillStyle = '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - 340, y - 20, 680, 40, 10)
        ctx.fill()
        ctx.fillStyle = colorFor(g.rank)
        ctx.font = '22px system-ui'
        ctx.textAlign = 'left'
        ctx.fillText(g.text, cx - 320, y + 7)
        ctx.textAlign = 'right'
        ctx.fillText(g.rank === 0 ? 'TROVATA' : `#${g.rank}`, cx + 320, y + 7)
      })

      if (revealed) {
        ctx.fillStyle = '#3ccf7a'
        ctx.font = 'bold 30px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(`${solver} ha trovato: ${target.word}`, cx, height * 0.86)
      }

      if (!revealed) drawTimerBar(ctx, width, height, Math.max(0, timer / autoHintSecs), '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}

