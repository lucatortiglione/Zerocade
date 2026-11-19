import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GAMES, defaultSettings, type GameSettings, type LiveEvent, type Viewer } from '@zerocade/shared'
import type { GameInstance } from '../../apps/overlay/src/games/engine.ts'

// Banco di prova dei giochi dell'overlay, senza schermo né rete (docs: riscrittura dell'overlay, Fase 0).
// Un gioco viene creato, fatto girare con la stessa chat e gli stessi tempi, e di ogni istante di controllo si registrano:
//  - `texts`: i testi disegnati, cioè quello che gli spettatori leggono. Una riscrittura non deve cambiarli.
//  - `trace`: l'impronta di tutte le chiamate di disegno (forme, colori, posizioni). Cambia quando cambia l'aspetto.
// Casualità e orologio sono fissi, quindi due esecuzioni danno lo stesso risultato.

export interface Checkpoint { at: number; texts: string[]; trace: string; calls: number }

const SEED_FILE = fileURLToPath(new URL('../../apps/server/src/content.seed.json', import.meta.url))
const WIDTH = 1080
const HEIGHT = 1920
const STEP = 0.1
export const CHECK_AT = [0.1, 3, 6, 12]

const round = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : typeof v === 'string' ? v : v === null || v === undefined ? '' : typeof v === 'object' ? '[obj]' : String(v))

class Recorder {
  texts: string[] = []
  calls = 0
  private hash = createHash('sha1')
  add(name: string, args: unknown[]) {
    this.calls++
    this.hash.update(name + '(' + args.map(round).join(',') + ')\n')
  }
  text(value: unknown) { this.texts.push(String(value)) }
  finish(): { texts: string[]; trace: string; calls: number } {
    const out = { texts: this.texts, trace: this.hash.copy().digest('hex').slice(0, 16), calls: this.calls }
    this.texts = []
    return out
  }
}

const METHODS = new Set(['fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
  'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip', 'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform',
  'drawImage', 'setLineDash', 'putImageData', 'fillText', 'strokeText'])

function recordingContext(rec: Recorder): CanvasRenderingContext2D {
  const state = new Map<string, unknown>()
  const gradient = (kind: string) => (...args: unknown[]) => { rec.add(kind, args); return { addColorStop: (...a: unknown[]) => rec.add('stop', a) } }
  return new Proxy({}, {
    get(_t, prop: string) {
      if (METHODS.has(prop)) return (...args: unknown[]) => { rec.add(prop, args); if (prop === 'fillText' || prop === 'strokeText') rec.text(args[0]) }
      if (prop === 'measureText') return (t: unknown) => ({ width: String(t).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(t).length * 10 })
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createConicGradient') return gradient(prop)
      if (prop === 'createPattern') return () => ({})
      if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      if (prop === 'canvas') return { width: WIDTH, height: HEIGHT }
      if (prop === 'isPointInPath') return () => false
      return state.get(prop)
    },
    set(_t, prop: string, value) { state.set(prop, value); rec.add('=' + prop, [value]); return true },
  }) as unknown as CanvasRenderingContext2D
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const VIEWERS: Viewer[] = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elisa', 'Fabio'].map((nickname, i) => ({ id: `u${i}`, nickname }))
const WORDS = ['ciao', 'a', 'casa', 'e', 'mare', 'r', 'sole', 's', 'luna', 'o', 'gatto', 'n', 'albero', 't', 'pizza', 'i', 'amore', 'l']

/** La chat dello scenario: a ogni mezzo secondo un messaggio, poi un regalo, un like e un follow. Uguale per tutti i giochi. */
function eventsAt(second: number, index: number): LiveEvent[] {
  const user = VIEWERS[index % VIEWERS.length]
  const events: LiveEvent[] = []
  if (Math.abs(second * 2 - Math.round(second * 2)) < 1e-9 && second > 0) events.push({ type: 'comment', user, text: WORDS[index % WORDS.length] })
  if (Math.abs(second - 4) < 1e-9) events.push({ type: 'gift', user, giftId: 'rose', count: 1 })
  if (Math.abs(second - 5) < 1e-9) events.push({ type: 'like', user, count: 3 })
  if (Math.abs(second - 7) < 1e-9) events.push({ type: 'follow', user })
  return events
}

let installed = false
function installBrowserStubs() {
  if (installed) return
  installed = true
  const store = new Map<string, string>()
  const g = globalThis as Record<string, unknown>
  // I timer dei giochi (nuovi tentativi, attese) non devono tenere vivo il processo dopo la prova: con un tentativo che si ripete per
  // sempre il test runner non terminerebbe, e la CI con lui.
  for (const name of ['setTimeout', 'setInterval'] as const) {
    const real = globalThis[name] as (...args: unknown[]) => { unref?: () => void }
    g[name] = (...args: unknown[]) => { const timer = real(...args); timer.unref?.(); return timer }
  }
  g.window = globalThis
  g.location = { search: '', href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', host: 'localhost', pathname: '/' }
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: unknown) => { store.set(k, String(v)) }, removeItem: (k: string) => { store.delete(k) } }
  g.Image = class { complete = true; width = 1; height = 1; onload?: () => void; onerror?: () => void; set src(_v: string) { setTimeout(() => this.onload?.(), 0) } }
  g.document = {
    createElement: () => ({ getContext: () => recordingContext(new Recorder()), style: {}, width: 0, height: 0, addEventListener() {}, setAttribute() {}, appendChild() {} }),
    addEventListener() {}, removeEventListener() {}, body: { appendChild() {}, style: {} }, documentElement: { style: {} },
    fonts: { load: async () => [], ready: Promise.resolve(), check: () => true }, hidden: false, visibilityState: 'visible',
  }
  g.requestAnimationFrame = () => 0
  g.cancelAnimationFrame = () => {}
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  g.Worker = class { postMessage() {} terminate() {} addEventListener() {} }
  g.fetch = async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/content')) return new Response(readFileSync(SEED_FILE, 'utf8'), { headers: { 'content-type': 'application/json' } })
    return new Response('', { status: 404 })
  }
}

