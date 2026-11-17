import { bandInfo, type ContextTournamentState, type TournamentBand } from '@zerocade/shared'
import { roundCheer } from '../audio'
import { overlaySnapshot } from '../store'
import { clamp } from './common'
import { paintContext, type ContextGuess, type ContextView, type TournamentLayer } from './contextView'

// ZeroContext's tournament, drawn with the same code as the classic game (paintContext): the same panel, tiles, chips,
// cards, ranking and words of the moment. It decides nothing: everything comes from the server's state (specifica §10),
// the clock counted down locally from its remainingMs. Neither the secret nor its length is sent before the round ends.

const UI = {
  mode: (round: number, total: number | null) =>
    `MODALITÀ TORNEO ZEROCONTEXT${round > 0 ? ` · ${total === null ? `MANCHE ${round}` : `MANCHE ${round} DI ${total}`}` : ''}`,
  ready: 'Il torneo sta per iniziare',
  readyHint: 'Scrivi una parola in chat quando si apre la finestra:',
  readyHint2: 'entri in classifica con il primo tentativo valido.',
  players: (n: number) => (n === 1 ? '1 giocatore' : `${n} giocatori`),
  open: 'INVIO APERTO',
  processing: 'ELABORAZIONE',
  start: 'PARTENZA',
  next: 'NUOVA FINESTRA',
  suspended: 'IN PAUSA',
  window: (x: number, y: number) => `Finestra ${x}/${y}`,
  received: (n: number) => (n === 1 ? '1 parola ricevuta' : `${n} parole ricevute`),
  best: (p: number | null) => (p === null ? 'nessun tentativo' : `migliore #${p.toLocaleString('it-IT')}`),
  of: (n: number) => `su ${n.toLocaleString('it-IT')} parole`,
  top10: 'CLASSIFICA TORNEO ZEROCONTEXT — TOP 10',
  final: 'CLASSIFICA FINALE DEL TORNEO — TOP 10',
  cancelled: 'TORNEO ANNULLATO — CLASSIFICA',
  nobody: 'Ancora nessun giocatore in classifica',
  empty: 'Nessuna parola ancora',
  tieAtTen: 'Pari merito al 10° posto: la classifica completa li mostra tutti',
  waitNext: "La prossima manche parte quando l'organizzatore la avvia",
}
const GREEN = '#1FA35B'
const AMBER = '#E0A022'
const RED = '#C62828'

type GuessLike = { word: string; position: number; author: string | null }

export function createContextTournament() {
  let width = 0
  let height = 0
  // When each word first appeared, so a new one slides in like in the classic game.
  const seen = new Map<string, number>()
  let seenTournament = ''
  // Whether the word was already found at the last frame; null before the first one, so a page opened on a round
  // that is over does not cheer.
  let found: boolean | null = null
  const guess = (g: GuessLike, now: number, tag: string): ContextGuess => {
    const key = `${tag}:${g.word}`
    let first = seen.get(key)
    if (first === undefined) seen.set(key, (first = now))
    return { word: g.word, rank: g.position - 1, by: g.author === null ? null : { id: `t:${g.author}`, nickname: g.author }, at: first }
  }

  return {
    reset(_settings: unknown, w: number, h: number) {
      width = w
      height = h
    },
    onAction() {},
    update() {},
    draw(ctx: CanvasRenderingContext2D, now: number) {
      ctx.clearRect(0, 0, width, height)
      const { contextTournament: t, contextTournamentAt } = overlaySnapshot()
      if (!t) return
      if (seenTournament !== t.tournamentId) {
        seen.clear()
        seenTournament = t.tournamentId
        found = null
      }
      // The word is found: the same applause as the classic game's (it follows the "Applauso a fine round" setting).
      const nowFound = t.solution !== null && t.solvedBy !== null
      if (found === false && nowFound) roundCheer()
      found = nowFound
      const k = clamp((width - 16) / 840, 0.3, 1)
      ctx.save()
      try {
        ctx.scale(k, k)
        paintContext(ctx, now, width / k, height / k, k, viewOf(t, performance.now() - contextTournamentAt, now, guess))
      } finally { ctx.restore() }
    },
  }
}

const positionBand = (position: number): TournamentBand =>
  position <= 1 ? 'target' : position <= 100 ? 'red' : position <= 600 ? 'orange' : position <= 2500 ? 'yellow' : position <= 7500 ? 'cyan' : 'blue'

