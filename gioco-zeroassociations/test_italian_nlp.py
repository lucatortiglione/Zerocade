"""Provenienza, ambiguità, confronto e isolamento delle previsioni NLP."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace as NS
import tempfile
import unittest
from unittest.mock import patch

from italian_nlp import ItalianAnalyzer, artifact_hashes, digest, stanza_tokens, token_row, load_spacy
from nlp_tools import (initialize_nlp, store_analysis, lookup_analyses, load_gold,
                       score_predictions, peak_memory_bytes, write_json)
from prompt_inventory import initialize_inventory, import_source
from sqlite_prompt_runtime import CACHE, SQLite


def prediction(text='Luca porta il pane.', lemma='portare', *, capabilities=None):
    model = {'engine': 'fixture', 'library_version': '1', 'model_version': '1',
             'capabilities': capabilities if capabilities is not None else ['lemma', 'upos', 'morph']}
    return {'text': text, 'scope': 'contextual', 'model': model, 'model_id': digest(model),
            'evidence_kind': 'model_prediction', 'tokens': [
                token_row('porta', lemma, 'VERB', 'V', {'Number': 'Sing', 'Person': '3'}, 5, 10)]}


class AnalysisTests(unittest.TestCase):
    def test_stanza_multiword_keeps_original_span_and_expansion(self):
        words = [NS(text='di', lemma='di', upos='ADP', xpos='E', feats=None),
                 NS(text='il', lemma='il', upos='DET', xpos='RD', feats='Gender=Masc|Number=Sing')]
        doc = NS(sentences=[NS(tokens=[NS(words=words, start_char=3, end_char=6)])])
        rows = stanza_tokens(doc)
        self.assertEqual([row['lemma'] for row in rows], ['di', 'il'])
        self.assertTrue(all(row['expanded_multiword'] for row in rows))
        self.assertEqual(rows[1]['morph'], {'Gender': 'Masc', 'Number': 'Sing'})
        self.assertEqual((rows[1]['start'], rows[1]['end']), (3, 6))

    def test_isolated_simplemma_does_not_claim_context_pos_or_attestation(self):
        analyzer = ItalianAnalyzer.__new__(ItalianAnalyzer)
        analyzer.engine = 'simplemma'
        analyzer.pipeline = NS(simple_tokenizer=lambda text: ['porta', 'porta'],
                               lemmatize=lambda word, lang: 'portare')
        analyzer.metadata = {'capabilities': ['lemma']}
        analyzer.model_id = digest(analyzer.metadata)
        result = analyzer.analyze('porta porta', scope='isolated')
        self.assertFalse(result['context_used'])
        self.assertEqual(result['evidence_kind'], 'model_prediction')
        self.assertEqual(result['status'], 'AWAITING_REVIEW')
        self.assertEqual([r['start'] for r in result['tokens']], [0, 6])
        self.assertTrue(all(not r['upos'] and r['morph'] == {} for r in result['tokens']))
        with self.assertRaises(ValueError):
            analyzer.analyze(' ')

    def test_single_token_spacy_does_not_claim_context(self):
        analyzer = ItalianAnalyzer.__new__(ItalianAnalyzer)
        analyzer.engine, analyzer.metadata, analyzer.model_id = 'spacy', {}, 'fixture'
        analyzer.pipeline = lambda text: [NS(text='porta', lemma_='porta', pos_='NOUN', tag_='S',
                                             morph=NS(to_dict=lambda: {}), idx=0, is_space=False)]
        self.assertFalse(analyzer.analyze('porta')['context_used'])

    def test_missing_optional_engine_is_an_error_without_silent_fallback(self):
        with patch.dict('sys.modules', {'simplemma': None}), self.assertRaisesRegex(RuntimeError, 'Simplemma'):
            ItalianAnalyzer('simplemma')

    def test_non_italian_spacy_model_is_rejected(self):
        with patch.dict('sys.modules', {'spacy': NS(load=lambda *a, **kw: NS(lang='en'))}):
            with self.assertRaisesRegex(ValueError, 'italiano'):
                load_spacy('english-fixture')

    def test_model_fingerprint_tracks_bytes_not_install_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / 'one', Path(tmp) / 'two'
            first.mkdir(); second.mkdir()
            for directory in (first, second):
                (directory / 'model').write_bytes(b'version-one')
            self.assertEqual(artifact_hashes(first), artifact_hashes(second))
            (second / 'model').write_bytes(b'version-two')
            self.assertNotEqual(artifact_hashes(first), artifact_hashes(second))


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.gold = [{'id': 'verb', 'text': 'Luca porta il pane.', 'targets': [
            {'surface': 'porta', 'start': 5, 'end': 10, 'lemma': 'portare', 'upos': 'VERB',
             'morph': {'Number': 'Sing'}}]}]

    def test_missing_alignment_and_wrong_lemma_are_counted(self):
        correct = score_predictions(self.gold, [prediction()])
        self.assertEqual(correct['metrics']['lemma']['accuracy'], 1)
        wrong = prediction(lemma='porta')
        self.assertEqual(score_predictions(self.gold, [wrong])['metrics']['lemma']['accuracy'], 0)
        wrong['tokens'][0]['start'] = 4
        score = score_predictions(self.gold, [wrong])
        self.assertEqual(score['aligned_targets'], 0)
        self.assertEqual(score['metrics']['lemma']['total'], 1)

    def test_expanded_tokens_cannot_inflate_alignment_score(self):
        result = prediction()
        result['tokens'][0]['expanded_multiword'] = True
        score = score_predictions(self.gold, [result])
        self.assertEqual(score['aligned_targets'], 0)
        self.assertEqual(score['metrics']['lemma']['accuracy'], 0)

    def test_simplemma_unsupported_annotations_are_not_reported_as_zero_accuracy(self):
        result = score_predictions(self.gold, [prediction(capabilities=['lemma'])])
        self.assertIsNone(result['metrics']['upos']['accuracy'])
        self.assertFalse(result['metrics']['upos']['supported'])
        self.assertEqual(result['errors'], [])

    def test_wrong_gold_offsets_and_duplicate_ids_fail_before_evaluation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'gold.jsonl'
            path.write_text(json.dumps(self.gold[0]) + '\n', encoding='utf-8')
            self.assertEqual(load_gold(path), self.gold)
            invalid = deepcopy(self.gold[0])
            invalid['targets'][0]['start'] = 4
            path.write_text(json.dumps(invalid), encoding='utf-8')
            with self.assertRaises(ValueError): load_gold(path)
            path.write_text((json.dumps(self.gold[0]) + '\n') * 2, encoding='utf-8')
            with self.assertRaises(ValueError): load_gold(path)

    def test_shipped_regression_sample_and_native_memory_measurement(self):
        sample = Path(__file__).parent / 'resources/nlp_gold_it.jsonl'
        self.assertEqual(len(load_gold(sample)), 12)
        self.assertGreater(peak_memory_bytes(), 0)

    def test_json_publication_is_complete_and_preserves_unicode(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'report.json'
            write_json(path, {'word': 'caffè'})
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), {'word': 'caffè'})
            self.assertEqual(list(path.parent.glob('*.part')), [])


@unittest.skipUnless((CACHE / 'sqlite3.exe').exists(), 'SQLite ufficiale non disponibile')
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = SQLite(self.root / 'fixture.sqlite3')
        initialize_inventory(self.db)
        initialize_nlp(self.db)
        self.path = self.root / 'morph.txt'
        self.path.write_text('porta\tporta\tNOUN-F:s\nporta\tportare\tVER:ind+pres+3+s\n', encoding='utf-8')
        self.source = {'id': 'fixture', 'name': 'Fixture', 'kind': 'morphit', 'encoding': 'utf-8',
                       'url': 'https://example.invalid/fixture', 'license': 'fixture', 'attribution': 'test'}
        import_source(self.db, self.source, self.path)

    def test_lookup_retains_both_lemmas_and_provenance_without_selecting_one(self):
        result = lookup_analyses(self.db, ' PORTA ')
        self.assertEqual({r['lemma'] for r in result['analyses']}, {'porta', 'portare'})
        self.assertTrue(result['multiple_analyses'])
        self.assertIsNone(result['selected_lemma'])
        self.assertTrue(all(r['attestations'][0]['source_key'] == 'fixture' for r in result['analyses']))
        self.assertEqual(lookup_analyses(self.db, 'sconosciuta')['analyses'], [])
        with self.assertRaises(ValueError): lookup_analyses(self.db, 'due parole')

    def test_predictions_never_change_attestations_or_promote_decisions(self):
        before = self.db.run('SELECT count(*) AS n FROM inventory_attestations;', rows=True)
        first = store_analysis(self.db, prediction())
        self.assertEqual(store_analysis(self.db, prediction()), first)
        changed = prediction()
        changed['model']['model_version'] = '2'
        changed['model_id'] = digest(changed['model'])
        self.assertNotEqual(store_analysis(self.db, changed), first)
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM nlp_analyses;', rows=True)[0]['n'], 2)
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM inventory_attestations;', rows=True), before)
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM inventory_term_decisions;', rows=True)[0]['n'], 0)
        self.assertIsNone(lookup_analyses(self.db, 'porta')['selected_lemma'])

    def test_bad_model_identity_does_not_write_partial_results(self):
        result = prediction()
        result['model']['model_version'] = 'edited'
        with self.assertRaises(ValueError): store_analysis(self.db, result)
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM nlp_models;', rows=True)[0]['n'], 0)


if __name__ == '__main__':
    unittest.main()
