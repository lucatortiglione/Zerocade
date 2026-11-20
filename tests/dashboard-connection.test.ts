import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { connectionLabels, connectionStatus } from '../apps/dashboard/src/connectionStatus.ts'
import type { BridgeStatus, SourceStatus } from '@zerocade/shared'

const twitch: SourceStatus = { kind: 'twitch', username: 'studio', state: 'connected' }
const bridge: BridgeStatus = { enabled: true, port: 8780, state: 'connected', tiktok: '', twitch: '' }

test('a Twitch chat connection is reported as a connected source', () => {
  const status = connectionStatus({ connected: true, sources: { twitch }, bridge: null })
  assert.equal(connectionLabels[status], 'Sorgente collegata')
})

test('a retrying bridge is visible unless another source is already connected', () => {
  const retrying = { ...bridge, state: 'connecting' as const }
  assert.equal(connectionStatus({ connected: true, sources: {}, bridge: retrying }), 'connecting')
  assert.equal(connectionStatus({ connected: true, sources: { twitch }, bridge: retrying }), 'connected')
})

test('the bridge needs an upstream account to report a connected source', () => {
  assert.equal(connectionStatus({ connected: true, sources: {}, bridge }), 'idle')
  assert.equal(connectionStatus({ connected: true, sources: {}, bridge: { ...bridge, tiktok: 'studio' } }), 'connected')
})

test('a disconnected dashboard drops its sources before a server with no sources reconnects', async (t) => {
  // Supply the socket events and read the React snapshot without starting a browser worker.
  const transport = 'data:text/javascript,' + encodeURIComponent(
    "import { EventEmitter } from 'node:events'; export const socket = new EventEmitter()",
  )
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/dashboard/src/store.ts')) {
      if (specifier === './socket') return { url: transport, shortCircuit: true }
      if (specifier === 'react') return { url: 'data:text/javascript,export const useSyncExternalStore = (_, read) => read()', shortCircuit: true }
    }
    return next(specifier, context)
  } })
  t.after(() => hooks.deregister())
  const { useDashboard } = await import('../apps/dashboard/src/store.ts')
  const { socket } = await import(transport)
  const previousFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
  Object.defineProperty(globalThis, 'requestAnimationFrame', { value: () => 1, configurable: true })
  t.after(() => {
    if (previousFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', previousFrame)
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
  })
  socket.emit('connect')
  socket.emit('source:status', twitch)
  socket.emit('bridge:status', { ...bridge, twitch: 'studio' })
  assert.equal(connectionStatus(useDashboard()), 'connected')
  socket.emit('disconnect', 'transport close')
  assert.equal(connectionStatus(useDashboard()), 'offline')
  assert.deepEqual(useDashboard().sources, {})
  assert.equal(useDashboard().bridge, null)
  socket.emit('connect')
  assert.equal(connectionStatus(useDashboard()), 'idle')
})
