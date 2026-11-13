import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  QUIZZLAND_LETTERS,
  quizzlandCategoryById,
  type GameSettings,
  type QuizzlandFast,
  type QuizzlandPlayer,
  type QuizzlandState,
} from '@zerocade/shared'
import sky from '@quizzland/sfondo.svg'
import { quizSound, roundCheer } from './audio'
import { NasaBackdrop } from './NasaBackdrop'
import { useOverlay } from './store'
import './quizzland.css'

// Quizzland is drawn in the DOM, like Bivio and Incastro: the server runs the quiz and this
// renders its QuizzlandState. Sizes are in vmin/vh within the 9:16 frame main.tsx keeps, so
// the dashboard preview and the 1080 × 1920 browser source look the same; a landscape scene
// puts the question beside the answers. Fonts (Fredoka, Nunito: OFL) are bundled.

// The dashboard's live preview passes ?preview and stays silent.
const PREVIEW = new URLSearchParams(window.location.search).has('preview')

const UI = {
  question: 'Domanda',
  answers: (n: number) => (n === 1 ? '1 risposta' : `${n.toLocaleString('it')} risposte`),
  firstAnswer: 'Vale la prima risposta',
  right: (n: number, of: number) => (n === 1 ? `1 su ${of} ha indovinato` : `${n} su ${of} hanno indovinato`),
  nobodyRight: 'Nessuno ha indovinato',
  noAnswers: 'Nessuna risposta',
  fastest: 'I più veloci',
  leaderboard: 'Classifica',
  noScores: 'Ancora nessun punto: indovina la prossima!',
  next: 'Prossima domanda tra',
  nextSoon: 'Prossima domanda…',
  paused: 'In pausa',
  empty: 'Nessuna domanda per questi filtri',
  fifty: 'ha usato il 50:50',
  fiftyAuto: '50:50',
  difficulty: ['', 'Facile', 'Media', 'Difficile'],
}

