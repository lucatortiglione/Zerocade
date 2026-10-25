// Shared circular avatar renderer, used by the quiz/picture games.
const avatarCache = new Map<string, HTMLImageElement>()

export function drawAvatar(ctx: CanvasRenderingContext2D, url: string | undefined, x: number, y: number, r: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  if (url) {
    let img = avatarCache.get(url)
    if (!img) {
      img = new Image()
      img.src = url
      avatarCache.set(url, img)
    }
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2)
    } else {
      ctx.fillStyle = '#3a3a44'
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  } else {
    ctx.fillStyle = '#3a3a44'
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#3ccf7a'
  ctx.lineWidth = 2
  ctx.stroke()
}