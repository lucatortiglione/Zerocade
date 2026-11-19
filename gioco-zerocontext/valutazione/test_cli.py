"""Comandi della valutazione, su un «mondo» finto: raw 2.0, associazioni verificate, Morph-it! e un profilo candidato."""
from contextlib import closing
import csv
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import numpy as np

from valutazione import cli, profiles, ranking, split
from valutazione.store import Store

N_SECRETS, N_GOLD, N_OTHER, DIM = 800, 400, 200, 8
SECRETS = [f'a{i:04d}' for i in range(N_SECRETS)]
OTHERS = [f'o{i:03d}' for i in range(N_OTHER)]
VOCAB = SECRETS + OTHERS
GOLD_WORDS = {SECRETS[i]: [OTHERS[(i * 7 + k) % N_OTHER] for k in range(3)] for i in range(N_GOLD)}
MEASURE = {s for s in SECRETS if split.is_measure(s)}
CONSIDERED = MEASURE | set(GOLD_WORDS)


def make_world(root: Path) -> dict:
    raw2, giochi, morphit = root / 'raw2.sqlite3', root / 'giochi.sqlite3', root / 'morphit.txt'
    with closing(sqlite3.connect(raw2)) as con:
        con.executescript('''
            CREATE TABLE parole(parola TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL);
            CREATE TABLE normalizzata(parola TEXT PRIMARY KEY, is_single_word INTEGER NOT NULL);
            CREATE TABLE normalizzazione_esclusioni(parola TEXT PRIMARY KEY, sostituita_da TEXT, motivo TEXT NOT NULL);
            CREATE TABLE parole_segrete(parola TEXT PRIMARY KEY, ordinaria INTEGER NOT NULL, speciale INTEGER NOT NULL,
                                        legacy INTEGER NOT NULL, deroga INTEGER NOT NULL);''')
        con.executemany('INSERT INTO parole VALUES (?,1)', [(w,) for w in VOCAB])
        con.executemany('INSERT INTO normalizzata VALUES (?,1)', [(w,) for w in VOCAB])
        flags = lambda i: (1, 0, 1, 0) if i < 300 else ((0, 0, 1, 1) if i < 700 else (1, 0, 0, 0))
        con.executemany('INSERT INTO parole_segrete VALUES (?,?,?,?,?)', [(s, *flags(i)) for i, s in enumerate(SECRETS)])
        con.commit()
    morphit.write_text('xyz\txyz\tNOUN-M:s\n', encoding='utf-8')
    with closing(sqlite3.connect(giochi)) as con:
        con.executescript('''
            CREATE TABLE associazioni__prompts(id INTEGER PRIMARY KEY, prompt TEXT, pos TEXT, sense TEXT, category_id TEXT, ref TEXT, review_id TEXT);
            CREATE TABLE associazioni__words(id INTEGER PRIMARY KEY, word TEXT);
            CREATE TABLE associazioni__prompt_words(prompt_id INTEGER, word_id INTEGER, group_name_id INTEGER, difficulty INTEGER,
                                                    PRIMARY KEY(prompt_id, word_id));''')
        con.executemany('INSERT INTO associazioni__words VALUES (?,?)', [(i + 1, w) for i, w in enumerate(OTHERS)])
        for i, secret in enumerate(GOLD_WORDS, start=1):
            con.execute("INSERT INTO associazioni__prompts VALUES (?,?,'NOUN',?,NULL,NULL,NULL)", (i, secret, f'glossa di {secret}'))
            con.executemany('INSERT INTO associazioni__prompt_words VALUES (?,?,?,4)',
                            [(i, OTHERS.index(w) + 1, k + 1) for k, w in enumerate(GOLD_WORDS[secret])])
        con.commit()
    rng = np.random.default_rng(3)
    matrix = rng.normal(size=(len(VOCAB), DIM)).astype('<f4')
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
    vectors, vocab = root / 'mini.bin', root / 'mini.txt'
    vectors.write_bytes(matrix.astype('<f4').tobytes())
    vocab.write_text('\n'.join(VOCAB) + '\n', encoding='utf-8')
    return {'raw2': raw2, 'giochi': giochi, 'morphit': morphit, 'vectors': vectors, 'vocab': vocab}


