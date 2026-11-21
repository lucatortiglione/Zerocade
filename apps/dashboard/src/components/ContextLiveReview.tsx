import { useEffect, useState } from 'react'
import type { ContextLivePair, LivePairVerdict, LiveReviewReply } from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'

function request(send: (ack: (reply: LiveReviewReply) => void) => void): Promise<LiveReviewReply> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => resolve({ ok: false, error: 'Conferma non ricevuta. Ricarica i confronti per verificare il salvataggio.' }), 10_000)
    send(reply => { window.clearTimeout(timer); resolve(reply) })
  })
}

export function ContextLiveReview() {
  const { session, connected } = useDashboard()
  const playing = session?.gameId === 'context' && !session.ended
  return (
    <section aria-labelledby="live-review">
      <h2 id="live-review" className="section-label">Confronti di fine live</h2>
      {!connected || !session ? <p className="text-muted" role="status">Connessione alla regia in corso…</p>
        : playing ? <p className="text-muted">I confronti si aprono quando termini la sessione ZeroContext.</p>
        : <Ballot />}
    </section>
  )
}

function Ballot() {
  const [pairs, setPairs] = useState<ContextLivePair[] | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let mounted = true
    setError('')
    setPairs(null)
    void request(ack => socket.emit('context:live-review', ack)).then(reply => {
      if (!mounted) return
      if (reply.ok) setPairs(reply.pairs)
      else setError(reply.error)
    })
    return () => { mounted = false }
  }, [revision])

  async function vote(id: string, verdict: LivePairVerdict) {
    setSaving(true)
    setError('')
    const result = await request(ack => socket.emit('context:live-vote', id, verdict, ack))
    if (result.ok) setPairs(result.pairs)
    else setError(result.error)
    setSaving(false)
  }

  return <>
    {error && <p className="quality__problem" role="alert">{error} <button type="button" className="btn btn--ghost btn--small"
      onClick={() => setRevision(n => n + 1)}>Ricarica</button></p>}
    {!error && pairs === null && <p className="text-muted" role="status">Caricamento dei confronti…</p>}
    {pairs?.length === 0 && <p className="text-muted">Nessun confronto disponibile. Servono almeno due parole diverse giocate in chat nello stesso round concluso.</p>}
    {pairs && pairs.length > 0 && <>
      <p aria-live="polite">{pairs.filter(pair => pair.verdict !== null).length} di {pairs.length} confronti valutati</p>
      {pairs.map(pair => <article key={pair.id} className="quality__secret">
        <h3 id={`pair-${pair.id}`}>Quale parola è più vicina a «{pair.secret}»?</h3>
        <div className="quality__verdicts quality__pair" role="group" aria-labelledby={`pair-${pair.id}`}>
          {(['a', 'b', 'tie'] as const).map(choice =>
            <button key={choice} type="button" disabled={saving || pair.verdict !== null}
              aria-pressed={pair.verdict === choice}
              className={`btn btn--small ${pair.verdict === choice ? 'is-picked' : 'btn--ghost'}`}
              onClick={() => void vote(pair.id, choice)}>
              {choice === 'tie' ? 'Pari' : pair[choice]}
            </button>
          )}
        </div>
      </article>)}
    </>}
  </>
}
