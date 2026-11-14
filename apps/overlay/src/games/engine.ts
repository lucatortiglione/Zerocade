import type { GameCommand, GameSettings, LiveEvent } from '@zerocade/shared'

// A small, dependency-free game loop. Games implement GameInstance and are swapped
// in when the dashboard selects a new game, without ever reloading the overlay.

export interface GameInstance {
  reset(settings: GameSettings, width: number, height: number): void
  onAction(action: string, event: LiveEvent, now: number): void
  // A command of the creator from the dashboard; a game without it ignores them.
  onCommand?(command: GameCommand): void
  update(dt: number, now: number, settings: GameSettings): void
  draw(ctx: CanvasRenderingContext2D, now: number): void
}

interface PendingAction {
  action: string
  event: LiveEvent
  now: number
}

export class Engine {
  private ctx: CanvasRenderingContext2D
  private instance: GameInstance | null = null
  private actions: PendingAction[] = []
  private commands: GameCommand[] = []
  private settings: GameSettings = {}
  private raf = 0
  private last = 0
  // A paused game keeps its last frame: no updates, no actions.
  private paused = false

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  setGame(instance: GameInstance, settings: GameSettings) {
    this.instance = instance
    this.settings = settings
    this.actions.length = 0
    this.commands.length = 0
    instance.reset(settings, this.ctx.canvas.width, this.ctx.canvas.height)
  }

  // No canvas game (Bivio renders in the DOM, or the id is unknown): blank the canvas.
  clear() {
    this.instance = null
    this.actions.length = 0
    this.commands.length = 0
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
  }

  setSettings(settings: GameSettings) {
    this.settings = settings
  }

  setPaused(paused: boolean) {
    this.paused = paused
    if (paused) {
      this.actions.length = 0
      this.commands.length = 0
    }
  }

  pushAction(action: string, event: LiveEvent) {
    if (!this.instance || this.paused) return
    this.actions.push({ action, event, now: performance.now() })
    if (this.actions.length > 300) this.actions.shift()
  }

  // Like the actions, carried out in the next frame and dropped while paused.
  pushCommand(command: GameCommand) {
    if (!this.instance || this.paused) return
    this.commands.push(command)
    if (this.commands.length > 10) this.commands.shift()
  }

  start() {
    this.last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.05)
      this.last = now
      if (this.instance) {
        if (!this.paused) {
          for (const c of this.commands) this.instance.onCommand?.(c)
          this.commands.length = 0
          for (const a of this.actions) this.instance.onAction(a.action, a.event, a.now)
          this.actions.length = 0
          this.instance.update(dt, now, this.settings)
        }
        this.instance.draw(this.ctx, now)
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.raf)
  }
}
