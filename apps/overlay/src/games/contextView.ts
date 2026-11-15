import type { Viewer } from '@zerocade/shared'
import { drawAvatar, fillTextWithAvatar } from './avatar'
import { clamp, type Score } from './common'
import { bandColor, closeness, position } from './contextRanking'

export interface ContextGuess { word: string; rank: number; by: Viewer | null; at: number }
export interface ContextTypedGuess { text: string; user: Viewer; rank: number | null }
export interface ContextView {
  ready: boolean; problem: string | null; preparing: boolean; word: string; total: number; attempts: number
  revealed: boolean; lettersShown: number; solver: Viewer | null; revealAt: number; best: number
  redUntil: number; orangeUntil: number; yellowUntil: number; cyanUntil: number
  showBoard: boolean; last: ContextGuess | null; closest: readonly ContextGuess[]
  matchOver: boolean; leaders: readonly Score[]; typed: readonly ContextTypedGuess[]
  // Set by the tournament, which is drawn with this same view: its extras and its own readings of the round.
  tournament?: TournamentLayer
}

export interface TournamentStandingRow { place: string; name: string; avatar?: string; points: number; delta: number }
export interface TournamentLayer {
  // "Modalità Torneo ZeroContext · Manche 2 di 5", under the title.
  mode: string
  // The clock of the window, top right: big text and what it is.
  badge: { text: string; sub: string; color: string } | null
  chips: string[]
  // The band colour of a rank: the official one (§2), not the classic game's.
  colorOf: (rank: number) => string
  // The 3-2-1 before a window: a big number over the panel.
  bigCount: number | null
  // Lines in the middle of the panel instead of the round (before the first one).
  centerLines: string[] | null
  // The Top 10 in place of the closest words, between rounds and at the end.
  standingsTitle: string | null
  standings: readonly TournamentStandingRow[]
  emptyText: string
  // Small notes above the end-of-round line (achievements, ties, what happens next).
  notes: string[]
}

