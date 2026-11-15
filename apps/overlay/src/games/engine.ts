import type { GameCommand, GameSettings, LiveEvent } from '@zerocade/shared'
import { payloadBytes } from '@zerocade/shared'

// A small, dependency-free game loop. Games implement GameInstance and are swapped
// in when the dashboard selects a new game, without ever reloading the overlay.

export interface GameInstance {
  // Optional resources owned by a game (e.g. ZeroContext's worker).
  dispose?(): void
  onOverload?(): void
  // A game that can lose old chat events without harm (a burst after a throttled frame): when the engine's queue is
  // full the oldest actions are dropped and the game keeps running, instead of being stopped by onOverload.
  dropOldestOnOverflow?: boolean
  reset(settings: GameSettings, width: number, height: number): void
  // Games that cache settings can apply changes before the next frame's queued actions.
  setSettings?(settings: GameSettings): void
  setPaused?(paused: boolean): void
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

export const ENGINE_LIMITS = { actions: 300, commands: 10, bytes: 256 * 1024, players: 10_000 } as const
// How long without an animation frame before the timer steps the game instead (see start()).
export const ENGINE_HIDDEN_STEP_MS = 250

export class Engine {
  private ctx: CanvasRenderingContext2D
  private instance: GameInstance | null = null
  private actions: PendingAction[] = []
  private commands: GameCommand[] = []
  private settings: GameSettings = {}
  private raf = 0
  private ticker: ReturnType<typeof setInterval> | null = null
  private last = 0
  // A paused game keeps its last frame: no updates, no actions.
  private paused = false
  private running = false
  private queuedBytes = 0
  private players = new Set<string>()
  private fault: string | null = null
  private admissionStopped = false
  private droppedWarned = false

  private release() {
    const previous = this.instance
    this.instance = null
    try { previous?.dispose?.() }
    catch (error) { console.warn('[game-engine] Chiusura del gioco fallita', error) }
  }

  private clearQueues() {
    this.actions.length = 0
    this.commands.length = 0
    this.queuedBytes = 0
  }

  private fail(message: string, error?: unknown) {
    this.fault = message
    this.admissionStopped = true
    this.clearQueues()
    this.release()
    console.warn('[game-engine]', message, error ?? '')
  }

  private overload() {
    this.admissionStopped = true
    this.clearQueues()
    if (this.instance?.onOverload) {
      try { this.instance.onOverload() }
      catch (error) { this.fail('Troppi eventi in attesa. Riavvia il gioco.', error) }
    } else this.fail('Troppi eventi in attesa. Riavvia il gioco.')
  }

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  setGame(instance: GameInstance, settings: GameSettings) {
    if (this.instance !== instance) this.release()
    this.instance = instance
    this.settings = settings
    this.clearQueues()
    this.players.clear()
    this.fault = null
    this.admissionStopped = false
    try {
      instance.reset(settings, this.ctx.canvas.width, this.ctx.canvas.height)
      instance.setPaused?.(this.paused)
    } catch (error) { this.fail('Impossibile avviare il gioco. Riavvialo dalla regia.', error) }
  }

  // No canvas game (Bivio renders in the DOM, or the id is unknown): blank the canvas.
  clear() {
    this.release()
    this.clearQueues()
    this.players.clear()
    this.fault = null
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
  }

  setSettings(settings: GameSettings) {
    this.settings = settings
    try { this.instance?.setSettings?.(settings) }
    catch (error) { this.fail('Impossibile aggiornare il gioco. Riavvialo dalla regia.', error) }
  }

  setPaused(paused: boolean) {
    this.paused = paused
    try { this.instance?.setPaused?.(paused) }
    catch (error) { this.fail('Impossibile sospendere il gioco. Riavvialo dalla regia.', error) }
    if (paused) {
      this.clearQueues()
    }
  }

  pushAction(action: string, event: LiveEvent) {
    if (!this.instance || this.paused || this.admissionStopped) return
    const bytes = 3 * payloadBytes(event, ENGINE_LIMITS.bytes)
    if (this.actions.length >= ENGINE_LIMITS.actions || this.queuedBytes + bytes > ENGINE_LIMITS.bytes) {
      if (!this.instance.dropOldestOnOverflow || bytes > ENGINE_LIMITS.bytes) return this.overload()
      while (this.actions.length && (this.actions.length >= ENGINE_LIMITS.actions || this.queuedBytes + bytes > ENGINE_LIMITS.bytes)) {
        const gone = this.actions.shift()!
        this.queuedBytes -= 3 * payloadBytes(gone.event, ENGINE_LIMITS.bytes)
      }
      if (!this.droppedWarned) { this.droppedWarned = true; console.warn('[game-engine]', 'Coda piena: scartati gli eventi più vecchi.') }
    }
    if ('user' in event) {
      if (!this.players.has(event.user.id) && this.players.size >= ENGINE_LIMITS.players)
        return this.fail('Raggiunto il limite dei partecipanti. Riavvia il gioco.')
      this.players.add(event.user.id)
    }
    this.queuedBytes += bytes
    this.actions.push({ action, event, now: performance.now() })
  }

  // Like the actions, carried out in the next frame and dropped while paused.
  pushCommand(command: GameCommand) {
    if (!this.instance || this.paused || this.admissionStopped) return
    if (this.commands.length >= ENGINE_LIMITS.commands) {
      if (!this.instance.dropOldestOnOverflow) return this.overload()
      this.commands.shift()
    }
    this.commands.push(command)
  }

  // One step of the game: the queued commands and actions, then update and draw.
  private frame(now: number) {
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    const instance = this.instance
    try {
      if (instance) {
        if (!this.paused && !this.admissionStopped) {
          const commands = this.commands.splice(0)
          const actions = this.actions.splice(0)
          this.queuedBytes = 0
          for (const c of commands) {
            if (this.instance !== instance || this.paused) break
            instance.onCommand?.(c)
          }
          for (const a of actions) {
            if (this.instance !== instance || this.paused) break
            instance.onAction(a.action, a.event, a.now)
          }
          if (this.instance === instance && !this.paused) instance.update(dt, now, this.settings)
        }
        this.instance?.draw(this.ctx, now)
      }
    } catch (error) {
      this.fail('Il gioco si è interrotto. Riavvialo dalla regia.', error)
    }
    if (this.fault) {
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
      this.ctx.fillStyle = '#ffffff'
      this.ctx.font = '24px system-ui'
      this.ctx.textAlign = 'center'
      this.ctx.fillText(this.fault, this.ctx.canvas.width / 2, this.ctx.canvas.height / 2)
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      this.frame(now)
      if (this.running) this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
    // A browser source that is not on screen (another OBS scene, a background tab) gets no animation frames at all,
    // while the chat keeps coming over the socket: the queues would fill up and the game stop. A timer keeps the
    // game stepping while frames are missing; the moment they come back, the timer stands aside.
    const ticker = setInterval(() => {
      if (!this.running) return
      const now = performance.now()
      if (now - this.last >= ENGINE_HIDDEN_STEP_MS) this.frame(now)
    }, ENGINE_HIDDEN_STEP_MS)
    ;(ticker as unknown as { unref?: () => void }).unref?.()
    this.ticker = ticker
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    if (this.ticker !== null) { clearInterval(this.ticker); this.ticker = null }
    this.release()
    this.clearQueues()
    this.players.clear()
  }
}