// A, B, C, D: one colour each, the same on every question.
const COLORS = ['#ff5d73', '#3fa9ff', '#ffc23d', '#2ed3a0']
const MEDALS = ['#ffd166', '#d5dde8', '#f0a46b']

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`
}

const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

// Shares that add up to 100 (largest remainders), so the bars never read 33 + 33 + 33.
function sharesOf(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0)
  if (!total) return counts.map(() => 0)
  const exact = counts.map((c) => (c / total) * 100)
  const out = exact.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left-- <= 0) break
    out[i]++
  }
  return out
}

type Background = { mode: 'theme' | 'nasa' | 'color' | 'transparent' | 'image'; color: string; image: string; minutes: number }

function backgroundOf(s: GameSettings): Background {
  const raw = typeof s.background === 'string' ? s.background : 'theme'
  const image = typeof s.bgImage === 'string' ? s.bgImage : ''
  const color = hex(s.bgColor, '#1d1147')
  const minutes = Number(s.photoMinutes) || 3
  if (raw === 'image' && image) return { mode: 'image', color, image, minutes }
  if (raw === 'nasa') return { mode: 'nasa', color: '#05080f', image, minutes }
  if (raw === 'color' || raw === 'transparent') return { mode: raw, color, image, minutes }
  return { mode: 'theme', color, image, minutes }
}

// Counts a server duration down locally, ticking ten times a second.
function useCountdown(ms: number, at: number, running: boolean) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running || ms <= 0) return
    const timer = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(timer)
  }, [running, ms, at])
  return running ? Math.max(0, ms - Math.max(0, now - at)) : ms
}

// Text that shrinks until it fits its box, never breaking a word: measured again when the
// box changes size and once the font has loaded.
function Fit({ text, className }: { text: string; className: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const b = box.current
    const el = inner.current
    if (!b || !el) return
    const fit = () => {
      el.style.fontSize = ''
      let size = parseFloat(getComputedStyle(el).fontSize)
      for (let i = 0; i < 10 && (b.scrollHeight > b.clientHeight + 1 || el.scrollWidth > b.clientWidth + 1); i++) {
        size *= 0.92
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(b)
    void document.fonts.ready.then(fit)
    return () => observer.disconnect()
  }, [text])
  return (
    <span ref={box} className={`qz-fit ${className}`}>
      <span ref={inner} className="qz-fit__text">
        {text}
      </span>
    </span>
  )
}

// Small icons drawn here rather than emoji, which change with the PC's system font.
const ICONS = {
  chat: <path d="M5.5 3.5h13a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-7l-4.6 3.8c-.5.4-1.2 0-1.2-.6v-3.2h-.2A2.5 2.5 0 0 1 3 14V6a2.5 2.5 0 0 1 2.5-2.5z" />,
  check: <path className="qz-icon__line" d="M5 12.5l4.4 4.4L19 7.3" />,
  trophy: (
    <>
      <path d="M6.5 3.5h11v4.8a5.5 5.5 0 0 1-11 0z" />
      <path className="qz-icon__line" d="M6.6 5.5H4.2c0 2.6 1.3 4 3.4 4.3M17.4 5.5h2.4c0 2.6-1.3 4-3.4 4.3M12 13.8v3.4" />
      <rect x="8" y="17.5" width="8" height="3.5" rx="1.2" />
    </>
  ),
  bolt: <path d="M13.2 2.5 4.8 13.4h6l-1.4 8.1 8.8-11.3h-6.1z" />,
  flame: (
    <path d="M12 2.8c.6 3-1.9 4.6-3.3 6.6C7.4 11.2 6.5 13 6.5 15a5.5 5.5 0 0 0 11 0c0-2.2-1-4-2.2-5.4-.2 1.4-.9 2.4-2 2.8.5-3.6-.3-7-1.3-9.6z" />
  ),
  bulb: (
    <>
      <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.8.6 1.2 1.4 1.2 2.3h5.4c0-.9.4-1.7 1.2-2.3A6.5 6.5 0 0 0 12 2.5z" />
      <path className="qz-icon__line" d="M9.6 19h4.8M10.6 21.5h2.8" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4.5" width="4.4" height="15" rx="1.6" />
      <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.6" />
    </>
  ),
  // Categories.
  logica: (
    <path d="M9.5 3.5h0a2.5 2.5 0 0 1 5 0v1h3a1.5 1.5 0 0 1 1.5 1.5v3h-1a2.5 2.5 0 0 0 0 5h1v3a1.5 1.5 0 0 1-1.5 1.5h-3v-1a2.5 2.5 0 0 0-5 0v1h-3A1.5 1.5 0 0 1 5 17.5v-3h1a2.5 2.5 0 0 0 0-5H5V6a1.5 1.5 0 0 1 1.5-1.5h3z" />
  ),
  numeri: <path className="qz-icon__line" d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4 9h16.5M3.5 15H20" />,
  trabocchetti: (
    <>
      <path d="M6.6 18.5 9 6.8a1.2 1.2 0 0 1 1.2-1h3.6a1.2 1.2 0 0 1 1.2 1l2.4 11.7z" />
      <rect x="3" y="18" width="18" height="3" rx="1.5" />
      <path d="M19 2.5l.7 1.6 1.8.4-1.4 1.1.3 1.8-1.4-.9-1.6.9.4-1.8-1.3-1.1 1.8-.4z" />
    </>
  ),
  cultura: (
    <>
      <path d="M11 6.4C9.3 5.1 6.8 4.5 3.5 4.7v13.6c3.3-.1 5.8.5 7.5 1.6z" />
      <path d="M13 6.4c1.7-1.3 4.2-1.9 7.5-1.7v13.6c-3.3-.1-5.8.5-7.5 1.6z" />
    </>
  ),
  scienze: (
    <>
      <rect x="8.5" y="2.5" width="7" height="2.4" rx="1.2" />
      <path d="M10.2 5.6h3.6v3.3l5.2 9.1c.8 1.4-.2 3.1-1.8 3.1H6.8c-1.6 0-2.6-1.7-1.8-3.1l5.2-9.1z" />
    </>
  ),
  // curiosita uses bulb, the fallback.
}
type IconName = keyof typeof ICONS

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`qz-icon${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// A viewer's picture, or their initial on a colour of their own when there is none (Twitch)
// or it fails to load.
function Avatar({ player, className }: { player: QuizzlandPlayer; className: string }) {
  const [failed, setFailed] = useState('')
  const hue = [...player.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className={`qz-avatar ${className}`} style={{ '--tint': `hsl(${hue} 60% 45%)` } as CSSProperties} aria-hidden="true">
      {player.nickname.charAt(0).toUpperCase()}
      {player.avatar && player.avatar !== failed && (
        <img src={player.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(player.avatar ?? '')} />
      )}
    </span>
  )
}

export function Quizzland() {
  const { quizzland, quizzlandAt, session } = useOverlay()
  return quizzland ? <Game state={quizzland} at={quizzlandAt} settings={session?.settings ?? {}} /> : null
}

function Game({ state, at, settings }: { state: QuizzlandState; at: number; settings: GameSettings }) {
  const bg = backgroundOf(settings)
  const sounds = settings.sounds !== false && !PREVIEW
  const running = !state.paused && state.phase !== 'empty'
  const remaining = useCountdown(state.remainingMs, at, running)
  const q = state.question
  const showBoard = settings.showLeaderboard !== false

  // A transparent background has to reach the page itself for OBS to key it out; the other
  // class dresses the app's top bar and play guide like the game.
  useEffect(() => {
    document.body.classList.toggle('quizzland-see-through', bg.mode === 'transparent')
    return () => document.body.classList.remove('quizzland-see-through')
  }, [bg.mode])
  useEffect(() => {
    document.body.classList.add('quizzland-on')
    return () => document.body.classList.remove('quizzland-on')
  }, [])

  useQuizSounds(state, remaining, sounds)

  // Read each new question aloud once, with its answers, if the browser source has a voice.
  useEffect(() => {
    if (settings.tts !== true || PREVIEW || state.phase !== 'question' || !q || !('speechSynthesis' in window)) return
    const options = q.options.map((o, i) => `${QUIZZLAND_LETTERS[i]}: ${o}`).join('. ')
    const utterance = new SpeechSynthesisUtterance(`${UI.question} ${state.number}. ${q.text} ${options}.`)
    utterance.lang = 'it-IT'
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }, [state.roundId, settings.tts])

  const style = { backgroundColor: bg.mode === 'transparent' ? 'transparent' : bg.color } as CSSProperties

  if (state.phase === 'empty' || !q) {
    return (
      <div className="qz" style={style}>
        <Backdrop bg={bg} />
        <div className="qz__empty">
          <Icon name="bulb" />
          <p>{UI.empty}</p>
        </div>
      </div>
    )
  }

  const reveal = state.phase === 'reveal'
  const category = quizzlandCategoryById(q.category)
  const chipColors = category?.colors ?? ['#a78bfa', '#6d28d9']
  const chipIcon: IconName = category && category.id in ICONS ? (category.id as IconName) : 'bulb'

  return (
    <div className={`qz qz--${state.phase}`} style={style}>
      <Backdrop bg={bg} />

      <header className="qz__head">
        <span className="qz-chip" style={{ background: `linear-gradient(135deg, ${chipColors[0]}, ${chipColors[1]})` }}>
          <Icon name={chipIcon} />
          {category?.label ?? capitalize(q.category)}
        </span>
        <span className="qz__number">
          {UI.question} <strong>{state.number}</strong>
        </span>
        <span className="qz-level" title={UI.difficulty[q.difficulty]}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`qz-level__pip${n <= q.difficulty ? ' qz-level__pip--on' : ''}`} />
          ))}
          <span className="qz-level__label">{UI.difficulty[q.difficulty]}</span>
        </span>
      </header>

      {state.phase === 'break' ? (
        <Break state={state} remaining={remaining} showBoard={showBoard} />
      ) : (
        <>
          <section className="qz__stage">
            <QuestionCard state={state} remaining={remaining} />
            <Options state={state} />
          </section>

          <footer className="qz__foot">
            {reveal ? <Result state={state} /> : <Answered state={state} settings={settings} />}
          </footer>
        </>
      )}

      {state.paused && (
        <div className="qz__paused">
          <Icon name="pause" />
          {UI.paused}
        </div>
      )}

      {reveal && state.right > 0 && <Confetti key={state.roundId} />}
    </div>
  )
}