// Presentation only: no downloads, ranking computation, worker or score effects.
export function paintContext(ctx: CanvasRenderingContext2D, now: number, width: number, height: number, k: number, view: ContextView) {
  const { ready, problem, preparing, word, total, attempts, revealed, lettersShown, solver, revealAt,
    best, redUntil, orangeUntil, yellowUntil, cyanUntil, showBoard, last, closest, matchOver, leaders, typed } = view
      const T = view.tournament
      ctx.textBaseline = 'alphabetic'
      const cx = width / 2
      const panelW = Math.min(width - 48, 800)
      const left = cx - panelW / 2
      const top = Math.round(56 / k)
      const bottom = height - Math.round(132 / k)
      if (bottom - top < 300) return

      // One glass panel behind everything, so the game reads over any stream background.
      const bg = ctx.createLinearGradient(0, top, 0, bottom)
      bg.addColorStop(0, 'rgba(22,18,44,0.88)')
      bg.addColorStop(1, 'rgba(10,12,24,0.88)')
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.roundRect(left - 18, top, panelW + 36, bottom - top, 28)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Title: ZERO in white, CONTEXT in the brand gradient.
      ctx.font = '800 40px system-ui'
      const zeroW = ctx.measureText('ZERO').width
      const ctxW = ctx.measureText('CONTEXT').width
      const tx = cx - (zeroW + ctxW) / 2
      ctx.textAlign = 'left'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('ZERO', tx, top + 58)
      const title = ctx.createLinearGradient(tx + zeroW, 0, tx + zeroW + ctxW, 0)
      title.addColorStop(0, '#7c5cff')
      title.addColorStop(1, '#22d3ee')
      ctx.fillStyle = title
      ctx.fillText('CONTEXT', tx + zeroW, top + 58)

      if (T) {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#9aa0b8'
        ctx.font = '700 15px system-ui'
        ctx.fillText(T.mode, cx, top + 84, panelW - 200)
        if (T.badge) {
          const bw = 124
          const bx = left + panelW - bw
          ctx.fillStyle = T.badge.color + '38'
          ctx.beginPath()
          ctx.roundRect(bx, top + 18, bw, 56, 16)
          ctx.fill()
          ctx.strokeStyle = T.badge.color
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 28px system-ui'
          ctx.fillText(T.badge.text, bx + bw / 2, top + 47)
          ctx.fillStyle = T.badge.color
          ctx.font = '700 11px system-ui'
          ctx.fillText(T.badge.sub, bx + bw / 2, top + 65, bw - 12)
        }
        if (T.centerLines) {
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 26px system-ui'
          ctx.fillText(T.centerLines[0] ?? '', cx, top + 190, panelW)
          ctx.fillStyle = '#9aa0b8'
          ctx.font = '18px system-ui'
          T.centerLines.slice(1).forEach((line, i) => ctx.fillText(line, cx, top + 232 + i * 30, panelW))
          return
        }
      }

      if (problem || !ready) {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#9aa0b8'
        ctx.font = '24px system-ui'
        const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3))
        ctx.font = problem ? '18px system-ui' : '24px system-ui'
        ctx.fillText(problem ?? (preparing ? `Preparo la classifica${dots}` : `Carico le parole${dots}`), cx, top + 130, panelW)
        return
      }

      const n = word.length

      // The secret as tiles: shown letters filled, the rest empty; they hop when it is found.
      const gap = 8
      const tile = Math.min(56, (panelW - gap * (n - 1)) / n)
      const tilesW = n * tile + (n - 1) * gap
      const ty = top + (T ? 108 : 88)
      for (let i = 0; i < n; i++) {
        const x = cx - tilesW / 2 + i * (tile + gap)
        const shown = revealed || i < lettersShown
        const pop = revealed ? clamp((now - revealAt - i * 70) / 260, 0, 1) : 1
        const lift = shown && revealed ? Math.sin(pop * Math.PI) * 10 : 0
        ctx.fillStyle = shown ? (revealed ? (solver ? '#1FA35B' : '#E0A022') : '#3b3f66') : 'rgba(255,255,255,0.07)'
        ctx.beginPath()
        ctx.roundRect(x, ty - lift, tile, tile * 1.15, 12)
        ctx.fill()
        if (shown) {
          ctx.fillStyle = '#ffffff'
          ctx.font = `800 ${Math.round(tile * 0.6)}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(word[i].toUpperCase(), x + tile / 2, ty - lift + (tile * 1.15) / 2 + 2)
          ctx.textBaseline = 'alphabetic'
        }
      }

      // Chips: tries, best rank and the scale.
      const chips = T?.chips ?? [`${attempts} tentativi`, Number.isFinite(best) ? `migliore #${position(best).toLocaleString('it-IT')}` : 'nessun tentativo', `su ${total.toLocaleString('it-IT')} parole`]
      const chipFont = '600 13px system-ui'
      ctx.font = chipFont
      const cw = chips.map((c) => ctx.measureText(c).width + 24)
      let cxp = cx - (cw.reduce((a, b) => a + b, 0) + (chips.length - 1) * 10) / 2
      // The tournament shows no tiles until the word is found: how many letters it has is not said.
      // In the tournament the finder's name goes right under the secret word, and the chips and the standings follow.
      const finderY = ty + tile * 1.15 + 34
      const cy = ty + (T && !revealed ? -8 : tile * 1.15 + 18) + (T && revealed ? 40 : 0)
      if (T && revealed) {
        ctx.textAlign = 'center'
        ctx.fillStyle = solver ? '#3ccf7a' : '#E0A022'
        ctx.font = '800 26px system-ui'
        if (solver) fillTextWithAvatar(ctx, `${solver.nickname} ha trovato la parola!`, cx, finderY, solver)
        else ctx.fillText('Nessuno ha trovato la parola', cx, finderY)
      }
      chips.forEach((c, i) => {
      // The font is set again: the finder's line above (round over) left the large one, and the chips, measured at the
      // small size, would be drawn wider than their pills and run into each other.
      ctx.font = chipFont
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.beginPath()
        ctx.roundRect(cxp, cy, cw[i], 28, 14)
        ctx.fill()
        ctx.fillStyle = '#c4c9e0'
        ctx.textAlign = 'center'
        ctx.fillText(c, cxp + cw[i] / 2, cy + 19)
        cxp += cw[i] + 10
      })

      // By position, as the players see it: 1 is the secret.
      const heat = (r: number) => {
        const p = position(r)
        return p === 1 ? '🏆 Trovata!' : p <= 10 ? '🔥 Rovente' : p <= 100 ? '♨️ Caldissima' : p <= 300 ? '😀 Calda' : p <= 1500 ? '🙂 Tiepida' : p <= 5000 ? '❄️ Fredda' : '🧊 Gelida'
      }
      const ease = (g: ContextGuess) => 1 - Math.pow(1 - clamp((now - g.at) / 380, 0, 1), 3)

      // A guess on its bar: the colour is its band, the fill is how close it is, and a new
      // one slides in. `big` is the featured last guess.
      const card = (g: ContextGuess, y: number, h: number, big: boolean) => {
        const e = ease(g)
        const x = left + (1 - e) * 40
        ctx.save()
        ctx.globalAlpha = e
        const color = T ? T.colorOf(g.rank) : bandColor(g.rank, redUntil, orangeUntil, yellowUntil, cyanUntil)
        ctx.fillStyle = big ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'
        ctx.beginPath()
        ctx.roundRect(x, y, panelW, h, 16)
        ctx.fill()
        const fillW = Math.max(h, panelW * closeness(g.rank, total))
        const bar = ctx.createLinearGradient(x, 0, x + fillW, 0)
        bar.addColorStop(0, color + '30')
        bar.addColorStop(1, color + (big ? 'aa' : '88'))
        ctx.fillStyle = bar
        ctx.beginPath()
        ctx.roundRect(x, y, fillW, h, 16)
        ctx.fill()
        if (big) {
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.roundRect(x, y, panelW, h, 16)
          ctx.stroke()
        }
        const mid = y + h / 2
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 ${big ? 32 : 22}px system-ui`
        ctx.fillText(g.word, x + 20, big ? y + h * 0.36 : mid)
        ctx.font = '600 16px system-ui'
        ctx.fillStyle = color
        if (big) ctx.fillText(heat(g.rank), x + 20, y + h * 0.74)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#ffffff'
        ctx.font = `800 ${big ? 38 : 22}px system-ui`
        ctx.fillText(`${g.rank === 0 ? '★ ' : ''}#${position(g.rank).toLocaleString('it-IT')}`, x + panelW - 20, big ? y + h * 0.4 : mid)
        // The viewer: picture beside the name.
        ctx.font = '600 16px system-ui'
        ctx.fillStyle = '#d6daf0'
        const nameX = x + panelW - (big ? 20 : 120)
        const nameY = big ? y + h * 0.76 : mid
        if (g.by) {
          const nameW = ctx.measureText(g.by.nickname).width
          drawAvatar(ctx, g.by.avatar, nameX - nameW - 18, nameY, big ? 13 : 11, g.by.nickname)
          ctx.fillText(g.by.nickname, nameX, nameY)
        } else {
          ctx.fillStyle = '#a99cff'
          ctx.fillText('✨ aiuto', nameX, nameY)
        }
        ctx.restore()
        ctx.textBaseline = 'alphabetic'
      }

      // The Top 10 in place of the closest words: in the tournament between rounds and at the end; in the classic game
      // once the round is over (the session's ranking, from the overlay's own scores).
      const S: { title: string; rows: readonly { place: string; name: string; avatar?: string; points: number; delta?: number }[]; empty: string } | null =
        T?.standingsTitle ? { title: T.standingsTitle, rows: T.standings, empty: T.emptyText }
        : !T && revealed && leaders.length ? { title: 'CLASSIFICA SESSIONE — TOP 10', rows: leaders.slice(0, 10).map((l, i) => ({ place: String(i + 1), name: l.name, avatar: l.avatar, points: l.pts })), empty: '' }
        : null
      // The ranking of the five best scorers, in the bottom of the panel (not when the Top 10 is up instead).
      const board = showBoard && !(S && !T)
      const boardH = board ? 84 : 0
      const boardTop = bottom - boardH - 12
      let y = cy + 46
      const notes = T?.notes ?? []
      // The classic game's end-of-round lines (who found it, the match winner) sit under the list.
      const endLines = !T && revealed ? 50 + (matchOver && leaders[0] ? 36 : 0) : 0
      const listBottom = (board ? boardTop : bottom) - 40 - notes.length * 26 - endLines
      if (S) {
        ctx.textAlign = 'left'
        ctx.fillStyle = '#7f86a8'
        ctx.font = '700 14px system-ui'
        ctx.fillText(S.title, left + 6, y + 4)
        y += 14
        const medalColors = ['#f5c542', '#c0c6d4', '#d08a4e']
        const rowsRoom = Math.max(0, Math.floor((listBottom - y) / 46))
        if (!S.rows.length) {
          ctx.textAlign = 'center'
          ctx.fillStyle = '#7f86a8'
          ctx.font = '22px system-ui'
          ctx.fillText(S.empty, cx, y + 40)
        }
        for (const r of S.rows.slice(0, Math.min(10, rowsRoom))) {
          const idx = Number.parseInt(r.place, 10) - 1
          const medal = medalColors[idx] ?? '#6f78a8'
          ctx.fillStyle = idx >= 0 && idx < 3 ? medal + '30' : 'rgba(255,255,255,0.05)'
          ctx.beginPath()
          ctx.roundRect(left, y, panelW, 40, 16)
          ctx.fill()
          const mid = y + 20
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'left'
          ctx.fillStyle = medal
          ctx.font = '800 22px system-ui'
          ctx.fillText(r.place, left + 20, mid)
          drawAvatar(ctx, r.avatar, left + 82, mid, 13, r.name)
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 22px system-ui'
          let name = r.name
          while (name.length > 3 && ctx.measureText(name).width > panelW - 330) name = name.slice(0, -2) + '…'
          ctx.fillText(name, left + 106, mid)
          ctx.textAlign = 'right'
          if (r.delta !== undefined) {
            ctx.fillStyle = r.delta < 0 ? '#ff8a80' : '#7ee2a8'
            ctx.font = '700 16px system-ui'
            ctx.fillText(r.delta === 0 ? '±0' : r.delta > 0 ? `+${r.delta}` : String(r.delta), left + panelW - 20, mid)
          }
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 22px system-ui'
          ctx.fillText(`${r.points} pt`, left + panelW - (r.delta === undefined ? 20 : 80), mid)
          y += 46
        }
        ctx.textBaseline = 'alphabetic'
      } else if (last) {
        const h = 82
        card(last, y, h, true)
        y += h + 16
        ctx.textAlign = 'left'
        ctx.fillStyle = '#7f86a8'
        ctx.font = '700 14px system-ui'
        ctx.fillText('I PIÙ VICINI', left + 6, y + 4)
        y += 14
      } else {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#7f86a8'
        ctx.font = '22px system-ui'
        ctx.fillText(T?.emptyText ?? 'Scrivi una parola in chat per iniziare', cx, y + 40)
      }
      const rowH = 46
      const room = Math.max(0, Math.floor((listBottom - y) / rowH))
      for (const g of S ? [] : closest.slice(0, Math.min(10, room))) {
        card(g, y, rowH - 6, false)
        y += rowH
      }

      // The tournament's notes (achievements, ties, what comes next), above the end-of-round line.
      if (notes.length) {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#f5c542'
        ctx.font = '700 16px system-ui'
        const base = (board ? boardTop : bottom) - (revealed && !T ? 52 : 14)
        notes.forEach((line, i) => ctx.fillText(line, cx, base - (notes.length - 1 - i) * 26, panelW))
      }

      // The end of the round, above the ranking.
      if (revealed && !T) {
        ctx.textAlign = 'center'
        ctx.fillStyle = solver ? '#3ccf7a' : '#E0A022'
        ctx.font = '800 26px system-ui'
        const my = (board ? boardTop : bottom) - 14
        if (solver) fillTextWithAvatar(ctx, `${solver.nickname} ha trovato: ${word}`, cx, my, solver)
        else ctx.fillText(`Round terminato: era ${word}`, cx, my)
        const champion = matchOver ? leaders[0] : undefined
        if (champion) {
          ctx.fillStyle = '#f5c542'
          ctx.font = '800 22px system-ui'
          fillTextWithAvatar(ctx, `🏁 Partita finita: vince ${champion.name} con ${champion.pts} pt`, cx, my - 36, { nickname: champion.name, avatar: champion.avatar })
        }
      }

      if (board) {
        const best5 = leaders
        ctx.textAlign = 'left'
        ctx.fillStyle = '#7f86a8'
        ctx.font = '700 14px system-ui'
        ctx.fillText('CLASSIFICA', left + 6, boardTop - 6)
        const slot = (panelW - 4 * 8) / 5
        const medals = ['#f5c542', '#c0c6d4', '#d08a4e', '#6f78a8', '#6f78a8']
        for (let i = 0; i < 5; i++) {
          const x = left + i * (slot + 8)
          ctx.fillStyle = 'rgba(255,255,255,0.06)'
          ctx.beginPath()
          ctx.roundRect(x, boardTop, slot, boardH - 12, 14)
          ctx.fill()
          const entry = best5[i]
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'left'
          ctx.fillStyle = medals[i]
          ctx.font = '800 20px system-ui'
          ctx.fillText(String(i + 1), x + 12, boardTop + (boardH - 12) / 2)
          if (!entry) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)'
            ctx.font = '600 16px system-ui'
            ctx.fillText('—', x + 34, boardTop + (boardH - 12) / 2)
            continue
          }
          drawAvatar(ctx, entry.avatar, x + 52, boardTop + (boardH - 12) / 2, 15, entry.name)
          ctx.fillStyle = '#ffffff'
          ctx.font = '700 15px system-ui'
          let name = entry.name
          while (name.length > 3 && ctx.measureText(name).width > slot - 84) name = name.slice(0, -2) + '…'
          ctx.fillText(name, x + 74, boardTop + (boardH - 12) / 2 - 9)
          ctx.fillStyle = medals[i]
          ctx.font = '800 15px system-ui'
          ctx.fillText(`${entry.pts} pt`, x + 74, boardTop + (boardH - 12) / 2 + 11)
        }
        ctx.textBaseline = 'alphabetic'
      }

    // The words just sent, under the panel: who wrote what, coloured by how close it is (grey: not a word).
    if (typed.length) {
      const y = bottom + 14
      const h = 34
      ctx.textBaseline = 'middle'
      ctx.font = '700 17px system-ui'
      const pills = typed.map((t) => {
        ctx.font = '600 14px system-ui'
        const nameW = ctx.measureText(t.user.nickname).width
        ctx.font = '800 17px system-ui'
        return { t, nameW, w: 12 + 22 + nameW + 10 + ctx.measureText(t.text).width + 14 }
      })
      // The newest ones that fit in the panel's width.
      let shown = pills.length
      let total = pills.reduce((a, p) => a + p.w + 8, -8)
      while (shown > 1 && total > panelW) total -= pills[pills.length - shown].w + 8, shown--
      let x = cx - Math.min(total, panelW) / 2
      for (const p of pills.slice(-shown)) {
        const color = p.t.rank === null ? '#6f78a8' : T ? T.colorOf(p.t.rank) : bandColor(p.t.rank, redUntil, orangeUntil, yellowUntil, cyanUntil)
        ctx.fillStyle = p.t.rank === null ? 'rgba(255,255,255,0.08)' : color + '40'
        ctx.beginPath()
        ctx.roundRect(x, y, p.w, h, 17)
        ctx.fill()
        drawAvatar(ctx, p.t.user.avatar, x + 18, y + h / 2, 10, p.t.user.nickname)
        ctx.textAlign = 'left'
        ctx.font = '600 14px system-ui'
        ctx.fillStyle = '#c4c9e0'
        ctx.fillText(p.t.user.nickname, x + 34, y + h / 2)
        ctx.font = '800 17px system-ui'
        ctx.fillStyle = p.t.rank === null ? '#9aa0b8' : '#ffffff'
        ctx.fillText(p.t.text, x + 34 + p.nameW + 10, y + h / 2)
        x += p.w + 8
      }
      ctx.textBaseline = 'alphabetic'
    }

    // The 3-2-1 before a window, big in the middle of the panel; it pulses at each number.
    if (T?.bigCount) {
      const phase = clamp((now % 1000) / 1000, 0, 1)
      ctx.save()
      ctx.globalAlpha = 0.95 - phase * 0.35
      ctx.fillStyle = 'rgba(10,12,24,0.72)'
      ctx.beginPath()
      ctx.arc(cx, (top + bottom) / 2, 120, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#E0A022'
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffffff'
      ctx.font = `800 ${Math.round(150 - phase * 20)}px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(T.bigCount), cx, (top + bottom) / 2 + 8)
      ctx.restore()
    }
}
