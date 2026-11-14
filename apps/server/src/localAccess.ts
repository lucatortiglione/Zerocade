const HOST = /^(localhost|127\.0\.0\.1|\[::1\]|zerocade\.test)(:\d{1,5})?$/

// Loopback binding and Host validation prevent DNS rebinding. Origin validation
// additionally rejects browser requests made by an unrelated external website.
export function localAccess(host: string | undefined, origin: string | undefined, port: number): boolean {
  if (!host || !HOST.test(host)) return false
  if (origin === undefined) return true // local CLI clients do not send Origin
  try {
    const url = new URL(origin)
    if (url.origin !== origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return false
    if (!['localhost', '127.0.0.1', '[::1]', 'zerocade.test'].includes(url.hostname)) return false
    return [port, 5173, 5174].includes(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))
  } catch { return false }
}
