import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contextProfile, isContextProfile } from '../packages/shared/src/contextProfiles.ts'
import { loadContextData } from '../apps/overlay/src/games/contextLoader.ts'
import { availableContextProfiles, contextFile } from '../apps/server/src/context.ts'
import { serverCorpus } from '../apps/server/src/context-tournament-ranking.ts'

test('the integrated profiles preserve every secret and use distinct matrices and caches', () => {
  const profiles = availableContextProfiles()
  assert.deepEqual(profiles.map((p) => p.id), ['original', 'abtt'])
  assert.ok(profiles.every((p) => p.available))
  assert.equal(new Set(profiles.map((p) => p.revision)).size, 2)
  const original = serverCorpus('original')!
  const expected = original.data.secrets.map((i) => original.data.words[i]).sort()
  for (const profile of profiles) {
    const corpus = serverCorpus(profile.id)!
    assert.equal(corpus.data.words.length, 93928)
    assert.deepEqual(corpus.data.secrets.map((i) => corpus.data.words[i]).sort(), expected)
    assert.equal(corpus.data.dim, profile.id === 'original' ? 300 : 1024)
    assert.equal(corpus.data.semantic?.special.length, 0)
    const meta = JSON.parse(contextFile('meta.json', profile.id)!.toString())
    if (profile.id === 'abtt') {
      assert.match(meta.embedding_model, /bge-m3-italian.*ABTT/)
      assert.equal(meta.embedding_benchmark.spearman_100, 67.01519287871898)
      assert.equal(corpus.data.vectors.byteLength, 93928 * 1024 * 4)
    }
  }
  assert.equal(serverCorpus('original'), original, 'loading another profile does not replace the original cache')
  assert.notEqual(serverCorpus('abtt'), original)
  assert.equal(serverCorpus('abtt'), serverCorpus('abtt'), 'the ABTT cache is reused')
})

test('the loader pins one profile across all downloads and refuses mixed profile responses', async () => {
  const calls: string[] = []
  const files: Record<string, BodyInit> = {
    'vocab.txt': 'mare\nonda\n', 'secrets.txt': 'mare\n',
    'links.json': JSON.stringify({ boost: 0, links: {} }),
    'vectors.bin': new Int8Array([100, 0, 95, 30]),
  }
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input))
    calls.push(url.searchParams.get('profile')!)
    return new Response(files[url.pathname.split('/').at(-1)!], { headers: { 'x-zerocontext-profile': 'abtt' } })
  }) as typeof fetch
  const data = await loadContextData('http://localhost?profile=abtt', new AbortController().signal, fetcher)
  assert.equal(data.words.length, 2)
  assert.deepEqual(calls, ['abtt', 'abtt', 'abtt', 'abtt'])
  await assert.rejects(loadContextData('http://localhost?profile=original', new AbortController().signal, fetcher), /associazioni.*diverse/)
  await assert.rejects(loadContextData('http://localhost?profile=unknown', new AbortController().signal, fetcher), /non valide/)
  assert.equal(contextProfile(undefined), 'original')
  assert.equal(isContextProfile('unknown'), false)
  for (const retired of ['turbox', 'harrier']) {
    assert.equal(isContextProfile(retired), false)
    assert.equal(contextProfile(retired), 'original', 'old room settings fall back to the original bank')
    await assert.rejects(loadContextData(`http://localhost?profile=${retired}`, new AbortController().signal, fetcher), /non valide/)
  }
})
