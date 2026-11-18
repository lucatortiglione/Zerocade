import gzip
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline_a.calibration import Calibrator, ECDF
from pipeline_a.conceptnet import Graph, load_graph, parse_node
from pipeline_a.cooccurrence import count_cooccurrences, ppmi, sppmi
from pipeline_a.config import SIGNALS, Config
from pipeline_a.distributional import c_raw, svd_vectors
from pipeline_a.embeddings import VectorIndex, l2_normalize
from pipeline_a.ranker import Pipeline
from pipeline_a.store import export_sqlite, load_queries, load_vocabulary

DOCS = [['mare', 'onda', 'spiaggia', 'barca'], ['mare', 'barca', 'onda'], ['spiaggia', 'sole', 'mare'],
        ['pesca', 'frutto', 'albero'], ['pesca', 'albero', 'frutto']] * 8
VOCAB = ['mare', 'onda', 'spiaggia', 'barca', 'sole', 'pesca', 'frutto', 'albero', 'oceano']


def make_pipeline(with_graph=True, with_embedding=True):
    index = {w: i for i, w in enumerate(VOCAB)}
    X, _ = count_cooccurrences(DOCS, index, 2)
    P = ppmi(X)
    svd = svd_vectors(sppmi(X), 4, 0.5, 0)
    rng = np.random.default_rng(0)
    emb = l2_normalize(rng.normal(size=(len(VOCAB), 8))) if with_embedding else np.zeros((len(VOCAB), 8), np.float32)
    graph = Graph({('mare', 'oceano'): {'weight': 1.0, 'relation': 'Synonym', 'source': 't'}} if with_graph else {})
    samples = {s: np.linspace(0, 1, 50) for s in SIGNALS}
    return Pipeline(VOCAB, emb, svd, P, graph, Calibrator(samples, 'test', False), Config(top_k=20), {'build_id': 't'})


class MatrixTests(unittest.TestCase):
    def test_ppmi_only_observed_pairs_and_nonnegative(self):
        index = {w: i for i, w in enumerate(VOCAB)}
        X, targets = count_cooccurrences(DOCS, index, 2)
        P = ppmi(X)
        self.assertGreaterEqual(P.data.min(), 0)
        self.assertTrue(set(zip(*P.nonzero())) <= set(zip(*X.nonzero())))
        self.assertEqual(targets[index['mare']], 24)

    def test_stopwords_removed_from_contexts_only(self):
        X, targets = count_cooccurrences([['a', 'x', 'b']], {'a': 0, 'x': 1, 'b': 2}, 1, frozenset({'x'}))
        self.assertEqual(targets[1], 1)
        self.assertEqual(X[0, 1], 0)
        self.assertEqual(X[1, 0], 1)

    def test_shift_reduces_entries(self):
        index = {w: i for i, w in enumerate(VOCAB)}
        X, _ = count_cooccurrences(DOCS, index, 2)
        self.assertLessEqual(sppmi(X, 5).nnz, sppmi(X, 1).nnz)

    def test_svd_zero_rows_stay_missing(self):
        index = {w: i for i, w in enumerate(VOCAB)}
        X, _ = count_cooccurrences(DOCS, index, 2)
        v = svd_vectors(sppmi(X), 4)
        self.assertEqual(float(np.linalg.norm(v[index['oceano']])), 0.0)
        self.assertAlmostEqual(float(np.linalg.norm(v[index['mare']])), 1.0, places=5)

    def test_c_raw_missing_is_nan_not_zero(self):
        index = {w: i for i, w in enumerate(VOCAB)}
        X, _ = count_cooccurrences(DOCS, index, 2)
        out = c_raw(ppmi(X), index['mare'], [index['onda'], index['oceano']])
        self.assertFalse(np.isnan(out[0]))
        self.assertTrue(np.isnan(out[1]))