// The last countdownMs of the wait before a window: the 3-2-1, whose words already count for it.
function isCounting(t: ContextTournamentState, elapsed: number): boolean {
  return t.phase === 'window-processing' && t.countdownMs > 0 && t.remainingMs - elapsed <= t.countdownMs
}

function viewOf(t: ContextTournamentState, elapsed: number, now: number, make: (g: GuessLike, now: number, tag: string) => ContextGuess): ContextView {
  const remaining = Math.max(0, t.remainingMs - elapsed)
  const seconds = Math.max(1, Math.ceil(remaining / 1000))
  // The 3-2-1 before a window: the last countdownMs of the wait.
  const counting = isCounting(t, elapsed)
  const count = Math.max(1, Math.ceil(remaining / 1000))
  const between = t.phase === 'intermission' || t.phase === 'completed' || t.phase === 'cancelled'
  const badge = t.phase === 'window-open' ? { text: String(seconds), sub: UI.open, color: GREEN }
    : t.phase === 'window-processing' && counting ? { text: String(count), sub: UI.start, color: AMBER }
    : t.phase === 'window-processing' ? { text: remaining > 400 ? '…' : String(t.window), sub: remaining > 400 ? UI.processing : UI.next, color: AMBER }
    : t.phase === 'suspended' ? { text: '⏸', sub: UI.suspended, color: RED }
    : null
  const notes: string[] = []
  if (t.suspendedReason) notes.push(t.suspendedReason)
  if (t.achievements.length) notes.push(t.achievements.join(' · '))
  if (between && t.tieAtTen) notes.push(UI.tieAtTen)
  if (t.phase === 'intermission') notes.push(UI.waitNext)
  const layer: TournamentLayer = {
    showTilesDuringRound: t.wordLength !== null,
    mode: UI.mode(t.round, t.totalRounds),
    badge,
    bigCount: counting ? count : null,
    chips: [UI.window(t.window, t.windowsPerRound), t.phase === 'window-open' ? UI.received(t.submissions) : UI.best(t.best), UI.of(t.corpusSize)],
    colorOf: (rank) => bandInfo(positionBand(rank + 1)).background,
    centerLines: t.phase === 'ready' ? [UI.ready, UI.readyHint, UI.readyHint2, UI.players(t.players)] : null,
    standingsTitle: between ? (t.phase === 'completed' ? UI.final : t.phase === 'cancelled' ? UI.cancelled : UI.top10) : null,
    standings: t.top10.map((r) => ({ place: `${r.place}${r.tied ? '=' : ''}`, name: r.nickname, avatar: r.avatar, points: r.points, delta: r.delta })),
    emptyText: between ? UI.nobody : UI.empty,
    notes,
  }
  // The window's words: the closest as the featured card, the others as the words of the moment under the panel.
  const window = [...t.lastWindow].sort((a, b) => a.position - b.position)
  return {
    // With "Mostra numero di lettere" on, the round shows one empty tile per letter (the word is blank padding).
    ready: true, problem: null, preparing: false, word: t.solution ?? ' '.repeat(t.wordLength ?? 0), total: Math.max(t.corpusSize, 3),
    attempts: t.submissions, revealed: t.solution !== null, lettersShown: 0, showWordLength: t.wordLength !== null,
    solver: t.solvedBy ? { id: 't:solver', nickname: t.solvedBy } : null, revealAt: now - 1_000_000,
    best: t.best === null ? Infinity : t.best - 1, redUntil: 100, orangeUntil: 600, yellowUntil: 2500, cyanUntil: 7500,
    showBoard: !between && t.top10.length > 0, last: window[0] ? make(window[0], now, 'w') : null,
    closest: t.board.map((g) => make(g, now, 'b')), matchOver: false,
    leaders: t.top10.map((r) => ({ name: r.nickname, pts: r.points, avatar: r.avatar })),
    // The words written, as in the classic game: grey when it is not a word, else the colour of its band.
    typed: t.typed.map((w) => ({ text: w.text, user: { id: `t:${w.nickname}`, nickname: w.nickname, ...(w.avatar ? { avatar: w.avatar } : {}) },
      rank: w.position === null ? null : w.position - 1 })),
    tournament: layer,
  }
}

