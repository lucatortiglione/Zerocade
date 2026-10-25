import type { GameInstance } from './engine'

interface Obstacle {
  x: number
  w: number
  h: number
}

export function createLunarDash(): GameInstance {
  let width = 0
  let height = 0
  let groundY = 0
  let playerY = 0
  let playerVy = 0
  let obstacles: Obstacle[] = []
  let speedTimer = 0
  let shield = 0
  let score = 0
  let night = true
  let stars: { x: number; y: number; s: number }[] = []

  return {
    reset(settings, w, h) {
      width = w
      height = h
      groundY = h * 0.8
      night = settings.night !== false
      obstacles = []
      stars = []
      for (let i = 0; i < 60; i++) {
        stars.push({ x: Math.random() * w, y: Math.random() * h * 0.7, s: Math.random() * 2 + 1 })
      }
      score = 0
      speedTimer = 0
      shield = 0
      playerY = groundY
      playerVy = 0
    },
    onAction(action, _event) {
      if (action === 'jump') {
        if (playerY >= groundY) playerVy = -720
      } else if (action === 'power') {
        shield = 3
      } else if (action === 'obstacle') {
        obstacles.push({ x: width + 40, w: 40 + Math.random() * 40, h: 60 + Math.random() * 80 })
      } else if (action === 'speed') {
        speedTimer = 2.5
      }
    },
    update(dt, _now, settings) {
      night = settings.night !== false
      const base = typeof settings.speed === 'number' ? settings.speed : 360
      const boost = speedTimer > 0 ? 1.6 : 1
      speedTimer = Math.max(0, speedTimer - dt)
      shield = Math.max(0, shield - dt)
      const cur = base * boost
      score += cur * dt * 0.1

      playerVy += 1800 * dt
      playerY += playerVy * dt
      if (playerY >= groundY) {
        playerY = groundY
        playerVy = 0
      }

      for (const o of obstacles) o.x -= cur * dt
      obstacles = obstacles.filter((o) => o.x + o.w > -20)

      if (Math.random() < dt * 0.6 && obstacles.length < 8) {
        obstacles.push({ x: width + 40, w: 40 + Math.random() * 40, h: 60 + Math.random() * 80 })
      }

      const px = width * 0.2
      const pr = 26
      for (const o of obstacles) {
        const oy = groundY - o.h
        const hit = px + pr > o.x && px - pr < o.x + o.w && groundY > oy
        if (hit) {
          obstacles = obstacles.filter((x) => x !== o)
          if (shield > 0) {
            // Shielded: obstacle is destroyed with no penalty.
          } else {
            score = Math.max(0, score - 500)
          }
        }
      }
    },
    draw(ctx, _now) {
      ctx.clearRect(0, 0, width, height)
      const g = ctx.createLinearGradient(0, 0, 0, height)
      if (night) {
        g.addColorStop(0, '#0a1a2f')
        g.addColorStop(1, '#16324a')
      } else {
        g.addColorStop(0, '#7fd4ff')
        g.addColorStop(1, '#cfefff')
      }
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)

      if (night) {
        ctx.fillStyle = '#ffffff'
        for (const s of stars) {
          ctx.globalAlpha = 0.6
          ctx.fillRect(s.x, s.y, s.s, s.s)
        }
        ctx.globalAlpha = 1
      }

      ctx.fillStyle = night ? '#2b1f4a' : '#3fae6a'
      ctx.fillRect(0, groundY, width, height - groundY)

      ctx.fillStyle = night ? '#c084fc' : '#d97706'
      for (const o of obstacles) ctx.fillRect(o.x, groundY - o.h, o.w, o.h)

      const px = width * 0.2
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      if (shield > 0) {
        ctx.fillStyle = '#3ccf7a'
        ctx.beginPath()
        ctx.arc(px, playerY - 30, 40, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.font = '44px system-ui'
      ctx.fillText('🌙', px, playerY)

      ctx.fillStyle = '#ffffff'
      ctx.font = '26px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText(`Score ${Math.floor(score)}`, 20, 46)
      if (speedTimer > 0) {
        ctx.fillStyle = '#3ccf7a'
        ctx.fillText('BOOST', 20, 80)
      }
    },
  }
}
