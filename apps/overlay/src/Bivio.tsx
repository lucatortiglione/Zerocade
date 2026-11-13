import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  BIVIO_DEFAULT_COLORS,
  bivioCategoryById,
  type BivioChoice,
  type BivioLang,
  type BivioState,
  type BivioTally,
  type BivioVoter,
  type GameSettings,
} from '@zerocade/shared'
import appDark from '@bivio/backgrounds/app_dark.svg'
import optionA from '@bivio/backgrounds/option_a.svg'
import optionB from '@bivio/backgrounds/option_b.svg'
import { roundCheer } from './audio'
import { useOverlay } from './store'
import { ViewerAvatar } from './ViewerAvatar'

// Bivio is drawn in the DOM rather than on the canvas, so long options wrap and the
// percentages animate in CSS. The server runs the round; this renders its BivioState,
// with the look chosen in the dashboard (Aspetto and Sfondo settings).

// Category id -> icon URL, from gioco-dilemmi/assets/category-icons.
const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('@bivio/category-icons/*.svg', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url]),
)

// The dashboard's live preview passes ?preview: it stays silent, so the creator does not
// hear every question twice.
const PREVIEW = new URLSearchParams(window.location.search).has('preview')

const UI: Record<
  BivioLang,
  {
    ask: string
    or: string
    hint: string
    tie: string
    noVotes: string
    allLives: string
    paused: string
    next: string
    empty: string
  }
> = {
  it: {
    ask: 'Preferiresti…',
    or: 'o',
    hint: 'Scrivi A o B in chat',
    tie: 'Pareggio!',
    noVotes: 'Nessun voto',
    allLives: 'Tutte le live',
    paused: 'In pausa',
    next: 'Prossima domanda…',
    empty: 'Nessuna domanda per questi filtri',
  },
  en: {
    ask: 'Would you rather…',
    or: 'or',
    hint: 'Type A or B in chat',
    tie: 'It’s a tie!',
    noVotes: 'No votes',
    allLives: 'All lives',
    paused: 'Paused',
    next: 'Next question…',
    empty: 'No questions match these filters',
  },
}

const HINTS: Record<string, Record<BivioLang, string>> = {
  letters: { it: 'Scrivi A o B in chat', en: 'Type A or B in chat' },
  numbers: { it: 'Scrivi 1 o 2 in chat', en: 'Type 1 or 2 in chat' },
}

const votesLabel = (lang: BivioLang, n: number) =>
  `${n.toLocaleString(lang)} ${lang === 'it' ? (n === 1 ? 'voto' : 'voti') : n === 1 ? 'vote' : 'votes'}`

// Share of A, with B as its complement so the two always add up to 100.
const shareOf = (t: BivioTally, choice: BivioChoice) => {
  const total = t.a + t.b
  if (!total) return 0
  const a = Math.round((t.a / total) * 100)
  return choice === 'a' ? a : 100 - a
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const textSize = (s: string) => (s.length > 48 ? ' bivio-opt__text--long' : s.length > 30 ? ' bivio-opt__text--mid' : '')

const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback

// A card's gradient runs from the chosen colour to a darker shade of it.
const shade = (color: string) =>
  '#' +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * 0.5).toString(16).padStart(2, '0'))
    .join('')

// The default colours keep the game's own artwork; any other colour becomes a gradient.
function lookOf(s: GameSettings) {
  const D = BIVIO_DEFAULT_COLORS
  const a = hex(s.colorA, D.a)
  const b = hex(s.colorB, D.b)
  const accent = hex(s.accent, D.accent)
  const bg = hex(s.bgColor, D.background)
  const image = typeof s.bgImage === 'string' ? s.bgImage : ''
  const seeThrough = !image && s.bgTransparent === true
  const card = (color: string, def: string, art: string) =>
    color === def ? `url("${art}")` : `linear-gradient(135deg, ${color}, ${shade(color)})`
  return {
    stacked: s.layout === 'stacked',
    seeThrough,
    cards: { a: card(a, D.a, optionA), b: card(b, D.b, optionB) },
    style: {
      background: image
        ? `center / cover no-repeat url("${image}")`
        : seeThrough
          ? 'transparent'
          : bg === D.background
            ? `center / cover url("${appDark}")`
            : bg,
      color: hex(s.textColor, D.text),
      '--bivio-a': a,
      '--bivio-b': b,
      '--bivio-accent': accent,
      '--bivio-timer': accent === D.accent ? `linear-gradient(90deg, ${a}, ${b})` : accent,
    } as CSSProperties,
  }
}

// Counts the server's remainingMs down locally, ticking ten times a second.
function useRemaining(state: BivioState, at: number) {
  const [now, setNow] = useState(() => performance.now())
  const running = state.remainingMs > 0 && !state.paused
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(timer)
  }, [running, at])
  return running ? Math.max(0, state.remainingMs - Math.max(0, now - at)) : state.remainingMs
}

