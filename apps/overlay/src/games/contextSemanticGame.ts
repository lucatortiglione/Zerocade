import { normalizeContextColors, type ContextSemanticGuess, type ContextSemanticState, type GameSettings } from '@zerocade/shared'
import { roundCheer } from '../audio'
import { clamp } from './common'
import { bandColor } from './contextRanking'
import { paintContext, type ContextGuess, type ContextView } from './contextView'

// Pure presentation: the server owns clock, attempts, solutions, hints and points.
export function createSemanticContext(snapshot: () => { contextSemantic: ContextSemanticState | null; contextSemanticAt: number }) {
  let width = 0, height = 0
  let settings: GameSettings = {}
  let round = 0
  let revealed = false
  let revealAt = 0
  const seen = new Map<string, number>()
  const guess = (g: ContextSemanticGuess, now: number): ContextGuess => {
    if (!seen.has(g.word)) seen.set(g.word, now)
    return { ...g, at: seen.get(g.word)! }
  }
  return {
    reset(s: GameSettings, w: number, h: number) { settings = s; width = w; height = h },
    setSettings(s: GameSettings) { settings = s },
    onAction() {},
    update() {},
    draw(ctx: CanvasRenderingContext2D, now: number) {
      ctx.clearRect(0, 0, width, height)
      const { contextSemantic: state, contextSemanticAt } = snapshot()
      if (!state) return
      if (round !== state.round) { round = state.round; seen.clear(); revealed = state.solution !== null }
      if (!revealed && state.solution !== null) { revealAt = now; if (state.solvedBy) roundCheer() }
      revealed = state.solution !== null
      const elapsed = state.paused ? 0 : Math.max(0, performance.now() - contextSemanticAt)
      const remaining = state.remainingMs === null ? null : Math.max(0, state.remainingMs - elapsed)
      const special = state.mode === 'special'
      const colors = normalizeContextColors(settings)
      const notes = [...state.notes]
      if (state.reason === 'time') notes.push('Tempo scaduto')
      if (state.reason === 'attempts') notes.push('Tentativi esauriti')
      const view: ContextView = {
        ready: state.preparing !== true, problem: null, preparing: state.preparing === true,
        word: state.solution ?? state.prefix.padEnd(state.wordLength ?? state.prefix.length, ' '),
        total: state.total, attempts: state.attempts, revealed, lettersShown: state.prefix.length,
        showWordLength: state.wordLength !== null, solver: state.solvedBy, revealAt,
        best: state.best ?? Infinity, ...colors, showBoard: settings.showLeaderboard !== false,
        last: state.last ? guess(state.last, now) : null, closest: state.closest.map((g) => guess(g, now)),
        matchOver: false, leaders: state.leaders, typed: state.typed, contextHint: state.contextHint?.text,
        tournament: {
          showTilesDuringRound: true,
          mode: `ROUND ${state.round} · ${special ? 'SPECIALE — SURVIVAL ZIPF 1.9' : 'ORDINARIO'}`,
          badge: special && !revealed ? { text: `${Math.ceil((remaining ?? 0) / 1000)}s`, sub: state.paused ? 'IN PAUSA' : 'TEMPO RIMASTO', color: '#f97316' } : null,
          chips: [special ? `${state.attempts}/100 tentativi` : `${state.attempts} tentativi`, `${state.total.toLocaleString('it-IT')} parole`,
            special ? '3 minuti' : 'Senza limite di tempo'],
          colorOf: (rank) => bandColor(rank, colors.redUntil, colors.orangeUntil, colors.yellowUntil, colors.cyanUntil),
          bigCount: null, centerLines: null,
          standingsTitle: revealed && state.leaders.length ? 'CLASSIFICA SESSIONE — TOP 10' : null,
          standings: state.leaders.map((l, i) => ({ place: String(i + 1), name: l.name, avatar: l.avatar, points: l.pts, delta: 0 })),
          emptyText: 'Scrivi una parola in chat', notes,
        },
      }
      const k = clamp((width - 16) / 840, .3, 1)
      ctx.save()
      try { ctx.scale(k, k); paintContext(ctx, now, width / k, height / k, k, view) }
      finally { ctx.restore() }
    },
  }
}