class ConceptNetTests(unittest.TestCase):
    def test_parse_and_filters(self):
        self.assertEqual(parse_node('/c/it/mare/n'), ('mare', 'NOUN'))
        self.assertIsNone(parse_node('/c/en/sea'))
        rows = [
            ['/a/1', '/r/Synonym', '/c/it/mare/n', '/c/it/oceano/n', json.dumps({'weight': 2.0, 'dataset': '/d/x'})],
            ['/a/2', '/r/Antonym', '/c/it/caldo', '/c/it/freddo', json.dumps({'weight': 2.0})],
            ['/a/3', '/r/RelatedTo', '/c/it/mare', '/c/en/sea', json.dumps({'weight': 2.0})],
            ['/a/4', '/r/RelatedTo', '/c/it/mare', '/c/it/mare', json.dumps({'weight': 2.0})],
            ['/a/5', '/r/RelatedTo', '/c/it/mare', '/c/it/fuori', json.dumps({'weight': 2.0})],
            ['/a/6', '/r/RelatedTo', '/c/it/mare', '/c/it/onda', json.dumps({'weight': 0.1})]]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'a.csv.gz'
            with gzip.open(path, 'wt', encoding='utf-8') as f:
                f.write('\n'.join('\t'.join(r) for r in rows))
            edges, dropped = load_graph(path, {'mare', 'oceano', 'onda', 'caldo', 'freddo'})
        self.assertEqual(list(edges), [('mare', 'oceano')])
        self.assertEqual(dropped['relation'], 1)
        self.assertEqual(dropped['non_italian'], 1)
        self.assertEqual(dropped['self_loop'], 1)
        self.assertEqual(dropped['out_of_vocab'], 1)
        self.assertEqual(dropped['low_weight'], 1)

    def test_missing_node_is_none_two_hop_penalised(self):
        g = Graph({('a', 'b'): {'weight': 1.0, 'relation': 'RelatedTo', 'source': ''},
                   ('b', 'c'): {'weight': 1.0, 'relation': 'IsA', 'source': ''}})
        self.assertEqual(g.g_raw('zzz', 'a'), (None, None))
        self.assertEqual(g.g_raw('a', 'b')[0], 1.0)
        self.assertAlmostEqual(g.g_raw('a', 'c')[0], 0.4)
        self.assertEqual(g.g_raw('a', 'zzz'), (None, None))


class CalibrationTests(unittest.TestCase):
    def test_ecdf_monotone_and_nan(self):
        e = ECDF([0.1, 0.2, 0.3, 0.4])
        out = e([0.0, 0.25, 1.0, np.nan])
        self.assertEqual(out[:3].tolist(), [0.0, 0.5, 1.0])
        self.assertTrue(np.isnan(out[3]))

    def test_roundtrip(self):
        c = Calibrator({'embedding': np.array([1.0, 2.0])}, 'v1', False)
        d = Calibrator.from_dict(json.loads(json.dumps(c.to_dict())))
        self.assertEqual((d.version, d.calibrated), ('v1', False))


class RankerTests(unittest.TestCase):
    def test_query_structure_and_missing_not_zero(self):
        out = make_pipeline().query('mare', 'balanced', 5)
        self.assertEqual(out['status'], 'ok')
        self.assertEqual(out['model_id'], 'bge-m3-pmi-svd-conceptnet-ppmi')
        for r in out['results']:
            self.assertFalse(r['score_is_calibrated'])
            for s in SIGNALS:
                self.assertEqual(r['signals'][s] is None, r['availability'][s] == 'missing')
            self.assertNotIn('_j', r)
        oceano = next(r for r in make_pipeline().query('mare', top_n=50)['results'] if r['lemma'] == 'oceano')
        self.assertEqual(oceano['availability']['pmi_svd'], 'missing')
        self.assertEqual(oceano['availability']['conceptnet'], 'observed')
        self.assertLess(oceano['weight_coverage'], 1.0)

    def test_scores_sorted_and_deterministic(self):
        a = make_pipeline().query('mare', top_n=8)['results']
        b = make_pipeline().query('mare', top_n=8)['results']
        self.assertEqual(a, b)
        self.assertEqual([r['score'] for r in a], sorted((r['score'] for r in a), reverse=True))

    def test_no_signals_gives_no_candidates_not_zero_scores(self):
        index = {w: i for i, w in enumerate(VOCAB)}
        p = Pipeline(VOCAB, np.zeros((len(VOCAB), 8), np.float32), np.zeros((len(VOCAB), 4), np.float32),
                     __import__('scipy.sparse', fromlist=['x']).csr_matrix((len(VOCAB),) * 2), Graph({}),
                     Calibrator({s: np.array([0.0, 1.0]) for s in SIGNALS}, 't', False), Config(), {})
        self.assertEqual(p.query('mare')['status'], 'no_candidates')
        self.assertEqual(p.query('inesistente')['status'], 'unknown_lemma')

    def test_filter_modes_and_mmr(self):
        p = make_pipeline()
        res = p.query('mare', allow=lambda w: w != 'onda', top_n=50)['results']
        self.assertNotIn('onda', [r['lemma'] for r in res])
        self.assertNotEqual(p.query('mare', 'association', 3)['mode'], 'balanced')
        with self.assertRaises(ValueError):
            p.query('mare', 'boh')
        p.config.mmr_lambda = 0.5
        self.assertEqual(len(p.query('mare', top_n=3)['results']), 3)

    def test_save_load_same_results(self):
        p = make_pipeline()
        with tempfile.TemporaryDirectory() as tmp:
            p.save(tmp)
            q = Pipeline.load(tmp)
        a, b = p.query('mare', top_n=5)['results'], q.query('mare', top_n=5)['results']
        self.assertEqual([r['lemma'] for r in a], [r['lemma'] for r in b])
        for x, y in zip(a, b):
            self.assertAlmostEqual(x['score'], y['score'], places=2)  # i vettori sono salvati in float16

    def test_vector_index_excludes_self_and_empty(self):
        idx = VectorIndex(np.array([[1, 0], [0.9, 0.1], [0, 0], [0, 1]], np.float32))
        ids, _ = idx.search(0, 5)
        self.assertEqual(ids.tolist(), [1, 3])
        self.assertTrue(np.isnan(idx.cosine(0, [2])[0]))


