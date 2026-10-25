import {
  GAMES,
  GIFTS,
  MAX_TRIGGERS,
  describeSource,
  type SessionState,
  type Trigger,
  type TriggerSource,
} from '@zerocade/shared'
import { socket } from '../socket'

const SOURCES: TriggerSource[] = [
  { type: 'gift' },
  ...GIFTS.map((g): TriggerSource => ({ type: 'gift', giftId: g.id })),
  { type: 'like' },
  { type: 'follow' },
  { type: 'share' },
  { type: 'comment' },
  { type: 'join' },
]

const encode = (source: TriggerSource) =>
  source.type === 'gift' && source.giftId ? `gift:${source.giftId}` : source.type

const decode = (value: string) => SOURCES.find((s) => encode(s) === value) ?? SOURCES[0]

export function TriggerEditor({ session }: { session: SessionState }) {
  const game = GAMES.find((g) => g.id === session.gameId)
  if (!game) return null

  // The server echoes the new state back, so there is no local copy to keep in sync.
  const save = (triggers: Trigger[]) => socket.emit('triggers:set', triggers)
  const change = (index: number, patch: Partial<Trigger>) =>
    save(session.triggers.map((t, i) => (i === index ? { ...t, ...patch } : t)))

  return (
    <section>
      <h2 className="section-label">Triggers</h2>
      <p className="text-muted small">Viewers see these in the overlay's side columns.</p>
      <ul className="trigger-list">
        {session.triggers.map((trigger, i) => (
          <li key={i} className="trigger-row">
            <select
              aria-label="When"
              value={encode(trigger.source)}
              onChange={(e) => change(i, { source: decode(e.target.value) })}
            >
              {SOURCES.map((source) => {
                const { icon, label } = describeSource(source)
                return (
                  <option key={encode(source)} value={encode(source)}>
                    {`${icon} ${label}`}
                  </option>
                )
              })}
            </select>
            <select aria-label="Then" value={trigger.action} onChange={(e) => change(i, { action: e.target.value })}>
              {game.actions.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.label}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              aria-label="Remove trigger"
              onClick={() => save(session.triggers.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        className="btn btn--ghost"
        disabled={session.triggers.length >= MAX_TRIGGERS}
        onClick={() => save([...session.triggers, { source: { type: 'gift' }, action: game.actions[0].id }])}
      >
        + Add trigger
      </button>
    </section>
  )
}
