import { useState, type CSSProperties } from 'react'
import type { Viewer } from '@zerocade/shared'

// The viewer's profile picture in a small disc, to sit next to their name; their initial on
// a colour of their own when there is none (Twitch) or it fails to load. Sized on the text
// around it (styles.css, .viewer-avatar).
export function ViewerAvatar({ viewer }: { viewer: Viewer }) {
  // The picture that failed, rather than a flag: the same widget can show someone else next.
  const [failed, setFailed] = useState('')
  const hue = [...viewer.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className="viewer-avatar" style={{ '--tint': `hsl(${hue} 55% 42%)` } as CSSProperties} aria-hidden="true">
      {viewer.nickname.charAt(0).toUpperCase()}
      {viewer.avatar && viewer.avatar !== failed && (
        <img src={viewer.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(viewer.avatar ?? '')} />
      )}
    </span>
  )
}
