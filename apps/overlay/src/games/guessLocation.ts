import type { GameInstance } from './engine'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, normalize, shuffled } from './common'
import { itemsFor } from '../content'

// "Guess the Location" — a stylised panorama with a landmark. Viewers guess the
// country (and optionally the city). Letters reveal progressively as hints.

interface Location {
  country: string
  city?: string
  region: string
  emoji: string
  hints: string[]
}

// Locations are loaded from the server's SQLite-backed content store.
export function createGuessLocation(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 45
  let revealSecs = 9
  let answerMode = 'both'
  let countryPts = 100
  let cityPts = 60
  let autoHints = true
  let showBoard = true

  let loc: Location = { country: '', region: 'Europa', emoji: '📍', hints: [] }
  let timer = 45
  let revealed = false
  let countryFound = false
  let cityFound = false
  let revealCountry = 0
  let revealCity = 0
  let hintClock = 0
  let winner = ''
  const solvedBy = new Set<string>()
  const scores = newScores()

  const pick = () => {
    loc = shuffled(itemsFor<Location>('guess-location'))[0] ?? { country: '', region: 'Europa', emoji: '📍', hints: [] }
    timer = roundSecs
    revealed = false
    countryFound = false
    cityFound = false
    revealCountry = 0
    revealCity = 0
    hintClock = 0
    winner = ''
    solvedBy.clear()
  }

  const allFound = () => countryFound && (answerMode === 'country' || cityFound)

  const finish = () => {
    revealed = true
    timer = revealSecs
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : 45
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : 9
      answerMode = settings.answerMode === 'country' ? 'country' : 'both'
      countryPts = typeof settings.countryPoints === 'number' ? settings.countryPoints : 100
      cityPts = typeof settings.cityPoints === 'number' ? settings.cityPoints : 60
      autoHints = settings.autoHints !== false
      showBoard = settings.showLeaderboard !== false
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (action === 'reveal_letter') {
        if (!revealed && revealCountry < loc.country.length) revealCountry++
        return
      }
      if (action === 'show_continent') return
      if (action === 'add_time') {
        if (!revealed) timer += 10
        return
      }
      if (event.type !== 'comment' || revealed) return
      const text = normalize(event.text)
      if (!text) return
      if (solvedBy.has(event.user.id)) return
      const cNorm = normalize(loc.country)
      const cityNorm = loc.city ? normalize(loc.city) : ''
      const gotCountry = text === cNorm
      const gotCity = answerMode === 'both' && loc.city ? text === cityNorm : false
      if (!gotCountry && !gotCity) return
      solvedBy.add(event.user.id)
      if (!winner) winner = event.user.nickname
      if (gotCountry && !countryFound) {
        countryFound = true
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, countryPts)
      }
      if (gotCity && !cityFound) {
        cityFound = true
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, cityPts)
      }
      if (allFound()) finish()
    },
    update(dt, _now, settings) {
      roundSecs = typeof settings.roundSeconds === 'number' ? settings.roundSeconds : roundSecs
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : revealSecs
      if (revealed) {
        timer -= dt
        if (timer <= 0) pick()
        return
      }
      timer -= dt
      if (timer <= 0) {
        finish()
        return
      }
      if (autoHints) {
        hintClock += dt
        if (hintClock >= 6) {
          hintClock = 0
          if (revealCountry < loc.country.length) revealCountry++
          else if (answerMode === 'both' && loc.city && revealCity < loc.city.length) revealCity++
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      drawPanorama(ctx, width, height, loc.emoji)

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('GUESS THE LOCATION', cx, 70)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '20px system-ui'
      ctx.fillText(`Indizio: ${loc.hints[0]}`, cx, 104)

      ctx.fillStyle = '#0a0a0e'
      ctx.beginPath()
      ctx.roundRect(cx - 100, 120, 200, 40, 20)
      ctx.fill()
      ctx.fillStyle = '#ffc02e'
      ctx.font = 'bold 22px system-ui'
      ctx.fillText(loc.region.toUpperCase(), cx, 146)

      drawBoxes(ctx, width, 'PAESE', loc.country, revealCountry, countryFound, revealed, height * 0.66, '#22c55e')
      if (answerMode === 'both' && loc.city) {
        drawBoxes(ctx, width, 'CITTÀ', loc.city, revealCity, cityFound, revealed, height * 0.78, '#38bdf8')
      }

      if (revealed) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 26px system-ui'
        ctx.fillText(`${loc.country}${loc.city ? ' — ' + loc.city : ''}`, cx, height * 0.88)
        if (winner) {
          ctx.fillStyle = '#3ccf7a'
          ctx.font = 'bold 22px system-ui'
          ctx.fillText(`🏆 ${winner} ha indovinato!`, cx, height * 0.92)
        }
      }

      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? revealSecs : roundSecs)), revealed ? '#3ccf7a' : '#ffc02e')
      if (showBoard) drawLeaderboard(ctx, scores, 5)
    },
  }
}
function drawBoxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  label: string,
  word: string,
  shown: number,
  found: boolean,
  revealed: boolean,
  y: number,
  color: string,
) {
  const cx = width / 2
  ctx.fillStyle = '#8a8a96'
  ctx.font = '18px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, y - 30)
  const tile = Math.min(44, (width - 160) / word.length)
  const total = word.length * tile + (word.length - 1) * 8
  let x = cx - total / 2 + tile / 2
  for (let i = 0; i < word.length; i++) {
    const isSpace = word[i] === ' '
    const visible = found || revealed || i < shown
    ctx.fillStyle = isSpace ? 'transparent' : visible ? color : '#0a0a0e'
    ctx.beginPath()
    ctx.roundRect(x - tile / 2, y - tile / 2, tile, tile, 8)
    ctx.fill()
    if (visible && !isSpace) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.round(tile * 0.55)}px system-ui`
      ctx.textBaseline = 'middle'
      ctx.fillText(word[i], x, y + 1)
      ctx.textBaseline = 'alphabetic'
    }
    x += tile + 8
  }
}

function drawPanorama(ctx: CanvasRenderingContext2D, width: number, height: number, emoji: string) {
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#0b1026')
  sky.addColorStop(0.7, '#1c2f52')
  sky.addColorStop(1, '#0a0a0e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0a0a0e'
  ctx.beginPath()
  ctx.ellipse(width / 2, height * 1.1, width * 0.8, height * 0.4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `${Math.round(Math.min(width, height) * 0.28)}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, width / 2, height * 0.44)
  ctx.textBaseline = 'alphabetic'
}


