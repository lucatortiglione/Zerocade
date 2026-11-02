import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type {
  GameSettings,
  IncastroMoment,
  IncastroPlayer,
  IncastroRecord,
  IncastroScore,
  IncastroState,
} from '@zerocade/shared'
import { gameSound, type GameSound } from './audio'
import { socket } from './socket'
import { useOverlay } from './store'

// Incastro is drawn in the DOM (and SVG for the wheel), like Bivio: the server runs the
// level and this renders its IncastroState. Sizes are in vmin/vh, within the 9:16 frame
// main.tsx keeps, so the dashboard preview and the 1080 × 1920 browser source look the same. The fonts (Fredoka, Nunito:
// OFL) are bundled, so OBS needs no network to show them.

// Chapter background file name -> URL, from gioco-parole/assets/backgrounds.
const BACKGROUNDS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('@incastro/backgrounds/*.svg', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
)

// The dashboard's live preview passes ?preview and stays silent.
const PREVIEW = new URLSearchParams(window.location.search).has('preview')

// Every text on the overlay: Incastro is played in Italian only.
const UI: Record<string, string> = {
  prompt: 'Scrivi in chat le parole che trovi',
  extras: 'extra',
  hintIn: 'Aiuto tra',
  found: 'ha trovato',
  extra: 'parola extra',
  repeat: 'già trovata',
  hintBy: 'ha rivelato una lettera',
  hintAuto: 'Aiuto: una lettera',
  revealBy: 'ha rivelato',
  revealAuto: 'Rivelata',
  shuffleBy: 'ha mescolato la ruota',
  shuffleAuto: 'Ruota mescolata',
  shuffleClick: 'Clicca per mescolare la ruota',
  complete: 'Livello completato!',
  timeUp: 'Tempo scaduto',
  best: 'Migliore del livello',
  nobody: 'Le parole sono comparse da sole',
  next: 'Prossimo livello tra',
  waiting: 'Prossimo livello in arrivo…',
  chapterDone: 'Capitolo completato: il giardino cresce!',
  paused: 'In pausa',
  empty: 'Nessun livello trovato',
  leaderboard: 'Classifica',
  noScores: 'Il primo che trova una parola sale qui',
  longest: 'Parola più lunga',
  point: 'punto',
  points: 'punti',
  word: 'parola',
  words: 'parole',
  time: 'Tempo',
}

const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback

// 'nasa' shows the level's NASA picture, and the chapter's garden until there is one.
function backgroundOf(s: GameSettings, chapterBackground: string, photo: IncastroState['photo']) {
  const mode = typeof s.background === 'string' ? s.background : 'nasa'
  const image = typeof s.bgImage === 'string' ? s.bgImage : ''
  if (mode === 'transparent') return { seeThrough: true, url: '', color: 'transparent', photo: false }
  if (mode === 'color') return { seeThrough: false, url: '', color: hex(s.bgColor, '#173b2c'), photo: false }
  if (mode === 'image' && image) return { seeThrough: false, url: image, color: '#173b2c', photo: false }
  if (mode === 'nasa' && photo) return { seeThrough: false, url: photo.url, color: '#05080f', photo: true }
  return { seeThrough: false, url: BACKGROUNDS[chapterBackground] ?? '', color: '#173b2c', photo: false }
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

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Played = Extract<IncastroMoment, { kind: 'found' | 'extra' | 'repeat' }>
const PLAY_MS: Record<Played['kind'], number> = { found: 1500, extra: 1100, repeat: 900 }
const QUEUE_MAX = 4

// The words found in chat, played one after the other on the wheel. A busy chat queues
// a few; past QUEUE_MAX the oldest waiting ones are dropped (the board shows them anyway).
// A new level drops whatever is left: those words belong to the old wheel.
function useWheelQueue(moments: IncastroMoment[], level: number, sounds: boolean) {
  const seen = useRef<number | null>(null)
  const [queue, setQueue] = useState<Played[]>([])
  const [current, setCurrent] = useState<Played | null>(null)

  useEffect(() => {
    setQueue([])
    setCurrent(null)
  }, [level])

  useEffect(() => {
    const newest = moments[0]?.seq ?? 0
    // First state after (re)loading the overlay: nothing to replay.
    if (seen.current === null) {
      seen.current = newest
      return
    }
    // A fresh room (the game picked again) numbers its moments from 1.
    if (newest && newest < seen.current) seen.current = 0
    const fresh = moments.filter((m) => m.seq > (seen.current ?? 0)).reverse()
    if (!fresh.length) return
    seen.current = newest
    const playable = fresh.filter((m): m is Played => m.kind === 'found' || m.kind === 'extra' || m.kind === 'repeat')
    if (playable.length) setQueue((q) => [...q, ...playable].slice(-QUEUE_MAX))
    if (sounds) {
      const other = fresh.find((m) => m.kind === 'hint' || m.kind === 'reveal' || m.kind === 'shuffle')
      if (other) gameSound(other.kind === 'shuffle' ? 'shuffle' : 'hint')
    }
  }, [moments])

  useEffect(() => {
    if (current || !queue.length) return
    const [next, ...rest] = queue
    setCurrent(next)
    setQueue(rest)
    if (sounds) gameSound(next.kind as GameSound, next.word.length)
  }, [current, queue])

  // Its own effect: one that also depended on the queue would clear this timer whenever a
  // new word arrived mid-play.
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(() => setCurrent(null), PLAY_MS[current.kind])
    return () => clearTimeout(timer)
  }, [current])

  return current
}

