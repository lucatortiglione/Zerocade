// Orderly shutdown: the steps run one after the other (the reverse of how things were started), a step that fails
// is logged and the rest still run, and a step that never finishes cannot keep the process alive past `timeoutMs`.

export interface ShutdownStep {
  name: string
  run: () => unknown | Promise<unknown>
}

export interface ShutdownOptions {
  steps: ShutdownStep[]
  /** The whole shutdown is cut off after this long. */
  timeoutMs?: number
  exit: (code: number) => void
  log?: (message: string, error?: unknown) => void
}

/** Returns the function to call on a signal. Calling it again while the shutdown runs does nothing. */
export function createShutdown({ steps, timeoutMs = 5000, exit, log = () => {} }: ShutdownOptions) {
  let running: Promise<void> | null = null

  return (reason: string): Promise<void> => {
    running ??= (async () => {
      log(`shutting down (${reason})`)
      let failed = false
      let timer: NodeJS.Timeout | undefined
      const cutOff = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs)
        timer.unref?.()
      })
      const all = (async () => {
        for (const step of steps) {
          try {
            await step.run()
          } catch (err) {
            failed = true
            log(`shutdown step "${step.name}" failed`, err)
          }
        }
        return 'done' as const
      })()
      const outcome = await Promise.race([all, cutOff])
      clearTimeout(timer)
      if (outcome === 'timeout') log(`shutdown cut off after ${timeoutMs} ms`)
      exit(outcome === 'timeout' || failed ? 1 : 0)
    })()
    return running
  }
}
