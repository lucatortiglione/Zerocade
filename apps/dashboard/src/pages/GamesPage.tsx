import { useState } from 'react'
import { Link } from 'react-router'
import { CONTEXT_HINT_STALL, GAMES, chainModeLabel, parseChainSecret, type ContextSemanticState, type SessionState } from '@zerocade/shared'
import { connectionLabels, connectionStatus } from '../connectionStatus'
import { PlaceBoxes } from '../components/PlaceBoxes'
import { BivioSidebar } from '../components/BivioSidebar'
import { ContextTournamentPanel } from '../components/ContextTournamentPanel'
import { ContextAssociationsPanel } from '../components/ContextAssociationsPanel'
import { IncastroSidebar } from '../components/IncastroSidebar'
import { LeaderboardPanel } from '../components/LeaderboardPanel'
import { LiveColumn } from '../components/LiveColumn'
import { GameControls } from '../components/GameControls'
import { BridgeControl, listedGames } from '../components/Regia'
import { QuizzlandSidebar } from '../components/QuizzlandSidebar'
import { TabooSidebar } from '../components/TabooSidebar'
import { WordHuntSidebar } from '../components/WordHuntSidebar'
import { SettingsPanel } from '../components/SettingsPanel'
import { Simulator } from '../components/Simulator'
import { TopGifters } from '../components/TopGifters'
import { TriggerEditor } from '../components/TriggerEditor'
import { WidgetsPanel } from '../components/WidgetsPanel'
import { overlayUrl, previewUrl } from '../overlayKey'
import { socket } from '../socket'
import { timesOut } from '../format'
import { useDashboard } from '../store'

export function GamesPage() {
  const { session, gameSecret, tournament, secretUses, contextSemantic, connected } = useDashboard()
  // ZeroContext's tournament (shown, or still running): the classic round controls step aside.
  const tournamentShown = session?.gameId === 'context' && Boolean(tournament)
  const tournamentOpen = tournamentShown && tournament?.state.phase !== 'completed' && tournament?.state.phase !== 'cancelled'

  // Bivio, Incastro and Quizzland have their own control column (game switcher included) next
  // to the preview. Every game gets the same right column: pads, creators and latest gifts.
  if (session?.gameId === 'zerodubbi' || session?.gameId === 'incastro' || session?.gameId === 'quizzland' || session?.gameId === 'zerotaboo' || session?.gameId === 'zerowordhunt') {
    return (
      <div className="games games--bivio" id="contenuto" tabIndex={-1}>
        <h1 className="sr-only">Regia</h1>
        {session.gameId === 'zerodubbi' ? (
          <BivioSidebar session={session} />
        ) : session.gameId === 'incastro' ? (
          <IncastroSidebar session={session} />
        ) : session.gameId === 'zerotaboo' ? (
          <TabooSidebar session={session} />
        ) : session.gameId === 'zerowordhunt' ? (
          <WordHuntSidebar session={session} />
        ) : (
          <QuizzlandSidebar session={session} />
        )}
        <Preview session={session} />
        <LiveColumn />
      </div>
    )
  }

  return (
    <div className="games" id="contenuto" tabIndex={-1}>
      <h1 className="sr-only">Regia</h1>
      <aside className="panel left-panel">
        <section>
          <h2 className="section-label">Giochi</h2>
          <GamePicker session={session} locked={tournamentOpen} />
        </section>
        {session?.gameId === 'context' && <ContextTournamentPanel />}
        {session?.gameId === 'context' && <ContextAssociationsPanel session={session} locked={Boolean(tournamentOpen)} />}
        {!tournamentShown && (session?.gameId === 'context' || session?.gameId === 'zerowordle' || session?.gameId === 'zeroreazioniacatena') && (
          <section>
            <h2 className="section-label">Soluzione</h2>
            <div className="context-solution">{gameSecret ? describeSecret(session.gameId, gameSecret) : '…'}</div>
            <p className="text-muted small">
              {session.gameId === 'zeroreazioniacatena' ? 'Le parole del round in corso: la chat non le vede.' : 'La parola segreta del round in corso: la chat non la vede.'}
              {session.gameId === 'context' && gameSecret && ` Uscita ${timesOut(secretUses[gameSecret] ?? 1)}: si scelgono sempre parole mai uscite finché ce ne sono.`}
            </p>
            {/* ZeroContext has no time limit: a round ends when the chat finds the word, or from here. */}
            {session.gameId === 'context' && (
              <button
                type="button"
                className="btn btn--small"
                title="Mostra la parola a tutti e, dopo la pausa, passa alla prossima"
                disabled={session.paused || session.ended}
                onClick={() => socket.emit('game:command', 'next-round')}
              >
                <span aria-hidden="true">⏭</span> Termina round
              </button>
            )}
          </section>
        )}
        {session && !tournamentOpen && <GameControls session={session} />}
        {session?.gameId === 'context' && session.ended && (
          <Link className="btn btn--small" to="/qualita">Valuta i confronti di fine live</Link>
        )}
        {session?.gameId === 'context' && !tournamentShown && contextSemantic?.contextHint &&
          <ContextHintPanel session={session} state={contextSemantic} connected={connected} />}
        <section>
          <h2 className="section-label">Chat Twitch e TikTok</h2>
          <p className="text-muted small">
            Il gioco riceve la chat da ZeroFollowerBot, che dice anche chi è follower o nel fan club. Attiva in
            ZeroFollowerBot &ldquo;Manda chat ed eventi a Zerocade&rdquo; e imposta qui la stessa porta.
          </p>
          <BridgeControl label="Collegati a ZeroFollowerBot (Twitch e TikTok)" />
        </section>
        {session && (
          <section>
            <h2 className="section-label">Classifica</h2>
            <LeaderboardPanel gameId={session.gameId} />
          </section>
        )}
        <Simulator />
        {session && <TriggerEditor session={session} />}
        {session && <SettingsPanel session={session} />}
        {session?.gameId === 'word-association' && <WordAssociationData />}
        {session && <WidgetsPanel session={session} />}
        <TopGifters />
      </aside>

      <Preview session={session} />

      <LiveColumn />
    </div>
  )
}

