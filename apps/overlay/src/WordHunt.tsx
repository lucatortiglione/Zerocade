import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { WORDHUNT_REFERENCE as REF, parseWordHuntCell, wordHuntCanvas, type WordHuntClaim, type WordHuntLeader, type WordHuntPublicState, type WordHuntWinner } from '@zerocade/shared'
import { useOverlay } from './store'
import { ViewerAvatar } from './ViewerAvatar'
import '@fontsource/opendyslexic/latin-700.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import '@fontsource/atkinson-hyperlegible/latin-ext-700.css'
import './wordhunt.css'

// ZeroWordHunt is drawn in the DOM: the server runs the round and this renders its WordHuntPublicState. The board keeps the
// geometry of the reference screenshot (spec §2.1): a fixed 570 × 769 surface scaled by ONE factor, so the tiles stay square.
// The colour belongs to the word (every tile of it), the letters on it turn black, and the winner's picture covers only the
// cell next to the word (§4). The timer and the standings are outside the board (§1.1); the server alone decides who found a word.

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const END_LABEL = { completed: 'Trovate tutte!', timeout: 'Tempo scaduto', stopped: 'Round concluso' } as const
const asViewer = (w: WordHuntWinner) => ({ id: w.id, nickname: w.nickname, ...(w.avatar ? { avatar: w.avatar } : {}) })

const px = (c: number) => REF.gridX + c * REF.step
const py = (r: number) => REF.gridY + r * REF.step

// The scale that fits the 570 × 769 surface in the box it is given, never different on the two axes (§5.3).
function useFit<T extends HTMLElement>(width: number, height: number): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const next = Math.min(box.width / width, box.height / height)
      if (Number.isFinite(next) && next > 0) setScale(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width, height])
  return [ref, scale]
}

// The winner's picture in its cell: the profile image cropped to the square, or the initial on a colour of the viewer's own when
// there is none or it fails to load, in the same cell (§4.4).
function Avatar({ winner, style }: { winner: WordHuntWinner; style: CSSProperties }) {
  const [failed, setFailed] = useState('')
  const hue = [...winner.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <div className="wordhunt-avatar" style={{ ...style, '--tint': `hsl(${hue} 55% 42%)` } as CSSProperties} title={winner.nickname}>
      <span>{winner.nickname.charAt(0).toUpperCase()}</span>
      {winner.avatar && winner.avatar !== failed && <img src={winner.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(winner.avatar ?? '')} />}
    </div>
  )
}

// The scheme of the board: by the setting, or ("auto") by the hour of the machine: day from 7:00 to 18:59, evening and night otherwise.
export type WordHuntTheme = 'day' | 'night'
export const themeFor = (setting: unknown, hour: number): WordHuntTheme =>
  setting === 'day' || setting === 'night' ? setting : hour >= 7 && hour < 19 ? 'day' : 'night'

// «Personalizzati»: the three colours chosen in the dashboard, applied as the board's own variables (live: the settings reach the overlay at once).
const HEX = /^#[0-9a-f]{6}$/i
const pickColor = (value: unknown, fallback: string): string => (typeof value === 'string' && HEX.test(value) ? value : fallback)
const FONTS: Record<string, string> = {
  opendyslexic: "'OpenDyslexic', 'Comic Sans MS', system-ui, sans-serif",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
}
function customColors(settings: Record<string, unknown> | undefined): CSSProperties {
  // Atkinson Hyperlegible unless the director chose another one (a setting never saved is the default).
  const font = FONTS[typeof settings?.wordhuntFont === 'string' ? settings.wordhuntFont : 'atkinson']
  const base = font ? ({ '--wh-font': font } as CSSProperties) : {}
  if (settings?.wordhuntTheme !== 'custom') return base
  const letter = pickColor(settings.wordhuntLetterColor, '#e4e7ef')
  const tile = pickColor(settings.wordhuntTileColor, '#1c2030')
  const board = pickColor(settings.wordhuntBoardColor, '#12141c')
  return {
    ...base, '--wh-letter': letter, '--wh-tile': tile, '--wh-bg': board,
    '--wh-border': `color-mix(in srgb, ${tile} 80%, ${letter})`, '--wh-coord': `color-mix(in srgb, ${board} 35%, ${letter})`,
  } as CSSProperties
}

function useTheme(setting: unknown): WordHuntTheme {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return themeFor(setting, hour)
}

