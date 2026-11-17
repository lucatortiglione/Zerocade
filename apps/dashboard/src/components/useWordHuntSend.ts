import { useRef, useState } from 'react'
import type { WordHuntCommand, WordHuntReply } from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'

// The commands of ZeroWordHunt from the dashboard: each carries the version the director saw, so a click on an old state does nothing
// and says so (DIRETTIVE §13); after a deadline without an answer the outcome is unknown, and it is said so (DIRETTIVE §5, §7).

const ACK_TIMEOUT_MS = 5000

export const WORDHUNT_ERRORS: Record<string, string> = {
  'stale-version': 'Lo stato è cambiato: riprova.',
  'wrong-phase': 'Non si può fare in questo momento.',
  'bad-input': 'Dati non validi.',
  'no-dictionary': 'Il dizionario non è disponibile: usa la griglia di riferimento.',
  'generation-failed': 'Non sono riuscito a generare una griglia valida: riprova con un altro seme.',
  'not-found': 'Parola non trovata.',
  unavailable: 'Non disponibile: controlla il registro del server.',
}

// Omit does not distribute over a union: each command keeps its own fields.
export type WithoutVersion<T> = T extends unknown ? Omit<T, 'expectedVersion'> : never
export type WordHuntSend = (command: WithoutVersion<WordHuntCommand>) => Promise<WordHuntReply>

export function useWordHuntSend(): { send: WordHuntSend; message: string | null } {
  const { wordhunt } = useDashboard()
  const [message, setMessage] = useState<string | null>(null)
  // The version the director sees now: read when a button is pressed.
  const version = useRef(0)
  version.current = wordhunt?.version ?? 0
  const send: WordHuntSend = (command) =>
    new Promise<WordHuntReply>((resolve) => {
      let settled = false
      const finish = (reply: WordHuntReply, text: string | null) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        setMessage(text)
        resolve(reply)
      }
      const timer = window.setTimeout(
        () => finish({ ok: false, error: 'unavailable', message: 'Esito sconosciuto.' }, 'Esito sconosciuto: nessuna risposta dal server. Controlla lo stato prima di ripetere il comando.'),
        ACK_TIMEOUT_MS,
      )
      socket.emit('wordhunt:control', { ...command, expectedVersion: version.current } as WordHuntCommand, (reply: WordHuntReply) => {
        finish(reply, reply.ok ? null : WORDHUNT_ERRORS[reply.error] ?? reply.message)
      })
    })
  return { send, message }
}
