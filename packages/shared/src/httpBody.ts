export class BodyLimitError extends Error {
  readonly code = 'BODY_LIMIT'
  constructor(readonly limit: number) { super(`Risposta oltre il limite di ${limit} byte`) }
}

interface BodyResponse {
  headers: { get(name: string): string | null }
  body: { getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>
    cancel(reason?: unknown): Promise<void>
    releaseLock(): void
  } } | null
}

// A growing contiguous buffer avoids retaining one object per tiny frame. Its
// capacity never exceeds limit; growth and final trimming need at most another
// buffer of that size. Fetch's signal also bounds reading the response body.
export async function readBoundedBytes(response: BodyResponse, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Limite di risposta non valido')
  const declared = Number(response.headers.get('content-length'))
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array(0)
  let bytes = new Uint8Array(Math.min(limit, 8192))
  let length = 0
  try {
    if (Number.isFinite(declared) && declared > limit) throw new BodyLimitError(limit)
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      if (value.byteLength > limit - length) throw new BodyLimitError(limit)
      if (length + value.byteLength > bytes.length) {
        const grown = new Uint8Array(Math.min(limit, Math.max(length + value.byteLength, bytes.length * 2)))
        grown.set(bytes.subarray(0, length))
        bytes = grown
      }
      bytes.set(value, length)
      length += value.byteLength
    }
    return length === bytes.length ? bytes : bytes.slice(0, length)
  } finally {
    // Cancelling a fetch stream releases its network buffer, including failures.
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
