import { useState } from 'react'
import { hostsLine, overlayUrl } from '../overlayKey'

export function SetupPage() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the field below stays selectable by hand.
    }
  }

  return (
    <div className="setup">
      <h1>Overlay setup</h1>
      <p className="text-muted">
        One link for every game. Add it once as a browser source in OBS or TikTok LIVE Studio, sized 1080 × 1920
        (1920 × 1080 for a landscape scene): when you pick another game here, the overlay switches by itself.
      </p>
      <div className="url-box">
        <input type="text" readOnly value={overlayUrl} aria-label="Overlay link" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn btn--primary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {hostsLine && (
        <p className="setup-warning small">
          This link won't open yet: the Windows hosts file needs the line <code>{hostsLine}</code>. Restart Zerocade
          and accept the administrator prompt, or add the line by hand to C:\Windows\System32\drivers\etc\hosts.
        </p>
      )}
      <p className="text-muted small">
        The link stays the same whatever browser opens this dashboard. It works on this PC only, while Zerocade is
        running.
      </p>
    </div>
  )
}
