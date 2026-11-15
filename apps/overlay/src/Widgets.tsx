import { useEffect, useState } from 'react'
import { TICKER_LIMITS, giftById, type Gifter, type LiveEvent, type TickerConfig } from '@zerocade/shared'
import { useOverlay } from './store'
import { ViewerAvatar } from './ViewerAvatar'

function alertText(e: LiveEvent): { icon: string; text: string } {
  switch (e.type) {
    case 'gift': {
      const g = giftById(e.giftId)
      return { icon: g?.emoji ?? '🎁', text: `${e.user.nickname} sent ${g?.name ?? 'gift'} ×${e.count}` }
    }
    case 'like':
      return { icon: '👍', text: `${e.user.nickname} liked ×${e.count}` }
    case 'follow':
      return { icon: '➕', text: `${e.user.nickname} followed!` }
    case 'share':
      return { icon: '🔁', text: `${e.user.nickname} shared` }
    case 'comment':
      return { icon: '💬', text: `${e.user.nickname}: ${e.text}` }
    case 'join':
      return { icon: '👋', text: `${e.user.nickname} joined` }
  }
}

export function Widgets() {
  const { session, event, seq, ranking, lastFollower, totalCoins } = useOverlay()
  if (!session) return null
  const w = session.widgets
  // What the viewers write is never an alert, in any game (in many it is a guess, which an alert would hand to
  // everyone). The "X joined" notices only when the creator turns them on.
  const alert = event?.type === 'comment' || (event?.type === 'join' && !w.joins) ? null : event

  return (
    <>
      {w.alerts && alert && <Alert key={seq} event={alert} />}
      {w.follower && lastFollower && (
        <div className="widget widget--follower">
          ➕ <ViewerAvatar viewer={lastFollower} /> {lastFollower.nickname} followed!
        </div>
      )}
      <Ticker ticker={session.ticker} />
      {w.goal && <Goal total={totalCoins} target={session.goal} />}
      {w.gifters && ranking.length > 0 && <Gifters ranking={ranking} />}
    </>
  )
}

// Keyed by event, so each one mounts afresh; it fades out by itself (alert-out in
// styles.css) and is then removed.
function Alert({ event }: { event: LiveEvent }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  const { icon, text } = alertText(event)
  return (
    <div className="widget-alert" onAnimationEnd={(e) => e.animationName === 'alert-out' && setGone(true)}>
      <span className="widget-alert__icon">{icon}</span>
      <ViewerAvatar viewer={event.user} />
      <span className="widget-alert__text">{text}</span>
    </div>
  )
}

function Goal({ total, target }: { total: number; target: number }) {
  const pct = Math.min(100, Math.round((total / Math.max(1, target)) * 100))
  return (
    <div className="widget widget--goal">
      <div className="widget-goal__label">
        Goal 🎯 {total.toLocaleString()} / {target.toLocaleString()}
      </div>
      <div className="widget-goal__bar">
        <div className="widget-goal__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Gifters({ ranking }: { ranking: Gifter[] }) {
  return (
    <div className="widget widget--gifters">
      <div className="widget__title">Top gifters</div>
      {ranking.slice(0, 3).map((g, i) => (
        <div key={g.id} className="widget-gifters__row">
          <span>{i + 1}.</span>
          <ViewerAvatar viewer={g} />
          <span>{g.nickname}</span>
          <span>{g.coins.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
// The creator's messages in turn: one every `intervalSec` seconds, on screen for a few seconds (never longer than the
// interval), then the next. Changing the list or the interval starts it again from the first message.
function Ticker({ ticker }: { ticker?: TickerConfig }) {
  const [shown, setShown] = useState<{ n: number; text: string } | null>(null)
  const enabled = Boolean(ticker?.enabled && ticker.messages.length)
  const messages = ticker?.messages ?? []
  const key = `${enabled}|${ticker?.intervalSec}|${JSON.stringify(messages)}`
  useEffect(() => {
    if (!enabled || !ticker) {
      setShown(null)
      return
    }
    const list = ticker.messages
    const every = ticker.intervalSec * 1000
    const visible = Math.min(TICKER_LIMITS.showSec * 1000, Math.max(1000, every - 1000))
    let n = 0
    let hide: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      setShown({ n, text: list[n % list.length] })
      n++
      clearTimeout(hide)
      hide = setTimeout(() => setShown(null), visible)
    }
    show()
    const timer = setInterval(show, every)
    return () => {
      clearInterval(timer)
      clearTimeout(hide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!shown) return null
  return (
    <div
      key={shown.n}
      className={`widget-ticker${ticker?.tickerPos ? ' placed' : ''}`}
      style={ticker?.tickerPos ? { left: `${ticker.tickerPos.x}%`, top: `${ticker.tickerPos.y}%` } : undefined}
    >
      {shown.text}
    </div>
  )
}
