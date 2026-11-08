import { useEffect, useState, type CSSProperties } from 'react'
import {
  GAMES,
  TIER_COLORS,
  giftById,
  type EventOrigin,
  type Feed,
  type FeedCreator,
  type FeedGift,
  type GiftTier,
  type Viewer,
} from '@zerocade/shared'
import { useDashboard, type FeedItem, type FeedMark } from '../store'
import { Pads } from './Pads'
import { Section } from './Section'

// The right column of the Games page, the same for every game: the chat and events of the
// live, the Sounds/GIFs pads, the creators live on this Zerocade and the latest gifts they
// received.

const FEED_MS = 3000

const TIER_LABELS: Record<GiftTier, string> = { rare: 'Raro', epic: 'Epico', legendary: 'Leggendario', mythic: 'Mitico' }

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}g`
}

const gameOf = (id: string) => GAMES.find((g) => g.id === id)

// 'tiktok:name' → '@name'; '' is the simulator.
const creatorName = (creator: string) => (creator ? `@${creator.slice(creator.indexOf(':') + 1)}` : 'Simulatore')

function useFeed(creator: string) {
  const [feed, setFeed] = useState<Feed | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/feed?creator=${encodeURIComponent(creator)}`)
        if (res.ok && alive) setFeed((await res.json()) as Feed)
      } catch {
        // Server down: keep the last feed; the left rail already shows it is offline.
      }
    }
    void load()
    const timer = setInterval(load, FEED_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [creator])
  return feed
}

function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function LiveColumn() {
  const [creator, setCreator] = useState('all')
  const feed = useFeed(creator)
  const now = useNow()
  return (
    <aside className="panel right-panel side live-col">
      <ChatFeed now={now} />
      <Pads />
      <Creators feed={feed} now={now} />
      <LatestGifts feed={feed} now={now} creator={creator} onCreator={setCreator} />
    </aside>
  )
}

// --- Chat and events ---

type ChatFilter = 'all' | 'chat' | 'events'

const ORIGIN_LABELS: Record<EventOrigin, string> = { tiktok: 'TikTok', twitch: 'Twitch', sim: 'Sim' }

const MARKS: Record<FeedMark, { icon: string; label: string }> = {
  found: { icon: '✓', label: 'Parola trovata' },
  extra: { icon: '★', label: 'Parola extra' },
  secret: { icon: '🔒', label: 'Parola segreta' },
  repeat: { icon: '↺', label: 'Parola già trovata' },
}

// Newest first. TikTok sends likes in small bursts: one viewer's likes in a row make one line.
function chatRows(feed: FeedItem[], filter: ChatFilter): FeedItem[] {
  const rows: FeedItem[] = []
  for (const item of feed) {
    const isChat = item.event.type === 'comment'
    if ((filter === 'chat' && !isChat) || (filter === 'events' && isChat)) continue
    const last = rows.at(-1)
    if (
      item.event.type === 'like' &&
      last?.event.type === 'like' &&
      last.origin === item.origin &&
      last.event.user.id === item.event.user.id
    ) {
      rows[rows.length - 1] = { ...item, event: { ...item.event, count: last.event.count + item.event.count } }
    } else rows.push(item)
  }
  return rows.reverse()
}

function ChatFeed({ now }: { now: number }) {
  const { feed } = useDashboard()
  const [filter, setFilter] = useState<ChatFilter>('all')
  const rows = chatRows(feed, filter)
  const tab = (id: ChatFilter, label: string) => (
    <button type="button" role="tab" aria-selected={filter === id} className="mini-tabs__btn" onClick={() => setFilter(id)}>
      {label}
    </button>
  )
  return (
    <Section
      title="Chat ed eventi"
      extra={
        <span className="mini-tabs" role="tablist" aria-label="Chat ed eventi">
          {tab('all', 'Tutto')}
          {tab('chat', 'Chat')}
          {tab('events', 'Eventi')}
        </span>
      }
    >
      {rows.length ? (
        <ul className="feed-list chat-feed">
          {rows.map((item) => (
            <ChatRow key={item.seq} item={item} now={now} />
          ))}
        </ul>
      ) : (
        <p className="text-muted small">
          {filter === 'events'
            ? 'Nessun evento ancora.'
            : 'I messaggi della chat TikTok e Twitch compaiono qui appena colleghi la diretta (o dal simulatore).'}
        </p>
      )}
    </Section>
  )
}

