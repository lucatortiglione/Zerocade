import { giftById, type Viewer } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { fillTextWithAvatar } from './avatar'

type Side = 'red' | 'blue'

interface Fighter {
  side: Side
  name: string
  // The viewer who joined this side, once one has.
  viewer?: Viewer
  hp: number
  hit: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

export function createMmaClash(): GameInstance {
  let width = 0
  let height = 0
  let red: Fighter = { side: 'red', name: 'RED', hp: 1, hit: 0 }
  let blue: Fighter = { side: 'blue', name: 'BLUE', hp: 1, hit: 0 }
  let sides = new Map<string, Side>()
  let round = 1
  let redWins = 0
  let blueWins = 0
  let rounds = 3
  let showNames = true
  let particles: Particle[] = []

  const cx = (side: Side) => (side === 'red' ? width * 0.28 : width * 0.72)
  const cy = () => height * 0.5

  const resetFighters = () => {
    red = { side: 'red', name: 'RED', hp: 1, hit: 0 }
    blue = { side: 'blue', name: 'BLUE', hp: 1, hit: 0 }
    sides = new Map()
  }

  return {
    reset(settings, w, h) {
      width = w
      height = h
      rounds = typeof settings.rounds === 'number' ? settings.rounds : 3
      showNames = settings.showNames !== false
      round = 1
      redWins = 0
      blueWins = 0
      particles = []
      resetFighters()
    },
    onAction(action, event, now) {
      const side = sides.get(event.user.id)
      if (action === 'join-red' || action === 'join-blue') {
        const s: Side = action === 'join-red' ? 'red' : 'blue'
        sides.set(event.user.id, s)
        const f = s === 'red' ? red : blue
        if (!f.viewer) {
          f.viewer = event.user
          f.name = event.user.nickname
        }
        return
      }
      if (action === 'punch') {
        const target = side === 'red' ? blue : side === 'blue' ? red : Math.random() < 0.5 ? red : blue
        const coins = event.type === 'gift' ? giftById(event.giftId)?.coins ?? 1 : 1
        target.hp = Math.max(0, target.hp - Math.min(0.25, 0.02 + coins * 0.0004))
        target.hit = now
        for (let i = 0; i < 12; i++) {
          particles.push({
            x: cx(target.side),
            y: cy(),
            vx: (Math.random() - 0.5) * 320,
            vy: (Math.random() - 0.5) * 320,
            life: 0.5,
            color: '#ffd54a',
          })
        }
      } else if (action === 'heal') {
        const f = side === 'red' ? red : blue
        f.hp = Math.min(1, f.hp + 0.12)
      }
    },
    update(dt, now, settings) {
      rounds = typeof settings.rounds === 'number' ? settings.rounds : rounds
      showNames = settings.showNames !== false
      for (const p of particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
      }
      particles = particles.filter((p) => p.life > 0)
      for (const f of [red, blue]) if (now - f.hit > 200) f.hit = 0

      if (red.hp <= 0 || blue.hp <= 0) {
        if (red.hp <= 0) blueWins++
        else redWins++
        if (round < rounds) round++
        resetFighters()
      }
    },
    draw(ctx, _now) {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#15151a'
      ctx.fillRect(0, height * 0.8, width, height * 0.2)

      const drawFighter = (f: Fighter) => {
        const x = cx(f.side)
        const y = cy()
        ctx.save()
        ctx.translate(x, y)
        ctx.fillStyle = f.side === 'red' ? '#ff5c5c' : '#5c8aff'
        ctx.beginPath()
        ctx.arc(0, 0, 64, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = '56px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🥊', 0, 0)
        ctx.restore()

        if (showNames) {
          ctx.fillStyle = '#f0f0f2'
          ctx.font = '22px system-ui'
          ctx.textAlign = 'center'
          if (f.viewer) fillTextWithAvatar(ctx, f.name, x, cy() + 96, f.viewer)
          else ctx.fillText(f.name, x, cy() + 96)
        }

        const bw = width * 0.3
        const bx = f.side === 'red' ? 24 : width - bw - 24
        ctx.fillStyle = '#00000055'
        ctx.fillRect(bx, 24, bw, 18)
        ctx.fillStyle = f.side === 'red' ? '#ff5c5c' : '#5c8aff'
        ctx.fillRect(bx, 24, bw * f.hp, 18)
      }

      drawFighter(red)
      drawFighter(blue)

      ctx.fillStyle = '#f0f0f2'
      ctx.font = '26px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`${redWins} : ${blueWins}`, width / 2, 60)
      ctx.fillStyle = '#8a8a96'
      ctx.font = '16px system-ui'
      ctx.fillText(`Round ${round}`, width / 2, 88)

      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}
