import { useEffect, useState } from 'react'
import { GIFTS, type LiveEvent, type Viewer } from '@zerocade/shared'
import { socket } from '../socket'

// Fake live events, so games can be built and tested without going live.

const NAMES = ['luna', 'marco_99', 'giulia.live', 'tex', 'sofi', 'ale_gamer', 'nina', 'kappa']
const COUNTS = [1, 5, 10]

function randomViewer(): Viewer {
  const nickname = NAMES[Math.floor(Math.random() * NAMES.length)]
  return { id: nickname, nickname }
}

function randomEvent(): LiveEvent {
  const user = randomViewer()
  const roll = Math.random()
  if (roll < 0.5) return { type: 'like', user, count: 1 + Math.floor(Math.random() * 15) }
  if (roll < 0.9) {
    // Cheap gifts are far more common than expensive ones, as on a real live.
    const gift = GIFTS[Math.floor(Math.random() ** 3 * GIFTS.length)]
    return { type: 'gift', user, giftId: gift.id, count: 1 }
  }
  return roll < 0.97 ? { type: 'follow', user } : { type: 'share', user }
}

const send = (event: LiveEvent) => socket.emit('sim:event', event)

export function Simulator() {
  const [count, setCount] = useState(1)
  const [auto, setAuto] = useState(false)

  useEffect(() => {
    if (!auto) return
    const timer = setInterval(() => send(randomEvent()), 700)
    return () => clearInterval(timer)
  }, [auto])

  return (
    <section className="sim-panel">
      <h2 className="section-label">Live simulator</h2>
      <div className="seg" role="group" aria-label="Gifts per click">
        {COUNTS.map((n) => (
          <button
            key={n}
            className={`seg__btn${count === n ? ' seg__btn--active' : ''}`}
            aria-pressed={count === n}
            onClick={() => setCount(n)}
          >
            ×{n}
          </button>
        ))}
      </div>
      <div className="gift-grid">
        {GIFTS.map((gift) => (
          <button
            key={gift.id}
            className="gift-btn"
            onClick={() => send({ type: 'gift', user: randomViewer(), giftId: gift.id, count })}
          >
            <span className="gift-btn__emoji" aria-hidden="true">
              {gift.emoji}
            </span>
            <span className="gift-btn__name">{gift.name}</span>
            <span className="gift-btn__coins">{gift.coins} coins</span>
          </button>
        ))}
      </div>
      <div className="sim-panel__row">
        <button className="btn" onClick={() => send({ type: 'like', user: randomViewer(), count: 15 })}>
          👍 Likes
        </button>
        <button className="btn" onClick={() => send({ type: 'follow', user: randomViewer() })}>
          ➕ Follow
        </button>
        <button className="btn" onClick={() => send({ type: 'share', user: randomViewer() })}>
          🔁 Share
        </button>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        Auto: a random event every 0.7 s
      </label>
    </section>
  )
}
