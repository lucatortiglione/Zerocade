import type { GameInstance } from './engine'

const WORDS = ['TIKTOK', 'STREAM', 'LEGEND', 'ROCKET', 'CROWN', 'GALAXY', 'VIEWER', 'GAMING']
const MAX_WRONG = 6

export function createWordGuess(): GameInstance {
  let width = 0
  let height = 0
  let seconds = 45
  let timer = 45
  let word = WORDS[0]
  let guessed = new Set<string>()
  let wrong = 0
  let winners: string[] = []
  let revealed = false

  const isWon = () => word.split('').every((c) => guessed.has(c))

  const pick = () => {
    word = WORDS[Math.floor(Math.random() * WORDS.length)]
    guessed = new Set()
    wrong = 0
    winners = []
    revealed = false
    timer = seconds
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      seconds = typeof settings.seconds === 'number' ? settings.seconds : 45
      pick()
    },
    onAction(_action, event) {
      if (event.type !== 'comment' || revealed) return
      const text = event.text.trim().toUpperCase()
      if (text === word) {
        if (!winners.includes(event.user.nickname)) winners.push(event.user.nickname)
        revealed = true
        timer = 4
        return
      }
      if (text.length === 1 && /[A-Z]/.test(text)) {
        if (!guessed.has(text)) {
          guessed.add(text)
          if (!word.includes(text)) wrong++
        }
      }
    },
    update(dt, _now, settings) {
      seconds = typeof settings.seconds === 'number' ? settings.seconds : seconds
      timer -= dt
      if (isWon() && !revealed) {
        revealed = true
        timer = 4
      }
      if (timer <= 0) {
        if (revealed) pick()
        else {
          revealed = true
          timer = 4
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(revealed ? 'The word was:' : 'Guess the word!', cx, height * 0.25)

      const gap = 64
      const total = word.length * gap
      word.split('').forEach((c, i) => {
        const x = cx - total / 2 + gap * i + gap / 2
        const shown = revealed || guessed.has(c)
        ctx.fillStyle = shown ? '#3ccf7a' : '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(x - 26, height * 0.38 - 32, 52, 64, 10)
        ctx.fill()
        if (shown) {
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 36px system-ui'
          ctx.fillText(c, x, height * 0.38 + 12)
        }
      })

      ctx.font = '24px system-ui'
      ctx.fillStyle = '#ff5c5c'
      ctx.textAlign = 'center'
      ctx.fillText(`Wrong guesses: ${wrong}/${MAX_WRONG}`, cx, height * 0.5)

      if (winners.length) {
        ctx.fillStyle = '#f5b14c'
        ctx.font = 'bold 28px system-ui'
        ctx.fillText(`🏆 ${winners[0]} guessed it!`, cx, height * 0.58)
      }

      const frac = Math.max(0, timer / (revealed ? 4 : seconds))
      ctx.fillStyle = '#00000055'
      ctx.fillRect(40, height - 60, width - 80, 14)
      ctx.fillStyle = '#3ccf7a'
      ctx.fillRect(40, height - 60, (width - 80) * frac, 14)
    },
  }
}