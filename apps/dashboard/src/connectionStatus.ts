import type { BridgeStatus, SourceKind, SourceStatus } from '@zerocade/shared'

interface Connection {
  connected: boolean
  sources: Partial<Record<SourceKind, SourceStatus>>
  bridge: BridgeStatus | null
}

export function connectionStatus({ connected, sources, bridge }: Connection) {
  if (!connected) return 'offline'
  const direct = Object.values(sources)
  if (direct.some((s) => s?.state === 'connected') || (bridge?.state === 'connected' && (bridge.tiktok || bridge.twitch))) return 'connected'
  if (bridge?.state === 'connecting' || direct.some((s) => s?.state === 'connecting')) return 'connecting'
  return 'idle'
}

export const connectionLabels = {
  offline: 'Server scollegato',
  connected: 'Sorgente collegata',
  connecting: 'Collegamento in corso…',
  idle: 'Nessuna sorgente',
}
