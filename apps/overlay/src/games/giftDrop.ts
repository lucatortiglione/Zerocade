import { TIER_COLORS, giftById, type LiveEvent } from '@zerocade/shared'
import type { GameInstance } from './engine'

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  emoji: string
  color: string
  rot: number
  vr: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  size: number
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

const giftMeta = (event: LiveEvent) => {
  if (event.type === 'gift') {
    const gift = giftById(event.giftId)
    return {
      emoji: gift?.emoji ?? '🎁',
      coins: gift?.coins ?? 1,
      color: gift ? TIER_COLORS[gift.tier] : '#7c5cff',
    }
  }
  return { emoji: '🎁', coins: 1, color: '#7c5cff' }
}

export function createGiftDrop(): GameInstance {
  let balls: Ball[] = []
  let particles: Particle[] = []
  let width = 0
  let height = 0

  const floor = () => height - 28

  const spawnBall = (emoji: string, color: string, coins: number, count: number) => {
    const r = 16 + Math.min(64, coins * 0.05) * Math.max(1, Math.min(count, 10))
    balls.push({
      x: rnd(r, width - r),
      y: -r,
      vx: rnd(-40, 40),
      vy: 0,
      r,
      emoji,
      color,
      rot: rnd(0, Math.PI * 2),
      vr: rnd(-2, 2),
    })
  }

  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2)
      const s = rnd(60, 260)
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 0.9), color, size: rnd(2, 6) })
    }
  }

  return {
    reset(_settings, w, h) {
      width = w
      height = h
      balls = []
      particles = []
    },
    onAction(action, event) {
      if (action === 'drop') {
        const { emoji, coins, color } = giftMeta(event)
        spawnBall(emoji, color, coins, event.type === 'gift' ? event.count : 1)
      } else if (action === 'rain') {
        for (let i = 0; i < 40; i++) {
          particles.push({
            x: rnd(0, width),
            y: rnd(-height * 0.2, 0),
            vx: rnd(-30, 30),
            vy: rnd(120, 320),
            life: rnd(1.2, 2.4),
            color: '#ff5c8a',
            size: rnd(4, 9),
          })
        }
      } else if (action === 'boost') {
        for (const b of balls) b.vy -= rnd(500, 700)
      } else if (action === 'bomb') {
        const x = rnd(0, width)
        const y = rnd(height * 0.3, height * 0.7)
        burst(x, y, '#ffd54a', 30)
        balls = balls.filter((b) => Math.hypot(b.x - x, b.y - y) > 180)
      }
    },
    update(dt, _now, settings) {
      const gravity = typeof settings.gravity === 'number' ? settings.gravity : 900
      for (const b of balls) {
        b.vy += gravity * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.rot += b.vr * dt
        if (b.x - b.r < 0) {
          b.x = b.r
          b.vx *= -0.5
        }
        if (b.x + b.r > width) {
          b.x = width - b.r
          b.vx *= -0.5
        }
        if (b.y + b.r > floor()) {
          b.y = floor() - b.r
          b.vy *= -0.45
          b.vx *= 0.92
        }
      }
      for (const p of particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 300 * dt
        p.life -= dt
      }
      particles = particles.filter((p) => p.life > 0)
    },
    draw(ctx, _now) {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      for (const b of balls) {
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(b.rot)
        ctx.fillStyle = b.color
        ctx.beginPath()
        ctx.arc(0, 0, b.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = `${Math.round(b.r * 1.2)}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(b.emoji, 0, 0)
        ctx.restore()
      }
    },
  }
}
