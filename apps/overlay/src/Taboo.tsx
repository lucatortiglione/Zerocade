import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import { useEffect, useState } from 'react'
import { TABOO_CATEGORIES, TABOO_DIFFICULTY_LABEL, TABOO_RULES, type TabooLeader, type TabooPublicState, type Viewer } from '@zerocade/shared'
import { useOverlay } from './store'
import { ViewerAvatar } from './ViewerAvatar'
import './taboo.css'

// ZeroTaboo is drawn in the DOM: the server runs the match and this renders its TabooPublicState. The server is authoritative; the
// overlay only counts the time down from `remainingMs`, and only while the round is running (a suspended round stays frozen).
// The five Taboo words of the open card are shown to the audience (decision D26); the target and the aliases never arrive here
// before the card is closed.

const KIND_LABEL: Record<string, string> = { warmup: 'Riscaldamento', classic: 'Classico', 'chat-choice': 'La chat sceglie', chaos: 'Caos leggero', finale: 'Gran finale' }
const OUTCOME_LABEL = { solved: 'Risolta', skipped: 'Saltata', taboo: 'Taboo', round_timeout: 'Tempo scaduto' } as const
// The difficulty is never told by colour alone (§10): a word and a mark.
const DIFFICULTY_MARK: Record<number, string> = { 1: '●', 2: '●●', 3: '●●●' }

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const asViewer = (l: Pick<TabooLeader, 'id' | 'nickname' | 'avatar'>): Viewer => ({ id: l.id, nickname: l.nickname, ...(l.avatar ? { avatar: l.avatar } : {}) })

function Name({ id, nickname, avatar }: { id: string; nickname: string; avatar?: string }) {
  // Every name goes with its picture.
  return (
    <span className="taboo-name">
      <ViewerAvatar viewer={asViewer({ id, nickname, avatar })} />
      <span className="taboo-name__text">{nickname}</span>
    </span>
  )
}

function Leaders({ leaders, limit }: { leaders: TabooLeader[]; limit: number }) {
  if (!leaders.length) return null
  return (
    <ol className="taboo-leaders" aria-label="Classifica degli indovini">
      {leaders.slice(0, limit).map((l) => (
        <li key={l.id}>
          <span className="taboo-leaders__place">{l.place}</span>
          <Name id={l.id} nickname={l.nickname} avatar={l.avatar} />
          <span className="taboo-leaders__wins">{l.solved}</span>
        </li>
      ))}
    </ol>
  )
}

export function Taboo() {
  const { taboo, tabooAt, session } = useOverlay()
  const [now, setNow] = useState(() => performance.now())
  const running = taboo?.phase === 'round'
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(id)
  }, [running])
  if (!taboo) return <div className="taboo taboo--wait">ZeroTaboo</div>
  const animated = session?.settings.tabooAnimations !== false
  return (
    <div className={`taboo${animated ? ' taboo--anim' : ''}`} data-phase={taboo.phase}>
      <Scene state={taboo} leftMs={running ? Math.max(0, taboo.remainingMs - (now - tabooAt)) : taboo.remainingMs} />
    </div>
  )
}

