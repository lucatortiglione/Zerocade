import { LiveSocket } from '@zerocade/browser-runtime'
import { overlayKey } from './overlayKey'

export const socket = new LiveSocket(window.location.origin, { clientType: 'dashboard', key: overlayKey })
