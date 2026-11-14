// State is committed immediately; only repaint notifications may coalesce. Live
// event consumers (the engine, counters) subscribe to the transport directly.
export function frameNotifications(publish: () => void,
  schedule: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
  cancel: (id: number) => void = (id) => cancelAnimationFrame(id)) {
  let frame: number | null = null
  return {
    notify() {
      if (frame === null) frame = schedule(() => { frame = null; publish() })
    },
    cancel() { if (frame !== null) cancel(frame); frame = null },
  }
}
