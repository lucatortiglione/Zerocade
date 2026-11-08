import { isWordAssociationPuzzle, type WordAssociationPuzzle } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'
import { addPoints, drawLeaderboard, drawTimerBar, newScores, shuffled } from './common'
import { itemsFor } from '../content'

// v3.5.5: guess one hidden target from seven clues, revealed 3 → 5 → 7.
export function createWordAssociation(): GameInstance {
  let width = 0
  let height = 0
  let roundSecs = 60
  let breakSecs = 5
  let pts = 1
  let speedBonus = true
  let progressive = true
  let showBoard = true
  let deck: WordAssociationPuzzle[] = []
  let puzzle: WordAssociationPuzzle | null = null
  let revealed = false
  let timer = 60
  let flash = 0
  let hintLetters = 0
  let last = { name: '', pts: 0, avatar: undefined as string | undefined }
  const scores = newScores()
  const answerKey = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('it')
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const clueCount = () => revealed || !progressive ? 7 : timer <= roundSecs / 3 ? 7 : timer <= roundSecs * 2 / 3 ? 5 : 3
  const pick = () => {
    if (!deck.length) deck = shuffled(itemsFor<unknown>('word-association').filter(isWordAssociationPuzzle))
    puzzle = deck.pop() ?? null
    revealed = false
    timer = roundSecs
    flash = 0
    hintLetters = 0
  }
  return {
    reset(settings, w, h) {
      width = w
      height = h
      roundSecs = positive(settings.roundSeconds, 60)
      breakSecs = positive(settings.breakSeconds, 5)
      pts = positive(settings.pointsPerCorrect, 1)
      speedBonus = settings.speedBonusEnabled !== false
      progressive = settings.dripRevealEnabled !== false
      showBoard = settings.showSessionLeaderboard !== false
      deck = []
      scores.clear()
      pick()
    },
    onAction(action, event) {
      if (!puzzle || revealed) return
      if (action === 'reveal_letter') {
        hintLetters = Math.min(hintLetters + 1, puzzle.prompt.length - 1)
        return
      }
      if (action !== 'guess' || event.type !== 'comment' || answerKey(event.text) !== answerKey(puzzle.prompt)) return
      const gain = pts + (speedBonus ? Math.round(Math.max(0, timer / roundSecs) * 2) : 0)
      addPoints(scores, event.user.id, event.user.nickname, event.user.avatar, gain)
      last = { name: event.user.nickname, pts: gain, avatar: event.user.avatar }
      flash = breakSecs
      revealed = true
      timer = breakSecs
    },
    update(dt, _now, settings) {
      if (!puzzle) return
      progressive = settings.dripRevealEnabled !== false
      showBoard = settings.showSessionLeaderboard !== false
      speedBonus = settings.speedBonusEnabled !== false
      pts = positive(settings.pointsPerCorrect, pts)
      if (flash > 0) flash -= dt
      timer -= dt
      if (timer > 0) return
      if (revealed) pick()
      else {
        revealed = true
        timer = breakSecs
      }
    },
    draw(ctx) {
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.min(44, width / 18)}px system-ui`
      ctx.fillText('Word Association', cx, height * 0.07)
      if (!puzzle) {
        ctx.font = `${Math.min(24, width / 28)}px system-ui`
        ctx.fillText('Nessun enigma approvato disponibile', cx, height * 0.4)
        return
      }
      const visible = clueCount()
      ctx.fillStyle = '#b3bacb'
      ctx.font = `${Math.min(24, width / 28)}px system-ui`
      const pos = { NOUN: 'nome', VERB: 'verbo', ADJ: 'aggettivo' }[puzzle.pos]
      ctx.fillText(`Indovina la parola in chat${puzzle.pos_hint_mode === 'visible' ? ` · ${pos}` : ''}`, cx, height * 0.11)
      ctx.fillText(`${visible} di 7 indizi`, cx, height * 0.15)
      const cellW = Math.min(width * 0.76, 680)
      const cellH = Math.min(58, height * 0.055)
      const gap = Math.min(14, height * 0.012)
      puzzle.words.forEach((clue, i) => {
        const y = height * 0.2 + i * (cellH + gap)
        ctx.fillStyle = i < visible ? '#23304d' : '#151925'
        ctx.beginPath()
        ctx.roundRect(cx - cellW / 2, y, cellW, cellH, 12)
        ctx.fill()
        ctx.fillStyle = i < visible ? '#ffffff' : '#8991a3'
        ctx.font = `bold ${Math.min(26, cellH * 0.48)}px system-ui`
        ctx.fillText(i < visible ? clue : `Indizio ${i + 1}`, cx, y + cellH * 0.66)
      })
      ctx.fillStyle = revealed ? '#5be09b' : '#f5b14c'
      ctx.font = `bold ${Math.min(40, width / 20)}px system-ui`
      ctx.fillText(revealed ? puzzle.prompt : hintLetters ? puzzle.prompt.slice(0, hintLetters) + '…' : 'Qual è la parola?', cx, height * 0.77)
      if (flash > 0) {
        ctx.font = `bold ${Math.min(26, width / 28)}px system-ui`
        fillTextWithAvatar(ctx, `${last.name} +${last.pts}`, cx, height * 0.82, { nickname: last.name, avatar: last.avatar })
      }
      drawTimerBar(ctx, width, height, Math.max(0, timer / (revealed ? breakSecs : roundSecs)), revealed ? '#3ccf7a' : '#f5b14c')
      if (showBoard) drawLeaderboard(ctx, scores)
    },
  }
}
