import { useState } from 'react'
import { giftById, type Gifter, type LiveEvent } from '@zerocade/shared'
import { useOverlay } from './store'

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
  // In Bivio comments are the votes: they are listed under the options, and an alert
  // would sit on top of option A.
  const alert = session.gameId === 'bivio' && event?.type === 'comment' ? null : event

  return (
    <>
      {w.alerts && alert && <Alert key={seq} event={alert} />}
      {w.follower && lastFollower && <div className="widget widget--follower">➕ {lastFollower} followed!</div>}
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
          <span>{g.nickname}</span>
          <span>{g.coins.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}