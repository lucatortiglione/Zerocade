import { useState } from 'react'
import { parseWordHuntHintTiers, WORDHUNT_MAX_HINT_TAPS, WORDHUNT_RULES } from '@zerocade/shared'

export function WordHuntHintTiers({ value, save }: { value: string; save: (value: string) => void }) {
  const [rows, setRows] = useState(() => (parseWordHuntHintTiers(value) ?? []).map(t => ({
    remaining: String(t.remaining), taps: String(t.taps),
  })))
  const encoded = rows.map(r => `${r.remaining}:${r.taps}`).join(',')
  const tiers = parseWordHuntHintTiers(encoded)
  const change = (i: number, field: 'remaining' | 'taps', text: string) =>
    setRows(rows.map((row, n) => n === i ? { ...row, [field]: text } : row))
  const add = () => {
    const max = Math.max(0, ...rows.map(r => Number(r.remaining) || 0))
    const next = max < WORDHUNT_RULES.targetMax ? max + 1 :
      Array.from({ length: WORDHUNT_RULES.targetMax }, (_, i) => i + 1).find(n => !rows.some(r => Number(r.remaining) === n))
    if (next) setRows([...rows, { remaining: String(next), taps: '100' }])
  }
  return <fieldset className="wordhunt-hint-settings">
    <legend>Aiutino con i tap</legend>
    <p className="text-muted small">L’indizio arriva dopo 20 secondi oppure al raggiungimento dei tap. Sopra l’ultimo scaglione l’aiutino è spento.</p>
    {rows.length > 0 && <table>
      <thead><tr><th>Rimaste, fino a</th><th>Tap per indizio</th><th /></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>
        <td><input type="number" min={1} max={WORDHUNT_RULES.targetMax} aria-label={`Parole rimaste, scaglione ${i+1}`}
          value={r.remaining} onChange={e => change(i, 'remaining', e.target.value)} /></td>
        <td><input type="number" min={1} max={WORDHUNT_MAX_HINT_TAPS} aria-label={`Tap, scaglione ${i+1}`}
          value={r.taps} onChange={e => change(i, 'taps', e.target.value)} /></td>
        <td><button type="button" className="btn btn--small" aria-label={`Rimuovi scaglione ${i+1}`}
          onClick={() => setRows(rows.filter((_, n) => n !== i))}>×</button></td>
      </tr>)}</tbody>
    </table>}
    {!rows.length && <p className="small">Aiutino spento per tutte le parole.</p>}
    {!tiers && <p className="small" role="alert">Per ogni scaglione scegli un limite distinto tra 1 e 24 parole e un numero intero tra 1 e 1.000.000 di tap.</p>}
    <button className="btn btn--small" type="button" disabled={rows.length >= WORDHUNT_RULES.targetMax} onClick={add}>Aggiungi scaglione</button>{' '}
    <button className="btn btn--small" type="button" disabled={!tiers || tiers.map(t => `${t.remaining}:${t.taps}`).join(',') === value} onClick={() => save(encoded)}>Applica</button>
  </fieldset>
}
