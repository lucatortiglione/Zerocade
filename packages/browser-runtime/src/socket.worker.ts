import { io, type Socket } from 'socket.io-client'
import { payloadBytes } from '@zerocade/shared'
import type { TransportRequest, TransportResponse } from './protocol'

let socket: Socket | null = null
const waiting: Extract<TransportRequest, { type: 'emit' }>[] = []
let queuedBytes = 0
const post = (reply: TransportResponse) => globalThis.postMessage(reply)
const deliveries = new Map<number, number>()
let deliveryBytes = 0
let serial = 0
let overloaded = false
function incoming(event: string, args: unknown[]) {
  if (overloaded) return
  const bytes = 3 * payloadBytes(args, 32 * 1024 * 1024)
  if (deliveries.size >= 256 || deliveryBytes + bytes > 32 * 1024 * 1024) {
    overloaded = true
    post({ type: 'fault', message: 'Interfaccia sovraccarica: flusso fermato. Ricarica la pagina per sincronizzare lo stato; alcuni eventi live non sono stati elaborati.' })
    socket?.disconnect()
    return
  }
  const delivery = ++serial
  deliveries.set(delivery, bytes)
  deliveryBytes += bytes
  post({ type: 'event', delivery, event, args })
}
const send = (request: Extract<TransportRequest, { type: 'emit' }>) => {
  if (!socket?.connected) {
    const bytes = 3 * payloadBytes(request.args, 8 * 1024 * 1024)
    if (waiting.length >= 256 || queuedBytes + bytes > 8 * 1024 * 1024) { post({ type: 'fault', message: 'Connessione assente: coda dei comandi piena.' }); return }
    waiting.push(request)
    queuedBytes += bytes
    return
  }
  if (request.ack === undefined) socket.emit(request.event, ...request.args)
  else socket.timeout(25_000).emit(request.event, ...request.args, (error: Error | null, ...args: unknown[]) => {
    if (!error) post({ type: 'ack', id: request.ack!, args })
    else post({ type: 'fault', message: 'Conferma del server non ricevuta: esito del comando sconosciuto.' })
  })
}

globalThis.addEventListener('message', (event: MessageEvent<TransportRequest>) => {
  const request = event.data
  if (request.type === 'received') {
    deliveryBytes -= deliveries.get(request.delivery) ?? 0
    deliveries.delete(request.delivery)
    return
  }
  if (request.type === 'close') { socket?.disconnect(); socket = null; waiting.length = 0; queuedBytes = 0; return }
  if (request.type === 'emit') {
    try {
      if (!overloaded) send(request)
      else post({ type: 'fault', message: 'Flusso fermato per sovraccarico: comando non avviato. Ricarica la pagina.' })
    }
    finally { post({ type: 'consumed', delivery: request.delivery }) }
    return
  }
  if (socket) return
  socket = io(request.origin, { path: '/socket.io', transports: ['websocket'], auth: request.auth })
  socket.onAny((event: string, ...args: unknown[]) => incoming(event, args))
  socket.on('connect', () => {
    incoming('connect', [])
    const pending = waiting.splice(0)
    queuedBytes = 0
    for (const command of pending) send(command)
  })
  socket.on('disconnect', (reason) => {
    if (overloaded) post({ type: 'event', delivery: ++serial, event: 'disconnect', args: [reason] })
    else incoming('disconnect', [reason])
  })
  socket.on('connect_error', (error: Error) => incoming('connect_error', [error.message]))
})
