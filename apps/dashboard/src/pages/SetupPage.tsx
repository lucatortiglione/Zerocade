import { useState } from 'react'
import { overlayUrl } from '../overlayKey'

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
        Add this link as a browser source in TikTok LIVE Studio or OBS, sized 1080 × 1920.
      </p>
      <div className="url-box">
        <input type="text" readOnly value={overlayUrl} aria-label="Overlay link" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn btn--primary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="setup__warning">Keep this link private: for now, anyone who has it can control your overlay.</p>
    </div>
  )
}