class JudgeBackend:
    """Un Qwen finto: registra le richieste, può interrompersi alla n-esima e può avere un effetto collaterale."""
    model = 'fake'

    def __init__(self, answer=None, interrupt_at=None, side_effect=None):
        self.asked: list[tuple[str, tuple[str, ...]]] = []
        self.calls = 0
        self.answer = answer or (lambda secret, word: 1)
        self.interrupt_at, self.side_effect = interrupt_at, side_effect

    def ask(self, secret, gloss, words):
        self.calls += 1
        if self.interrupt_at == self.calls:
            raise KeyboardInterrupt
        if self.side_effect:
            self.side_effect()
        self.asked.append((secret, tuple(words)))
        return {'parole': [{'parola': w, 'voto': self.answer(secret, w), 'senso_giusto': None if gloss is None else True,
                            'motivo': 'finto'} for w in words]}


def no_live(server):
    return None


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.world = make_world(self.root)
        self.results = self.root / 'risultati.sqlite3'
        self.reports = self.root / 'rapporti'
        self.paths = ['--raw2', str(self.world['raw2']), '--giochi', str(self.world['giochi']), '--morphit', str(self.world['morphit']),
                      '--risultati', str(self.results), '--rapporti', str(self.reports)]
        self.candidate = ['--candidato', 'mini', '--vettori', str(self.world['vectors']), '--vocab', str(self.world['vocab']), '--dim', str(DIM)]

    def main(self, *args, **kw):
        return cli.main([*args, *self.paths], **kw)

    def valuta(self, *extra, **kw):
        return self.main('valuta', *self.candidate, *extra, **kw)

    def query(self, sql, *params):
        with closing(sqlite3.connect(self.results)) as con:
            return con.execute(sql, params).fetchall()

    def metric(self, name, subset):
        rows = self.query('SELECT value, low, high, n FROM v_run_metrics WHERE metrica = ? AND sottoinsieme = ?', name, subset)
        return rows[0] if rows else None

    # --- campione ---

    def test_the_fixture_has_enough_secrets_in_each_corner(self):
        # Il campione chiede 25+25 (poi 13+12) segrete di misura, con e senza associazioni verificate.
        self.assertGreaterEqual(len(MEASURE & set(GOLD_WORDS)), 45)
        self.assertGreaterEqual(len(MEASURE - set(GOLD_WORDS)), 45)

    def test_campione_is_stable_and_blocks_grow(self):
        self.assertEqual(self.main('campione'), 0)
        first = self.sample()
        self.assertEqual(len(first), 50)
        self.assertEqual(sum(1 for _, gold, _ in first if gold), 25)
        self.assertTrue(all(s in MEASURE and block == 1 for s, _, block in first))
        self.assertTrue(all((s in GOLD_WORDS) == gold for s, gold, _ in first))
        self.assertEqual(self.main('campione'), 0)                  # senza --blocco non cambia nulla
        self.assertEqual(self.sample(), first)
        self.assertEqual(self.main('campione', '--blocco'), 0)
        grown = self.sample()
        self.assertEqual(len(grown), 75)
        self.assertEqual([x for x in grown if x[2] == 1], first)    # i primi 50 restano gli stessi
        self.assertEqual(sum(1 for _, gold, block in grown if block == 2 and gold), 13)
        self.assertEqual(sum(1 for _, gold, block in grown if block == 2 and not gold), 12)

    def sample(self):
        with closing(Store(self.results)) as store:
            return [(r.secret, r.has_gold, r.block) for r in store.sample()]

    # --- valuta senza giudice ---

    def test_valuta_completes_and_writes_the_report(self):
        self.assertEqual(self.valuta('--giudice', 'no'), 0)
        self.assertEqual([r[0] for r in self.query('SELECT status FROM runs')], ['completa'])
        secrets = {r[0] for r in self.query('SELECT DISTINCT s.word FROM run_top t JOIN words s ON s.id = t.secret_id')}
        self.assertEqual(secrets, CONSIDERED)           # misura tutta, sviluppo solo con associazioni verificate
        value, low, high, n = self.metric('precision_10_verificata', 'misura:con_associazioni')
        self.assertEqual(n, len(MEASURE & set(GOLD_WORDS)))
        self.assertTrue(0 <= low <= value <= high <= 1)
        self.assertIsNone(self.metric('precision_10_verificata', 'misura:senza_associazioni'))  # non è uno 0: non c'è
        self.assertIsNone(self.metric('precision_10_giudicata', 'misura:tutte'))                  # nessun giudice, parole senza voto
        self.assertEqual(self.metric('copertura_segrete_con_vettore', 'tutte')[0], 1.0)
        self.assertAlmostEqual(self.metric('copertura_segrete_con_associazioni', 'tutte')[0], N_GOLD / N_SECRETS)
        self.assertIsNotNone(self.metric('posizione_mediana_verificate', 'misura:con_associazioni'))
        self.assertIsNotNone(self.metric('ndcg_20', 'sviluppo:con_associazioni'))
        report = json.loads(next(self.reports.glob('valutazione_mini_*.json')).read_text(encoding='utf-8'))
        self.assertEqual(report['split_rule'], split.SPLIT_RULE)
        self.assertEqual(report['profile'], 'mini')
        self.assertTrue(report['reference_sha256'] and report['gold_sha256'])
        self.assertIn('precision_10_verificata', {m['metrica'] for m in report['metrics']})
        with next(self.reports.glob('valutazione_mini_*.csv')).open(encoding='utf-8', newline='') as f:
            self.assertEqual(next(csv.reader(f)), ['metrica', 'sottoinsieme', 'valore', 'minimo', 'massimo', 'n'])

    def test_second_valuta_starts_a_new_run_and_never_touches_the_first(self):
        self.assertEqual(self.valuta('--giudice', 'no'), 0)
        self.assertEqual(self.valuta('--giudice', 'no'), 0)
        self.assertEqual([r[0] for r in self.query('SELECT status FROM runs ORDER BY id')], ['completa', 'completa'])

    def test_missing_morphit_exits_3_with_the_command(self):
        code = cli.main(['valuta', *self.candidate, '--giudice', 'no', *self.paths, '--morphit', str(self.root / 'manca.txt')])
        self.assertEqual(code, 3)
        self.assertFalse(self.results.exists() and self.query('SELECT COUNT(*) FROM runs')[0][0])

    def test_judging_the_sample_needs_the_sample(self):
        self.assertEqual(self.valuta('--giudice', 'campione', backend=JudgeBackend(), live_guard_fn=no_live), 3)

    def test_profile_must_be_given_one_way_or_the_other(self):
        with self.assertRaises(SystemExit):
            self.main('valuta', '--giudice', 'no')

    # --- valuta con il giudice ---

    def test_judge_runs_on_the_sample_and_fills_the_judged_metrics(self):
        self.assertEqual(self.main('campione'), 0)
        backend = JudgeBackend(answer=lambda secret, word: 2 if word in GOLD_WORDS.get(secret, ()) else 0)
        self.assertEqual(self.valuta('--giudice', 'campione', backend=backend, live_guard_fn=no_live), 0)
        sample = {s for s, _, _ in self.sample()}
        asked_secrets = {s for s, _ in backend.asked}
        self.assertTrue(sample & asked_secrets)
        self.assertIsNotNone(self.metric('precision_10_giudicata', 'misura:tutte'))
        self.assertEqual(self.metric('giudice_sensibilita', 'sviluppo:tutte')[0], 1.0)
        self.assertEqual(self.metric('giudice_specificita', 'sviluppo:tutte')[0], 1.0)
        # I verificati non si chiedono al giudice.
        for secret, words in backend.asked:
            for word in words:
                if secret in sample:
                    self.assertNotIn(word, GOLD_WORDS.get(secret, ()))

    def test_interrupted_judging_resumes_without_asking_again(self):
        self.assertEqual(self.main('campione'), 0)
        backend = JudgeBackend(interrupt_at=2)
        with self.assertRaises(KeyboardInterrupt):
            self.valuta('--giudice', 'campione', backend=backend, live_guard_fn=no_live)
        self.assertEqual([r[0] for r in self.query('SELECT status FROM runs')], ['in_corso'])
        done = len(backend.asked)
        self.assertEqual(done, 1)
        backend.interrupt_at = None
        self.assertEqual(self.valuta('--giudice', 'campione', backend=backend, live_guard_fn=no_live), 0)
        self.assertEqual([r[0] for r in self.query('SELECT status FROM runs')], ['completa'])   # la stessa esecuzione, ripresa
        self.assertEqual(len(backend.asked), len(set(backend.asked)))                            # nessuna richiesta ripetuta

    def test_live_in_progress_stops_before_asking(self):
        self.assertEqual(self.main('campione'), 0)
        backend = JudgeBackend()

        def live(server):
            raise SystemExit('Diretta in corso')
        with self.assertRaises(SystemExit):
            self.valuta('--giudice', 'campione', backend=backend, live_guard_fn=live)
        self.assertEqual(backend.calls, 0)

    def test_reference_changed_during_the_run_cancels_it(self):
        self.assertEqual(self.main('campione'), 0)

        def change_raw2():
            with closing(sqlite3.connect(self.world['raw2'])) as con:
                con.execute("INSERT OR IGNORE INTO parole_segrete VALUES ('zzzz',1,0,0,0)")
                con.commit()
        backend = JudgeBackend(side_effect=change_raw2)
        self.assertEqual(self.valuta('--giudice', 'campione', backend=backend, live_guard_fn=no_live), 2)
        self.assertEqual([r[0] for r in self.query('SELECT status FROM runs')], ['annullata'])
        self.assertEqual(self.query('SELECT COUNT(*) FROM run_metrics')[0][0], 0)   # nessun numero da una base che è cambiata

    # --- ricalcola ---

    def test_ricalcola_uses_the_new_human_verdicts(self):
        self.assertEqual(self.main('campione'), 0)
        self.assertEqual(self.valuta('--giudice', 'no'), 0)
        self.assertIsNone(self.metric('valutazione_umana', 'misura:tutte'))
        with closing(Store(self.results)) as store:
            secret = store.sample()[0].secret
            run = store.con.execute("SELECT MAX(id) FROM runs WHERE status = 'completa'").fetchone()[0]
            store.save_human_verdict(secret, store.top(run, secret)[0], 'naturale')
        self.assertEqual(self.main('ricalcola'), 0)
        value, _, _, n = self.metric('valutazione_umana', 'misura:tutte')
        self.assertEqual((value, n), (1.0, 1))
        self.assertIsNotNone(self.metric('copertura_segrete_con_vettore', 'tutte'))   # il ricalcolo non butta via il resto
        # Il rapporto della stessa esecuzione viene riscritto con i numeri nuovi.
        files = list(self.reports.glob('valutazione_mini_*.json'))
        self.assertEqual(len(files), 1)
        self.assertIn('valutazione_umana', {m['metrica'] for m in json.loads(files[0].read_text(encoding='utf-8'))['metrics']})

    def test_ricalcola_refuses_when_raw2_changed_after_the_run(self):
        self.assertEqual(self.valuta('--giudice', 'no'), 0)
        with closing(sqlite3.connect(self.world['raw2'])) as con:
            con.execute("INSERT INTO parole_segrete VALUES ('zzzz',1,0,0,0)")
            con.commit()
        self.assertEqual(self.main('ricalcola'), 2)

    def test_ricalcola_reports_the_agreement_between_judge_and_luca(self):
        self.assertEqual(self.main('campione'), 0)
        backend = JudgeBackend(answer=lambda secret, word: 2)
        self.assertEqual(self.valuta('--giudice', 'campione', backend=backend, live_guard_fn=no_live), 0)
        with closing(Store(self.results)) as store:
            run = store.con.execute("SELECT MAX(id) FROM runs WHERE status = 'completa'").fetchone()[0]
            pairs = [(r.secret, w) for r in store.sample() for w in store.top(run, r.secret)[:10]
                     if store.judge_verdicts(r.secret, store.con.execute('SELECT judge_version FROM runs WHERE id = ?', (run,)).fetchone()[0]).get(w)]
            for i, (secret, word) in enumerate(pairs[:4]):
                store.save_human_verdict(secret, word, 'naturale' if i < 3 else 'non_naturale')   # il giudice ha detto 2 a tutte
        self.assertEqual(self.main('ricalcola'), 0)
        value, _, _, n = self.metric('giudice_accordo_umano', 'campione')
        self.assertEqual((value, n), (3 / 4, 4))

    # --- parità ---

    def test_parita_writes_the_top_of_the_first_secrets(self):
        self.assertEqual(self.main('parita', *self.candidate, '--segrete', '5'), 0)
        data = json.loads((self.reports / 'parita_mini.json').read_text(encoding='utf-8'))
        self.assertEqual(data['profile'], 'mini')
        expected = sorted(s for s in MEASURE)[:5]
        self.assertEqual([x['secret'] for x in data['secrets']], expected)
        profile = profiles.load_candidate('mini', self.world['vectors'], self.world['vocab'], DIM)
        first = data['secrets'][0]
        self.assertEqual(first['top'], [profile.words[i] for i in ranking.top(profile, profile.index[first['secret']], k=20)])
        self.assertEqual(len(first['top']), 20)


if __name__ == '__main__':
    unittest.main()
