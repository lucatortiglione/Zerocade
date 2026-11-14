import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  GAMES,
  TIER_COLORS,
  giftById,
  type EventOrigin,
  type Feed,
  type FeedCreator,
  type FeedGift,
  type Gifter,
  type GiftTier,
  type Viewer,
} from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard, type FeedItem, type FeedMark } from '../store'
import { Pads } from './Pads'
import { simViewer } from './Regia'
import { Section } from './Section'

// The right column of the Games page, the same for every game: the live's counters (viewers
// now, comments, likes, gifts, coins, new followers), the Sounds/GIFs pads, the chat and events
// with a box to comment as a simulated viewer, and the gifters (latest gifts, or the top of the
// live). It fits the screen: the pads keep their size, the chat and the gifters share the rest
// and scroll inside. The creators live on this Zerocade stay folded at the bottom.

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
      <LiveStatsBar />
      <Pads />
      <ChatFeed now={now} />
      <Gifters feed={feed} now={now} creator={creator} onCreator={setCreator} />
      <Creators feed={feed} now={now} />
    </aside>
  )
}

// --- Counters ---

function LiveStatsBar() {
  const { stats } = useDashboard()
  const cells: { icon: ReactNode; value: number; label: string; coin?: boolean }[] = [
    {
      icon: <EyeIcon />,
      value: stats.viewers ?? 0,
      label: stats.viewers === null ? 'Spettatori: non noti (nessuna diretta collegata, o un ZeroFollowerBot che ancora non li manda)' : 'Spettatori presenti ora',
    },
    { icon: <CommentIcon />, value: stats.comments, label: 'Commenti della sessione' },
    { icon: <HeartIcon />, value: stats.likes, label: 'Like della sessione' },
    { icon: <GiftIcon />, value: stats.gifts, label: 'Regali della sessione' },
    { icon: <Coin />, value: stats.coins, label: 'Monete ricevute nella sessione', coin: true },
    { icon: <FollowIcon />, value: stats.follows, label: 'Nuovi follower della sessione' },
  ]
  return (
    <ul className="live-stats" aria-label="Statistiche della diretta">
      {cells.map((c) => (
        <li key={c.label} className="live-stats__cell" title={`${c.label}: ${c.value.toLocaleString()}`}>
          {c.icon}
          <span className={`live-stats__value${c.coin ? ' live-stats__value--coin' : ''}`}>{compact.format(c.value)}</span>
          <span className="sr-only">{c.label}</span>
        </li>
      ))}
    </ul>
  )
}

function Empty({ icon, title, text, className = '' }: { icon: ReactNode; title: string; text: string; className?: string }) {
  return (
    <div className={`empty-state ${className}`}>
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
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

// Oldest first, with the newest at the bottom. Consecutive likes from one viewer make one line.
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
  return rows
}

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'Chat ed eventi' },
  { id: 'chat', label: 'Solo commenti' },
  { id: 'events', label: 'Solo eventi' },
]

function ChatFeed({ now }: { now: number }) {
  const { feed } = useDashboard()
  const [filter, setFilter] = useState<ChatFilter>('all')
  const scrollArea = useRef<HTMLDivElement>(null)
  const rows = chatRows(feed, filter)
  useLayoutEffect(() => {
    const area = scrollArea.current
    if (!area) return
    const showLatest = () => { area.scrollTop = area.scrollHeight }
    showLatest()
    // Keep the last message visible after resizing, folding the section or wrapping text.
    const observer = new ResizeObserver(showLatest)
    observer.observe(area)
    if (area.firstElementChild) observer.observe(area.firstElementChild)
    return () => observer.disconnect()
  }, [feed, filter])
  return (
    <Section title="Chat" className="side-section--grow side-section--chat" extra={<FilterMenu value={filter} onChange={setFilter} />}>
      <div className="scroll-area" ref={scrollArea}>
        {rows.length ? (
          <ul className="feed-list">
            {rows.map((item) => (
              <ChatRow key={item.seq} item={item} now={now} />
            ))}
          </ul>
        ) : filter === 'events' ? (
          <Empty icon={<HeartIcon size={20} />} title="Nessun evento" text="Like, follow, condivisioni e regali compaiono qui." />
        ) : (
          <Empty icon={<CommentIcon size={20} />} title="In attesa di commenti" text="I messaggi dei tuoi spettatori compariranno qui." />
        )}
      </div>
      <CommentBox />
    </Section>
  )
}

