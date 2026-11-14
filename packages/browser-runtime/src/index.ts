import type { ClientToServerEvents, HandshakeAuth, ServerToClientEvents } from '@zerocade/shared'
import { payloadBytes } from '@zerocade/shared'
import type { TransportRequest, TransportResponse } from './protocol'
export { apiFetch, UnconfirmedRequestError } from './http'
export { frameNotifications } from './frameNotifications'

type Incoming = ServerToClientEvents & { connect(): void; disconnect(reason: string): void; connect_error(error: Error): void }
type Arguments<T> = T extends (...args: infer A) => unknown ? A : never
type Listener = (args: unknown[]) => void
export interface TransportWorker {
  postMessage(request: TransportRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<TransportResponse>) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  terminate(): void
}

// A typed Socket.IO facade. Network parsing and reconnection run in the worker;
// only application events and acknowledgements cross back to the UI thread.
export class LiveSocket {
  connected = false
  private worker: TransportWorker | null = null
  private listeners = new Map<string, Map<unknown, Listener>>()
  private acknowledgements = new Map<number, { call(args: unknown[]): void; timer: ReturnType<typeof setTimeout> }>()
  private serial = 0
  private deliveries = new Map<number, number>()
  private deliveryBytes = 0
  private stopped = false
  private restart: ReturnType<typeof setTimeout> | undefined
  private failures = 0

  constructor(private origin: string, private auth: HandshakeAuth,
    private spawn: () => TransportWorker = () => new Worker(new URL('./socket.worker.ts', import.meta.url), { type: 'module' })) {
    this.open()
  }

  on<K extends keyof Incoming>(event: K, listener: Incoming[K]): this {
    const listeners = this.listeners.get(event) ?? new Map<unknown, Listener>()
    // The transport carries unknown tuples; the public event map is the single
    // contract shared with the server. No casts escape this boundary.
    listeners.set(listener, (args) => Reflect.apply(listener, undefined, args))
    this.listeners.set(event, listeners)
    return this
  }
  off<K extends keyof Incoming>(event: K, listener: Incoming[K]): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }
  emit<K extends keyof ClientToServerEvents>(event: K, ...args: Arguments<ClientToServerEvents[K]>): this {
    const wire: unknown[] = [...args]
    let ack: number | undefined
    const last = wire.at(-1)
    const bytes = 3 * payloadBytes(typeof last === 'function' ? wire.slice(0, -1) : wire, 8 * 1024 * 1024)
    if (this.deliveries.size >= 256 || this.deliveryBytes + bytes > 8 * 1024 * 1024) {
      this.fault('Coda dei comandi piena: operazione non avviata.'); return this
    }
    if (typeof last === 'function') {
      if (this.acknowledgements.size >= 256) { this.fault('Troppe richieste in attesa di conferma.'); return this }
      wire.pop()
      ack = ++this.serial
      const id = ack
      const timer = setTimeout(() => { this.acknowledgements.delete(id); this.fault('Conferma del server non ricevuta.') }, 30_000)
      this.acknowledgements.set(id, { call: (values) => last(...values), timer })
    }
    const delivery = ++this.serial
    try {
      if (!this.worker) throw new Error('Connessione al server in ripristino.')
      this.deliveries.set(delivery, bytes)
      this.deliveryBytes += bytes
      this.worker.postMessage({ type: 'emit', delivery, event, args: wire, ...(ack !== undefined && { ack }) })
    } catch (error) {
      this.deliveryBytes -= this.deliveries.get(delivery) ?? 0
      this.deliveries.delete(delivery)
      if (ack !== undefined) { clearTimeout(this.acknowledgements.get(ack)?.timer); this.acknowledgements.delete(ack) }
      this.fault(error instanceof Error ? error.message : String(error))
    }
    return this
  }

  private dispatch(event: string, args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event)?.values() ?? [])]) listener(args)
  }
  private fault(message: string): void {
    console.error('[connessione]', message)
    this.dispatch('connect_error', [new Error(message)])
    this.dispatch('runtime:issue', [{ component: 'transport', message, at: Date.now() }])
  }
  private open(): void {
    if (this.stopped) return
    try {
      const worker = this.spawn()
      this.worker = worker
      worker.addEventListener('message', ({ data }) => {
        if (this.worker !== worker) return
        if (data.type === 'consumed') {
          this.deliveryBytes -= this.deliveries.get(data.delivery) ?? 0
          this.deliveries.delete(data.delivery)
          return
        }
        if (data.type === 'fault') { this.fault(data.message); return }
        if (data.type === 'ack') {
          const ack = this.acknowledgements.get(data.id)
          if (ack) { this.acknowledgements.delete(data.id); clearTimeout(ack.timer); ack.call(data.args) }
          return
        }
        try {
          if (data.event === 'connect') { this.connected = true; this.failures = 0 }
          else if (data.event === 'disconnect') this.connected = false
          if (data.event === 'connect_error') this.dispatch(data.event, [new Error(String(data.args[0]))])
          else this.dispatch(data.event, data.args)
        } finally { worker.postMessage({ type: 'received', delivery: data.delivery }) }
      })
      const failed = () => { if (this.worker === worker) this.recover() }
      worker.addEventListener('error', failed)
      worker.addEventListener('messageerror', failed)
      worker.postMessage({ type: 'open', origin: this.origin, auth: this.auth })
    } catch { this.recover() }
  }
  private recover(): void {
    this.worker?.terminate()
    this.worker = null
    this.connected = false
    this.dispatch('disconnect', ['Connessione interrotta'])
    this.fault('Connessione interrotta: riprovo automaticamente. I comandi senza conferma non vengono ripetuti.')
    for (const ack of this.acknowledgements.values()) clearTimeout(ack.timer)
    this.acknowledgements.clear()
    this.deliveries.clear()
    this.deliveryBytes = 0
    if (!this.stopped) this.restart = setTimeout(() => this.open(), Math.min(5000, 1000 * ++this.failures))
  }
  close(): void {
    this.stopped = true
    clearTimeout(this.restart)
    this.worker?.terminate()
    this.worker = null
    this.connected = false
    for (const ack of this.acknowledgements.values()) clearTimeout(ack.timer)
    this.acknowledgements.clear()
    this.deliveries.clear()
    this.deliveryBytes = 0
    this.listeners.clear()
  }
}
