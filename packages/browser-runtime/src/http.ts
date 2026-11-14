import { readBoundedBytes } from '@zerocade/shared'

export class UnconfirmedRequestError extends Error {
  constructor(readonly outcome: 'not-started' | 'unknown' = 'unknown') { super(outcome === 'not-started'
    ? 'Operazione non avviata.' : 'Esito non confermato. Aggiorna i dati prima di riprovare.') }
}

// No automatic replay: a POST may already have committed when its reply is lost.
export async function apiFetch(input: string, init: RequestInit = {}, timeoutMs = 10_000, maxBytes = 2 * 1024 * 1024): Promise<Response> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  const writes = !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())
  if (signal.aborted && writes) throw new UnconfirmedRequestError('not-started')
  try {
    signal.throwIfAborted()
    const response = await fetch(input, { ...init, signal })
    signal.throwIfAborted()
    const bytes = await readBoundedBytes(response, maxBytes)
    signal.throwIfAborted()
    const headers = new Headers(response.headers)
    headers.delete('content-encoding')
    headers.delete('content-length')
    const body = [204, 205, 304].includes(response.status) ? null : bytes
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  } catch (error) {
    if (writes) throw new UnconfirmedRequestError()
    throw error
  }
}
