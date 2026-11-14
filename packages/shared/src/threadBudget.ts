// A conservative payload weight for bounded worker queues. Large strings are
// counted by length without serialising/copying them on the UI/server thread.
export function payloadBytes(value: unknown, stopAt = Number.MAX_SAFE_INTEGER): number {
  const pending = [value]
  const seen = new WeakSet<object>()
  let bytes = 0
  while (pending.length && bytes <= stopAt) {
    const item = pending.pop()
    if (typeof item === 'string') bytes += 32 + item.length * 2
    else if (item && typeof item === 'object') {
      if (seen.has(item)) continue
      seen.add(item)
      bytes += 64
      for (const [key, child] of Object.entries(item)) { bytes += 16 + key.length * 2; pending.push(child) }
    } else bytes += 16
  }
  return bytes
}
