import { useRef, useState } from 'react'
import type { TabooCommand, TabooReply } from '@zerocade/shared'
import { socket } from '../socket'
import { useDashboard } from '../store'

// The commands of ZeroTaboo from the dashboard: each carries the version the director saw, so a click on an old state does nothing and
// says so (DIRETTIVE §13). Shared by the control column and the streamer's full-screen view.

const ACK_TIMEOUT_MS = 5000

export const TABOO_ERRORS: Record<string, string> = {
  'stale-version': 'Lo stato è cambiato: riprova.',
  'wrong-phase': 'Non si può fare in questo momento.',
  'no-active-card': 'Non c\'è una carta attiva.',
  'no-skips-left': 'Non restano skip in questo round.',
  'already-penalized': 'La penalità di questa carta è già stata applicata.',
  'bridge-missing': 'Collega ZeroFollowerBot: la partita vera usa solo i messaggi del suo ponte.',
  'bad-input': 'Dati non validi.',
  'too-many-reports': 'Troppe segnalazioni in attesa.',
  unavailable: 'Non disponibile: controlla il registro del server.',
}

// Omit does not distribute over a union: each command keeps its own fields.
export type WithoutVersion<T> = T extends unknown ? Omit<T, 'expectedVersion'> : never
export type TabooSend = (command: WithoutVersion<TabooCommand>) => Promise<TabooReply>

export function useTabooSend(): { send: TabooSend; message: string | null } {
  const { taboo } = useDashboard()
  const [message, setMessage] = useState<string | null>(null)
  // The version the director sees now: read when a button is pressed.
  const version = useRef(0)
  version.current = taboo?.version ?? 0
  const send: TabooSend = (command) =>
    new Promise<TabooReply>((resolve) => {
      // The transport answers late or never when the link is down: after a deadline the outcome is unknown, and it is said so (DIRETTIVE §5, §7).
      let settled = false
      const finish = (reply: TabooReply, text: string | null) => {
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
      socket.emit('taboo:control', { ...command, expectedVersion: version.current } as TabooCommand, (reply: TabooReply) => {
        finish(reply, reply.ok ? null : TABOO_ERRORS[reply.error] ?? reply.message)
      })
    })
  return { send, message }
}
