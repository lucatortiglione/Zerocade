import { readCurve } from './files.js'

// The difficulty curve and matrix of gioco-parole/tools/curve.json (ALGORITMO.md explains
// every value). Levels never run out: the ramp of the sawtooth and the growth of wheels and
// grids level off instead of ending at a last level.

export type ArchetypeId = 'A' | 'B' | 'C' | 'D'

export interface Archetype {
  words: number
  wheelBonus?: number
  areaPerWord: number
  crossRatio: number
  prefix: number
  maxCycles: number
  hardCycles: boolean
  cycleReward: boolean
  baitRatio: number
  longShare?: number
  bridgeRank?: [number, number]
  cycleShare?: number
}

export interface Curve {
  levelsPerChapter: number
  packLevels: number
  tooth: { length: number; shape: number[]; ramp: [number, number]; rampTeeth: number; archetypes: ArchetypeId[] }
  growthLevels: number
  wheelGrowthLevels: number
  wheel: [number, number]
  words: [number, number]
  aspect: number
  maxRows: number
  maxCols: number
  tolerance: number
  attempts: number
  archetypes: Record<ArchetypeId, Archetype>
  cost: { crossRatio: number; prefix: number; cycles: number; aspect: number }
  rarity: { seedZipf: number; wordRank: [number, number]; gain: number }
  variants: { easy: number; expert: number; steps: number; minGap: number }
  solver: {
    alpha: number
    beta: number
    input: number
    gamma: number
    lambda: number
    eta: { first: number; second: number; rareConsonant: number; consonant: number; vowel: number; last: number }
    k: [number, number, number]
    scale: [number, number]
  }
}

export const CURVE = readCurve<Curve>()

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// T(c, i) of level n (1-based): position i in tooth c. The ramp approaches ramp[1] tooth after
// tooth (63% of the way after rampTeeth teeth), so the sawtooth goes on for ever.
export function target(level: number): { T: number; arche: ArchetypeId } {
  const tooth = CURVE.tooth
  const c = Math.floor((level - 1) / tooth.length)
  const i = (level - 1) % tooth.length
  const ramp = lerp(tooth.ramp[0], tooth.ramp[1], 1 - Math.exp(-c / tooth.rampTeeth))
  return { T: clamp(tooth.shape[i] + ramp, 0, 100), arche: tooth.archetypes[i] }
}

// Wheel letters and grid words, growing towards their maximum (63% of the way after
// wheelGrowthLevels and growthLevels levels).
export function size(level: number, arche: ArchetypeId): { wheel: number; words: number } {
  const grow = (levels: number) => 1 - Math.exp(-(level - 1) / levels)
  const a = CURVE.archetypes[arche]
  const wheel = Math.round(lerp(CURVE.wheel[0], CURVE.wheel[1], grow(CURVE.wheelGrowthLevels))) + (a.wheelBonus ?? 0)
  return {
    wheel: Math.min(CURVE.wheel[1], wheel),
    words: Math.round(lerp(CURVE.words[0], CURVE.words[1], grow(CURVE.growthLevels)) * a.words),
  }
}

// Rows and columns of the board an archetype is built on, portrait as CURVE.aspect.
export function matrix(words: number, longest: number, arche: ArchetypeId): { rows: number; cols: number } {
  const cells = words * CURVE.archetypes[arche].areaPerWord
  const rows = clamp(Math.round(Math.sqrt(cells * CURVE.aspect)), longest, CURVE.maxRows)
  const cols = clamp(Math.round(cells / rows), longest, CURVE.maxCols)
  return { rows, cols }
}