class FullRankingTests(unittest.TestCase):
    def test_every_word_has_a_rank_consistent_with_query(self):
        p = make_pipeline()
        ranks = p.ranks('mare')
        i = p.index['mare']
        self.assertEqual(ranks[i], 0)                       # la segreta stessa non ha posizione
        ranked = ranks[ranks > 0]
        self.assertEqual(ranked.min(), 1)
        top = p.query('mare', top_n=3)['results']
        for pos, r in enumerate(top, 1):
            self.assertEqual(ranks[p.index[r['lemma']]], pos)
            self.assertEqual(p.rank_of('mare', r['lemma'])['rank'], pos)

    def test_rank_of_unknown_and_filter(self):
        p = make_pipeline()
        self.assertEqual(p.rank_of('mare', 'inesistente')['status'], 'unknown_lemma')
        full = p.rank_of('mare', 'onda')
        filtered = p.rank_of('mare', 'onda', allow=lambda w: w == 'onda')
        self.assertEqual(filtered['rank'], 1)
        self.assertGreaterEqual(full['of'], filtered['of'])

    def test_ties_share_position(self):
        p = make_pipeline()
        ranks = p.ranks('mare')
        score = p.score_all('mare')['score']
        for a in range(len(VOCAB)):
            for b in range(len(VOCAB)):
                if ranks[a] and ranks[b] and score[a] == score[b]:
                    self.assertEqual(ranks[a], ranks[b])


class BackendBTests(unittest.TestCase):
    def test_oov_flag_and_model_id(self):
        p = make_pipeline()
        p.meta = {'model_id': 'fasttext-pmi-svd-conceptnet-ppmi', 'oov_subword_only': ['oceano']}
        p.oov = frozenset(p.meta['oov_subword_only'])
        out = p.query('mare', top_n=50)
        self.assertEqual(out['model_id'], 'fasttext-pmi-svd-conceptnet-ppmi')
        flags = {r['lemma']: r['oov_subword_only'] for r in out['results']}
        self.assertTrue(flags['oceano'])
        self.assertFalse(flags['onda'])
        self.assertNotIn('oov_subword_only', make_pipeline().query('mare')['results'][0])


class StoreTests(unittest.TestCase):
    def test_vocabulary_and_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / 'raw.sqlite3'
            con = sqlite3.connect(raw)
            con.execute('CREATE TABLE parole(parola TEXT PRIMARY KEY, is_single_word INTEGER)')
            con.execute('CREATE TABLE normalizzata(parola TEXT PRIMARY KEY, lexical_validity TEXT, iwfs REAL)')
            con.executemany('INSERT INTO parole VALUES (?,?)', [('mare', 1), ('onda', 1), ('xyz', 1), ('a b', 0), ('nuova', 1)])
            con.executemany('INSERT INTO normalizzata VALUES (?,?,?)', [('mare', 'VALID', 90), ('onda', 'VALID', 40), ('xyz', 'REJECTED', 99)])
            con.commit()
            con.close()
            self.assertEqual(load_vocabulary(raw), [('mare', 'VALID'), ('nuova', 'UNKNOWN'), ('onda', 'VALID'), ('xyz', 'REJECTED')])
            self.assertEqual(load_vocabulary(raw, 50), [('mare', 'VALID'), ('xyz', 'REJECTED')])
            out = Path(tmp) / 'out.sqlite3'
            giochi = Path(tmp) / 'giochi.sqlite3'
            g = sqlite3.connect(giochi)
            g.execute('CREATE TABLE ZeroContext_Segrete(id INTEGER PRIMARY KEY, parola TEXT)')
            g.executemany('INSERT INTO ZeroContext_Segrete(parola) VALUES (?)', [('mare',), ('pesca',), ('sconosciuta',)])
            g.commit()
            g.close()
            queries = load_queries(giochi)
            self.assertEqual(queries, ['mare', 'pesca', 'sconosciuta'])
            n = export_sqlite(make_pipeline(), out, top_n=3, detail_top=1, queries=queries)
            db = sqlite3.connect(out)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM semantic_pair_scores').fetchone()[0], n)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT MIN(rank), MAX(rank) FROM semantic_pair_scores').fetchone(), (1, 3))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM semantic_pair_scores WHERE rank>1 AND evidence_json!='{}'").fetchone()[0], 0)
            self.assertEqual({r[0] for r in db.execute('SELECT DISTINCT source_lexeme_id FROM semantic_pair_scores')}, {1, 6})
            self.assertEqual(db.execute("SELECT value FROM pipeline_meta WHERE name='queries_not_in_vocabulary'").fetchone()[0], '1')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lexemes').fetchone()[0], len(VOCAB))
            db.close()


if __name__ == '__main__':
    unittest.main()