// A call when a question opens, a tick in its last five seconds, a sweep for the 50:50, and
// the reveal: up when someone got it right, down when nobody did. Not on the first state
// after the overlay (re)loads.
function useQuizSounds(state: QuizzlandState, remaining: number, on: boolean) {
  const last = useRef<{ roundId: string; phase: string; fifty: boolean } | null>(null)
  useEffect(() => {
    const prev = last.current
    const fifty = state.eliminated.length > 0
    last.current = { roundId: state.roundId, phase: state.phase, fifty }
    if (!on || !prev) return
    if (state.roundId !== prev.roundId && state.phase === 'question') quizSound('question')
    else if (state.roundId === prev.roundId && fifty && !prev.fifty) quizSound('fifty')
    else if (state.roundId === prev.roundId && state.phase === 'reveal' && prev.phase === 'question') {
      quizSound(state.right > 0 ? 'right' : 'none')
      roundCheer()
    }
  }, [state])

  const secs = Math.ceil(remaining / 1000)
  useEffect(() => {
    if (on && state.phase === 'question' && !state.paused && secs > 0 && secs <= 5) quizSound('tick')
  }, [secs])
}

// The question on a light card; while the chat answers, a timer ring on its corner; at the
// reveal, the right letter in its place.
function QuestionCard({ state, remaining }: { state: QuizzlandState; remaining: number }) {
  const q = state.question!
  const reveal = state.phase === 'reveal'
  return (
    <article key={state.roundId} className="qz-card">
      {reveal && state.correct !== null ? (
        <span className="qz-card__answer" style={{ '--c': COLORS[state.correct] } as CSSProperties}>
          <Icon name="check" />
          {QUIZZLAND_LETTERS[state.correct]}
        </span>
      ) : (
        <Timer remaining={remaining} duration={state.durationMs} paused={state.paused} />
      )}
      <Fit text={q.text} className={`qz-card__text${q.text.length > 90 ? ' qz-card__text--long' : ''}`} />
      {state.eliminated.length > 0 && !reveal && (
        <p className="qz-card__fifty">
          <span className="qz-card__fifty-tag">50:50</span>
          {state.fiftyBy ? (
            <>
              <Avatar player={state.fiftyBy} className="qz-card__fifty-avatar" />
              <span className="qz-card__fifty-name">{state.fiftyBy.nickname}</span> {UI.fifty}
            </>
          ) : (
            UI.fiftyAuto
          )}
        </p>
      )}
    </article>
  )
}

