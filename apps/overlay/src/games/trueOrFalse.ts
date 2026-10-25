import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled } from './common'

// "True or False" — viewers judge a statement by typing V/F (or true/false).
// The reveal shows the answer, the explanation and the winners.

interface Statement {
  text: string
  answer: boolean
  why: string
}

const STATEMENTS: Statement[] = [
  { text: 'Il miele non scade mai.', answer: true, why: 'Grazie alla bassa umidità e all’acidità, resta commestibile per anni.' },
  { text: 'I pesci rossi hanno una memoria di soli 3 secondi.', answer: false, why: 'La loro memoria dura settimane, anche mesi.' },
  { text: 'Il Sole è una stella.', answer: true, why: 'È la stella più vicina alla Terra.' },
  { text: 'La Torre di Pisa è sempre stata inclinata.', answer: false, why: 'Ha iniziato a inclinarsi durante la costruzione.' },
  { text: 'I ragni sono insetti.', answer: false, why: 'Sono aracnidi: hanno 8 zampe, non 6.' },
  { text: 'La Grande Muraglia cinese è visibile dalla Luna.', answer: false, why: 'Non è visibile nemmeno dalla maggior parte delle orbite.' },
  { text: 'L’acqua bolle a 100 °C ovunque.', answer: false, why: 'Dipende dalla pressione: in montagna bolle a temperature più basse.' },
  { text: 'Le piante producono ossigeno.', answer: true, why: 'Lo rilasciano durante la fotosintesi.' },
  { text: 'Gli elefanti sono i mammiferi più grandi del mondo.', answer: false, why: 'La balenottera azzurra è molto più grande.' },
  { text: 'La lingua è il muscolo più forte del corpo.', answer: false, why: 'È formata da più muscoli, non è un singolo muscolo.' },
  { text: 'I pipistrelli sono mammiferi.', answer: true, why: 'Sono gli unici mammiferi capaci di volo attivo.' },
  { text: 'La luce del Sole impiega circa 8 minuti per arrivare sulla Terra.', answer: true, why: 'Viaggia a circa 300.000 km/s.' },
  { text: 'Gli struzzi nascondono la testa nella sabbia.', answer: false, why: 'È un mito: si sdraiano solo per mimetizzarsi.' },
  { text: 'Il caffè contiene caffeina.', answer: true, why: 'È una delle principali fonti naturali di caffeina.' },
  { text: 'Il deserto del Sahara è il più grande del mondo.', answer: false, why: 'Il più grande è l’Antartide, un deserto freddo.' },
  { text: 'La banana è una bacca.', answer: true, why: 'Botanicamente la banana è classificata come bacca.' },
  { text: 'I delfini sono pesci.', answer: false, why: 'Sono mammiferi marini e respirano aria.' },
  { text: 'Roma è la capitale d’Italia.', answer: true, why: 'È la capitale dal 1871.' },
  { text: 'L’olio galleggia sull’acqua.', answer: true, why: 'È meno denso dell’acqua.' },
  { text: 'I leoni vivono nella giungla.', answer: false, why: 'Vivono principalmente nella savana.' },
  { text: 'Il vetro è un liquido che scorre lentamente.', answer: false, why: 'Il vetro è un solido amorfo.' },
  { text: 'Il Monte Everest è la montagna più alta del mondo.', answer: true, why: 'Misura 8.849 metri sul livello del mare.' },
  { text: 'I serpenti hanno le palpebre.', answer: false, why: 'Hanno una squama trasparente che protegge l’occhio.' },
  { text: 'Il corpo umano adulto ha 206 ossa.', answer: true, why: 'Alla nascita ne ha circa 270, che si fondono crescendo.' },
]
export function createTrueOrFalse(): GameInstance {
  let width = 0
  let height = 0
  let stmtSecs = 25
  let revealSecs = 10
  let breakSecs = 2
  let pts = 10
  let speedBonus = true
  let showBoard = true

  let current = STATEMENTS[0]
  let timer = 25
  let revealed = false
  let answered = new Set<string>()
  let votes = { yes: 0, no: 0 }
  const scores = newScores()

  const pick = () => {
    current = shuffled(STATEMENTS)[0]
    timer = stmtSecs
    revealed = false
    answered = new Set()
    votes = { yes: 0, no: 0 }
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      stmtSecs = typeof settings.statementSeconds === 'number' ? settings.statementSeconds : 25
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : 10
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 2
      pts = typeof settings.pointsPerCorrect === 'number' ? settings.pointsPerCorrect : 10
      speedBonus = settings.speedBonus !== false
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'skip_statement') {
        if (!revealed) {
          revealed = true
          timer = breakSecs
        }
        return
      }
      if (action === 'extra_time') {
        if (!revealed) timer += 10
        return
      }
      if (event.type !== 'comment' || revealed) return
      if (answered.has(event.user.id)) return
      const t = event.text.trim().toUpperCase().replace(/[^A-Z]/g, '')
      if (!t) return
      const yes = ['V', 'VERO', 'TRUE', 'T', 'S', 'SI', 'YES', 'Y'].includes(t)
      const no = ['F', 'FALSO', 'FALSE', 'N', 'NO'].includes(t)
      if (!yes && !no) return
      answered.add(event.user.id)
      const isRight = (yes && current.answer) || (no && !current.answer)
      if (yes) votes.yes++
      else votes.no++
      if (isRight) {
        const bonus = speedBonus ? Math.round((timer / stmtSecs) * pts) : pts
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, bonus)
      }
    },
    update(dt, _now, settings) {
      stmtSecs = typeof settings.statementSeconds === 'number' ? settings.statementSeconds : stmtSecs
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : revealSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      timer -= dt
      if (timer <= 0) {
        if (revealed) pick()
        else {
          revealed = true
          timer = revealSecs
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('TRUE OR FALSE', cx, 84)

      ctx.fillStyle = '#171827'
      ctx.beginPath()
      ctx.roundRect(cx - 420, 130, 840, 200, 20)
      ctx.fill()
      ctx.fillStyle = '#f4f4fa'
      ctx.font = '30px system-ui'
      wrapText(ctx, current.text, cx, 185, 760, 44)

      const vy = height * 0.52
      const labels = [
        { t: 'VERO', c: '#1e6bff' },
        { t: 'FALSO', c: '#ff2e4d' },
      ]
      labels.forEach((l, i) => {
        const x = cx - 200 + i * 400
        ctx.fillStyle = revealed && (i === 0) === current.answer ? l.c : '#2a2a33'
        ctx.beginPath()
        ctx.roundRect(x - 150, vy - 40, 300, 80, 16)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 30px system-ui'
        ctx.fillText(l.t, x, vy + 10)
        ctx.font = '20px system-ui'
        ctx.fillText(`${i === 0 ? votes.yes : votes.no} voti`, x, vy + 46)
      })

      if (revealed) {
        ctx.fillStyle = current.answer ? '#3ccf7a' : '#ff5c5c'
        ctx.font = 'bold 32px system-ui'
        ctx.fillText(current.answer ? 'VERO ✓' : 'FALSO ✓', cx, height * 0.68)
        ctx.fillStyle = '#f0f0f2'
        ctx.font = '20px system-ui'
        wrapText(ctx, current.why, cx, height * 0.74, 760, 28)
      } else {
        ctx.fillStyle = '#8a8a96'
        ctx.font = '22px system-ui'
        ctx.fillText('Scrivi V (vero) o F (falso) in chat', cx, height * 0.68)
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? revealSecs : stmtSecs)), revealed ? '#3ccf7a' : '#ffc83d')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ')
  let line = ''
  let ly = y
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, ly)
      line = w
      ly += lineH
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, cx, ly)
}

