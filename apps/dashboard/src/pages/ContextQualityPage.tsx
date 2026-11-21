import { useCallback, useEffect, useMemo, useState } from 'react'
import { ContextLiveReview } from '../components/ContextLiveReview'
import type { EvaluationRun, EvaluationSample, EvaluationSampleWord, HumanVerdict } from '@zerocade/shared'
import { DEFAULT_SUBSET, comparisonRows, disagrees, formatInterval, formatValue, reviewProgress, subsetNames, type Cell } from '../qualityView'

// «Qualità posizioni»: how well ZeroContext puts the words people associate with a secret in the first positions, per profile,
// and the review of a fixed sample by hand. The numbers are calculated by gioco-zerocontext/script/evaluate_context_ranking.py:
// this page only shows them and saves the verdicts (docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md).

const RECALCULATE = 'python gioco-zerocontext/script/evaluate_context_ranking.py ricalcola'
const LABELS: Record<HumanVerdict, string> = { naturale: 'Naturale', non_naturale: 'Non naturale', non_so: 'Non so' }
const SUBSET_LABELS: Record<string, string> = {
  'misura:tutte': 'Misura · tutte le segrete', 'misura:con_associazioni': 'Misura · con associazioni verificate',
  'misura:senza_associazioni': 'Misura · senza associazioni verificate', 'misura:ordinaria': 'Misura · ordinarie',
  'misura:deroga': 'Misura · con deroga', 'misura:aggiunta': 'Misura · aggiunte il 18 novembre', 'sviluppo:tutte': 'Sviluppo · tutte',
  'sviluppo:con_associazioni': 'Sviluppo · con associazioni verificate', 'sviluppo:senza_associazioni': 'Sviluppo · senza associazioni verificate',
  'sviluppo:ordinaria': 'Sviluppo · ordinarie', 'sviluppo:deroga': 'Sviluppo · con deroga', 'sviluppo:aggiunta': 'Sviluppo · aggiunte il 18 novembre', tutte: 'Tutte',
}
const PROFILE_LABELS: Record<string, string> = { original: 'Originale', abtt: 'ABTT (BGE-M3)', pipeline_b: 'Pipeline B', riordino: 'Riordino' }
const subsetLabel = (name: string) => SUBSET_LABELS[name] ?? name
const profileLabel = (name: string) => PROFILE_LABELS[name] ?? name

