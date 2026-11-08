import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Viewer } from '@zerocade/shared'
import { ViewerAvatar } from './ViewerAvatar'

interface Entry extends Viewer { points: number }

// Two equally wide copies make a continuous right-to-left loop, including short boards.
export function ScoreTicker({ scores }: { scores: Entry[] }) {
  const group = useRef<HTMLOListElement>(null)
  const [duration, setDuration] = useState(20)
  const sorted = [...scores].sort((a, b) => b.points - a.points)
  useLayoutEffect(() => {
    const node = group.current
    if (!node) return
    const measure = () => setDuration(node.getBoundingClientRect().width / Math.max(24, window.innerWidth * 0.055))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [scores.length])
  if (!sorted.length) return null
  return (
    <section className="score-ticker" aria-label="Classifica utenti">
      <div className="score-ticker__track" style={{ '--ticker-duration': `${duration}s` } as CSSProperties}>
        {[0, 1].map((copy) => (
          <ol key={copy} ref={copy === 0 ? group : undefined} className="score-ticker__group" aria-hidden={copy === 1 || undefined}>
            {sorted.map((player, index) => (
              <li key={player.id} className="score-ticker__entry">
                <span className="score-ticker__rank">{index + 1}.</span>
                <ViewerAvatar viewer={player} />
                <span className="score-ticker__name">{player.nickname}</span>
                <strong>{player.points.toLocaleString('it-IT')} <small>pt</small></strong>
              </li>
            ))}
          </ol>
        ))}
      </div>
    </section>
  )
}