function Timer({ remaining, duration, paused }: { remaining: number; duration: number; paused: boolean }) {
  const fraction = duration > 0 ? Math.min(1, remaining / duration) : 0
  const secs = Math.ceil(remaining / 1000)
  const mood = secs <= 5 ? 'hurry' : fraction < 0.5 ? 'warn' : 'ok'
  return (
    <span className={`qz-timer qz-timer--${mood}${paused ? ' qz-timer--paused' : ''}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="qz-timer__track" cx="18" cy="18" r="15.5" />
        <circle className="qz-timer__fill" cx="18" cy="18" r="15.5" pathLength={1} style={{ strokeDashoffset: 1 - fraction }} />
      </svg>
      <span key={mood === 'hurry' ? secs : 'calm'} className="qz-timer__secs">
        {secs}
      </span>
    </span>
  )
}

function Options({ state }: { state: QuizzlandState }) {
  const q = state.question!
  const reveal = state.phase === 'reveal'
  const shares = state.counts ? sharesOf(state.counts) : null
  return (
    <ol className={`qz-options qz-options--${q.options.length}`}>
      {q.options.map((text, i) => {
        const out = state.eliminated.includes(i)
        const status = reveal ? (state.correct === i ? 'right' : 'wrong') : out ? 'out' : 'open'
        const style = {
          '--c': COLORS[i],
          '--c-soft': rgba(COLORS[i], 0.3),
          '--c-line': rgba(COLORS[i], 0.6),
          '--d': `${0.15 + i * 0.08}s`,
          '--share': `${shares?.[i] ?? 0}%`,
        } as CSSProperties
        return (
          // Keyed by round, so the bars start from zero and the tiles slide in on every question.
          <li key={`${state.roundId}-${i}`} className={`qz-opt qz-opt--${status}${out ? ' qz-opt--cut' : ''}`} style={style}>
            <span className="qz-opt__fill" />
            <span className="qz-opt__gem">{QUIZZLAND_LETTERS[i]}</span>
            <Fit text={text} className="qz-opt__text" />
            {shares && !(out && !reveal) && (
              <span className="qz-opt__share">
                {shares[i]}
                <small>%</small>
              </span>
            )}
            {status === 'right' && (
              <span className="qz-opt__check">
                <Icon name="check" />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// While the question is open: how to answer, how many have, and the latest of them (never
// what they chose).
function Answered({ state, settings }: { state: QuizzlandState; settings: GameSettings }) {
  const n = state.question?.options.length ?? 4
  const mode = settings.inputMode
  const keys = (mode === 'numbers' ? ['1', '2', '3', '4'] : [...QUIZZLAND_LETTERS]).slice(0, n)
  const hint = `Scrivi ${keys.slice(0, -1).join(', ')} o ${keys[keys.length - 1]} in chat`
  return (
    <div className="qz-answered">
      <p className="qz-answered__hint">
        <Icon name="chat" />
        {hint}
      </p>
      <div className="qz-answered__row">
        <span className="qz-answered__crowd">
          {state.answerers.slice(0, 9).map((p) => (
            <Avatar key={p.id} player={p} className="qz-answered__avatar" />
          ))}
        </span>
        <span key={state.answered} className={`qz-answered__count${state.answered ? ' qz-answered__count--bump' : ''}`}>
          {state.answered ? UI.answers(state.answered) : UI.firstAnswer}
        </span>
      </div>
    </div>
  )
}

// At the reveal: how many got it, why that is the answer, and the fastest three.
function Result({ state }: { state: QuizzlandState }) {
  const line = state.right ? UI.right(state.right, state.answered) : state.answered ? UI.nobodyRight : UI.noAnswers
  return (
    <div className="qz-result">
      <p className={`qz-result__line${state.right ? '' : ' qz-result__line--none'}`}>{line}</p>
      {state.explanation && (
        <p className="qz-why">
          <Icon name="bulb" />
          <span>{state.explanation}</span>
        </p>
      )}
      {state.fastest.length > 0 && (
        <ol className="qz-podium" aria-label={UI.fastest}>
          {state.fastest.map((f, i) => (
            <Fastest key={f.id} fast={f} rank={i} />
          ))}
        </ol>
      )}
    </div>
  )
}

function Fastest({ fast, rank }: { fast: QuizzlandFast; rank: number }) {
  return (
    <li className="qz-podium__spot" style={{ '--medal': MEDALS[rank], '--d': `${0.35 + rank * 0.12}s` } as CSSProperties}>
      <span className="qz-podium__pic">
        <Avatar player={fast} className="qz-podium__avatar" />
        <span className="qz-podium__rank">{rank + 1}</span>
      </span>
      <span className="qz-podium__who">
        <span className="qz-podium__name">{fast.nickname}</span>
        <span className="qz-podium__meta">
          <span className="qz-podium__pts">+{fast.points.toLocaleString('it')}</span>
          <Icon name="bolt" />
          {seconds(fast.ms)}
        </span>
      </span>
    </li>
  )
}

function Streak({ n }: { n: number }) {
  return (
    <span className="qz-streak" title={`${n} di fila`}>
      <Icon name="flame" />
      {n}
    </span>
  )
}

// Between two questions: the leaderboard, with what each one just won, and the countdown.
function Break({ state, remaining, showBoard }: { state: QuizzlandState; remaining: number; showBoard: boolean }) {
  const countdown = (
    <div className="qz-board__next">
      <span>
        {UI.next} {Math.ceil(remaining / 1000)} s
      </span>
      <span className="qz-board__bar">
        <span style={{ transform: `scaleX(${state.durationMs ? remaining / state.durationMs : 0})` }} />
      </span>
    </div>
  )
  if (!showBoard) {
    return (
      <section className="qz-board qz-board--plain">
        <p className="qz-board__soon">{UI.nextSoon}</p>
        {countdown}
      </section>
    )
  }
  return (
    <section className="qz-board">
      <h2 className="qz-board__title">
        <Icon name="trophy" />
        {UI.leaderboard}
      </h2>
      {state.scores.length === 0 ? (
        <p className="qz-board__empty">{UI.noScores}</p>
      ) : (
        <ol className="qz-board__list">
          {state.scores.slice(0, 5).map((s, i) => (
            <li
              key={s.id}
              className={`qz-row${i < 3 ? ' qz-row--medal' : ''}`}
              style={{ '--medal': MEDALS[i] ?? '#ffffff', '--d': `${0.1 + i * 0.08}s` } as CSSProperties}
            >
              <span className="qz-row__rank">{i + 1}</span>
              <Avatar player={s} className="qz-row__avatar" />
              <span className="qz-row__who">
                <span className="qz-row__name">{s.nickname}</span>
                <span className="qz-row__sub">
                  {s.correct} {s.correct === 1 ? 'giusta' : 'giuste'}
                  {s.streak >= 2 && <Streak n={s.streak} />}
                </span>
              </span>
              {s.last > 0 && <span className="qz-row__gain">+{s.last.toLocaleString('it')}</span>}
              <span className="qz-row__pts">{s.points.toLocaleString('it')}</span>
            </li>
          ))}
        </ol>
      )}
      {countdown}
    </section>
  )
}

// Question marks, sparkles and rings drifting up the sky; where each starts, how big it is
// and how long it takes.
const GLYPHS: { kind: 'q' | 'spark' | 'ring'; style: Record<string, string> }[] = Array.from({ length: 12 }, (_, i) => ({
  kind: (['q', 'spark', 'q', 'ring'] as const)[i % 4],
  style: {
    '--x': `${(i * 41 + 9) % 100}%`,
    '--s': `${4 + (i % 4) * 2.2}vmin`,
    '--t': `${22 + (i % 5) * 5}s`,
    '--d': `${-i * 3.1}s`,
    '--r': `${(i % 2 ? 1 : -1) * (12 + i * 7)}deg`,
    '--o': `${0.1 + (i % 3) * 0.05}`,
  },
}))

const GLYPH_PATHS: Record<'q' | 'spark' | 'ring', ReactNode> = {
  q: (
    <>
      <path d="M8.6 8.4a3.4 3.4 0 1 1 5 3c-1 .6-1.6 1.3-1.6 2.6v.6" fill="none" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="18.6" r="1.5" />
    </>
  ),
  spark: <path d="M12 2.5c.6 4.5 2.4 6.5 9.5 9.5-7.1 3-8.9 5-9.5 9.5-.6-4.5-2.4-6.5-9.5-9.5 7.1-3 8.9-5 9.5-9.5z" />,
  ring: <circle cx="12" cy="12" r="7.5" fill="none" strokeWidth="2.2" />,
}

// The sky (Quizzland's own artwork), NASA's picture of the day, a colour or an uploaded picture, with the
// drifting glyphs over the sky and the colour; nothing at all on a transparent background, which has to stay
// clear for OBS.
function Backdrop({ bg }: { bg: Background }) {
  if (bg.mode === 'transparent') return null
  const photo = bg.mode === 'image' || bg.mode === 'nasa'
  return (
    <div className="qz__backdrop" aria-hidden="true">
      {bg.mode === 'theme' && <div className="qz__sky" style={{ backgroundImage: `url("${sky}")` }} />}
      {bg.mode === 'theme' && <div className="qz__aurora" />}
      {bg.mode === 'image' && <div className="qz__photo" style={{ backgroundImage: `url("${bg.image}")` }} />}
      {bg.mode === 'nasa' && <NasaBackdrop minutes={bg.minutes} veil={false} />}
      {!photo && (
        <div className="qz__glyphs">
          {GLYPHS.map((g, i) => (
            <svg key={i} viewBox="0 0 24 24" className={`qz-glyph qz-glyph--${g.kind}`} style={g.style as CSSProperties}>
              {GLYPH_PATHS[g.kind]}
            </svg>
          ))}
        </div>
      )}
      <div className={`qz__veil${photo ? ' qz__veil--photo' : ''}`} />
    </div>
  )
}

// Confetti over the scene when someone got the answer right.
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  '--x': `${(i * 37 + 5) % 100}%`,
  '--r': `${(i * 83) % 360}deg`,
  '--t': `${2.4 + (i % 5) * 0.35}s`,
  '--d': `${(i % 6) * 0.08}s`,
  '--sway': `${(i % 2 ? 1 : -1) * (4 + (i % 4) * 2)}vmin`,
  '--c': [...COLORS, '#ffffff', '#ffd166'][i % 6],
}))

function Confetti() {
  return (
    <div className="qz-confetti" aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <span key={i} className={i % 3 === 0 ? 'qz-confetti__round' : undefined} style={p as CSSProperties} />
      ))}
    </div>
  )
}
