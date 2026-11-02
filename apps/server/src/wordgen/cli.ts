import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CURVE, size, target } from './curve.js'
import { packsDir } from './files.js'
import { Generator, rngFrom, type GeneratedLevel } from './generator.js'

// The ZeroWords generator from the command line, for tuning and checking (the server makes
// its levels on the fly):
//   npm run wordgen -w @zerocade/server -- --only 1-40     these levels, one line each
//   npm run wordgen -w @zerocade/server -- --calibrate     raw difficulty spread, for solver.scale
//   npm run wordgen -w @zerocade/server -- --write [N]     levels 1..N (default curve packLevels)
//                                                         into gioco-parole/data/levels/it, for
//                                                         python tools/validate_levels.py

const PACK_SIZE = 100

function parseOnly(text: string): number[] {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const [a, b] = part.split('-').map(Number)
    for (let n = a; n <= (b || a); n++) out.add(n)
  }
  return [...out].sort((x, y) => x - y)
}

// Pack shape read by tools/validate_levels.py: the archetype among the metrics.
const packed = ({ archetype, metrics, ...level }: GeneratedLevel) => ({ ...level, metrics: { archetype, ...metrics } })

function line(level: GeneratedLevel, ms: number): string {
  const m = level.metrics
  const v = level.variants
  return [
    String(level.id).padStart(4),
    level.archetype,
    `T=${m.target.toFixed(1).padStart(5)}`,
    `D=${m.dsim.toFixed(1).padStart(5)}`,
    `wheel=${level.letters}`,
    `${level.rows}x${level.cols}`,
    `words=${m.words}`,
    `cross=${m.crossings}`,
    `cyc=${m.cycles}`,
    `bait=${m.bait}`,
    `easy=${v.easy.metrics.dsim}`,
    `expert=${v.expert.metrics.dsim}`,
    `${ms}ms`,
  ].join(' ')
}

function build(gen: Generator, n: number): GeneratedLevel {
  const level = gen.level(n)
  if (!level) throw new Error(`no grid for level ${n}`)
  return level
}

function run(ids: number[], write: boolean) {
  const gen = new Generator()
  const levels: GeneratedLevel[] = []
  const t0 = Date.now()
  for (const n of ids) {
    const t = Date.now()
    const level = build(gen, n)
    levels.push(level)
    if (!write) console.log(line(level, Date.now() - t))
    else if (n % 50 === 0) console.log(`  ${n} levels`)
  }
  const tol = CURVE.tolerance
  const hit = (target: number, dsim: number) => Math.abs(dsim - target) <= tol
  const count = (pick: (l: GeneratedLevel) => { target: number; dsim: number }) =>
    levels.filter((l) => hit(pick(l).target, pick(l).dsim)).length
  console.log(
    `${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)} s; within ±${tol} of their target: ` +
      `standard ${count((l) => l.metrics)}, easy ${count((l) => l.variants.easy.metrics)}, expert ${count((l) => l.variants.expert.metrics)}`,
  )
  if (!write) return
  mkdirSync(packsDir, { recursive: true })
  for (const f of readdirSync(packsDir)) if (/^pack_\d+\.json$/.test(f)) rmSync(join(packsDir, f))
  for (let i = 0; i < levels.length; i += PACK_SIZE) {
    const pack = i / PACK_SIZE + 1
    const doc = { version: 3, language: 'it', pack, levels: levels.slice(i, i + PACK_SIZE).map(packed) }
    writeFileSync(join(packsDir, `pack_${String(pack).padStart(3, '0')}.json`), JSON.stringify(doc) + '\n')
  }
  console.log(`-> ${packsDir}`)
}

function calibrate() {
  const gen = new Generator()
  const raws = new Map<string, number[]>()
  for (let n = 1; n <= CURVE.packLevels; n += 7) {
    const { arche } = target(n)
    const { wheel, words } = size(n, arche)
    for (const r of [0, 0.5, 1]) {
      const got = gen.attempt(n, arche, wheel, words, r, rngFrom(`calibrate:${n}:${r}`))
      if (got) raws.set(arche, [...(raws.get(arche) ?? []), got.sim!.raw])
    }
  }
  const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
  for (const [arche, xs] of [...raws].sort()) {
    xs.sort((a, b) => a - b)
    console.log(`${arche}: n=${xs.length} p5=${pct(xs, 0.05).toFixed(2)} p50=${pct(xs, 0.5).toFixed(2)} p95=${pct(xs, 0.95).toFixed(2)}`)
  }
  const every = [...raws.values()].flat().sort((a, b) => a - b)
  console.log(`all: p2=${pct(every, 0.02).toFixed(2)} p50=${pct(every, 0.5).toFixed(2)} p98=${pct(every, 0.98).toFixed(2)}`)
}

const args = process.argv.slice(2)
const flag = (name: string) => args.indexOf(name)
if (flag('--calibrate') >= 0) calibrate()
else if (flag('--only') >= 0) run(parseOnly(args[flag('--only') + 1] ?? '1-20'), false)
else if (flag('--write') >= 0) {
  const n = Number(args[flag('--write') + 1]) || CURVE.packLevels
  run(Array.from({ length: n }, (_, i) => i + 1), true)
} else {
  console.log('usage: --only 1-40 | --calibrate | --write [N]')
}
