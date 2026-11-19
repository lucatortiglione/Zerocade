import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { rankAgainst } from '@zerocade/shared/contextRanking'

// Lo stesso caso piccolo, con gli ordini ragionati a mano dagli angoli, lo legge il valutatore Python
// (gioco-zerocontext/valutazione/test_gold_profiles_ranking.py): se i due ranking divergono, falliscono entrambi.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/context-evaluation-parity.json', import.meta.url), 'utf8')) as {
  dim: number
  words: number
  vectors: number[]
  cases: { name: string; secret: number; pinned?: number[]; expected: number[] }[]
}

// Le parole fissate dalla Pipeline B (`pinned`) sono nel lavoro del server non ancora committato: finché `rankAgainst` committato
// non le conosce, quel caso non ha un server con cui confrontarsi (si prova sulla copia di lavoro principale).
const rankingSource = readFileSync(new URL('../packages/shared/src/contextRanking.ts', import.meta.url), 'utf8')
const knowsPinned = rankingSource.includes('pinned')

for (const c of fixture.cases) {
  test(`rankAgainst del server coincide con il valutatore: ${c.name}`, { skip: c.pinned && !knowsPinned ? 'rankAgainst committato senza pinned' : false }, () => {
    const data = {
      vectors: Float32Array.from(fixture.vectors), dim: fixture.dim, wordCount: fixture.words,
      links: new Map<number, number[]>(), linkBoost: 0,
      ...(c.pinned ? { pinned: new Map([[c.secret, c.pinned]]) } : {}),
    }
    assert.deepEqual([...rankAgainst(data, c.secret).order], c.expected)
  })
}