function FilterMenu({ value, onChange }: { value: ChatFilter; onChange: (filter: ChatFilter) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <span className="filter-menu" ref={box}>
      <button
        type="button"
        className={`icon-btn${value !== 'all' ? ' icon-btn--on' : ''}`}
        aria-label="Filtra la chat"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filtra la chat"
        onClick={() => setOpen(!open)}
      >
        <FilterIcon />
      </button>
      {open && (
        <span className="filter-menu__list" role="menu">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === f.id}
              className="filter-menu__item"
              onClick={() => {
                onChange(f.id)
                setOpen(false)
              }}
            >
              {f.label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// A comment from a simulated viewer, the same for the whole visit: to try a game without a live.
function CommentBox() {
  const [viewer] = useState(simViewer)
  const [text, setText] = useState('')
  const send = (e: FormEvent) => {
    e.preventDefault()
    const comment = text.trim()
    if (!comment) return
    socket.emit('sim:event', { type: 'comment', text: comment.slice(0, 140), user: viewer })
    setText('')
  }
  return (
    <form className="comment-box" onSubmit={send}>
      <input
        value={text}
        maxLength={140}
        placeholder={`Commenta come @${viewer.nickname}`}
        aria-label={`Commenta come @${viewer.nickname}`}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" disabled={!text.trim()} aria-label="Invia commento" title="Invia">
        <SendIcon />
      </button>
    </form>
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

function ChatAvatar({ user, small = false }: { user: Pick<Viewer, 'nickname' | 'avatar'>; small?: boolean }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className={`chat-row__avatar${small ? ' chat-row__avatar--small' : ''}`} aria-hidden="true">
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
      open={false}
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

function Gifters({
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
  const { gifters } = useDashboard()
  const [tab, setTab] = useState<'live' | 'top'>('live')
  const creators = feed?.creators ?? []
  const tabButton = (id: 'live' | 'top', icon: ReactNode, label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} className="mini-tabs__btn" onClick={() => setTab(id)}>
      {icon}
      {label}
    </button>
  )
  return (
    <Section
      title="Donatori"
      className="side-section--grow"
      extra={
        <span className="mini-tabs" role="tablist" aria-label="Donatori">
          {tabButton('live', <PulseIcon />, 'Live')}
          {tabButton('top', <TrophyIcon />, 'Top')}
        </span>
      }
    >
      <div className="scroll-area">
        {tab === 'top' ? (
          gifters.length ? (
            <ol className="feed-list">
              {gifters.slice(0, 10).map((g, i) => (
                <GifterRow key={g.id} gifter={g} rank={i + 1} />
              ))}
            </ol>
          ) : (
            <Empty icon={<TrophyIcon size={20} />} title="Classifica vuota" text="Chi dona di più in questa diretta comparirà qui." />
          )
        ) : (
          <>
            {creators.filter(Boolean).length > 1 && (
              <select
                className="mini-select gifters__filter"
                value={creator}
                aria-label="Filtra per creator"
                onChange={(e) => onCreator(e.target.value)}
              >
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
            )}
            {feed?.top && <TopGift gift={feed.top} now={now} />}
            {feed?.gifts.length ? (
              <ul className="feed-list">
                {feed.gifts.map((g) => (
                  <GiftRow key={g.id} gift={g} now={now} />
                ))}
              </ul>
            ) : (
              <Empty icon={<GiftIcon size={20} />} title="Ancora nessun regalo" text="I regali compaiono qui appena uno spettatore ne invia uno." />
            )}
          </>
        )}
      </div>
    </Section>
  )
}

function GifterRow({ gifter, rank }: { gifter: Gifter; rank: number }) {
  return (
    <li className="feed-row feed-row--gift">
      <span className={`gifters__rank gifters__rank--${rank}`}>{rank}</span>
      <ChatAvatar user={gifter} />
      <span className="feed-row__body">
        <span className="feed-row__name">{gifter.nickname}</span>
      </span>
      <span className="feed-row__end feed-row__coins">
        <Coin />
        {gifter.coins.toLocaleString()}
      </span>
    </li>
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
          {gameOf(gift.gameId)?.name ?? gift.gameId} · <ChatAvatar user={gift} small /> {gift.nickname} · {ago(now - gift.at)} fa
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
      <ChatAvatar user={gift} />
      <span className="feed-row__body">
        <span className="feed-row__name">
          {gift.nickname}
          {!gift.creator && <span className="feed-row__sim">SIM</span>}
        </span>
        <span className="feed-row__sub">
          <span aria-hidden="true">{info?.emoji ?? '🎁'}</span> {info?.name ?? gift.giftId}
          {gift.count > 1 && <span className="feed-row__count">×{gift.count}</span>} · {gameOf(gift.gameId)?.name ?? gift.gameId}
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

// Line icons, in the text colour.
function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

function CommentIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 13h5" />
    </Icon>
  )
}

function HeartIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </Icon>
  )
}

function GiftIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </Icon>
  )
}

function FollowIcon() {
  return (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </Icon>
  )
}

function FilterIcon() {
  return (
    <Icon>
      <path d="M3 6h18M7 12h10M10 18h4" />
    </Icon>
  )
}

function SendIcon() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  )
}

function PulseIcon() {
  return (
    <Icon size={13}>
      <path d="M22 12h-4l-3 8-6-16-3 8H2" />
    </Icon>
  )
}

function TrophyIcon({ size = 13 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </Icon>
  )
}