function ContextHintPanel({ session, state, connected }: { session: SessionState; state: ContextSemanticState; connected: boolean }) {
  const hint = state.contextHint!
  const result = state.lastHintResult
  const playing = state.phase === 'playing'
  const enabled = session.settings.disableAllHints !== true
  const waiting = playing && enabled && hint.guessesAfterRelease === null
  const guesses = (n: number) => n === 1 ? '1 tentativo' : `${n} tentativi`
  return <section>
    <h2 className="section-label">Indizio contestuale</h2>
    {!enabled && <p className="text-muted small">Gli aiuti sono disattivati.</p>}
    {waiting && <>
      <p className="text-muted small">{guesses(hint.stalled)} senza migliorare la posizione. Servono {CONTEXT_HINT_STALL} parole distinte.</p>
      <button type="button" className="btn btn--small" disabled={!connected || !hint.available || session.ended || session.paused}
        onClick={() => socket.emit('context:release-hint', state.round, session.run ?? 0)}>Pubblica indizio</button>
      {!state.paused && hint.stalled >= CONTEXT_HINT_STALL && !hint.available && <p className="text-muted small">Aiuti del round esauriti.</p>}
    </>}
    {hint.text && <p>{hint.text}</p>}
    {playing && hint.guessesAfterRelease !== null && <p className="text-muted small">{hint.guessesToImprovement === null
      ? `${guesses(hint.guessesAfterRelease)} dopo l’indizio. In attesa di una posizione migliore.`
      : `Posizione migliorata dopo ${guesses(hint.guessesToImprovement)}.`}</p>}
    {!playing && hint.guessesAfterRelease === null && <p className="text-muted small">Round concluso senza indizio.</p>}
    {result && <p className="text-muted small">Round {result.round} · {result.improved
      ? `Posizione migliorata dopo ${guesses(result.guesses)}.`
      : `${guesses(result.guesses)} dopo l’indizio, nessun miglioramento.`}</p>}
  </section>
}

