import { useEffect, useState } from 'react'
import { GIFTS, type LiveEvent, type Viewer } from '@zerocade/shared'
import { socket } from '../socket'

// Fake live events, so games can be built and tested without going live.

const NAMES = ['luna', 'marco_99', 'giulia.live', 'tex', 'sofi', 'ale_gamer', 'nina', 'kappa']
const COUNTS = [1, 5, 10]
const COMMENTS = ['GG!', 'let\u2019s go', 'hi everyone', '😂😂', 'love this', 'W', 'go go go']

const pickComment = () => COMMENTS[Math.floor(Math.random() * COMMENTS.length)]

function randomViewer(): Viewer {
  const nickname = NAMES[Math.floor(Math.random() * NAMES.length)]
  return { id: nickname, nickname, avatar: `https://api.dicebear.com/9.x/adventurer/png?seed=${nickname}` }
}

function randomEvent(): LiveEvent {
  const user = randomViewer()
  const roll = Math.random()
  if (roll < 0.35) return { type: 'like', user, count: 1 + Math.floor(Math.random() * 15) }
  if (roll < 0.8) {
    // Cheap gifts are far more common than expensive ones, as on a real live.
    const gift = GIFTS[Math.floor(Math.random() ** 3 * GIFTS.length)]
    return { type: 'gift', user, giftId: gift.id, count: 1 }
  }
  if (roll < 0.9) return { type: 'comment', user, text: pickComment() }
  return roll < 0.97 ? { type: 'follow', user } : { type: 'share', user }
}

const send = (event: LiveEvent) => socket.emit('sim:event', event)

// Folded away until the creator starts it: only then the gifts, buttons and comment box show. Stopping it
// folds it again and ends the random events.
export function Simulator() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [auto, setAuto] = useState(false)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open || !auto) return
    const timer = setInterval(() => send(randomEvent()), 700)
    return () => clearInterval(timer)
  }, [open, auto])

  const sendComment = () => {
    if (!comment.trim()) return
    send({ type: 'comment', user: randomViewer(), text: comment.trim() })
    setComment('')
  }

  if (!open) {
    return (
      <section className="sim-panel">
        <h2 className="section-label">Live simulator</h2>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          ▶ Avvia simulazione
        </button>
      </section>
    )
  }

  return (
    <section className="sim-panel">
      <h2 className="section-label">Live simulator</h2>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setOpen(false)
          setAuto(false)
        }}
      >
        ■ Ferma simulazione
      </button>
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
            <span className="gift-btn__coins">{gift.coins.toLocaleString()}</span>
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
        <button className="btn" onClick={() => send({ type: 'join', user: randomViewer() })}>
          👋 Join
        </button>
      </div>
      <div className="sim-panel__row">
        <input
          type="text"
          placeholder="Comment as a viewer…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendComment()}
          style={{ flex: 1 }}
        />
        <button className="btn" onClick={sendComment}>
          💬 Send
        </button>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        Auto: a random event every 0.7 s
      </label>
    </section>
  )
}
