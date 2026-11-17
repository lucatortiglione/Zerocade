import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { WORDHUNT_REFERENCE as REF, parseWordHuntCell, type WordHuntClaim, type WordHuntPublicState, type WordHuntWinner } from '@zerocade/shared'
import { useOverlay } from './store'
import { ViewerAvatar } from './ViewerAvatar'
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
function useFit<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      const next = Math.min(box.width / REF.canvasWidth, box.height / REF.canvasHeight)
      if (Number.isFinite(next) && next > 0) setScale(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
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

function Board({ state, animated }: { state: WordHuntPublicState; animated: boolean }) {
  const [ref, scale] = useFit<HTMLDivElement>()
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
      <div className="wordhunt-frame" style={{ width: REF.canvasWidth * scale, height: REF.canvasHeight * scale }}>
        <div className={`wordhunt-board${animated ? ' wordhunt-board--anim' : ''}`} style={{ transform: `scale(${scale})` }} role="grid" aria-label="Griglia di lettere">
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

export function WordHunt() {
  const { wordhunt, wordhuntAt, session } = useOverlay()
  const [now, setNow] = useState(() => performance.now())
  const counting = wordhunt !== null && (wordhunt.phase === 'countdown' || (wordhunt.phase === 'active' && !wordhunt.paused))
  useEffect(() => {
    if (!counting) return
    const id = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(id)
  }, [counting])
  if (!wordhunt) return <div className="wordhunt wordhunt--wait">ZeroWordHunt</div>
  const animated = session?.settings.wordhuntAnimations !== false
  const leftMs = counting ? Math.max(0, wordhunt.remainingMs - (now - wordhuntAt)) : wordhunt.remainingMs
  const showLeaders = session?.settings.showLeaderboard !== false && wordhunt.leaders.length > 0
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
  return (
    <div className="wordhunt" data-phase={wordhunt.phase} data-nasa={nasa}>
      <header className="wordhunt-head">
        {wordhunt.phase === 'countdown' && <div className="wordhunt-timer">Si parte tra {Math.max(1, Math.ceil(leftMs / 1000))}</div>}
        {wordhunt.phase === 'active' && <div className="wordhunt-timer" data-low={leftMs < 15_000 && !wordhunt.paused}>{wordhunt.paused ? 'In pausa' : clock(leftMs)}</div>}
        {wordhunt.phase === 'finished' && <div className="wordhunt-timer">{wordhunt.end ? END_LABEL[wordhunt.end] : 'Round concluso'}</div>}
        {wordhunt.total > 0 && <div className="wordhunt-count" aria-label="Parole trovate"><strong>{wordhunt.found}</strong>/{wordhunt.total}</div>}
      </header>
      {wordhunt.letters.length > 0 ? (
        <Board state={wordhunt} animated={animated} />
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