// The round's secret as the creator reads it: ZeroReazioniACatena's with its mode and round, the hidden
// word of "Parola chiave" before its clues.
function describeSecret(gameId: string, secret: string): string {
  const round = gameId === 'zeroreazioniacatena' ? parseChainSecret(secret) : null
  if (!round) return secret.replaceAll('-', ' → ')
  const head = `${chainModeLabel(round.mode)}${round.round ? `, round ${round.round}` : ''}: `
  if (round.mode === 'chiave') return `${head}${round.words[0].toUpperCase()} (indizi: ${round.words.slice(1).join(', ')})`
  return head + round.words.join(' → ')
}

// The games in a drop-down, in alphabetical order; the chosen game's description sits below it.
function GamePicker({ session, locked = false }: { session: SessionState | null; locked?: boolean }) {
  const current = GAMES.find((g) => g.id === session?.gameId)
  // The same list as every other game menu (listedGames): quiz and brain games, in alphabetical order.
  const sorted = listedGames(current?.id)
  return (
    <div className="game-picker">
      <select
        aria-label="Gioco"
        disabled={locked}
        title={locked ? 'Durante il torneo ZeroContext non si cambia gioco' : undefined}
        value={current?.id ?? ''}
        onChange={(e) => socket.emit('game:select', e.target.value)}
      >
        {!current && <option value="">Scegli un gioco…</option>}
        {sorted.map((game) => (
          <option key={game.id} value={game.id}>
            {game.emoji} {game.name}
          </option>
        ))}
      </select>
      {current && <p className="text-muted small">{current.description}</p>}
    </div>
  )
}

// Word Association's telemetry, for gioco-zeroassociations/script/analyze_telemetry.py: which hidden
// words the chat finds, how fast, and what it writes instead.
function WordAssociationData() {
  return (
    <section>
      <h2 className="section-label">Dati di gioco</h2>
      <p className="text-muted small">
        Round giocati e tentativi della chat: servono a misurare la difficoltà delle parole e a trovare le associazioni che la
        chat si aspetta.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn--small" href="/api/word-association/rounds.csv" download>
          Round (CSV)
        </a>
        <a className="btn btn--small" href="/api/word-association/guesses.csv" download>
          Tentativi (CSV)
        </a>
      </div>
    </section>
  )
}

function Preview({ session }: { session: SessionState | null }) {
  const [placing, setPlacing] = useState(false)
  const tally = connectionStatus(useDashboard())
  return (
    <main className="preview" data-tally={tally}>
      <div className="preview__head">
        <div className="preview__title">
          <span className="preview__dot" aria-hidden="true" />
          <span className="preview__state" role="status">{connectionLabels[tally]}</span>
          {session && <span className="preview__game">{GAMES.find((g) => g.id === session.gameId)?.name}</span>}
        </div>
        <div className="preview__actions">
          {session && (
            <button type="button" className={`btn btn--small ${placing ? '' : 'btn--ghost'}`} aria-pressed={placing} onClick={() => setPlacing(!placing)}>
              {placing ? 'Fatto' : 'Sposta box'}
            </button>
          )}
          <a className="btn btn--ghost btn--small" href={overlayUrl} target="_blank" rel="noreferrer" title="Apre l'overlay in una nuova scheda">
            Apri overlay <span aria-hidden="true">↗</span><span className="sr-only"> (nuova scheda)</span>
          </a>
        </div>
      </div>
      <div className="preview__frame">
        <iframe title="Anteprima dell'overlay" src={previewUrl} />
        {placing && session && <PlaceBoxes session={session} />}
      </div>
      <p className="text-muted small">È esattamente quello che vedono gli spettatori in diretta.</p>
    </main>
  )
}