function Scene({ state, leftMs }: { state: TabooPublicState; leftMs: number }) {
  const category = TABOO_CATEGORIES.find((c) => c.code === state.category)
  const progress = Math.min(100, Math.round((state.team / state.threshold) * 100))
  const roundLabel = state.round > 0 ? `Round ${state.round}/${state.rounds} · ${KIND_LABEL[state.roundKind ?? ''] ?? ''}` : 'ZeroTaboo'
  const header = (
    <header className="taboo-head">
      <div className="taboo-head__round">{roundLabel}</div>
      {state.narrative && <div className="taboo-badge taboo-badge--narrative">Stile: {state.narrative}</div>}
      {state.mode === 'practice' && <div className="taboo-badge">Prova: fuori classifica</div>}
    </header>
  )
  const score = (
    <section className="taboo-score" aria-label="Punteggio di squadra">
      <div className="taboo-score__team"><strong>{state.team}</strong><span>/{state.threshold}</span></div>
      <div className="taboo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={state.threshold} aria-valuenow={state.team}>
        <div className="taboo-bar__fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="taboo-score__meta">
        {state.streak > 0 && <span className="taboo-badge taboo-badge--streak">Serie {state.streak}</span>}
        {state.reachedThreshold && <span className="taboo-badge taboo-badge--win">Soglia raggiunta</span>}
        {state.phase === 'round' && <span className="taboo-skips" aria-label={`Skip rimasti: ${state.skipsLeft}`}>Skip {'◆'.repeat(state.skipsLeft)}{'◇'.repeat(TABOO_RULES.skipsPerRound - state.skipsLeft)}</span>}
      </div>
    </section>
  )

  if (state.phase === 'setup') return <>{header}<div className="taboo-center"><h1>ZeroTaboo</h1><p>La partita sta per iniziare.</p></div></>

  if (state.phase === 'finished' || state.phase === 'cancelled') {
    return (
      <>
        {header}{score}
        <div className="taboo-center">
          <h1>{state.phase === 'cancelled' ? 'Partita annullata' : state.reachedThreshold ? 'Vittoria della squadra!' : 'Partita finita'}</h1>
          <p>{state.team} punti su {state.threshold}</p>
        </div>
        <Leaders leaders={state.leaders} limit={10} />
      </>
    )
  }

  if (state.phase === 'intermission') {
    return (
      <>
        {header}{score}
        <div className="taboo-center">
          <h1>{state.round === 1 ? 'Si comincia' : `Prossimo: round ${state.round}`}</h1>
          {state.roundSummary && (
            <p className="taboo-summary">
              Round {state.roundSummary.round}: {state.roundSummary.solved} risolte · {state.roundSummary.skipped} saltate · {state.roundSummary.taboo} Taboo · {state.roundSummary.timeout} scadute · {state.roundSummary.points >= 0 ? '+' : ''}{state.roundSummary.points} punti
            </p>
          )}
          {state.roundKind === 'chat-choice' && (
            <div className="taboo-vote">
              <h2>La chat sceglie la categoria: scrivi la lettera</h2>
              <ul>{TABOO_CATEGORIES.map((c) => <li key={c.code}><b>{c.code}</b> {c.name}</li>)}</ul>
            </div>
          )}
          {state.narrative && <p className="taboo-badge taboo-badge--narrative">In questo round: {state.narrative}</p>}
          {state.notice && <p className="taboo-notice">{state.notice}</p>}
          {state.correction && <p className="taboo-notice taboo-notice--correction">{state.correction}</p>}
        </div>
        {state.roundSummary && state.roundSummary.topGuessers.length > 0 && (
          <section><h2 className="taboo-subtitle">I migliori indovini del round</h2><Leaders leaders={state.roundSummary.topGuessers} limit={3} /></section>
        )}
        <section><h2 className="taboo-subtitle">Classifica</h2><Leaders leaders={state.leaders} limit={5} /></section>
      </>
    )
  }

  // round or suspended
  return (
    <>
      {header}
      <div className="taboo-timer" data-low={leftMs < 15_000 && state.phase === 'round'}>{clock(leftMs)}</div>
      {score}
      <section className="taboo-card" aria-live="polite">
        <div className="taboo-card__top">
          <span className="taboo-card__category">{category ? `${category.code} · ${category.name}` : 'Carta'}</span>
          {state.difficulty && <span className="taboo-card__difficulty">{DIFFICULTY_MARK[state.difficulty]} {TABOO_DIFFICULTY_LABEL[state.difficulty]}</span>}
          {state.jackpot && <span className="taboo-badge taboo-badge--jackpot">JACKPOT ×2</span>}
          {state.sung && <span className="taboo-badge taboo-badge--jackpot">CARTA CANTATA ×2</span>}
        </div>
        {state.forbidden.length > 0 && (
          <div className="taboo-forbidden">
            <h2>Parole che non si possono dire</h2>
            <ul>{state.forbidden.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
        {state.phase === 'suspended' && <div className="taboo-pause">{state.notice ?? 'Pausa tecnica'}</div>}
      </section>
      {state.lastWinner && (
        <section className="taboo-last">
          {state.lastWinner.user ? <><Name id={state.lastWinner.user.id} nickname={state.lastWinner.user.nickname} avatar={state.lastWinner.user.avatar} /> ha indovinato</> : <>La squadra ha indovinato</>}
          <strong> +{state.lastWinner.points}</strong>
        </section>
      )}
      {state.revealed && <section className="taboo-revealed">Ultima carta: <b>{state.revealed.target}</b> — {OUTCOME_LABEL[state.revealed.outcome]}</section>}
      <Leaders leaders={state.leaders} limit={3} />
    </>
  )
}