// Small icons drawn here rather than emoji, which change with the PC's system font.
const ICONS = {
  star: <path d="M12 2.6l2.83 5.9 6.47.83-4.75 4.47 1.2 6.42L12 17.1l-5.75 3.12 1.2-6.42L2.7 9.33l6.47-.83z" />,
  bulb: (
    <>
      <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.8.6 1.2 1.4 1.2 2.3h5.4c0-.9.4-1.7 1.2-2.3A6.5 6.5 0 0 0 12 2.5z" />
      <path className="inc-icon__line" d="M9.6 19h4.8M10.6 21.5h2.8" />
    </>
  ),
  clock: (
    <>
      <circle className="inc-icon__line" cx="12" cy="13.5" r="7.5" />
      <path className="inc-icon__line" d="M12 9.5v4l2.6 1.8M9.5 2.8h5" />
    </>
  ),
  trophy: (
    <>
      <path d="M6.5 3.5h11v4.8a5.5 5.5 0 0 1-11 0z" />
      <path className="inc-icon__line" d="M6.6 5.5H4.2c0 2.6 1.3 4 3.4 4.3M17.4 5.5h2.4c0 2.6-1.3 4-3.4 4.3M12 13.8v3.4" />
      <rect x="8" y="17.5" width="8" height="3.5" rx="1.2" />
    </>
  ),
  chat: <path d="M5.5 3.5h13a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-7l-4.6 3.8c-.5.4-1.2 0-1.2-.6v-3.2h-.2A2.5 2.5 0 0 1 3 14V6a2.5 2.5 0 0 1 2.5-2.5z" />,
  sprout: (
    <>
      <path className="inc-icon__line" d="M12 21v-8.5" />
      <path d="M12 13.2C11.6 8.4 8.3 5.6 3.6 6c.1 4.6 3.4 7.4 8.4 7.2z" />
      <path d="M12 11.2c.2-4.2 3-7.2 8.4-7.2.1 4.4-2.9 7.3-8.4 7.2z" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4.5" width="4.4" height="15" rx="1.6" />
      <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.6" />
    </>
  ),
  shuffle: <path className="inc-icon__line" d="M3.5 7h3.6c4.4 0 5.4 10 9.6 10h3.8M3.5 17h3.6c1.7 0 2.7-1.5 3.5-3.5m2.8-4.2C14.2 7.9 15.2 7 16.7 7h3.8M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5" />,
}
type IconName = keyof typeof ICONS

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`inc-icon${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

export function Incastro() {
  const { incastro, incastroAt, session } = useOverlay()
  return incastro ? <Game state={incastro} at={incastroAt} settings={session?.settings ?? {}} /> : null
}

function Game({ state, at, settings }: { state: IncastroState; at: number; settings: GameSettings }) {
  const ui = UI
  const sounds = settings.sounds !== false && !PREVIEW
  const playing = useWheelQueue(state.moments, state.level, sounds)
  const bg = backgroundOf(settings, state.chapter.background, state.photo)
  const accent = state.chapter.accent
  const running = !state.paused && state.phase !== 'empty' && state.phase !== 'loading'
  const remaining = useCountdown(state.remainingMs, at, running)
  const hintIn = useCountdown(state.hintInMs, at, running && state.phase === 'playing')

  // A transparent background has to reach the page itself for OBS to key it out.
  useEffect(() => {
    document.body.classList.toggle('incastro-see-through', bg.seeThrough)
    return () => document.body.classList.remove('incastro-see-through')
  }, [bg.seeThrough])

  // Lets the stream widgets (the gift alert) move out of the board's way.
  useEffect(() => {
    document.body.classList.add('incastro-on')
    return () => document.body.classList.remove('incastro-on')
  }, [])

  // Fanfare at the end of a level, a longer one when the chapter closes.
  const phaseRef = useRef(state.phase)
  useEffect(() => {
    if (sounds && state.phase === 'complete' && phaseRef.current === 'playing') {
      gameSound(state.chapterDone ? 'chapter' : 'complete')
    }
    phaseRef.current = state.phase
  }, [state.phase])

  const style = { '--inc-accent': accent, backgroundColor: bg.color } as CSSProperties

  // No grid yet: the level is being generated (a moment), or it cannot be.
  if (state.phase === 'empty' || state.phase === 'loading') {
    return (
      <div className="inc" style={style}>
        <Backdrop url={bg.url} ambient={!bg.seeThrough} photo={bg.photo} />
        <p className="inc__empty">{state.phase === 'loading' ? ui.waiting : ui.empty}</p>
      </div>
    )
  }

  const showBoard = settings.showLeaderboard !== false
  const canShuffle = state.phase === 'playing' && !state.paused

  return (
    <div className="inc" style={style}>
      <Backdrop url={bg.url} ambient={!bg.seeThrough} photo={bg.photo} />

      {/* Only the prompt, in the top bar between the name and the dot: the grid gets the
          height (chapter and level are in the dashboard). */}
      <header className="inc__head">
        <p className="inc__prompt">
          <Icon name="chat" />
          {ui.prompt}
        </p>
      </header>

      <section className="inc__stage">
        <Board state={state} />
        {state.phase === 'complete' && <Summary state={state} remaining={remaining} ui={ui} autoNext={settings.autoNext !== false} />}
        {state.paused && (
          <div className="inc__paused">
            <Icon name="pause" />
            {ui.paused}
          </div>
        )}
      </section>

      <section className="inc__play">
        <Feed moments={state.moments} playing={playing?.seq} ui={ui} />
        <aside className="inc__side inc__side--left">
          {showBoard && <Leaderboard scores={state.scores} longest={state.longest} ui={ui} />}
        </aside>
        {/* A click shuffles the wheel (the server takes this one command from an overlay). */}
        <div
          className={`inc__wheel-wrap${canShuffle ? ' inc__wheel-wrap--click' : ''}`}
          role={canShuffle ? 'button' : undefined}
          title={canShuffle ? ui.shuffleClick : undefined}
          onClick={canShuffle ? () => socket.emit('incastro:shuffle') : undefined}
        >
          <Bubble moment={playing} ui={ui} />
          <Wheel letters={state.letters} moment={playing} />
        </div>
        <aside className="inc__side inc__side--right">
          <div className="inc-stat">
            <Icon name="star" className="inc-stat__icon" />
            <span className="inc-stat__value">
              {state.extrasFound}
              <small>/{state.extrasTotal}</small>
            </span>
            <span className="inc-stat__label">{ui.extras}</span>
          </div>
          {state.phase === 'playing' && state.hintInMs > 0 && (
            <div className="inc-stat">
              <Ring fraction={hintIn / Math.max(1, Number(settings.hintSeconds ?? 30) * 1000)} />
              <span className="inc-stat__value">{Math.ceil(hintIn / 1000)}s</span>
              <span className="inc-stat__label">{ui.hintIn}</span>
            </div>
          )}
          {state.phase === 'playing' && state.durationMs > 0 && (
            <div className={`inc-stat${remaining < 15_000 ? ' inc-stat--hurry' : ''}`}>
              <Icon name="clock" className="inc-stat__icon inc-stat__icon--time" />
              <span className="inc-stat__value">{clock(remaining)}</span>
              <span className="inc-stat__label">{ui.time}</span>
            </div>
          )}
        </aside>
      </section>

      {bg.photo && state.photo && <p className="inc__credit">NASA · {state.photo.title}</p>}

      {state.phase === 'complete' && state.chapterDone && <LeafRain />}
    </div>
  )
}

// Where each speck of pollen starts, how big it is and how long it takes to rise.
const POLLEN = Array.from({ length: 12 }, (_, i) => ({
  '--x': `${(i * 37 + 11) % 100}%`,
  '--s': `${0.7 + (i % 3) * 0.45}vmin`,
  '--t': `${16 + (i % 4) * 4}s`,
  '--d': `${-i * 2.3}s`,
}))

// The chapter's garden. When the chapter changes the new one fades in over the old. Over
// it a soft veil keeps the text readable, and a little pollen drifts up; neither is drawn
// on a transparent background, which has to stay clear for OBS.
function Backdrop({ url, ambient, photo }: { url: string; ambient: boolean; photo: boolean }) {
  const [layers, setLayers] = useState<string[]>([])
  // A new picture comes in only once it has loaded, over the old one: a remote photo never
  // leaves an empty background while it downloads (or if it fails to).
  useEffect(() => {
    if (!url) return setLayers([])
    let current = true
    const img = new Image()
    img.onload = () => current && setLayers((prev) => (prev.at(-1) === url ? prev : [...prev, url].slice(-2)))
    img.src = url
    return () => {
      current = false
    }
  }, [url])
  return (
    <div className="inc__backdrop" aria-hidden="true">
      {layers.map((u, i) => (
        <div
          key={u}
          className={`inc__bg${photo ? ' inc__bg--photo' : ''}${i > 0 ? ' inc__bg--in' : ''}`}
          style={{ backgroundImage: `url("${u}")` }}
        />
      ))}
      {ambient && (
        <>
          <div className={`inc__veil${photo ? ' inc__veil--photo' : ''}`} />
          {!photo && (
            <div className="inc__pollen">
              {POLLEN.map((p, i) => (
                <span key={i} style={p as CSSProperties} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

type Cell = { r: number; c: number; letter: string; status: 'hidden' | 'hint' | 'found' | 'missed' }

function Board({ state }: { state: IncastroState }) {
  const cells = new Map<string, Cell>()
  state.grid.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') return
      const status = ch === '_' ? 'hidden' : ch === ch.toLowerCase() ? 'hint' : 'found'
      cells.set(`${r},${c}`, { r, c, letter: ch === '_' ? '' : ch.toUpperCase(), status })
    }),
  )
  // Words missed when the time ran out show their letters in grey.
  const cellKey = (w: IncastroState['words'][number], k: number) => (w.d === 'H' ? `${w.r},${w.c + k}` : `${w.r + k},${w.c}`)
  for (const w of state.words) {
    if (!w.missed || !w.text) continue
    for (let k = 0; k < w.length; k++) {
      const cell = cells.get(cellKey(w, k))
      if (cell && cell.status === 'hidden') Object.assign(cell, { letter: w.text[k], status: 'missed' })
    }
  }
  // The newest word on the board drops in letter by letter.
  const delays = new Map<string, number>()
  const last = state.moments.find((m) => m.kind === 'found' || m.kind === 'reveal')
  const lastWord = last && 'word' in last ? state.words.find((w) => w.text === last.word) : undefined
  if (lastWord) for (let k = 0; k < lastWord.length; k++) delays.set(cellKey(lastWord, k), 0.25 + k * 0.07)

  return (
    <div className="inc-board" style={{ '--rows': state.rows, '--cols': state.cols } as CSSProperties}>
      {[...cells.entries()].map(([key, cell]) => (
        // The empty slot appears with the level; the tile on it is keyed by its status, so
        // a cell that changes plays its drop again.
        <div
          key={`${state.level}-${key}`}
          className={`inc-cell inc-cell--${cell.status}`}
          style={{ gridRow: cell.r + 1, gridColumn: cell.c + 1, '--d': `${(cell.r + cell.c) * 0.03}s` } as CSSProperties}
        >
          {cell.status !== 'hidden' && (
            <span key={cell.status} className="inc-cell__tile" style={{ '--d': `${delays.get(key) ?? 0}s` } as CSSProperties}>
              {cell.letter}
            </span>
          )}
        </div>
      ))}
      {state.words.map((w) =>
        w.by ? (
          <Avatar
            key={`${state.level}-${w.r}-${w.c}-${w.d}`}
            player={w.by}
            className="inc-board__badge"
            style={{ gridRow: w.r + 1, gridColumn: w.c + 1 }}
          />
        ) : null,
      )}
    </div>
  )
}

function Avatar({ player, className, style }: { player: IncastroPlayer; className: string; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false)
  const hue = [...player.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className={`inc-avatar ${className}`} style={{ ...style, '--tint': `hsl(${hue} 55% 42%)` } as CSSProperties}>
      {player.nickname.charAt(0).toUpperCase()}
      {player.avatar && !broken && <img src={player.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </span>
  )
}

// Wheel geometry, in the SVG's own units (viewBox -50..50).
const RING = 33
const letterRadius = (n: number) => (n <= 4 ? 13.5 : n <= 5 ? 12.5 : n <= 6 ? 11.5 : 10.5)
const spot = (i: number, n: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
  return { x: Math.cos(a) * RING, y: Math.sin(a) * RING }
}

// The order the line visits the wheel to spell `word`: each letter takes the first
// matching slot not used yet (a wheel can hold the same letter twice).
function pathOn(letters: string, word: string): number[] {
  const used = new Set<number>()
  const path: number[] = []
  for (const ch of word) {
    const i = [...letters].findIndex((l, k) => l === ch && !used.has(k))
    if (i < 0) return path
    used.add(i)
    path.push(i)
  }
  return path
}

// The frosted disc itself is CSS (it blurs the garden behind it); the SVG draws the
// ornaments, the line and the letters on top.
function Wheel({ letters, moment }: { letters: string; moment: Played | null }) {
  const n = letters.length
  const lr = letterRadius(n)
  // Each letter keeps its identity (letter + occurrence) so a shuffle slides it round.
  const seen: Record<string, number> = {}
  const keyed = [...letters].map((ch, i) => {
    seen[ch] = (seen[ch] ?? 0) + 1
    return { ch, id: `${ch}${seen[ch]}`, ...spot(i, n) }
  })
  const path = moment ? pathOn(letters, moment.word) : []
  const points = path.map((i) => `${keyed[i].x.toFixed(2)},${keyed[i].y.toFixed(2)}`).join(' ')
  const order = new Map(path.map((i, k) => [i, k]))
  const step = 0.09
  const draw = { animationDuration: `${path.length * step}s` }

  return (
    <svg className={`inc-wheel${moment ? ` inc-wheel--${moment.kind}` : ''}`} viewBox="-50 -50 100 100" aria-hidden="true">
      <circle className="inc-wheel__ring" r={RING - lr - 3} pathLength={60} />
      <g className="inc-wheel__sprout" transform="translate(-7.5 -8) scale(0.625)">
        {ICONS.sprout}
      </g>
      {moment && path.length > 1 && (
        <g key={moment.seq}>
          <polyline className="inc-wheel__halo" points={points} pathLength={1} style={draw} />
          <polyline className="inc-wheel__line" points={points} pathLength={1} style={draw} />
        </g>
      )}
      {keyed.map((l) => {
        const k = order.get(keyed.indexOf(l))
        const delay = k === undefined ? undefined : { animationDelay: `${k * step}s` }
        return (
          <g key={l.id} className="inc-wheel__letter" style={{ transform: `translate(${l.x}px, ${l.y}px)` }}>
            {k !== undefined && (
              <g key={`on-${moment?.seq}`} className="inc-wheel__chip" style={delay}>
                <circle className="inc-wheel__chip-base" r={lr} />
                <ellipse className="inc-wheel__chip-shine" rx={lr * 0.56} ry={lr * 0.26} cy={-lr * 0.58} />
              </g>
            )}
            <text
              key={k === undefined ? 't-idle' : `t-${moment?.seq}`}
              className={`inc-wheel__text${k === undefined ? '' : ' inc-wheel__text--on'}`}
              style={{ fontSize: `${lr * 1.3}px`, ...delay }}
              dy="0.36em"
            >
              {l.ch}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// The word being played on the wheel, spelled in tiles above it, with who found it.
function Bubble({ moment, ui }: { moment: Played | null; ui: Record<string, string> }) {
  if (!moment) return <div className="inc-bubble inc-bubble--idle" />
  const note: ReactNode =
    moment.kind === 'found' ? (
      <>
        +{moment.points}
        {moment.full && <Icon name="star" />}
      </>
    ) : moment.kind === 'extra' ? (
      <>
        <Icon name="star" /> {ui.extra} +{moment.points}
      </>
    ) : (
      ui.repeat
    )
  return (
    <div key={moment.seq} className={`inc-bubble inc-bubble--${moment.kind}`}>
      <div className="inc-bubble__tiles">
        {[...moment.word].map((ch, i) => (
          <span key={i} className="inc-bubble__tile" style={{ animationDelay: `${i * 0.09}s` }}>
            {ch}
          </span>
        ))}
      </div>
      <div className="inc-bubble__who">
        <Avatar player={moment.by} className="inc-bubble__avatar" />
        <span className="inc-bubble__name">{moment.by.nickname}</span>
        <span className="inc-bubble__note">{note}</span>
      </div>
    </div>
  )
}

const FEED_ICON: Partial<Record<IncastroMoment['kind'], IconName>> = { hint: 'bulb', reveal: 'bulb', shuffle: 'shuffle' }

// The latest news, without repeats and without the word the wheel is playing right now.
// The latest moment, in the strip above the wheel; hidden while a word's bubble is up there.
function Feed({ moments, playing, ui }: { moments: IncastroMoment[]; playing?: number; ui: Record<string, string> }) {
  const shown = moments.filter((m) => m.kind !== 'repeat' && m.seq !== playing).slice(0, 1)
  return (
    <ol className={`inc-feed${playing !== undefined ? ' inc-feed--hidden' : ''}`}>
      {shown.map((m) => (
        <li key={m.seq} className={`inc-feed__item inc-feed__item--${m.kind}`}>
          {'by' in m && m.by ? (
            <Avatar player={m.by} className="inc-feed__avatar" />
          ) : (
            <span className="inc-feed__icon">
              <Icon name={FEED_ICON[m.kind] ?? 'bulb'} />
            </span>
          )}
          <span className="inc-feed__text">{feedText(m, ui)}</span>
        </li>
      ))}
    </ol>
  )
}

function feedText(m: IncastroMoment, ui: Record<string, string>): string {
  switch (m.kind) {
    case 'found':
      return `${m.by.nickname} ${ui.found} ${m.word} · +${m.points}`
    case 'extra':
      return `${m.by.nickname} · ${ui.extra} ${m.word} · +${m.points}`
    case 'repeat':
      return `${m.word} ${ui.repeat}`
    case 'hint':
      return m.by ? `${m.by.nickname} ${ui.hintBy}` : ui.hintAuto
    case 'reveal':
      return m.by ? `${m.by.nickname} ${ui.revealBy} ${m.word}` : `${ui.revealAuto}: ${m.word}`
    case 'shuffle':
      return m.by ? `${m.by.nickname} ${ui.shuffleBy}` : ui.shuffleAuto
  }
}

function Leaderboard({
  scores,
  longest,
  ui,
}: {
  scores: IncastroScore[]
  longest: IncastroRecord | null
  ui: Record<string, string>
}) {
  return (
    <div className="inc-board-list">
      <h2 className="inc-board-list__title">
        <Icon name="trophy" />
        {ui.leaderboard}
      </h2>
      {scores.length === 0 ? (
        <p className="inc-board-list__empty">{ui.noScores}</p>
      ) : (
        <ol>
          {scores.slice(0, 5).map((s, i) => (
            <li key={s.id} className="inc-board-list__row">
              <span className="inc-board-list__rank">{i + 1}</span>
              <Avatar player={s} className="inc-board-list__avatar" />
              <span className="inc-board-list__name">{s.nickname}</span>
              <span className="inc-board-list__pts">{s.points}</span>
            </li>
          ))}
        </ol>
      )}
      {longest && (
        <div className="inc-record">
          <span className="inc-record__label">{ui.longest}</span>
          <span className="inc-record__word">{longest.word}</span>
          <span className="inc-record__who">
            <Avatar player={longest.by} className="inc-record__avatar" />
            <span className="inc-record__name">{longest.by.nickname}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function Ring({ fraction }: { fraction: number }) {
  const f = Math.min(1, Math.max(0, fraction))
  return (
    <svg className="inc-ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" className="inc-ring__track" />
      <circle cx="18" cy="18" r="15" className="inc-ring__fill" pathLength={1} style={{ strokeDashoffset: 1 - f }} />
      <svg x="10" y="10" width="16" height="16" viewBox="0 0 24 24" className="inc-icon inc-ring__icon">
        {ICONS.bulb}
      </svg>
    </svg>
  )
}

function Summary({
  state,
  remaining,
  ui,
  autoNext,
}: {
  state: IncastroState
  remaining: number
  ui: Record<string, string>
  autoNext: boolean
}) {
  const [best, ...others] = state.levelScores
  return (
    <div className={`inc-summary${state.chapterDone ? ' inc-summary--chapter' : ''}`}>
      <span className="inc-summary__medal">
        <Icon name={state.timeUp ? 'clock' : 'sprout'} />
      </span>
      <h2 className="inc-summary__title">{state.timeUp ? ui.timeUp : ui.complete}</h2>
      {best ? (
        <div className="inc-summary__best">
          <Avatar player={best} className="inc-summary__avatar" />
          <div>
            <span className="inc-summary__label">{ui.best}</span>
            <strong className="inc-summary__name">{best.nickname}</strong>
            <span className="inc-summary__pts">
              {best.points} {best.points === 1 ? ui.point : ui.points} · {best.words} {best.words === 1 ? ui.word : ui.words}
            </span>
          </div>
        </div>
      ) : (
        <p className="inc-summary__label">{ui.nobody}</p>
      )}
      {others.length > 0 && (
        <p className="inc-summary__others">
          {others.map((s, i) => (
            <span key={s.id}>
              {i + 2}. {s.nickname} · {s.points}
            </span>
          ))}
        </p>
      )}
      {state.chapterDone && (
        <p className="inc-summary__chapter">
          <Icon name="sprout" />
          {ui.chapterDone}
        </p>
      )}
      <p className="inc-summary__next">
        {autoNext && state.durationMs > 0 ? `${ui.next} ${Math.ceil(remaining / 1000)} s` : ui.waiting}
      </p>
    </div>
  )
}

// Leaves and petals falling over the scene when a chapter is complete.
const RAIN = Array.from({ length: 18 }, (_, i) => ({
  '--x': `${(i * 53 + 7) % 100}%`,
  '--r': `${(i * 67) % 360}deg`,
  '--t': `${3.4 + (i % 5) * 0.5}s`,
  '--d': `${0.9 + (i % 6) * 0.4}s`,
}))

function LeafRain() {
  return (
    <div className="inc-rain" aria-hidden="true">
      {RAIN.map((p, i) => (
        <span key={i} style={p as CSSProperties} />
      ))}
    </div>
  )
}