function eventText(item: FeedItem): { icon: string; text: string } | null {
  const e = item.event
  switch (e.type) {
    case 'comment':
      return null
    case 'gift': {
      const gift = giftById(e.giftId)
      return { icon: gift?.emoji ?? '🎁', text: `${gift?.name ?? e.giftId}${e.count > 1 ? ` ×${e.count}` : ''}` }
    }
    case 'like':
      return item.origin === 'twitch'
        ? { icon: '💎', text: `${e.count} bit` }
        : { icon: '❤️', text: `${e.count} like` }
    case 'follow':
      return { icon: '➕', text: 'ti segue' }
    case 'share':
      return { icon: '🔁', text: 'ha condiviso la diretta' }
    case 'join':
      return { icon: '👋', text: 'è entrato' }
  }
}

function ChatRow({ item, now }: { item: FeedItem; now: number }) {
  const e = item.event
  const ev = eventText(item)
  const mark = item.mark ? MARKS[item.mark] : null
  return (
    <li className={`chat-row${ev ? ' chat-row--event' : ''}`}>
      <ChatAvatar user={e.user} />
      <span className="chat-row__body">
        <span className="chat-row__head">
          <span className="chat-row__name">{e.user.nickname}</span>
          <span className={`chat-row__origin chat-row__origin--${item.origin}`}>{ORIGIN_LABELS[item.origin]}</span>
        </span>
        {e.type === 'comment' ? (
          <span className="chat-row__text">{e.text || <em className="text-muted">messaggio vuoto</em>}</span>
        ) : (
          ev && (
            <span className="chat-row__text chat-row__text--event">
              <span aria-hidden="true">{ev.icon}</span> {ev.text}
            </span>
          )
        )}
      </span>
      <span className="chat-row__end">
        {mark && (
          <span className={`chat-row__mark chat-row__mark--${item.mark}`} title={mark.label} aria-label={mark.label}>
            {mark.icon}
          </span>
        )}
        <span className="text-muted" title={new Date(item.at).toLocaleTimeString()}>
          {ago(now - item.at)}
        </span>
      </span>
    </li>
  )
}

function ChatAvatar({ user }: { user: Viewer }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="chat-row__avatar" aria-hidden="true">
      {user.nickname.charAt(0).toUpperCase()}
      {user.avatar && !broken && <img src={user.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </span>
  )
}

function Creators({ feed, now }: { feed: Feed | null; now: number }) {
  const [tab, setTab] = useState<'live' | 'recent'>('live')
  const list = (tab === 'live' ? feed?.live : feed?.recent) ?? []
  return (
    <Section
      title="Creator"
      extra={
        <span className="mini-tabs" role="tablist" aria-label="Creator">
          <button type="button" role="tab" aria-selected={tab === 'live'} className="mini-tabs__btn" onClick={() => setTab('live')}>
            <span className="mini-tabs__dot" aria-hidden="true" />
            Live <span className="mini-tabs__count">{feed?.live.length ?? 0}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'recent'} className="mini-tabs__btn" onClick={() => setTab('recent')}>
            Recenti
          </button>
        </span>
      }
    >
      {list.length ? (
        <ul className="feed-list">
          {list.map((c) => (
            <CreatorRow key={`${c.kind}:${c.username}`} creator={c} live={tab === 'live'} now={now} />
          ))}
        </ul>
      ) : (
        <p className="text-muted small">
          {tab === 'live'
            ? 'Nessuna diretta collegata a questo Zerocade. Collega TikTok o Twitch e comparirai qui.'
            : 'Nessuna diretta recente.'}
        </p>
      )}
    </Section>
  )
}

