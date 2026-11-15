import { payloadBytes, normalizeContextColors, type LiveEvent, type Viewer } from '@zerocade/shared'
import { retryDue } from './retry'
import { CONTEXT_LIMITS, ContextError } from '@zerocade/shared'
import { ContextWorkerClient } from './contextWorkerClient'
import type { ContextComputer } from './contextProtocol'
import type { GameInstance } from './engine'
import { paintContext, type ContextGuess as Guess, type ContextTypedGuess } from './contextView'
import { addPoints, clamp, newScores, topOf, type Score } from './common'
import { freshSecret, noteSecretUse } from './secretUses'
import {
  closerHint,
  lookup,
  startHint,
  type ContextVocabulary,
  type Ranking,
} from './contextRanking'
import { followSecret, reportSecret, revealSecret, type RoomSecret } from './roomSecret'
import { roundCheer } from '../audio'

// ZeroContext: every word typed in chat is ranked by closeness of meaning to a secret word,
// over the whole Italian vocabulary of gioco-zerocontext (1 = the closest word). Chat narrows
// it down until someone writes the secret. An owned worker ranks the vectors the
// server serves at /api/context/*; there is no list of "close" words to learn.

export function createContext(createComputer: () => ContextComputer = () => new ContextWorkerClient(window.location.origin),
  room: RoomSecret = { follow: followSecret, report: reportSecret, reveal: revealSecret }): GameInstance {
  let width = 0
  let height = 0
  let breakSecs = 8
  let finderPts = 100
  let disableAllHints = false
  let autoHints = false
  let autoHintSecs = 45
  let maxHints = 5
  let hintFloor = 3 // a rank: position 4
  let startHintAt = 30 // a position
  let startHintOn = false
  let redUntil = 10
  let orangeUntil = 100
  let yellowUntil = 1000
  let cyanUntil = 10000
  let showBoard = true
  let starterWords = false
  let closestMult = 1
  let matchWords = 0 // 0: one leaderboard all stream
  let roundsPlayed = 0
  let matchOver = false

  // The dashboard's settings, read again every frame so a change applies at once.
  const read = (settings: Record<string, number | boolean | string>) => {
    const num = (key: string, fallback: number) => (typeof settings[key] === 'number' && Number.isFinite(settings[key]) ? settings[key] : fallback)
    if (settings.disableAllHints === true && !disableAllHints) {
      guesses = guesses.filter((g) => g.by !== null)
      last = guesses.at(-1) ?? null
      best = guesses.reduce((best, g) => Math.min(best, g.rank), Infinity)
      rebuildClosest()
      taken = new Set(guesses.map((g) => data!.index.get(g.word)!))
      lettersShown = 0
      hintClock = 0
    }
    disableAllHints = settings.disableAllHints === true
    breakSecs = num('breakSeconds', 8)
    finderPts = num('finderPoints', 100)
    autoHints = !disableAllHints && settings.autoHints === true // off unless the creator turns it on
    autoHintSecs = num('autoHintSeconds', 45)
    maxHints = num('maxHintsPerRound', 5)
    // The setting is a position (2 = the closest word, 1 being the secret); closerHint takes a rank.
    hintFloor = Math.max(1, num('hintClosest', 4) - 1)
    startHintAt = num('startHint', 30)
    startHintOn = !disableAllHints && settings.startHintOn === true // off unless the creator turns it on
    const colors = normalizeContextColors(settings)
    redUntil = colors.redUntil
    orangeUntil = colors.orangeUntil
    yellowUntil = colors.yellowUntil
    cyanUntil = colors.cyanUntil
    showBoard = settings.showLeaderboard !== false
    starterWords = !disableAllHints && settings.starterWords === true
    closestMult = { none: 0, low: 0.5, normal: 1, high: 2 }[String(settings.closestPoints ?? 'normal')] ?? 1
    matchWords = settings.matchEnds === 'words' ? num('matchWords', 10) : 0
  }

  let data: ContextVocabulary | null = null
  let computer: ContextComputer | null = null
  let loading = false
  let preparing = false
  let active = false
  let paused = false
  let frozen = false
  let problem: string | null = null
  let failedAt: number | null = null
  let attempts = 0
  let generation = 0
  let roundRevision = 0
  let requestedSecret: number | null = null
  let lastSecret: string | null = null
  let readyRound: (() => void) | null = null
  let unfollow: (() => void) | null = null
  type Input = { kind: 'action'; action: string; event: LiveEvent } | { kind: 'finish' }
  let inputs: Input[] = []
  let inputBytes = 0
  let ranking: Ranking | null = null
  let timer = 0
  let revealed = false
  let revealAt = 0
  let solver: Viewer | null = null
  let hintCount = 0
  let hintClock = 0
  let lettersShown = 0
  let best = Infinity
  let guesses: Guess[] = []
  let closest: Guess[] = []
  let taken = new Set<number>()
  let last: Guess | null = null
  // The words the chat has just sent, valid or not, shown under the panel (newest last).
  let typed: ContextTypedGuess[] = []
  const scores = newScores()
  let leaders: Score[] = []
  const award = (user: Viewer, points: number) => {
    addPoints(scores, user.id, user.nickname, user.avatar, points)
    leaders = topOf(scores, 5).map(([, score]) => score)
  }

  const total = () => data?.words.length ?? 0
  const secretWord = () => (data && ranking ? data.words[ranking.secret] : '')

  let pending: string | null = null // the room's secret, received before the words were loaded

  const clearInputs = () => { inputs = []; inputBytes = 0 }
  const freeze = (message: string) => {
    frozen = true
    problem = message
    roundRevision++
    readyRound = null
    preparing = false
    computer?.dispose()
    computer = null
    clearInputs()
    console.warn('[zerocontext]', message)
  }
  const enqueue = (input: Input) => {
    const bytes = 3 * payloadBytes(input, CONTEXT_LIMITS.pendingBytes)
    if (inputs.length >= CONTEXT_LIMITS.pendingActions || inputBytes + bytes > CONTEXT_LIMITS.pendingBytes) {
      freeze('Troppi eventi in attesa: round interrotto. Riavvia ZeroContext.'); return
    }
    inputs.push(structuredClone(input))
    inputBytes += bytes
  }

  // A new round: with the word the room is playing (`forced`) or a random one, reported to the server.
  const pick = (forced?: number) => {
    if (!data || !computer || frozen || !active || (preparing && forced === undefined)) return
    const prev = lastSecret
    if (forced === undefined && pending !== null) forced = data.index.get(pending)
    pending = null
    if (forced !== undefined && !data.secrets.includes(forced)) {
      freeze('La soluzione della stanza non è nella banca. Riavvia ZeroContext dopo aver aggiornato i dati.'); return
    }
    if (preparing && forced === requestedSecret) return
    if (preparing) clearInputs() // A different room word supersedes an unannounced round.
    // A word that never came out in this Zerocade while there is one (secretUses), counted here at once so the next
    // round does not take it again before the server's count arrives.
    const secret = forced ?? freshSecret(data.secrets, data.words, lastSecret)
    if (forced === undefined) noteSecretUse(data.words[secret])
    requestedSecret = secret
    const ticket = ++roundRevision
    const life = generation
    preparing = true
    ranking = null
    readyRound = null
    void computer.rank(secret).then((result) => {
      if (!active || frozen || generation !== life || roundRevision !== ticket) return
      const install = () => {
        if (!active || frozen || generation !== life || roundRevision !== ticket || !data) return
        preparing = false
        problem = null
        ranking = result
        lastSecret = data.words[result.secret]
        beginRound(forced === undefined ? { word: lastSecret, prev } : null)
      }
      if (paused) readyRound = install
      else install()
    }).catch((error: unknown) => {
      if (!active || generation !== life || roundRevision !== ticket) return
      if (error instanceof ContextError && (error.kind === 'closed' || error.kind === 'superseded')) return
      freeze('Calcolo di ZeroContext non riuscito. Riavvia il gioco.');
    })
  }

  const beginRound = (announcement: { word: string; prev: string | null } | null) => {
    if (!data || !ranking) return
    revealed = false
    solver = null
    hintCount = 0
    hintClock = 0
    lettersShown = 0
    best = Infinity
    guesses = []
    closest = []
    taken.clear()
    last = null
    typed = []
    if (starterWords) {
      // A few words far from the secret, to start the board; they are not hints.
      for (const share of [0.4, 0.1, 0.02]) {
        const r = Math.floor(total() * share)
        const i = ranking.order[r]
        if (r > 0 && !taken.has(i)) place({ word: data.words[i], rank: r, by: null, at: performance.now() })
      }
    }
    // A hint to start from (unless turned off), a little way from the closest word. It is not one of the round's hints
    // (maxHints), but it is the best so far: "Rivela più vicino" goes closer than it.
    const start = startHintOn ? startHint(ranking, startHintAt, hintFloor) : -1
    const startWord = start > 0 ? data.words[ranking.order[start]] : ''
    if (startWord && !guesses.some((g) => g.word === startWord)) place({ word: startWord, rank: start, by: null, at: performance.now() })
    if (announcement) room.report(announcement.word, announcement.prev)
    const waiting = inputs
    clearInputs()
    for (const input of waiting) {
      if (frozen || revealed) break
      if (input.kind === 'finish') finish(null)
      else act(input.action, input.event)
    }
  }

  // Wait for the words; the first round starts as soon as they are here.
  const ensureData = () => {
    if (data || loading || !active || frozen || attempts >= 3 || !retryDue(failedAt, performance.now())) return
    const life = generation
    loading = true
    attempts++
    try { computer ??= createComputer() }
    catch { loading = false; freeze('Impossibile avviare ZeroContext in un worker.'); return }
    void computer.load()
      .then((d) => {
        if (!active || frozen || life !== generation) return
        loading = false
        data = d
        failedAt = null
        problem = null
        if (!ranking) pick()
      })
      .catch((error: unknown) => {
        if (!active || frozen || life !== generation) return
        loading = false
        failedAt = performance.now()
        computer?.dispose()
        computer = null
        if (error instanceof ContextError && error.kind === 'network' && attempts < 3) {
          problem = 'Connessione ai dati interrotta. Riprovo tra pochi secondi.'
          console.warn('[zerocontext]', problem)
        } else freeze('Dati di ZeroContext non disponibili o non validi. Riavvia dopo averli verificati.')
      })
  }

  const rebuildClosest = () => { closest = [...guesses].sort((a, b) => a.rank - b.rank).slice(0, 10) }
  const place = (g: Guess) => {
    guesses.push(g)
    if (data) taken.add(data.index.get(g.word)!)
    closest = [...closest, g].sort((a, b) => a.rank - b.rank).slice(0, 10)
    last = g
    if (g.rank < best) best = g.rank
  }

  const hint = () => {
    if (disableAllHints || !data || !ranking || revealed || hintCount >= maxHints) return
    if (guesses.length >= CONTEXT_LIMITS.guesses) { freeze('Limite dei tentativi raggiunto. Riavvia il gioco.'); return }
    const r = closerHint(ranking, best, taken, hintFloor)
    if (r < 0) return
    place({ word: data.words[ranking.order[r]], rank: r, by: null, at: performance.now() })
    hintCount++
  }

  const finish = (by: Viewer | null) => {
    revealed = true
    roundCheer()
    revealAt = performance.now()
    solver = by
    timer = breakSecs
    roundsPlayed++
    matchOver = matchWords > 0 && roundsPlayed >= matchWords
    // Until the next round ZeroFollowerBot's voice does not read the chat's single words (see roomSecret).
    room.reveal?.(secretWord())
  }

  const act = (action: string, event: LiveEvent) => {
    if (!data || !ranking || revealed || frozen || paused) return
    if (action === 'reveal_closer') return hint()
    if (action === 'small_hint') {
      if (disableAllHints) return
      lettersShown = Math.min(lettersShown + 1, Math.max(1, secretWord().length - 2))
      return
    }
    if (event.type !== 'comment' || event.text.length > 256) return
    const who: Viewer = { id: event.user.id.slice(0, 64), nickname: event.user.nickname.slice(0, 32),
      ...(event.user.avatar && event.user.avatar.length <= 512 ? { avatar: event.user.avatar } : {}) }
    const i = lookup(data, event.text, ranking.secret)
    const text = event.text.trim().replace(/\s+/g, ' ').slice(0, 24)
    if (text) typed = [...typed, { text, user: who, rank: i >= 0 ? ranking.rankOf[i] : null }].slice(-6)
    if (i < 0 || taken.has(i)) return
    if (guesses.length >= CONTEXT_LIMITS.guesses || (!scores.has(who.id) && scores.size >= CONTEXT_LIMITS.players)) {
      freeze('Limite dei tentativi o dei giocatori raggiunto. Riavvia il gioco.'); return
    }
    const word = data.words[i]
    const rank = ranking.rankOf[i]
    const improved = rank < best
    place({ word, rank, by: who, at: performance.now() })
    if (rank === 0) {
      award(who, finderPts)
      finish(who)
    } else if (improved && closestMult > 0) {
      award(who, Math.max(1, Math.round((closestMult * finderPts) / (rank + 1))))
    }
  }

  return {
    setSettings: read,
    setPaused(value) {
      paused = value
      if (paused) clearInputs()
    },
    onOverload() { if (active && !frozen) freeze('Troppi eventi in attesa: round interrotto. Riavvia ZeroContext.') },
    dispose() {
      active = false
      generation++
      roundRevision++
      computer?.dispose()
      computer = null
      unfollow?.()
      unfollow = null
      readyRound = null
      data = null
      ranking = null
      guesses = []
      closest = []
      taken.clear()
      typed = []
      scores.clear()
      leaders = []
      clearInputs()
    },
    reset(settings, w, h) {
      generation++
      roundRevision++
      computer?.dispose()
      computer = null
      unfollow?.()
      active = true
      paused = false
      frozen = false
      loading = false
      preparing = false
      problem = null
      failedAt = null
      attempts = 0
      requestedSecret = null
      lastSecret = null
      readyRound = null
      data = null
      guesses = []
      closest = []
      taken.clear()
      last = null
      typed = []
      clearInputs()
      width = w
      height = h
      read(settings)
      roundsPlayed = 0
      matchOver = false
      scores.clear()
      leaders = []
      ranking = null
      pending = null
      unfollow = room.follow({
        adopt(word) {
          if (!active || frozen) return
          if (!data) pending = word
          else if (word !== secretWord() && data.index.has(word)) pick(data.index.get(word)!)
        },
      })
      ensureData()
      pick()
    },
    // "Termina round" in the dashboard: the word is shown as when nobody finds it, then the next round starts after
    // the pause.
    onCommand(command) {
      if (command !== 'next-round' || !active || frozen || paused) return
      if (data && ranking && !revealed) finish(null)
      else if (loading || preparing) enqueue({ kind: 'finish' })
    },
    onAction(action, event) {
      if (!active || frozen || paused) return
      if (!data || !ranking) return enqueue({ kind: 'action', action, event })
      act(action, event)
    },
    update(dt, _now, settings) {
      read(settings)
      if (!active || frozen || paused) return
      if (readyRound) { const install = readyRound; readyRound = null; install() }
      // Without the words (still loading, or the last download failed) ask again: retryDue decides when.
      if (!data) return ensureData()
      if (!ranking) { if (!preparing) pick(); return }
      if (revealed) {
        timer -= Number.isFinite(dt) && dt > 0 ? dt : 0
        if (timer <= 0) {
          if (matchOver) {
            // A new match: the leaderboard starts again.
            scores.clear()
            leaders = []
            roundsPlayed = 0
            matchOver = false
          }
          pick()
        }
        return
      }
      // No time limit: a round ends when the chat finds the word, or when the creator ends it (onCommand).
      if (autoHints) {
        hintClock += Number.isFinite(dt) && dt > 0 ? dt : 0
        if (hintClock >= autoHintSecs) {
          hintClock = 0
          hint()
        }
      }
    },
    // Laid out for a canvas 840 wide, and scaled down on a narrower one (the dashboard's preview).
    draw(ctx, now) {
      ctx.clearRect(0, 0, width, height)
      const k = clamp((width - 16) / 840, 0.3, 1)
      ctx.save()
      try {
        ctx.scale(k, k)
        paintContext(ctx, now, width / k, height / k, k, {
        ready: Boolean(data && ranking), problem, preparing, word: secretWord(), total: total(), attempts: guesses.length,
        revealed, lettersShown, solver, revealAt, best, redUntil, orangeUntil, yellowUntil, cyanUntil,
        showBoard, last, closest, matchOver, leaders, typed,
        })
      } finally { ctx.restore() }
    },
  }

}