export function characterizedGameIds(): string[] {
  const source = readFileSync(fileURLToPath(new URL('../../apps/overlay/src/games/registry.ts', import.meta.url)), 'utf8')
  const body = source.slice(source.indexOf('const registry'), source.indexOf('export const createGame'))
  return [...body.matchAll(/^\s*'?([a-z0-9-]+)'?:/gm)].map((m) => m[1])
}

/** Fa girare un gioco per 12 secondi di tempo simulato e restituisce i punti di controllo. `null` se il gioco non si può creare. */
export async function runScenario(id: string): Promise<Checkpoint[] | null> {
  installBrowserStubs()
  const realRandom = Math.random
  const realNow = Date.now
  const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now')
  let clock = 1_000_000
  Math.random = mulberry32(20261119)
  Date.now = () => clock
  Object.defineProperty(performance, 'now', { value: () => clock, configurable: true, writable: true })
  let game: GameInstance | null = null
  try {
    const content = await import('../../apps/overlay/src/content.ts')
    await content.loadContent(0)
    const { createGame } = await import('../../apps/overlay/src/games/registry.ts')
    game = createGame(id)
    if (!game) return null
    const settings: GameSettings = defaultSettings(GAMES.find((g) => g.id === id)?.settings ?? [])
    const rec = new Recorder()
    const ctx = recordingContext(rec)
    game.reset(settings, WIDTH, HEIGHT)
    const out: Checkpoint[] = []
    let index = 0
    const steps = Math.round(Math.max(...CHECK_AT) / STEP)
    for (let i = 1; i <= steps; i++) {
      const second = Math.round(i * STEP * 1000) / 1000
      clock = 1_000_000 + second * 1000
      for (const event of eventsAt(second, index)) { game.onAction(event.type === 'comment' ? 'comment' : event.type, event, clock); index++ }
      game.update(STEP, clock, settings)
      const at = CHECK_AT.find((c) => Math.abs(c - second) < 1e-9)
      if (at !== undefined) {
        game.draw(ctx, clock)
        out.push({ at, ...rec.finish() })
      }
    }
    return out
  } finally {
    game?.dispose?.()
    Math.random = realRandom
    Date.now = realNow
    if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor)
  }
}