function Board({ state, animated, theme, colors }: { state: WordHuntPublicState; animated: boolean; theme: WordHuntTheme; colors: CSSProperties }) {
  // The surface grows with the cells: 570 x 769 for 15 x 20 (the screenshot), the same margins for the smaller boards.
  const canvas = wordHuntCanvas(state.cols, state.rows)
  const [ref, scale] = useFit<HTMLDivElement>(canvas.width, canvas.height)
  // Derived from the claims only: a new message of the chat changes nothing here, only a claim does.
  const found = useMemo(() => {
    const colors = new Map<string, string>()
    for (const claim of state.claims) for (const cell of claim.cells) colors.set(cell, claim.color)
    return colors
  }, [state.claims])
  const rows = Array.from({ length: state.rows }, (_, r) => r)
  const cols = Array.from({ length: state.cols }, (_, c) => c)
  return (
    <div className="wordhunt-fit" ref={ref}>
      <div className="wordhunt-frame" style={{ width: canvas.width * scale, height: canvas.height * scale }}>
        <div className={`wordhunt-board${animated ? ' wordhunt-board--anim' : ''}`} data-theme={theme} style={{ ...colors, width: canvas.width, height: canvas.height, transform: `scale(${scale})` }} role="grid" aria-label="Griglia di lettere">
          {cols.map((c) => (
            <span key={`c${c}`} className="wordhunt-coord wordhunt-coord--col" style={{ left: px(c), top: 22, width: REF.tile }}>{c + 1}</span>
          ))}
          {rows.map((r) => (
            <span key={`r${r}`} className="wordhunt-coord wordhunt-coord--row" style={{ left: 2, top: py(r), width: 20, height: REF.tile, lineHeight: `${REF.tile}px` }}>{String.fromCharCode(65 + r)}</span>
          ))}
          {rows.map((r) => cols.map((c) => {
            const name = `${String.fromCharCode(65 + r)}${c + 1}`
            const color = found.get(name)
            return (
              <div key={name} className="wordhunt-tile" data-found={color ? 'true' : 'false'} style={{ left: px(c), top: py(r), ...(color ? { '--word-color': color } : {}) } as CSSProperties}>
                {state.letters[r]?.[c] ?? ''}
              </div>
            )
          }))}
          {state.claims.map((claim) => {
            const cell = parseWordHuntCell(claim.avatarCell)
            return cell ? <Avatar key={claim.target} winner={claim.winner} style={{ left: px(cell.col), top: py(cell.row) }} /> : null
          })}
        </div>
      </div>
    </div>
  )
}

function Name({ winner }: { winner: WordHuntWinner }) {
  // Every name goes with its picture.
  return (
    <span className="wordhunt-name">
      <ViewerAvatar viewer={asViewer(winner)} />
      <span className="wordhunt-name__text">{winner.nickname}</span>
    </span>
  )
}

function Last({ claim }: { claim: WordHuntClaim }) {
  return (
    <section className="wordhunt-last" style={{ '--word-color': claim.color } as CSSProperties} aria-live="polite">
      <Name winner={claim.winner} /> ha trovato <b>{claim.word}</b> <strong>+{claim.points}</strong>
    </section>
  )
}

// The standings of the whole session, on show for the last seconds of the pause between two rounds.
const STANDINGS_MS = 8_000

