import { useEffect, useState } from 'react'
import { CONTEXT_PROFILES, contextProfile, type SessionState } from '@zerocade/shared'
import { socket } from '../socket'

export function ContextAssociationsPanel({ session, locked }: { session: SessionState; locked: boolean }) {
  const [available, setAvailable] = useState<Set<string> | null>(null)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/context/profiles', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Elenco associazioni non disponibile.')
        const rows = await response.json() as { id: string; available: boolean }[]
        setAvailable(new Set(rows.filter((r) => r.available).map((r) => r.id)))
      })
      .catch(() => { if (!controller.signal.aborted) setProblem('Impossibile verificare le associazioni disponibili. Ricarica il pannello.') })
    return () => controller.abort()
  }, [])
  const selected = contextProfile(session.settings.associationSource)
  return <section className="context-associations" aria-labelledby="context-associations-title">
    <h2 className="section-label" id="context-associations-title">Associazioni ZeroContext</h2>
    <div className="context-associations__choices" role="radiogroup" aria-label="Associazioni ZeroContext">
      {CONTEXT_PROFILES.map(({ id, label }) => <label key={id} className={`context-associations__choice${selected === id ? ' is-selected' : ''}`}>
        <input type="radio" name="context-associations" value={id} checked={selected === id}
          disabled={locked || !available?.has(id)}
          onChange={() => socket.emit('settings:set', { associationSource: id })} />
        <span>{label}{available && !available.has(id) && <small>Non disponibili</small>}</span>
      </label>)}
    </div>
    <p className="text-muted small">{locked ? 'La scelta resta fissa durante il torneo.' : 'Il cambio avvia un nuovo round. La classifica generale rimane e il server resta acceso.'}</p>
    {problem && <p className="text-muted small" role="alert">{problem}</p>}
  </section>
}