function CreatorRow({ creator, live, now }: { creator: FeedCreator; live: boolean; now: number }) {
  const game = gameOf(creator.gameId)
  return (
    <li className="feed-row">
      <span
        className="feed-row__thumb"
        style={{ background: game ? `linear-gradient(135deg, ${game.gradient[0]}, ${game.gradient[1]})` : undefined }}
        aria-hidden="true"
      >
        {game?.emoji ?? '🎮'}
        {live && <span className="feed-row__live" />}
      </span>
      <span className="feed-row__body">
        <span className="feed-row__name">{creator.kind === 'twitch' ? creator.username : `@${creator.username}`}</span>
        <span className="feed-row__sub">
          {game?.name ?? creator.gameId}
          {creator.kind === 'twitch' ? ' · Twitch' : ''}
        </span>
      </span>
      {live && creator.viewers !== undefined ? (
        <span className="feed-row__end feed-row__viewers" title={`${creator.viewers} spettatori`}>
          <EyeIcon />
          {compact.format(creator.viewers)}
        </span>
      ) : (
        <span className="feed-row__end text-muted" title={new Date(creator.at).toLocaleString()}>
          {live ? `da ${ago(now - creator.at)}` : `${ago(now - creator.at)} fa`}
        </span>
      )}
    </li>
  )
}

function LatestGifts({
  feed,
  now,
  creator,
  onCreator,
}: {
  feed: Feed | null
  now: number
  creator: string
  onCreator: (creator: string) => void
}) {
  const creators = feed?.creators ?? []
  return (
    <Section
      title="Ultimi regali"
      extra={
        <select className="mini-select" value={creator} aria-label="Filtra per creator" onChange={(e) => onCreator(e.target.value)}>
          <option value="all">Tutti i creator</option>
          {creators
            .filter(Boolean)
            .map((c) => (
              <option key={c} value={c}>
                {creatorName(c)}
              </option>
            ))}
          {(creators.includes('') || creator === 'sim') && <option value="sim">Simulatore</option>}
        </select>
      }
    >
      {feed?.top && <TopGift gift={feed.top} now={now} />}
      {feed?.gifts.length ? (
        <ul className="feed-list">
          {feed.gifts.map((g) => (
            <GiftRow key={g.id} gift={g} now={now} />
          ))}
        </ul>
      ) : (
        <p className="text-muted small">Nessun regalo ancora: arrivano qui appena li ricevi in diretta (o dal simulatore).</p>
      )}
    </Section>
  )
}

function TopGift({ gift, now }: { gift: FeedGift; now: number }) {
  const info = giftById(gift.giftId)
  const tier = info?.tier ?? 'rare'
  return (
    <div className="top-gift" style={{ '--tier': TIER_COLORS[tier] } as CSSProperties}>
      <span className="top-gift__icon" aria-hidden="true">
        {info?.emoji ?? '🎁'}
      </span>
      <span className="top-gift__body">
        <span className="top-gift__kicker">
          🔥 {TIER_LABELS[tier]} <span aria-hidden="true">•</span> Top di oggi
        </span>
        <span className="top-gift__name">
          {info?.name ?? gift.giftId}
          {gift.count > 1 && <span className="feed-row__count"> ×{gift.count}</span>}
        </span>
        <span className="feed-row__sub">
          {gameOf(gift.gameId)?.name ?? gift.gameId} · {gift.nickname} · {ago(now - gift.at)} fa
        </span>
      </span>
      <span className="feed-row__coins feed-row__coins--big">
        <Coin />
        {gift.coins.toLocaleString()}
      </span>
    </div>
  )
}

function GiftRow({ gift, now }: { gift: FeedGift; now: number }) {
  const info = giftById(gift.giftId)
  return (
    <li className="feed-row feed-row--gift" title={`${gift.nickname} → ${creatorName(gift.creator)}`}>
      <span className="feed-row__emoji" aria-hidden="true">
        {info?.emoji ?? '🎁'}
      </span>
      <span className="feed-row__body">
        <span className="feed-row__name feed-row__name--gift">
          {info?.name ?? gift.giftId}
          {gift.count > 1 && <span className="feed-row__count">×{gift.count}</span>}
          {!gift.creator && <span className="feed-row__sim">SIM</span>}
        </span>
        <span className="feed-row__sub">
          {gameOf(gift.gameId)?.name ?? gift.gameId} · {gift.nickname}
        </span>
      </span>
      <span className="feed-row__end">
        <span className="text-muted">{ago(now - gift.at)}</span>
        <span className="feed-row__coins">
          <Coin />
          {gift.coins.toLocaleString()}
        </span>
      </span>
    </li>
  )
}

const Coin = () => <span className="coin" role="img" aria-label="monete" />

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