function Standings({ leaders }: { leaders: WordHuntLeader[] }) {
  return (
    <section className="wordhunt-standings" aria-live="polite">
      <h2>Classifica della sessione</h2>
      <ol>
        {leaders.map((l) => (
          <li key={l.id}>
            <span className="wordhunt-standings__place">{l.place}</span>
            <Name winner={l} />
            <span className="wordhunt-standings__words">{l.words} {l.words === 1 ? 'parola' : 'parole'}</span>
            <span className="wordhunt-standings__points">{l.points}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function WordHunt() {
  const { wordhunt, wordhuntAt, session } = useOverlay()
  const [now, setNow] = useState(() => performance.now())
  const theme = useTheme(session?.settings.wordhuntTheme)
  const colors = customColors(session?.settings)
  const counting = wordhunt !== null && (wordhunt.phase === 'countdown' || (wordhunt.phase === 'active' && !wordhunt.paused) || (wordhunt.phase === 'finished' && wordhunt.nextRoundMs !== null))
  useEffect(() => {
    if (!counting) return
    const id = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(id)
  }, [counting])
  if (!wordhunt) return <div className="wordhunt wordhunt--wait">ZeroWordHunt</div>
  const animated = session?.settings.wordhuntAnimations !== false
  const leftMs = counting ? Math.max(0, wordhunt.remainingMs - (now - wordhuntAt)) : wordhunt.remainingMs
  const showLeaders = session?.settings.showLeaderboard !== false && wordhunt.leaders.length > 0
  const nextInMs = wordhunt.nextRoundMs === null ? null : Math.max(0, wordhunt.nextRoundMs - (now - wordhuntAt))
  const showStandings = session?.settings.showLeaderboard !== false && wordhunt.phase === 'finished' && nextInMs !== null && nextInMs <= STANDINGS_MS && wordhunt.sessionLeaders.length > 0
  // Before every round (nothing yet, a round made and waiting, the countdown) the board stays away and NASA's picture is shown whole, with no
  // veil and nothing over it but a caption; the picture comes from the overlay's background (App.tsx), so only with that background chosen.
  const nasa = (session?.settings.background ?? 'nasa') === 'nasa'
  const preRound = wordhunt.phase === 'idle' || wordhunt.phase === 'ready' || wordhunt.phase === 'countdown'
  if (preRound) {
    return (
      <div className="wordhunt wordhunt--photo" data-phase={wordhunt.phase} data-nasa={nasa}>
        <p className="wordhunt-caption" aria-live="polite">
          {wordhunt.phase === 'countdown'
            ? <>Si parte tra <strong>{Math.max(1, Math.ceil(leftMs / 1000))}</strong></>
            : wordhunt.phase === 'ready' ? 'Il round sta per iniziare' : wordhunt.notice ?? 'ZeroWordHunt'}
        </p>
      </div>
    )
  }
  if (showStandings) {
    return (
      <div className="wordhunt wordhunt--standings" data-phase={wordhunt.phase} data-nasa={nasa}>
        <Standings leaders={wordhunt.sessionLeaders} />
        <p className="wordhunt-caption">Nuovo round tra <strong>{Math.max(1, Math.ceil((nextInMs ?? 0) / 1000))}</strong></p>
      </div>
    )
  }
  return (
    <div className="wordhunt" data-phase={wordhunt.phase} data-nasa={nasa}>
      <header className="wordhunt-head">
        {wordhunt.phase === 'countdown' && <div className="wordhunt-timer">Si parte tra {Math.max(1, Math.ceil(leftMs / 1000))}</div>}
        {wordhunt.phase === 'active' && (wordhunt.limited || wordhunt.paused) && <div className="wordhunt-timer" data-low={wordhunt.limited && leftMs < 15_000 && !wordhunt.paused}>{wordhunt.paused ? 'In pausa' : clock(leftMs)}</div>}
        {wordhunt.phase === 'finished' && (
          <div className="wordhunt-timer">
            {wordhunt.end ? END_LABEL[wordhunt.end] : 'Round concluso'}
            {wordhunt.nextRoundMs !== null && <small className="wordhunt-next"> · nuovo round tra {Math.max(1, Math.ceil(Math.max(0, wordhunt.nextRoundMs - (now - wordhuntAt)) / 1000))}</small>}
          </div>
        )}
        {wordhunt.total > 0 && <div className="wordhunt-count" aria-label="Parole trovate"><strong>{wordhunt.found}</strong>/{wordhunt.total}</div>}
      </header>
      {wordhunt.letters.length > 0 ? (
        <Board state={wordhunt} animated={animated} theme={theme} colors={colors} />
      ) : (
        <div className="wordhunt-center"><p>{wordhunt.notice ?? 'Il prossimo round sta per iniziare.'}</p></div>
      )}
      {wordhunt.notice && wordhunt.letters.length > 0 && <p className="wordhunt-notice">{wordhunt.notice}</p>}
      {wordhunt.lastClaim && <Last claim={wordhunt.lastClaim} />}
      {showLeaders && (
        <ol className="wordhunt-leaders" aria-label="Classifica">
          {wordhunt.leaders.slice(0, 3).map((l) => (
            <li key={l.id}>
              <span className="wordhunt-leaders__place">{l.place}</span>
              <Name winner={l} />
              <span className="wordhunt-leaders__points">{l.points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