/** GET with a time limit: a server that does not answer must not leave the page waiting for ever. */
async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), 10_000)
  const abort = () => timeout.abort()
  signal.addEventListener('abort', abort)
  try {
    const response = await fetch(url, { signal: timeout.signal, cache: 'no-store' })
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(body.error ?? `Il server ha risposto ${response.status}.`)
    return body as T
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

function Number_({ cell }: { cell: Cell }) {
  if (cell.value === null) return <span className="text-muted">—</span>
  const interval = formatInterval(cell.low, cell.high)
  return (
    <span title={interval ? `Intervallo al 95%: ${interval} · ${cell.n} segrete` : `${cell.n} segrete`}>
      {formatValue(cell.value)}
      {interval && <small className="quality__interval">{interval}</small>}
    </span>
  )
}

export function ContextQualityPage() {
  const [runs, setRuns] = useState<EvaluationRun[] | null>(null)
  const [problem, setProblem] = useState('')
  const [subset, setSubset] = useState(DEFAULT_SUBSET)
  const [profile, setProfile] = useState('')
  const [sample, setSample] = useState<EvaluationSample | null>(null)
  const [sampleProblem, setSampleProblem] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getJson<EvaluationRun[]>('/api/context/evaluation/runs', controller.signal)
      .then((rows) => { setRuns(rows); setProfile((current) => current || rows[0]?.profile || '') })
      .catch((error: unknown) => { if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : 'Impossibile leggere le valutazioni.') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!profile) return
    const controller = new AbortController()
    setSample(null)
    setSampleProblem('')
    getJson<EvaluationSample>(`/api/context/evaluation/sample?profile=${encodeURIComponent(profile)}`, controller.signal)
      .then(setSample)
      .catch((error: unknown) => { if (!controller.signal.aborted) setSampleProblem(error instanceof Error ? error.message : 'Impossibile leggere il campione.') })
    return () => controller.abort()
  }, [profile])

  const rows = useMemo(() => comparisonRows(runs ?? [], subset), [runs, subset])
  const subsets = useMemo(() => subsetNames(runs ?? []), [runs])
  const progress = useMemo(() => reviewProgress(sample?.secrets ?? []), [sample])

  // The verdict is shown at once and saved; if the server refuses it, the old one comes back with the reason.
  const judge = useCallback(async (secret: string, word: EvaluationSampleWord, verdict: HumanVerdict) => {
    if (word.human === verdict) return
    const before = word.human
    const set = (human: HumanVerdict | null) => setSample((current) => current && {
      ...current,
      secrets: current.secrets.map((s) => s.secret !== secret ? s : { ...s, words: s.words.map((w) => w.word === word.word ? { ...w, human } : w) }),
    })
    set(verdict)
    setNotice('')
    try {
      const response = await fetch('/api/context/evaluation/verdict', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret, word: word.word, verdict }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Il server ha risposto ${response.status}.`)
      }
      setSample((current) => current && { ...current, humanAfterRun: current.humanAfterRun + (before === null ? 1 : 0) })
    } catch (error) {
      set(before)
      setNotice(`Verdetto su «${word.word}» non salvato: ${error instanceof Error ? error.message : 'errore sconosciuto'}`)
    }
  }, [])

  return (
    <div className="quality" id="contenuto" tabIndex={-1}>
      <h1>Qualità posizioni</h1>
      <p className="text-muted">
        Quanto ZeroContext mette in alto, nelle prime dieci posizioni, le parole che la gente associa alla parola segreta. I numeri li
        calcola lo script di valutazione; qui li confronti e rivedi a mano un campione.
      </p>

      <ContextLiveReview />
      {problem && <p className="quality__problem" role="alert">{problem}</p>}
      {!problem && runs === null && <p className="text-muted" aria-live="polite">Caricamento…</p>}

      {runs && (
        <section aria-labelledby="quality-compare">
          <div className="quality__head">
            <h2 id="quality-compare" className="section-label">Confronto tra profili</h2>
            <label className="quality__select">
              <span>Segrete</span>
              <select value={subset} onChange={(e) => setSubset(e.target.value)}>
                {subsets.map((name) => <option key={name} value={name}>{subsetLabel(name)}</option>)}
              </select>
            </label>
          </div>
          {runs.length === 0 ? <p className="text-muted">Nessuna esecuzione completa.</p> : (
            <div className="quality__scroll">
              <table className="quality__table">
                <caption className="sr-only">Metriche per profilo, {subsetLabel(subset)}</caption>
                <thead>
                  <tr>
                    <th scope="col">Profilo</th>
                    <th scope="col" title="P@10 verificata: quota delle prime 10 parole che sono associazioni verificate (non dipende da Qwen)">Verificate nei primi 10</th>
                    <th scope="col" title="P@10 giudicata: quota delle prime 10 giudicate associate alla segreta (verificate, Qwen, tuoi verdetti)">Giudicate nei primi 10</th>
                    <th scope="col" title="nDCG@20: le associazioni migliori stanno più in alto?">Ordine delle migliori</th>
                    <th scope="col" title="Accezione: quota delle prime 10 nel senso della glossa">Senso giusto</th>
                    <th scope="col" title="Valutazione umana: quota di «naturale» nei tuoi verdetti">Naturali per te</th>
                    <th scope="col">Segrete</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.runId}>
                      <th scope="row">{profileLabel(row.profile)}</th>
                      <td><Number_ cell={row.cells.precisionVerified} /></td>
                      <td><Number_ cell={row.cells.precisionJudged} /></td>
                      <td><Number_ cell={row.cells.ndcg} /></td>
                      <td><Number_ cell={row.cells.sense} /></td>
                      <td><Number_ cell={row.cells.human} /></td>
                      <td className="quality__count">{row.segrete === null ? '—' : row.segrete.toLocaleString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted small">«—» vuol dire che la misura non c'è per quel gruppo di segrete (per esempio senza associazioni verificate o senza giudice).</p>
        </section>
      )}

      {runs && runs.length > 0 && (
        <section aria-labelledby="quality-review">
          <div className="quality__head">
            <h2 id="quality-review" className="section-label">Revisione del campione</h2>
            <label className="quality__select">
              <span>Profilo</span>
              <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                {runs.map((run) => <option key={run.id} value={run.profile}>{profileLabel(run.profile)}</option>)}
              </select>
            </label>
          </div>
          {sampleProblem && <p className="quality__problem" role="alert">{sampleProblem}</p>}
          {!sampleProblem && !sample && <p className="text-muted" aria-live="polite">Caricamento del campione…</p>}
          {sample && (
            <>
              <p aria-live="polite">
                <strong>{progress.done} / {progress.total}</strong> segrete riviste · {progress.words.done} / {progress.words.total} parole
              </p>
              {sample.humanAfterRun > 0 && (
                <p className="quality__stale">
                  Verdetti nuovi dopo l'ultimo calcolo: {sample.humanAfterRun}. Per aggiornare i numeri: <code translate="no">{RECALCULATE}</code>
                </p>
              )}
              {notice && <p className="quality__problem" role="alert">{notice}</p>}
              {sample.secrets.length === 0 && <p className="text-muted">Il campione di questo profilo è vuoto.</p>}
              {sample.secrets.map((secret) => (
                <article key={secret.secret} className="quality__secret" aria-labelledby={`q-${secret.secret}`}>
                  <h3 id={`q-${secret.secret}`}>{secret.secret}</h3>
                  {secret.gloss && <p className="text-muted small">{secret.gloss}</p>}
                  <ol className="quality__words">
                    {secret.words.map((word) => (
                      <li key={word.word} className={`quality__word${disagrees(word) ? ' is-disagreement' : ''}`}>
                        <span className="quality__pos">{word.position}</span>
                        <span className="quality__text">
                          {word.word}
                          {word.verified && <span className="quality__tag quality__tag--ok">verificata</span>}
                          {word.variant && <span className="quality__tag">variante</span>}
                        </span>
                        <span className="quality__judge text-muted small" title={word.judge?.reason}>
                          {word.judge ? `Qwen ${word.judge.grade}${word.judge.senseOk === false ? ' · altro senso' : ''}` : ''}
                          {disagrees(word) && <strong className="quality__disagree"> · discordi</strong>}
                        </span>
                        {word.variant ? <span className="quality__none text-muted small">non si giudica</span> : (
                          <span className="quality__verdicts" role="group" aria-label={`Verdetto su ${word.word}`}>
                            {(Object.keys(LABELS) as HumanVerdict[]).map((verdict) => (
                              <button key={verdict} type="button" className={`btn btn--small${word.human === verdict ? ' is-picked' : ' btn--ghost'}`}
                                aria-pressed={word.human === verdict} onClick={() => void judge(secret.secret, word, verdict)}>
                                {LABELS[verdict]}
                              </button>
                            ))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  )
}
