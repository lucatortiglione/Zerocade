from contextlib import closing
import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from context_semantic_sources import digest, load_game, sha
from context_subword import unit_rows, MODEL_SHA
from context_vector_pipeline import (align_fallback, configuration, dense_contexts, distill_teacher,
                                      margin_retrofit, quality_words, validate_quality)

HERE = Path(__file__).resolve().parent.parent
CONFIG = configuration(HERE / 'resources/semantic-vectors.json')


def names(n):
    return ['voce' + chr(97 + i // 676) + chr(97 + i // 26 % 26) + chr(97 + i % 26) for i in range(n)]


def quality_matrix(words):
    rng = np.random.default_rng(8)
    noise = unit_rows(rng.normal(size=(len(words), 299)).astype(np.float32))
    rows = np.column_stack([np.full(len(words), np.sqrt(.1)), np.sqrt(.9) * noise]).astype(np.float32)
    idx = {w: i for i, w in enumerate(words)}
    rows[idx['freddo']] = -rows[idx['caldo']]
    rows[idx['tiepido']] = rows[idx['caldo']]
    rows[idx['scialacquamento']] = rows[idx['scialacquare']]
    return unit_rows(rows)


def tiny_teacher():
    import torch
    from transformers import BertConfig, BertModel, PreTrainedTokenizerFast
    from tokenizers import Tokenizer, models, pre_tokenizers, processors
    torch.set_num_threads(2); torch.manual_seed(0)
    words = names(330)
    vocab = {w: i for i, w in enumerate(['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'] + words)}
    tok = Tokenizer(models.WordPiece(vocab, unk_token='[UNK]'))
    tok.pre_tokenizer = pre_tokenizers.Whitespace()
    tok.post_processor = processors.TemplateProcessing(single='[CLS] $A [SEP]', special_tokens=[('[CLS]', 2), ('[SEP]', 3)])
    tokenizer = PreTrainedTokenizerFast(tokenizer_object=tok, unk_token='[UNK]', pad_token='[PAD]', cls_token='[CLS]', sep_token='[SEP]')
    model = BertModel(BertConfig(vocab_size=len(vocab), hidden_size=320, num_hidden_layers=1,
        num_attention_heads=8, intermediate_size=384, max_position_embeddings=128))
    return words, model, tokenizer


class VectorTests(unittest.TestCase):
    def test_configuration_and_current_special_suspension(self):
        self.assertFalse(CONFIG['special_rounds_enabled'])
        self.assertEqual(CONFIG['dimensions'], 300)
        for mutate in [lambda c: c['teacher'].update(revision='main'),
                       lambda c: c['retrofitting'].update(margin=-1),
                       lambda c: c['quality'].update(norm_tolerance=.1),
                       lambda c: c['multi_context'].update(templates=['{missing}', '{w}'])]:
            c = copy.deepcopy(CONFIG); mutate(c)
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'bad.json'; path.write_text(json.dumps(c), encoding='utf-8')
                with self.assertRaises(ValueError): configuration(path)

    def test_fallback_learns_a_shared_space_and_handles_only_invalid_static_rows(self):
        rng = np.random.default_rng(2)
        fast = unit_rows(rng.normal(size=(120, 3)).astype(np.float32))
        rotation = np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]], np.float32)
        base = fast @ rotation
        expected = base[-2:].copy(); base[-2] = 0; base[-1] = np.nan
        out, report, _ = align_fallback(base, fast, 100, .0001)
        np.testing.assert_allclose(out[-2:], expected, atol=2e-5)
        self.assertEqual(report['fallback_rows'], [118, 119])
        np.testing.assert_allclose(out[:-2], base[:-2], atol=1e-6)

    def test_margin_objective_decreases_and_repulsion_stops_beyond_margin(self):
        initial = unit_rows(np.array([[1, 0], [.5, .866], [.99, -.14], [-1, 0]], np.float32))
        final, report = margin_retrofit(initial, [(0, 1)], [(0, 2)], CONFIG['retrofitting'])
        self.assertGreater(final[0] @ final[1], initial[0] @ initial[1])
        self.assertLess(final[0] @ final[2], initial[0] @ initial[2])
        self.assertTrue(all(a >= b - 1e-6 for a, b in zip(report['losses'], report['losses'][1:])))
        only_far, _ = margin_retrofit(initial, [], [(0, 3)], CONFIG['retrofitting'])
        np.testing.assert_allclose(only_far, initial, atol=1e-6)

    def test_quality_checks_every_polarity_oov_norm_and_seeded_angular_gate(self):
        words = names(600) + quality_words(CONFIG)
        matrix = quality_matrix(words)
        first = validate_quality(matrix, words, CONFIG, 600)
        self.assertTrue(first['passed'], first)
        self.assertEqual(first, validate_quality(matrix, words, CONFIG, 600))
        half = matrix.astype(np.float16).astype(np.float32)
        self.assertTrue(validate_quality(half, words, CONFIG, 600)['passed'])
        bad = matrix.copy(); bad[words.index('freddo')] = matrix[words.index('caldo')]
        self.assertFalse(validate_quality(bad, words, CONFIG, 600)['passed'])
        bad = matrix.copy(); bad[words.index('scialacquamento')] = -matrix[words.index('scialacquare')]
        self.assertFalse(validate_quality(bad, words, CONFIG, 600)['passed'])
        self.assertFalse(validate_quality(np.ones_like(matrix), words, CONFIG, 600)['passed'])

    @unittest.skipUnless(importlib.util.find_spec('model2vec'), 'Richiede .venv-vectors')
    def test_real_model2vec_api_shared_pca_and_dense_templates_on_local_tiny_teacher(self):
        from model2vec import StaticModel
        words, teacher, tokenizer = tiny_teacher()
        config = copy.deepcopy(CONFIG); config['teacher']['id'] = 'local-fixture'
        contexts = dense_contexts(teacher, tokenizer, words[:2], config)
        self.assertEqual(contexts.shape, (2, 320))
        with tempfile.TemporaryDirectory() as folder:
            static, pca = distill_teacher(teacher, tokenizer, words, config, Path(folder))
            encoded = static.encode(words[:3])
            self.assertEqual(encoded.shape, (3, 300))
            np.testing.assert_allclose(np.linalg.norm(encoded, axis=1), 1, atol=1e-5)
            self.assertTrue(np.isfinite(pca.transform(contexts)).all())
            restored = StaticModel.from_pretrained(Path(folder) / 'model2vec')
            np.testing.assert_allclose(restored.encode(words[:3]), encoded, atol=1e-5)

    @unittest.skipUnless(importlib.util.find_spec('model2vec'), 'Richiede .venv-vectors')
    def test_full_encoder_reuses_verified_cache_and_fills_unknown_static_rows(self):
        from context_vector_pipeline import initial_vectors
        words, teacher, tokenizer = tiny_teacher()
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder); snapshot = cache / 'teacher'; snapshot.mkdir()
            teacher.save_pretrained(snapshot); tokenizer.save_pretrained(snapshot)
            vector_words = words + ['scialacquamento']
            rng = np.random.default_rng(2)
            fasttext = unit_rows(rng.normal(size=(len(vector_words), 300)).astype(np.float32))
            config = copy.deepcopy(CONFIG); config['teacher']['id'] = 'local-fixture'
            with patch('huggingface_hub.snapshot_download', return_value=str(snapshot)) as download:
                result, report = initial_vectors(vector_words, len(words), words[:2], fasttext, config, cache)
                self.assertEqual(report['alignment']['fallback_rows'], [len(words)])
                np.testing.assert_allclose(np.linalg.norm(result, axis=1), 1, atol=1e-5)
                cached, _ = initial_vectors(vector_words, len(words), words[:2], fasttext, config, cache)
                self.assertEqual(download.call_count, 1)
                np.testing.assert_allclose(result, cached, atol=1e-6)
                complete = next((cache / 'model2vec').rglob('initial.npy'))
                complete.write_bytes(b'corrotto')
                with self.assertRaisesRegex(ValueError, 'Cache Model2Vec corrotta'):
                    initial_vectors(vector_words, len(words), words[:2], fasttext, config, cache)

    def test_complete_candidate_float16_preserves_secrets_and_failed_quality_cannot_publish(self):
        import build_context_semantic as builder
        from publish_context import publish
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); cache = root / 'cache'; cache.mkdir(); data = root / 'data'; data.mkdir()
            words = names(600); secrets = [words[0]]
            schema = root / 'initial.db'; game = root / 'game.sqlite3'; raw = root / 'raw.sqlite3'
            with closing(sqlite3.connect(schema)) as con:
                con.executescript(builder.CONTEXT_SCHEMA)
                con.executemany('INSERT INTO vocab VALUES (?,?)', enumerate(words))
                con.execute('INSERT INTO secrets VALUES (?)', (secrets[0],))
                con.executemany('INSERT INTO hubs VALUES (?,0)', ((i,) for i in range(len(words))))
                con.executemany('INSERT INTO meta VALUES (?,?)', [('dim', '4'), ('words', str(len(words)))])
                con.commit()
            builder.SchemaDb(game, {}, 'UNUSED').import_schema(schema, 'context')
            with closing(sqlite3.connect(raw)) as con:
                con.execute('CREATE TABLE raw__inventory_source_heads(source_key TEXT,snapshot_id TEXT)'); con.commit()
            np.zeros((len(words), 4), np.int8).tofile(data / 'vectors.bin')
            vector_words = words + quality_words(CONFIG)
            key = digest({'words': vector_words, 'model': MODEL_SHA})
            np.save(cache / f'subword-{key}.npy', quality_matrix(vector_words))
            (cache / f'subword-{key}.json').write_text('{}', encoding='utf-8')
            config = copy.deepcopy(CONFIG); config['storage'] = 'float16'
            profile = root / 'config.json'; profile.write_text(json.dumps(config), encoding='utf-8')
            args = SimpleNamespace(config=profile, game_db=game, raw_db=raw, data_dir=data, cache=cache,
                                   limit=None, output=root / 'run')
            def encode(vwords, count, contexts, fasttext, c, folder): return quality_matrix(vwords), {'fixture': True}
            with patch.object(builder, 'morphology', return_value=({}, {}, set())), \
                 patch.object(builder, 'nvdb_classes', return_value=({}, {'fixture': True})), \
                 patch.object(builder, 'profiles', side_effect=lambda ws, *_: ([{'word': w, 'origin': 'fixture'} for w in ws], [])), \
                 patch.object(builder, 'frequency', return_value=0), \
                 patch.object(builder, 'acquire_model', return_value=root / 'unused'), \
                 patch.object(builder, 'initial_vectors', side_effect=encode), \
                 patch.object(builder, 'lexical_graph', return_value=([], [], {})), \
                 patch.object(builder, 'version', return_value='fixture'):
                before = sha(game)
                result = builder.build(args)
                self.assertEqual(sha(game), before)
                self.assertTrue(result['quality_passed'])
                self.assertEqual(result['special'], 0)
                run = Path(result['output'])
                self.assertEqual((run / 'vectors.bin').stat().st_size, len(words) * 300 * 2)
                report = json.loads((run / 'report.json').read_text(encoding='utf-8'))
                report['quality']['passed'] = False
                (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'Collaudo'):
                    publish(run, game, data, server_url=None)
                self.assertEqual(sha(game), before)
                report['quality']['passed'] = True
                (run / 'report.json').write_text(json.dumps(report), encoding='utf-8')
                self.assertTrue(publish(run, game, data, server_url=None)['published_to_live'])
                self.assertEqual(load_game(game)[1], secrets)


if __name__ == '__main__': unittest.main()
