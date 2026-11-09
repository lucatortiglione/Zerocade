// Shared circular avatar renderer, used by the quiz/picture games.
const avatarCache = new Map<string, HTMLImageElement>()

// The viewer's picture in a ringed disc. Without one (Twitch), or until it loads, a grey
// disc, with the viewer's initial when `name` is given.
export function drawAvatar(ctx: CanvasRenderingContext2D, url: string | undefined, x: number, y: number, r: number, name?: string) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  let img = url ? avatarCache.get(url) : undefined
  if (url && !img) {
    img = new Image()
    // Like the pictures in the page (referrerPolicy="no-referrer"): TikTok's picture server
    // can turn away a request that comes with another site's address.
    img.referrerPolicy = 'no-referrer'
    img.src = url
    avatarCache.set(url, img)
  }
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = '#3a3a44'
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    if (name) {
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.round(r)}px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(name.charAt(0).toUpperCase(), x, y)
    }
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#3ccf7a'
  ctx.lineWidth = 2
  ctx.stroke()
}

// A line of text centred on x, with the viewer's picture just before their name in it
// ("🏆 <picture> luna ha indovinato!"). The picture is sized on the current font.
export function fillTextWithAvatar(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  who: { nickname: string; avatar?: string },
) {
  // The font size may have decimals ("bold 20.77px …"): read all of it, not just its last digits.
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 20)
  const r = size * 0.6
  const gap = size * 0.3
  const at = Math.max(0, text.indexOf(who.nickname))
  const before = text.slice(0, at)
  const after = text.slice(at)
  const beforeWidth = ctx.measureText(before).width
  const left = x - (beforeWidth + r * 2 + gap + ctx.measureText(after).width) / 2
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillText(before, left, y)
  ctx.fillText(after, left + beforeWidth + r * 2 + gap, y)
  drawAvatar(ctx, who.avatar, left + beforeWidth + r, ctx.textBaseline === 'middle' ? y : y - size * 0.35, r, who.nickname)
  ctx.restore()
}
