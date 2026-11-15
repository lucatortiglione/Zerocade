// A conservative payload weight for bounded worker queues. Large strings are
// counted by length without serialising/copying them on the UI/server thread.
export function payloadBytes(value: unknown, stopAt = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(stopAt) || stopAt < 0) throw new RangeError('Budget del payload non valido')
  // Iterators keep a wide object from duplicating all its properties in a work
  // queue before the budget can be checked. No recursion on untrusted depth.
  function* properties(item: object): Generator<unknown> {
    for (const key in item) if (Object.hasOwn(item, key)) {
      yield key
      yield Reflect.get(item, key)
    }
  }
  function* entries(item: Map<unknown, unknown>): Generator<unknown> {
    for (const [key, child] of item) { yield key; yield child }
  }
  const pending: Iterator<unknown>[] = [[value].values()]
  const seen = new WeakSet<object>()
  let bytes = 0
  while (pending.length && bytes <= stopAt) {
    const next = pending[pending.length - 1].next()
    if (next.done) { pending.pop(); continue }
    const item = next.value
    if (typeof item === 'string') bytes += 32 + item.length * 2
    else if (item && typeof item === 'object') {
      if (seen.has(item)) continue
      seen.add(item)
      bytes += 64
      if (item instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && item instanceof SharedArrayBuffer)) {
        bytes += item.byteLength
      } else if (ArrayBuffer.isView(item)) {
        // A view clones its whole backing buffer, not just its visible slice.
        pending.push([item.buffer].values())
      } else if (item instanceof Map) {
        bytes += item.size * 32
        if (bytes <= stopAt) pending.push(entries(item))
      } else if (item instanceof Set) {
        bytes += item.size * 16
        if (bytes <= stopAt) pending.push(item.values())
      } else {
        if (Array.isArray(item)) bytes += item.length * 8
        if (bytes <= stopAt) pending.push(properties(item))
      }
    } else bytes += 16
  }
  return bytes
}
