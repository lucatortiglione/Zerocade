import type { Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores } from './common'

// "Memory Maestro" — a numeric sequence is shown briefly, then hidden. Viewers
// must type it back in chat; the difficulty grows with each correct answer.

export function createMemoryMaestro(): GameInstance {
  let width = 0
  let height = 0
  let memSecs = 1.5
  let startLevel = 1
  let answerSecs = 15
  let revealSecs = 4
  let breakSecs = 5
  let showBoard = true

  let level = 1
  let sequence = ''
  let phase: 'memorize' | 'answer' | 'reveal' | 'break' = 'memorize'
  let timer = 1.5
  let solver: Viewer | null = null
  const scores = newScores()

  const newRound = (grow: boolean) => {
    if (grow) level++
    sequence = Array.from({ length: level }, () => String(Math.floor(Math.random() * 10))).join('')
    phase = 'memorize'
    timer = memSecs
    solver = null
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      memSecs = typeof settings.memorySeconds === 'number' ? settings.memorySeconds : 1.5
      startLevel = typeof settings.startingLevel === 'number' ? settings.startingLevel : 1
      answerSecs = typeof settings.answerSeconds === 'number' ? settings.answerSeconds : 15
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : 4
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : 5
      showBoard = settings.showLeaderboard !== false
      level = startLevel
      scores.clear()
      newRound(false)
    },
    onAction(action, event) {
      if (action === 'show_again' && phase === 'answer') {
        phase = 'memorize'
        timer = memSecs
        return
      }
      if (action === 'extra_time' && phase === 'answer') {
        timer += 10
        return
      }
      if (event.type !== 'comment') return
      if (phase !== 'answer') return
      const text = event.text.trim().replace(/[^0-9]/g, '')
      if (!text) return
      if (text === sequence) {
        phase = 'reveal'
        timer = revealSecs
        solver = event.user
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, level * 10)
      } else {
        addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, 0)
      }
    },
    update(dt, _now, settings) {
      memSecs = typeof settings.memorySeconds === 'number' ? settings.memorySeconds : memSecs
      answerSecs = typeof settings.answerSeconds === 'number' ? settings.answerSeconds : answerSecs
      revealSecs = typeof settings.revealSeconds === 'number' ? settings.revealSeconds : revealSecs
      breakSecs = typeof settings.breakSeconds === 'number' ? settings.breakSeconds : breakSecs
      timer -= dt
      if (timer <= 0) {
        if (phase === 'memorize') {
          phase = 'answer'
          timer = answerSecs
        } else if (phase === 'answer') {
          phase = 'reveal'
          timer = revealSecs
        } else if (phase === 'reveal') {
          phase = 'break'
          timer = breakSecs
        } else {
          newRound(false)
        }
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 40px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('MEMORY MAESTRO', cx, 84)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '22px system-ui'
      ctx.fillText(`Livello ${level} — ${sequence.length} cifre`, cx, 122)

      const show = phase === 'memorize' || phase === 'reveal'
      if (show) {
        ctx.fillStyle = '#1b1b21'
        ctx.beginPath()
        ctx.roundRect(cx - 260, height * 0.3 - 60, 520, 120, 20)
        ctx.fill()
        ctx.fillStyle = '#f5b14c'
        ctx.font = `bold ${Math.min(72, 460 / Math.max(1, sequence.length))}px system-ui`
        ctx.fillText(sequence, cx, height * 0.3 + 20)
      } else {
        ctx.fillStyle = '#8a8a96'
        ctx.font = '28px system-ui'
        ctx.fillText('_ '.repeat(sequence.length).trim(), cx, height * 0.3 + 10)
      }

      let hint = ''
      if (phase === 'memorize') hint = 'Memorizza la sequenza…'
      else if (phase === 'answer') hint = 'Scrivi la sequenza in chat!'
      else if (phase === 'reveal') hint = solver ? `${solver.nickname} ha indovinato!` : 'Tempo scaduto'
      else hint = 'Prossimo livello…'
      ctx.fillStyle = phase === 'answer' ? '#3ccf7a' : '#8a8a96'
      ctx.font = 'bold 24px system-ui'
      if (phase === 'reveal' && solver) fillTextWithAvatar(ctx, hint, cx, height * 0.56, solver)
      else ctx.fillText(hint, cx, height * 0.56)

      const total = phase === 'memorize' ? memSecs : phase === 'answer' ? answerSecs : phase === 'reveal' ? revealSecs : breakSecs
      drawTimerBar(ctx, width, height, Math.max(0, timer / total), phase === 'answer' ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores, 6)
    },
  }
}
