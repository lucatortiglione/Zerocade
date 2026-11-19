"""Database dei risultati: schema normalizzato, esecuzioni riprendibili, verdetti e metriche."""
from pathlib import Path
import sqlite3
import tempfile
import unittest

from valutazione import EVALUATOR_VERSION
from valutazione.split import SPLIT_RULE
from valutazione.store import MetricRow, SampleRow, SecretMetricRow, Store, Verdict


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'valutazione.sqlite3'
        self.store = Store(self.path)
        self.addCleanup(self.store.close)
        self.profile = self.store.profile_id('original', 'giochi.sqlite3#context_original', 'a' * 64, 300, 93928)

    def scalar(self, sql, *args):
        return self.store.con.execute(sql, args).fetchone()[0]

    # --- schema ---

    def test_schema_pragmas_and_version(self):
        self.assertEqual(self.scalar('PRAGMA foreign_keys'), 1)
        self.assertEqual(self.scalar('PRAGMA journal_mode'), 'wal')
        self.assertEqual(self.scalar('PRAGMA user_version'), 1)

    def test_reopening_keeps_the_data(self):
        self.store.word_id('cane')
        self.store.close()
        again = Store(self.path)
        self.addCleanup(again.close)
        self.assertEqual(again.con.execute('SELECT word FROM words').fetchall(), [('cane',)])
        self.assertEqual(again.con.execute('PRAGMA user_version').fetchone()[0], 1)

    def test_composite_key_tables_are_without_rowid(self):
        for table in ('run_top', 'sample', 'judge_verdicts', 'human_verdicts', 'run_metrics', 'run_secret_metrics'):
            sql = self.scalar("SELECT sql FROM sqlite_master WHERE name = ?", table)
            self.assertIn('WITHOUT ROWID', sql, table)

    def test_views_exist_and_answer(self):
        for view in ('v_runs', 'v_run_metrics', 'v_sample_top'):
            self.store.con.execute(f'SELECT * FROM {view} LIMIT 0')

    def test_foreign_keys_are_enforced(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.con.execute('INSERT INTO run_top VALUES (999, 1, 2, 1, 0, 0)')

    def test_server_fixture_is_the_current_schema(self):
        # tests/context-evaluation.test.ts costruisce il suo database da questo file: se lo schema cambia, va rigenerato
        # con  python -c "from valutazione.store import Store; print(Store.ddl(), end='')"  dalla cartella gioco-zerocontext.
        fixture = Path(__file__).resolve().parents[2] / 'tests' / 'fixtures' / 'context-evaluation-schema.sql'
        self.assertEqual(fixture.read_text(encoding='utf-8'), Store.ddl())

    def test_ddl_is_the_schema_in_use(self):
        fresh = sqlite3.connect(':memory:')
        fresh.executescript(Store.ddl())
        names = lambda c: sorted(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"))
        self.assertEqual(names(fresh), names(self.store.con))

    # --- esecuzioni ---

    def test_run_lifecycle_and_resume(self):
        run = self.store.start_run(self.profile, 'giudice-1-abc', 'r' * 64, 'g' * 64)
        self.assertEqual(self.store.open_run(self.profile, 'r' * 64, 'g' * 64, 'giudice-1-abc'), run)
        # altri ingressi: un'esecuzione diversa, non si riprende
        self.assertIsNone(self.store.open_run(self.profile, 'x' * 64, 'g' * 64, 'giudice-1-abc'))
        self.assertIsNone(self.store.open_run(self.profile, 'r' * 64, 'g' * 64, None))
        self.store.finish_run(run, 'completa')
        self.assertIsNone(self.store.open_run(self.profile, 'r' * 64, 'g' * 64, 'giudice-1-abc'))
        row = self.store.con.execute('SELECT status, evaluator_version, split_rule, finished_at FROM runs WHERE id = ?', (run,)).fetchone()
        self.assertEqual(row[:3], ('completa', EVALUATOR_VERSION, SPLIT_RULE))
        self.assertIsNotNone(row[3])

    def test_run_without_judge_resumes_with_null(self):
        run = self.store.start_run(self.profile, None, 'r' * 64, 'g' * 64)
        self.assertEqual(self.store.open_run(self.profile, 'r' * 64, 'g' * 64, None), run)

    def test_profile_is_unique_by_name_and_hash(self):
        self.assertEqual(self.store.profile_id('original', 'altro', 'a' * 64, 300, 93928), self.profile)
        self.assertNotEqual(self.store.profile_id('original', 'altro', 'b' * 64, 300, 93928), self.profile)

    def test_unknown_run_status_is_refused(self):
        run = self.store.start_run(self.profile, None, 'r', 'g')
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.con.execute("UPDATE runs SET status = 'finita' WHERE id = ?", (run,))

    # --- prime 20 ---

    def test_top_roundtrip_and_replace(self):
        run = self.store.start_run(self.profile, None, 'r', 'g')
        words = [f'w{i}' for i in range(20)]
        self.store.save_top(run, 'cane', words, [i % 2 == 0 for i in range(20)], [i == 3 for i in range(20)])
        self.assertEqual(self.store.top(run, 'cane'), words)
        self.assertEqual(self.scalar('SELECT MIN(position) FROM run_top'), 2)
        self.assertEqual(self.scalar('SELECT MAX(position) FROM run_top'), 21)
        self.store.save_top(run, 'cane', ['a', 'b'], [True, False], [False, False])
        self.assertEqual(self.store.top(run, 'cane'), ['a', 'b'])

    def test_more_than_twenty_words_are_refused(self):
        run = self.store.start_run(self.profile, None, 'r', 'g')
        with self.assertRaises(ValueError):
            self.store.save_top(run, 'cane', [f'w{i}' for i in range(21)], [False] * 21, [False] * 21)
        self.assertEqual(self.store.top(run, 'cane'), [])

    def test_verified_and_variant_lists_must_match(self):
        run = self.store.start_run(self.profile, None, 'r', 'g')
        with self.assertRaises(ValueError):
            self.store.save_top(run, 'cane', ['a', 'b'], [True], [False, False])

    # --- verdetti ---

    def test_judge_verdict_cache_key(self):
        self.store.save_judge_verdicts('cane', 'giudice-1-abc', 'qwen', [Verdict('gatto', 2, None, 'sinonimo'), Verdict('osso', 1, True, 'debole')])
        self.assertEqual(self.store.judge_verdict('cane', 'gatto', 'giudice-1-abc', 'qwen'), Verdict('gatto', 2, None, 'sinonimo'))
        self.assertEqual(self.store.judge_verdict('cane', 'osso', 'giudice-1-abc', 'qwen').sense_ok, True)
        # un'altra versione del prompt o un altro modello non vede i vecchi verdetti
        self.assertIsNone(self.store.judge_verdict('cane', 'gatto', 'giudice-2-xyz', 'qwen'))
        self.assertIsNone(self.store.judge_verdict('cane', 'gatto', 'giudice-1-abc', 'altro'))
        self.assertIsNone(self.store.judge_verdict('cane', 'tavolo', 'giudice-1-abc', 'qwen'))

    def test_grade_out_of_range_is_refused_and_nothing_is_saved(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.save_judge_verdicts('cane', 'v', 'qwen', [Verdict('gatto', 2, None, 'ok'), Verdict('osso', 3, None, 'no')])
        self.assertIsNone(self.store.judge_verdict('cane', 'gatto', 'v', 'qwen'))  # transazione unica

    def test_human_verdict_overwrites(self):
        self.store.save_human_verdict('cane', 'gatto', 'naturale')
        self.store.save_human_verdict('cane', 'gatto', 'non_naturale')
        self.assertEqual(self.store.human_verdicts(), {('cane', 'gatto'): 'non_naturale'})
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.save_human_verdict('cane', 'gatto', 'forse')

    def test_judge_verdicts_by_version_take_the_latest_of_any_model(self):
        self.store.save_judge_verdicts('cane', 'v1', 'qwen-a', [Verdict('gatto', 0, None, 'vecchio')])
        self.store.save_judge_verdicts('cane', 'v1', 'qwen-b', [Verdict('gatto', 2, True, 'nuovo'), Verdict('osso', 1, None, 'debole')])
        self.store.save_judge_verdicts('cane', 'v2', 'qwen-a', [Verdict('tavolo', 2, None, 'altra versione')])
        found = self.store.judge_verdicts('cane', 'v1')
        self.assertEqual(found, {'gatto': Verdict('gatto', 2, True, 'nuovo'), 'osso': Verdict('osso', 1, None, 'debole')})
        self.assertEqual(self.store.judge_verdicts('gatto', 'v1'), {})

    def test_word_ids_are_stable_and_ordered(self):
        ids = self.store.word_ids(['cane', 'gatto', 'cane', 'Città'])
        self.assertEqual(ids, [self.store.word_id('cane'), self.store.word_id('gatto'), self.store.word_id('cane'), self.store.word_id('città')])
        self.assertEqual(self.store.word_ids([]), [])

    def test_words_are_stored_normalized(self):
        self.assertEqual(self.store.word_id('Città'), self.store.word_id('città'))
        self.assertEqual(self.store.word_id('città'), self.store.word_id('città'))

    # --- campione ---

    def test_sample(self):
        self.store.add_sample([SampleRow('cane', True, 1), SampleRow('gatto', False, 1)], 20261119)
        self.store.add_sample([SampleRow('cane', True, 2), SampleRow('luna', True, 2)], 20261120)
        self.assertEqual(self.store.sample(), [SampleRow('cane', True, 1), SampleRow('gatto', False, 1), SampleRow('luna', True, 2)])
        self.assertEqual(self.scalar("SELECT seed FROM sample WHERE secret_id = ?", self.store.word_id('luna')), 20261120)

    # --- metriche e viste ---

    def test_metrics_through_the_view(self):
        run = self.store.start_run(self.profile, None, 'r', 'g')
        self.store.save_metrics(run, [MetricRow('precision_10_verificata', 'misura:tutte', 0.21, 0.18, 0.24, 620),
                                      MetricRow('ndcg_20', 'misura:tutte', None, None, None, 0)])
        self.store.save_secret_metrics(run, [SecretMetricRow('cane', 'ndcg_20', 0.4), SecretMetricRow('gatto', 'ndcg_20', None)])
        rows = self.store.con.execute('SELECT profilo, metrica, sottoinsieme, value, low, high, n FROM v_run_metrics ORDER BY metrica').fetchall()
        self.assertEqual(rows, [('original', 'ndcg_20', 'misura:tutte', None, None, None, 0),
                                ('original', 'precision_10_verificata', 'misura:tutte', 0.21, 0.18, 0.24, 620)])
        self.assertEqual(self.scalar('SELECT COUNT(*) FROM run_secret_metrics'), 2)
        # ripetere il salvataggio sostituisce, non duplica
        self.store.save_metrics(run, [MetricRow('ndcg_20', 'misura:tutte', 0.5, 0.4, 0.6, 10)])
        self.assertEqual(self.scalar("SELECT value FROM v_run_metrics WHERE metrica = 'ndcg_20'"), 0.5)

    def test_sample_top_view_shows_only_completed_runs_with_verdicts(self):
        self.store.add_sample([SampleRow('cane', True, 1)], 1)
        run = self.store.start_run(self.profile, 'giudice-1-abc', 'r', 'g')
        self.store.save_top(run, 'cane', ['gatto', 'guinzaglio'], [False, True], [False, False])
        self.store.save_judge_verdicts('cane', 'giudice-1-abc', 'qwen', [Verdict('gatto', 2, None, 'sinonimo')])
        self.store.save_human_verdict('cane', 'gatto', 'naturale')
        self.assertEqual(self.store.con.execute('SELECT * FROM v_sample_top').fetchall(), [])  # esecuzione ancora in corso
        self.store.finish_run(run, 'completa')
        rows = self.store.con.execute('SELECT secret, position, word, verified, variant, human, judge_grade FROM v_sample_top ORDER BY position').fetchall()
        self.assertEqual(rows, [('cane', 2, 'gatto', 0, 0, 'naturale', 2), ('cane', 3, 'guinzaglio', 1, 0, None, None)])

    def test_vacuum_keeps_the_data(self):
        self.store.word_id('cane')
        self.store.vacuum()
        self.assertEqual(self.scalar('SELECT COUNT(*) FROM words'), 1)


if __name__ == '__main__':
    unittest.main()