export function Bivio() {
  const { bivio, bivioAt, session } = useOverlay()
  return bivio ? <Round state={bivio} at={bivioAt} settings={session?.settings ?? {}} /> : null
}

function Round({ state, at, settings }: { state: BivioState; at: number; settings: GameSettings }) {
  const ui = UI[state.lang]
  const remaining = useRemaining(state, at)
  const look = lookOf(settings)
  const q = state.question
  const tts = settings.tts === true

  // A transparent background has to reach the page itself for OBS to key it out.
  useEffect(() => {
    document.body.classList.toggle('bivio-see-through', look.seeThrough)
    return () => document.body.classList.remove('bivio-see-through')
  }, [look.seeThrough])

  // Read each new dilemma aloud once, if the browser source has a voice for it.
  useEffect(() => {
    if (!tts || PREVIEW || state.phase !== 'voting' || !q || !('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(`${ui.ask} ${q.a}, ${ui.or} ${q.b}?`)
    utterance.lang = state.lang === 'it' ? 'it-IT' : 'en-US'
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }, [state.roundId, tts])

  // The applause when the vote closes and the result shows.
  const phaseRef = useRef(state.phase)
  useEffect(() => {
    if (state.phase === 'reveal' && phaseRef.current === 'voting') roundCheer()
    phaseRef.current = state.phase
  }, [state.phase])

  if (!q) {
    return (
      <div className="bivio" style={look.style}>
        <p className="bivio__empty">{ui.empty}</p>
      </div>
    )
  }

  const category = bivioCategoryById(q.category)
  const reveal = state.phase === 'reveal'
  const total = state.votes.a + state.votes.b
  const winner: BivioChoice | null =
    reveal && state.votes.a !== state.votes.b ? (state.votes.a > state.votes.b ? 'a' : 'b') : null
  // All-lives figures only add something once the dilemma has been played before.
  const allTime = reveal && state.allTime && state.allTime.a + state.allTime.b > total ? state.allTime : null
  const option = (choice: BivioChoice): OptionProps => ({
    choice,
    text: q[choice],
    background: look.cards[choice],
    share: shareOf(state.votes, choice),
    votes: state.votes[choice],
    showCounts: reveal || state.liveCounts,
    stacked: look.stacked,
    outcome: winner ? (winner === choice ? 'win' : 'lose') : null,
    allTime: allTime ? `${ui.allLives}: ${shareOf(allTime, choice)}%` : null,
    crowd: state.crowd[choice],
    lang: state.lang,
  })

  const hint = HINTS[String(settings.inputMode)]?.[state.lang] ?? ui.hint
  let status: string
  if (state.paused) status = `⏸ ${ui.paused}`
  else if (!reveal) status = remaining > 0 ? `${hint} · ${Math.ceil(remaining / 1000)} s` : hint
  else status = total ? (winner ? '' : ui.tie) : ui.noVotes

  return (
    <div className="bivio" style={look.style}>
      <div className="bivio__head">
        {category && (
          <span
            className="bivio__chip"
            style={{ background: `linear-gradient(135deg, ${category.colors[0]}, ${category.colors[1]})` }}
          >
            {ICONS[category.id] && <img src={ICONS[category.id]} alt="" />}
            {category[state.lang]}
          </span>
        )}
        <h1 className="bivio__ask">{ui.ask}</h1>
      </div>

      {state.phase === 'break' ? (
        <p className="bivio__break">{ui.next}</p>
      ) : (
        <div className={`bivio__options${look.stacked ? ' bivio__options--stacked' : ''}`}>
          {/* Keyed by round, so the fills start from zero on every new dilemma. */}
          <Option key={`${state.roundId}-a`} {...option('a')} />
          <span className="bivio__or">{ui.or}</span>
          <Option key={`${state.roundId}-b`} {...option('b')} />
        </div>
      )}

      <div className="bivio__foot">
        {state.durationMs > 0 && (
          <div className="bivio__timer">
            <div className="bivio__timer-fill" style={{ transform: `scaleX(${remaining / state.durationMs})` }} />
          </div>
        )}
        {state.phase !== 'break' && (
          <>
            <p className="bivio__status">{[status, votesLabel(state.lang, total)].filter(Boolean).join(' · ')}</p>
            <div className="bivio__voters">
              {state.voters.map((v) => (
                <span key={v.id} className={`bivio__voter bivio__voter--${v.choice}`}>
                  <ViewerAvatar viewer={v} />
                  {v.nickname} → {v.choice.toUpperCase()}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface OptionProps {
  choice: BivioChoice
  text: string
  background: string
  share: number
  votes: number
  showCounts: boolean
  stacked: boolean
  outcome: 'win' | 'lose' | null
  allTime: string | null
  crowd: BivioVoter[]
  lang: BivioLang
}

function Option({ choice, text, background, share, votes, showCounts, stacked, outcome, allTime, crowd, lang }: OptionProps) {
  // Side-by-side cards fill from the bottom, stacked ones from the left.
  const fill = showCounts ? `${share}%` : '0%'
  const slots = useSlots(crowd)
  const textRef = useWholeWords(text, stacked)
  return (
    <div
      className={`bivio-opt bivio-opt--${choice}${outcome ? ` bivio-opt--${outcome}` : ''}`}
      style={{ backgroundImage: background }}
    >
      <div className="bivio-opt__fill" style={stacked ? { width: fill } : { height: fill }} />
      {/* Keyed by viewer: only a new voter mounts, and so only a new voter pops in. */}
      <div className="bivio-opt__crowd" aria-hidden="true">
        {crowd.map((v, i) => (
          <Bubble
            key={v.id}
            voter={v}
            style={{ ...bubbleSpot(v.id, slots.get(v.id) ?? i, stacked), zIndex: crowd.length - i }}
          />
        ))}
      </div>
      <div className="bivio-opt__body">
        <span className="bivio-opt__letter">{choice.toUpperCase()}</span>
        <p ref={textRef} className={`bivio-opt__text${textSize(text)}`}>
          {capitalize(text)}
        </p>
        {showCounts && (
          <p className="bivio-opt__result">
            <span className="bivio-opt__share">{share}%</span>
            <span className="bivio-opt__votes">{votesLabel(lang, votes)}</span>
          </p>
        )}
        {allTime && <span className="bivio-opt__all">{allTime}</span>}
      </div>
    </div>
  )
}

// Words are never broken across lines: when the longest one does not fit the card, the whole
// option's text gets smaller until it does. Measured again when the card changes size and once
// the font has loaded.
function useWholeWords(text: string, stacked: boolean) {
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const body = el?.parentElement
    if (!el || !body) return
    const fit = () => {
      el.style.fontSize = ''
      let size = parseFloat(getComputedStyle(el).fontSize)
      // A word that does not fit sticks out of the line (scrollWidth); it shrinks about in
      // step with the font, so a few rounds are enough.
      for (let i = 0; i < 4 && el.scrollWidth > el.clientWidth; i++) {
        size *= (el.clientWidth / el.scrollWidth) * 0.98
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(body)
    void document.fonts.ready.then(fit)
    return () => observer.disconnect()
  }, [text, stacked])
  return ref
}

// Bubble centres (% of the card), filled in this order. Side-by-side cards build a
// honeycomb pile up from the bottom; stacked cards, wide and short, use the side margins.
const SIDE_SLOTS: [number, number][] = [
  [50, 91], [31, 91], [69, 91], [12, 91], [88, 91],
  [40.5, 82.5], [59.5, 82.5], [21.5, 82.5], [78.5, 82.5],
  [50, 74], [31, 74], [69, 74],
]
const STACKED_SLOTS: [number, number][] = [
  [7, 30], [93, 30], [7, 58], [93, 58], [7, 86], [93, 86],
  [16, 44], [84, 44], [16, 72], [84, 72], [16, 16], [84, 16],
]

// Each voter keeps the slot it landed in, so bubbles never jump when others leave; a
// newcomer takes the first free one. Option is keyed by round, so slots reset with it.
function useSlots(crowd: BivioVoter[]): Map<string, number> {
  const slots = useRef(new Map<string, number>()).current
  const present = new Set(crowd.map((v) => v.id))
  for (const id of slots.keys()) if (!present.has(id)) slots.delete(id)
  const taken = new Set(slots.values())
  for (const v of [...crowd].reverse()) {
    if (slots.has(v.id)) continue
    let slot = 0
    while (taken.has(slot)) slot++
    slots.set(v.id, slot)
    taken.add(slot)
  }
  return slots
}

const hashOf = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)

// The slot, nudged a little per viewer so the pile looks loose, plus a float phase and a
// fallback colour, all from the viewer's id.
function bubbleSpot(id: string, slot: number, stacked: boolean): CSSProperties {
  const slotList = stacked ? STACKED_SLOTS : SIDE_SLOTS
  const [x, y] = slotList[slot % slotList.length]
  const h = hashOf(id)
  const r1 = (h % 1000) / 1000
  const r2 = ((h >>> 10) % 1000) / 1000
  const r3 = ((h >>> 20) % 1000) / 1000
  return {
    left: `${(x + (r1 - 0.5) * 4).toFixed(1)}%`,
    top: `${(y + (r2 - 0.5) * 3).toFixed(1)}%`,
    '--float-delay': `${(-r3 * 3).toFixed(2)}s`,
    '--tint': `hsl(${Math.round(r3 * 360)} 65% 45%)`,
  } as CSSProperties
}

// The viewer's TikTok picture in a bubble, or their initial if there is none (Twitch)
// or it fails to load.
function Bubble({ voter, style }: { voter: BivioVoter; style: CSSProperties }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="bivio-bubble" style={style}>
      <span className="bivio-bubble__float">
        <span className="bivio-bubble__pop">
          {voter.nickname.charAt(0).toUpperCase()}
          {voter.avatar && !broken && (
            <img src={voter.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
          )}
        </span>
      </span>
      <span className="bivio-bubble__name">{voter.nickname}</span>
    </span>
  )
}
