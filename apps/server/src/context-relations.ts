import { createHash } from 'node:crypto'
import lexicon from './context-relations.json' with { type: 'json' }

type RelationKind = 'strumento' | 'parte' | 'azione'
function edgesOf(data: Record<string, string[][]>) {
  const edges = new Map<string, [string, RelationKind][]>()
  for (const [secret, rows] of Object.entries(data)) {
    edges.set(secret, rows.map(([word, kind]) => {
      if (!word || (kind !== 'strumento' && kind !== 'parte' && kind !== 'azione')) throw new Error('Relazione ZeroContext non valida')
      return [word, kind]
    }))
  }
  return edges
}
const ranking = edgesOf(lexicon.ranking)
const hints = edgesOf(lexicon.hints)

/** Only reviewed associations are offered as verbal clues. */
export function riordinoRelationClues(secret: string): readonly { word: string; kind: RelationKind }[] {
  return (hints.get(secret) ?? []).map(([word, kind]) => ({ word, kind }))
}

/** Called after playability filtering. Keep the base order where the dictionary
 * already confirms a candidate, then consider specific new lexical clues. */
export function rerankRiordino(vocab: readonly string[], pinned: Map<number, number[]>): string {
  const index = new Map(vocab.map((word, i) => [word, i]))
  const digest = createHash('sha256')
  for (const [secret, base] of pinned) {
    const edges = ranking.get(vocab[secret])
    let list = base
    if (edges?.length) {
      const lexical = new Set<number>()
      for (const [word] of edges) {
        const i = index.get(word)
        if (i !== undefined && i !== secret) lexical.add(i)
      }
      const first = [...new Set([...base.filter(i => lexical.has(i)), ...lexical])].slice(0, 3)
      if (first.length) {
        const promoted = new Set(first)
        list = [...first, ...base.filter(i => !promoted.has(i))].slice(0, base.length)
        pinned.set(secret, list)
      }
    }
    digest.update(`${secret}:${list.join(',')}\n`)
  }
  return digest.digest('hex')
}
