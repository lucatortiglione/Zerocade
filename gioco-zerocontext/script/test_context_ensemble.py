"""Prove offline: geometria, fonti, ripresa e corpus completo su DB temporanei."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np

from context_ensemble import (MODEL_NAMES, NAMES, combine, positions, quantize, read_assertions,
                              reduce_block, unit_rows)
import context_semantic_sources as sources
import build_context_ensemble as builder


def raw_fixture(path):
    with closing(sqlite3.connect(path)) as con:
        con.executescript('''
            CREATE TABLE raw__inventory_source_heads(source_key,snapshot_id);
            CREATE TABLE raw__inventory_snapshot_numbers(n,snapshot_id);
            CREATE TABLE raw__inventory_snapshots(id,sha256);
            CREATE TABLE raw__inventory_registered_sources(source_key,enabled);
            CREATE TABLE raw__inventory_attestation_roles(n,role);
            CREATE TABLE raw__inventory_attestation_pos(n,pos);
            CREATE TABLE raw__inventory_attestation_rows_json(prompt,snapshot,role,pos,locator,details_json);
            INSERT INTO raw__inventory_source_heads VALUES ('kaikki-itwiktionary','current');
            INSERT INTO raw__inventory_snapshot_numbers VALUES (1,'current'),(2,'old');
            INSERT INTO raw__inventory_snapshots VALUES ('current','sha-current');
            INSERT INTO raw__inventory_registered_sources VALUES ('kaikki-itwiktionary',1);
            INSERT INTO raw__inventory_attestation_roles VALUES (1,'lemma'),(2,'proper_name');
            INSERT INTO raw__inventory_attestation_pos VALUES (1,'noun'),(2,'name');
        ''')
        def entry(word, snap, role, gloss):
            con.execute('INSERT INTO raw__inventory_attestation_rows_json VALUES (?,?,?,1,?,?)',
                        (word, snap, role, f'{snap}-{word}', json.dumps({'senses': [{'glosses': [gloss]}]})))
        entry('cuculo', 2, 1, 'vecchio senso da non usare')
        entry('cuculo', 1, 1, 'uccello che depone uova nei nidi altrui')
        entry('nido', 1, 1, 'riparo degli uccelli che contiene uova')
        entry('uccello', 1, 1, 'animale con piume che costruisce il nido')
        entry('luna', 1, 1, 'satellite naturale visibile nel cielo')
        entry('aurora', 1, 1, 'luce nel cielo prima del sole')
        entry('rocco', 1, 2, 'nome proprio')
        con.commit()


class GeometryTests(unittest.TestCase):
    def test_weighted_dot_is_sum_of_source_similarities(self):
        a = unit_rows(np.array([[1, 2], [2, -1], [3, 1]], dtype=np.float32))
        blocks = {n: a if i % 2 else a[:, ::-1] for i, n in enumerate(NAMES)}
        weights = {n: 1 / len(NAMES) for n in NAMES}
        merged = combine(blocks, weights)
        expected = sum(weights[n] * (b @ b.T) for n, b in blocks.items())
        np.testing.assert_allclose(merged @ merged.T, expected, atol=1e-6)
        q, scale = quantize(merged)
        np.testing.assert_allclose(q.astype(np.int32) @ q.T.astype(np.int32) / scale**2, expected, atol=.02)

    def test_missing_numberbatch_stays_missing_after_pca(self):
        rows = np.array([[1., 1, 0], [0, 2, 1], [1, 0, 2], [0, 0, 0]])
        reduced, mean, axes, retained = reduce_block(rows, 2)
        np.testing.assert_array_equal(reduced[-1], [0, 0])
        np.testing.assert_allclose(np.linalg.norm(reduced[:3], axis=1), 1, atol=1e-6)
        self.assertGreater(retained, 0)
        np.testing.assert_allclose(unit_rows((unit_rows(rows[:3]) - mean) @ axes), reduced[:3], atol=1e-6)

    def test_runtime_limits_and_invalid_weights(self):
        blocks = {n: np.ones((3, 171)) for n in NAMES}
        with self.assertRaisesRegex(ValueError, 'limiti'):
            combine(blocks, {n: 1 / len(NAMES) for n in blocks})
        with self.assertRaisesRegex(ValueError, '(?i)pesi'):
            combine(blocks, {n: 1. for n in blocks})
        with self.assertRaisesRegex(ValueError, 'non finiti'):
            reduce_block(np.array([[np.nan], [1]]), 1)

    def test_exact_target_and_stable_ties(self):
        order, ranks = positions([2., 2., -3., 5.], 2)
        self.assertEqual(order.tolist(), [2, 3, 0, 1])
        self.assertEqual(ranks.tolist(), [3, 4, 1, 2])


class SourceTests(unittest.TestCase):
    def test_current_italian_definition_and_reviewed_sense_precedence(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'raw.sqlite3'
            raw_fixture(path)
            cards, snapshots = sources.profiles(['cuculo', 'nido', 'rocco'], {'nido': 'riparo degli uccelli'}, path)
        self.assertIn('uccello', cards[0]['text'])
        self.assertNotIn('vecchio', cards[0]['text'])
        self.assertEqual(cards[1]['origin'], 'reviewed_sense')
        self.assertEqual(cards[2]['origin'], 'lemma_only')
        self.assertEqual(snapshots, [(1, 'current', 'sha-current')])

    def test_form_references_do_not_become_definitions(self):
        self.assertIsNone(sources.definition({'senses': [{'tags': ['form-of'], 'glosses': ['plurale di...']}]}))
        self.assertIsNone(sources.definition({'entry_tags': ['offensive'], 'senses': [{'glosses': ['testo']}]}))

    def test_graph_filters_language_relation_and_weak_edges(self):
        def edge(rel, a, b, weight=1):
            return '\t'.join(['/a/test', '/r/' + rel, a, b,
                               json.dumps({'weight': weight, 'license': 'cc:by-sa/4.0'})]) + '\n'
        graph = read_assertions([
            edge('IsA', '/c/it/cuculo/n', '/c/it/uccello'),
            edge('RelatedTo', '/c/it/cuculo', '/c/it/luna'),
            edge('IsA', '/c/en/cuckoo', '/c/it/luna'),
            edge('HasA', '/c/it/cuculo', '/c/it/nido', .5),
            edge('AtLocation', '/c/it/cuculo', '/c/it/nido')],
            ['cuculo', 'luna', 'nido', 'uccello'], ['cuculo'])
        self.assertEqual(set(graph), {(0, 2), (0, 3)})
        self.assertEqual(graph[(0, 3)][0]['license'], 'cc:by-sa/4.0')

    def test_encoder_resumes_completed_batch_and_uses_task_prefix(self):
        calls = []
        state = {'fail': True}
        class Model:
            def __init__(self, *a, **kw):
                pass
            def get_sentence_embedding_dimension(self):
                return 3
            def encode(self, texts, **kw):
                calls.append(texts)
                if state['fail'] and len(calls) == 2:
                    raise RuntimeError('interruzione')
                return np.tile([1., 0, 0], (len(texts), 1))
        fake = types.SimpleNamespace(SentenceTransformer=Model)
        config = {'id': 'fixture', 'revision': 'a' * 40, 'prefix': 'task: sentence similarity | query: '}
        with tempfile.TemporaryDirectory() as tmp, patch.dict(sys.modules, {'sentence_transformers': fake}), patch.object(sources, 'version', return_value='fixture'):
            args = ('gemma', config, ['uno', 'due', 'tre'], Path(tmp))
            with self.assertRaisesRegex(RuntimeError, 'interruzione'):
                sources.sentence_vectors(*args, batch_size=2, sequence_length=32)
            state['fail'] = False
            result, _ = sources.sentence_vectors(*args, batch_size=2, sequence_length=32)
            self.assertEqual(result.shape, (3, 3))
            del result
            prefix = config['prefix']
            self.assertEqual(calls, [[prefix+'uno', prefix+'due'], [prefix+'tre'], [prefix+'tre']])
            cached, _ = sources.sentence_vectors(*args, batch_size=2, sequence_length=32)
            self.assertEqual(len(calls), 3)
            del cached


class PipelineTests(unittest.TestCase):
    def test_complete_candidate_preserves_live_and_other_games(self):
        self.check_candidate('ensemble.json')

    def test_statistical_candidate_uses_lsa_without_any_neural_model(self):
        self.check_candidate('contexts.json')

    def test_refreshed_candidate_can_publish_new_words_and_secrets_once_complete(self):
        self.check_candidate('contexts.json', refresh=True)

    def check_candidate(self, filename, refresh=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = root / 'raw.sqlite3'
            raw_fixture(raw)
            words = ['aurora', 'cuculo', 'luna', 'nido', 'rocco', 'uccello']
            source = root / 'source.sqlite3'
            schema = root / 'initial.sqlite3'
            with closing(sqlite3.connect(schema)) as c:
                c.executescript(builder.CONTEXT_SCHEMA)
                c.executemany('INSERT INTO vocab VALUES (?,?)', enumerate(words))
                c.execute("INSERT INTO secrets VALUES ('cuculo')")
                c.executemany('INSERT INTO meta VALUES (?,?)', [('dim', '4'), ('link_boost', '0')])
                c.executemany('INSERT INTO hubs VALUES (?,0)', ((i,) for i in range(len(words))))
                c.commit()
            builder.SchemaDb(source, {}, 'UNUSED_TEST_LEGACY').import_schema(schema, 'context')
            with closing(sqlite3.connect(source)) as c:
                c.execute('CREATE TABLE another_game(value)')
                c.execute("INSERT INTO another_game VALUES ('preservato')")
                c.commit()
            cache = root / 'cache'
            cache.mkdir()
            (cache / 'morphit_048.txt').write_text('nidi\tnido\tNOUN-M:p\nuccelli\tuccello\tNOUN-M:p\nuova\tuovo\tNOUN-M:p\n', encoding='utf-8')
            rng = np.random.default_rng(4)
            cache_words = sorted(words + ['casa']) if refresh else words
            for name in ('fasttext_it', 'numberbatch_it'):
                (cache / f'{name}_words.txt').write_text('\n'.join(cache_words), encoding='utf-8')
                np.save(cache / f'{name}_vectors.npy', rng.normal(size=(len(cache_words), 300)).astype(np.float16))
            vector_file = root / 'vectors.bin'
            rng.integers(-10, 10, size=(len(words), 4), dtype=np.int8).tofile(vector_file)
            before = sources.sha(source), sources.sha(vector_file)
            args = builder.parser().parse_args(['--game-db', str(source), '--raw-db', str(raw),
                '--vectors', str(vector_file), '--cache', str(cache), '--output', str(root / 'run'),
                '--config', str(builder.HERE / 'resources' / filename), '--probe', 'cuculo',
                *(['--refresh-vocabulary'] if refresh else [])])
            encoded = []
            def encoder(key, config, texts, cache, **kwargs):
                encoded.append((key, texts))
                return rng.normal(size=(len(texts), 12)).astype(np.float32), {'fixture': True}
            checked_models = []
            def access_check(models, cache):
                checked_models.extend(models)
                self.assertNotIn('bge_it', models)
            if refresh:
                selected_words, selected_secrets = cache_words, ['casa', 'cuculo']
                selection = {'mode': 'inventory-db-1', 'inputs': {'fixture': True},
                             'words_added': 1, 'words_removed': 0, 'secrets_added': 1, 'secrets_removed': 0,
                             'vocab_sha256': sources.digest(selected_words),
                             'secrets_sha256': sources.digest(selected_secrets)}
                with patch('context_inventory.select_inventory', return_value=(selected_words, selected_secrets, selection)), \
                     patch('context_inventory.inventory_identity', return_value={'fixture': True}):
                    result = builder.build(args, encoder=encoder, access_check=access_check)
            else:
                selected_words, selected_secrets = words, ['cuculo']
                result = builder.build(args, encoder=encoder, access_check=access_check)
            run = Path(result['output'])
            self.assertEqual(before, (sources.sha(source), sources.sha(vector_file)))
            _, expected_weights = builder.configuration(args.config)
            expected_models = [n for n in MODEL_NAMES if n in expected_weights]
            self.assertEqual([k for k, _ in encoded], expected_models)
            self.assertEqual(checked_models, expected_models)
            if encoded:
                self.assertIn('uccello', encoded[0][1][1])
            report = json.loads((run / 'report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['quality_status'], 'comparison_only_not_human_validated')
            self.assertEqual(set(report['weights']), set(expected_weights))
            self.assertAlmostEqual(sum(report['weights'].values()), 1)
            if filename == 'ensemble.json':
                self.assertEqual(report['disabled_models'], {'bge_it': 'Kleva-ai/italian-bge-m3'})
            else:
                self.assertEqual(set(report['sources']), {'fasttext', 'conceptnet', 'lsa'})
                self.assertEqual(encoded, [])
                self.assertEqual(checked_models, [])
            self.assertNotIn('bge_it', report['sources'])
            self.assertFalse((run / 'bge_it_pca.npz').exists())
            for name, expected in report['artifacts'].items():
                self.assertEqual(sources.sha(run / name), expected)
            candidate = sources.load_game(run / 'giochi.sqlite3')
            self.assertEqual(candidate[0], selected_words)
            self.assertEqual(candidate[1], selected_secrets)
            self.assertEqual((run / 'vectors.bin').stat().st_size, len(selected_words) * candidate[2]['dim'])
            with closing(sources.readonly(run / 'giochi.sqlite3')) as c:
                self.assertEqual(c.execute('SELECT value FROM another_game').fetchone()[0], 'preservato')
            if filename == 'contexts.json':
                from publish_context import publish, active_vectors
                import shutil
                data_dir = root / 'active'
                data_dir.mkdir()
                shutil.copyfile(vector_file, data_dir / 'vectors.bin')
                before_publish = sources.sha(source)
                # Neppure un candidato con lo stesso numero di segrete può sostituire
                # una segreta precedente con una diversa: controllare l'insieme, non il conteggio.
                candidate_path = run / 'giochi.sqlite3'
                with closing(sqlite3.connect(candidate_path)) as con:
                    con.execute("DELETE FROM context__secrets WHERE word='cuculo'")
                    con.execute("INSERT INTO context__secrets VALUES ('luna')")
                    con.commit()
                report['artifacts']['giochi.sqlite3'] = sources.sha(candidate_path)
                (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'perderebbe 1 segrete'):
                    publish(run, source, data_dir, server_url=None)
                self.assertEqual(sources.sha(source), before_publish)
                with closing(sqlite3.connect(candidate_path)) as con:
                    con.execute("DELETE FROM context__secrets WHERE word='luna'")
                    con.execute("INSERT INTO context__secrets VALUES ('cuculo')")
                    con.commit()
                report['artifacts']['giochi.sqlite3'] = sources.sha(candidate_path)
                (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                if refresh:
                    report['selection']['vocab_sha256'] = 'selezione-diversa'
                    (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                    with self.assertRaisesRegex(ValueError, 'selezione dal DB'):
                        publish(run, source, data_dir, server_url=None)
                    self.assertEqual(sources.sha(source), before_publish)
                    report['selection']['vocab_sha256'] = sources.digest(selected_words)
                    (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                with patch.object(builder.SchemaDb, 'import_schema', side_effect=RuntimeError('import fallito')):
                    with self.assertRaisesRegex(RuntimeError, 'import fallito'):
                        publish(run, source, data_dir, server_url=None)
                self.assertEqual(sources.sha(source), before_publish)
                with closing(sqlite3.connect(source)) as con:
                    con.execute("INSERT INTO another_game VALUES ('modifica successiva al candidato')")
                    con.commit()
                notices = []
                def notifier(url, revision, db):
                    active = sources.load_game(db)
                    self.assertEqual(active[2]['corpus_revision'], revision)
                    self.assertEqual(sources.sha(active_vectors(active[2], data_dir)), report['artifacts']['vectors.bin'])
                    notices.append(revision)
                    return {'state': 'reloaded'}
                published = publish(run, source, data_dir, notifier=notifier)
                self.assertTrue(published['published_to_live'])
                self.assertTrue((Path(published['backup']) / 'giochi.sqlite3').exists())
                self.assertEqual(sources.sha(data_dir / 'vectors.bin'), before[1], 'il file usato dai vecchi lettori resta immutato')
                with closing(sources.readonly(source)) as con:
                    self.assertEqual(con.execute('SELECT count(*) FROM another_game').fetchone()[0], 2)
                again = publish(run, source, data_dir, notifier=notifier)
                self.assertTrue(again['already_active'])
                self.assertEqual(again['backup'], published['backup'])
                self.assertEqual(notices, [published['revision'], published['revision']])
                report['pilot'] = True
                (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'pilota'):
                    publish(run, source, data_dir, notifier=notifier)

    def test_disabled_model_can_be_reenabled_with_original_weight(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = json.loads((builder.HERE / 'resources/ensemble.json').read_text(encoding='utf-8'))
            path = Path(tmp) / 'ensemble.json'
            path.write_text(json.dumps(config), encoding='utf-8')
            _, disabled_weights = builder.configuration(path)
            self.assertNotIn('bge_it', disabled_weights)
            self.assertAlmostEqual(disabled_weights['qwen'], .1 / .9)
            self.assertAlmostEqual(disabled_weights['fasttext'], .15 / .9)
            config['models']['bge_it']['enabled'] = True
            path.write_text(json.dumps(config), encoding='utf-8')
            _, enabled_weights = builder.configuration(path)
            self.assertAlmostEqual(enabled_weights['bge_it'], .1)
            self.assertAlmostEqual(sum(enabled_weights.values()), 1)


if __name__ == '__main__':
    unittest.main()
