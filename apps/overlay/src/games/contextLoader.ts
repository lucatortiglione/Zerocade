import { readBoundedBytes } from '@zerocade/shared'
import { CONTEXT_LIMITS, ContextError } from '@zerocade/shared'
import { parseContextData, type ContextData } from './contextRanking'

// Sequential reads keep just one growing download buffer alive. A single signal
// bounds the entire operation, including decoding and the last response body.
export async function loadContextData(origin: string, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<ContextData> {
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ContextError('data', 'Origine ZeroContext non valida.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new ContextError('timeout', 'Caricamento ZeroContext scaduto.')), CONTEXT_LIMITS.loadMs)
  const combined = AbortSignal.any([signal, controller.signal])
  const read = async (name: string, limit: number, optional = false) => {
    combined.throwIfAborted()
    let response: Response
    try { response = await fetchFn(new URL(`/api/context/${name}`, url.origin), { signal: combined, cache: 'no-store' }) }
    catch {
      combined.throwIfAborted()
      throw new ContextError('network', 'Connessione interrotta durante il caricamento di ZeroContext.')
    }
    if (!response.ok) {
      await response.body?.cancel()
      if (optional && response.status === 404) return null
      throw new ContextError(response.status >= 500 ? 'network' : 'data', `${name}: HTTP ${response.status}.`)
    }
    const bytes = await readBoundedBytes(response, limit)
    combined.throwIfAborted()
    return bytes
  }
  const decode = (bytes: Uint8Array) => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { throw new ContextError('data', 'Testo ZeroContext con codifica UTF-8 non valida.') }
  }
  try {
    const vocab = decode((await read('vocab.txt', CONTEXT_LIMITS.vocab))!)
    const secrets = decode((await read('secrets.txt', CONTEXT_LIMITS.secrets))!)
    const linked = await read('links.json', CONTEXT_LIMITS.links, true)
    const links: unknown = linked === null ? null : JSON.parse(decode(linked))
    const vectors = (await read('vectors.bin', CONTEXT_LIMITS.vectors))!
    combined.throwIfAborted()
    return parseContextData(vocab, vectors.buffer, secrets, links)
  } catch (error) {
    if (combined.aborted) throw new ContextError(signal.aborted ? 'closed' : 'timeout', signal.aborted ? 'Caricamento annullato.' : 'Caricamento ZeroContext scaduto.')
    if (error instanceof ContextError) throw error
    if (error instanceof TypeError) throw new ContextError('network', 'Connessione interrotta durante la lettura di ZeroContext.')
    throw new ContextError('data', 'Dati di ZeroContext illeggibili o oltre il limite consentito.')
  } finally { clearTimeout(timer); controller.abort() }
}
