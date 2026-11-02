import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// TikTok LIVE Studio can give the browser source a window wider than its 1080 × 1920 canvas
// (about 3:4) and crop the sides. The scene is laid out in viewport units, so it would spread
// over that whole window and lose its edges. So this page only holds a frame, 9:16 (16:9 in a
// landscape window) and centred, and the overlay runs inside it with ?scene: there the
// viewport is exactly the scene, whatever window the source gets.
const url = new URL(window.location.href)
if (url.searchParams.has('scene')) {
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} else {
  url.searchParams.set('scene', '')
  document.body.classList.add('scene-host')
  const frame = document.createElement('iframe')
  frame.className = 'scene-frame'
  frame.title = 'Zerocade'
  frame.allow = 'autoplay'
  frame.src = url.href
  document.getElementById('root')!.append(frame)
}
