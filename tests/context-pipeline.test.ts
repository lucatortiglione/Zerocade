import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { rankAgainst, type ContextRankSource } from '@zerocade/shared/contextRanking'
import { loadPipelineAssociations } from '../apps/server/src/context-pipeline.ts'

// Five words on a line: by the vectors alone, the order from "a" is a, b, c, d, e.
const angles = [0, 0.1, 0.2, 0.3, 0.4]
const source = (pinned?: ContextRankSource['pinned']): ContextRankSource => {
  const vectors = new Float32Array(angles.flatMap((a) => [Math.cos(a), Math.sin(a)]))
  return { wordCount: 5, dim: 2, vectors, links: new Map(), linkBoost: 0, ...(pinned ? { pinned } : {}) }
}

test('the pinned words take the positions after the secret, then the vectors order the rest', () => {
  assert.deepEqual([...rankAgainst(source(), 0).order], [0, 1, 2, 3, 4])
  const ranking = rankAgainst(source(new Map([[0, [3, 2]]])), 0)
  assert.deepEqual([...ranking.order], [0, 3, 2, 1, 4])
  assert.equal(ranking.rankOf[3], 1)
  assert.equal(ranking.rankOf[1], 3)
  // A pinned list names the secret, a duplicate and a word outside the vocabulary: none of them breaks the order.
  assert.deepEqual([...rankAgainst(source(new Map([[0, [0, 4, 4, 99, -1]]])), 0).order], [0, 4, 1, 2, 3])
  // The pins of another secret do not touch this one.
  assert.deepEqual([...rankAgainst(source(new Map([[2, [4]]])), 0).order], [0, 1, 2, 3, 4])
})

test('the export of Pipeline B is read in the order of rank, keeping the vocabulary words and the secrets with enough of them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zc-pipeline-'))
  const file = join(dir, 'export.sqlite3')
  try {
    const db = new Database(file)
    db.exec(`CREATE TABLE lexemes(lexeme_id INTEGER PRIMARY KEY, lemma TEXT NOT NULL);
      CREATE TABLE semantic_pair_scores(source_lexeme_id INTEGER, target_lexeme_id INTEGER, model_version TEXT, rank INTEGER,
        PRIMARY KEY(source_lexeme_id, target_lexeme_id, model_version)) WITHOUT ROWID;
      CREATE TABLE pipeline_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL);`)
    const lemmas = ['mare', 'onda', 'sale', 'nave', 'zzzfuori', 'sole', 'luce']
    lemmas.forEach((lemma, i) => db.prepare('INSERT INTO lexemes VALUES (?, ?)').run(i + 1, lemma))
    const pair = db.prepare("INSERT INTO semantic_pair_scores VALUES (?, ?, 'v1', ?)")
    // mare: nave (1), a word outside the vocabulary (2), onda (3), sale (4), and itself (5, ignored)
    for (const [target, rank] of [[4, 1], [5, 2], [2, 3], [3, 4], [1, 5]]) pair.run(1, target, rank)
    // sole: only one word: too few
    pair.run(6, 7, 1)
    db.prepare("INSERT INTO pipeline_meta VALUES ('model_version', 'v1')").run()
    db.prepare("INSERT INTO pipeline_meta VALUES ('queries', '3')").run()
    db.close()
    const vocab = ['luce', 'mare', 'nave', 'onda', 'sale', 'sole']
    const found = loadPipelineAssociations(file, vocab, 3)
    assert.deepEqual([...found.pinned.keys()], [1])
    assert.deepEqual(found.pinned.get(1)!.map((i) => vocab[i]), ['nave', 'onda', 'sale'])
    assert.deepEqual(found.skipped, { notInVocabulary: 1, tooFew: 1 }) // the export declares 3 queries: one is not a word of the vocabulary
    assert.equal(found.version, 'v1')
    assert.notEqual(loadPipelineAssociations(file, vocab, 1).fingerprint, found.fingerprint, 'the fingerprint follows what is played')

    // An export written before the `rank` column existed is refused with a message that tells what to do.
    const old = join(dir, 'old.sqlite3')
    const o = new Database(old)
    o.exec('CREATE TABLE semantic_pair_scores(source_lexeme_id INTEGER, target_lexeme_id INTEGER, model_version TEXT); CREATE TABLE lexemes(lexeme_id INTEGER, lemma TEXT); CREATE TABLE pipeline_meta(name TEXT, value TEXT)')
    o.close()
    assert.throws(() => loadPipelineAssociations(old, vocab), /colonna rank/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
