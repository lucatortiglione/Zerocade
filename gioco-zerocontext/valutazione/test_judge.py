"""Giudice Qwen: cache, risposte non valide, controlli di sensibilità e specificità, blocco durante una diretta."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import socket
import sys
import tempfile
import threading
import unittest

from valutazione import judge
from valutazione.gold import GoldEntry
from valutazione.judge import Judge, QwenBackend, controls, judge_version, live_guard
from valutazione.store import Store

GLOSS = 'Animale domestico della specie canina'


class FakeBackend:
    """Risponde come farebbe Qwen: una voce per parola; `answer` decide il contenuto."""
    def __init__(self, answer=None):
        self.calls = 0
        self.asked: list[list[str]] = []
        self.answer = answer or (lambda secret, gloss, word: (2, True if gloss else None))

    def ask(self, secret, gloss, words):
        self.calls += 1
        self.asked.append(list(words))
        out = []
        for w in words:
            grade, sense = self.answer(secret, gloss, w)
            out.append({'parola': w, 'voto': grade, 'senso_giusto': sense, 'motivo': f'motivo di {w}'})
        return {'parole': out}


class JudgeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(Path(self.tmp.name) / 'r.sqlite3')
        self.addCleanup(self.store.close)
        self.backend = FakeBackend()
        self.judge = Judge(self.store, self.backend, 'fake')

    def test_second_run_makes_no_request(self):
        first = self.judge.grade('cane', GLOSS, ['gatto', 'osso'])
        again = self.judge.grade('cane', GLOSS, ['gatto', 'osso'])
        self.assertEqual(self.backend.calls, 1)
        self.assertEqual(first, again)
        self.assertEqual((first['gatto'].grade, first['gatto'].sense_ok, first['gatto'].reason), (2, True, 'motivo di gatto'))

    def test_only_the_missing_words_are_asked(self):
        self.judge.grade('cane', GLOSS, ['gatto'])
        result = self.judge.grade('cane', GLOSS, ['gatto', 'osso'])
        self.assertEqual(self.backend.asked, [['gatto'], ['osso']])
        self.assertEqual(set(result), {'gatto', 'osso'})

    def test_words_are_normalized_and_deduplicated(self):
        result = self.judge.grade('Cane', GLOSS, ['Gatto', 'gatto', 'Città'])
        self.assertEqual(self.backend.asked, [['gatto', 'città']])
        self.assertEqual(set(result), {'gatto', 'città'})

    def test_wrong_words_rejected_then_none(self):
        def wrong(secret, gloss, words):  # risponde su una parola che non è stata chiesta
            self.backend.calls += 1
            return {'parole': [{'parola': 'tavolo', 'voto': 2, 'senso_giusto': True, 'motivo': 'x'}]}
        self.backend.ask = wrong
        self.assertIsNone(self.judge.grade('cane', GLOSS, ['gatto', 'osso']))
        self.assertEqual(self.backend.calls, 2)   # un solo nuovo tentativo
        self.assertIsNone(self.store.judge_verdict('cane', 'gatto', judge_version(), 'fake'))
        self.assertIsNone(self.store.judge_verdict('cane', 'tavolo', judge_version(), 'fake'))

    def test_missing_word_in_the_answer_is_rejected(self):
        self.backend.ask = lambda secret, gloss, words: {'parole': [{'parola': 'gatto', 'voto': 2, 'senso_giusto': None, 'motivo': 'x'}]}
        self.assertIsNone(self.judge.grade('cane', GLOSS, ['gatto', 'osso']))
        self.assertIsNone(self.store.judge_verdict('cane', 'gatto', judge_version(), 'fake'))  # niente a metà

    def test_invalid_grade_or_shape_is_rejected(self):
        for bad in ({'parole': [{'parola': 'gatto', 'voto': 3, 'senso_giusto': None, 'motivo': 'x'}]},
                    {'parole': [{'parola': 'gatto', 'voto': True, 'senso_giusto': None, 'motivo': 'x'}]},
                    {'parole': [{'parola': 'gatto', 'voto': 2, 'senso_giusto': 'si', 'motivo': 'x'}]},
                    {'parole': 'gatto'}, {}, {'parole': [{'voto': 2}]}):
            self.backend.ask = lambda secret, gloss, words, bad=bad: bad
            self.assertIsNone(self.judge.grade('cane', GLOSS, ['gatto']), bad)

    def test_retry_once_then_ok(self):
        answers = [{'parole': []}, None]

        def ask(secret, gloss, words):
            self.backend.calls += 1
            if len(answers) == 2:
                answers.pop()
                return {'parole': []}   # malformata: nessuna parola
            return {'parole': [{'parola': w, 'voto': 1, 'senso_giusto': None, 'motivo': 'ok'} for w in words]}
        self.backend.ask = ask
        result = self.judge.grade('cane', GLOSS, ['gatto'])
        self.assertEqual(result['gatto'].grade, 1)
        self.assertEqual(self.backend.calls, 2)

    def test_without_gloss_the_sense_is_never_set(self):
        result = self.judge.grade('cane', None, ['gatto'])       # il finto risponde con None perché la glossa manca
        self.assertIsNone(result['gatto'].sense_ok)
        self.backend.ask = lambda secret, gloss, words: {'parole': [{'parola': 'osso', 'voto': 2, 'senso_giusto': True, 'motivo': 'x'}]}
        self.assertIsNone(self.judge.grade('cane', None, ['osso'])['osso'].sense_ok)  # anche se Qwen risponde true

    def test_reason_is_cut_to_the_schema_limit(self):
        self.backend.ask = lambda secret, gloss, words: {'parole': [{'parola': 'gatto', 'voto': 2, 'senso_giusto': None, 'motivo': 'a' * 400}]}
        self.assertEqual(len(self.judge.grade('cane', GLOSS, ['gatto'])['gatto'].reason), 160)

    def test_backend_errors_are_not_swallowed(self):
        def broken(secret, gloss, words):
            raise ConnectionError('server spento')
        self.backend.ask = broken
        with self.assertRaises(ConnectionError):
            self.judge.grade('cane', GLOSS, ['gatto'])

    def test_judge_version_follows_the_prompt(self):
        before = judge_version()
        self.assertTrue(before.startswith(judge.JUDGE_PROMPT_VERSION + '-'))
        self.assertEqual(before, judge_version())
        original = judge.SYSTEM
        self.addCleanup(setattr, judge, 'SYSTEM', original)
        judge.SYSTEM = original + ' Regola nuova.'
        self.assertNotEqual(before, judge_version())

    def test_schema_matches_the_plan(self):
        item = judge.SCHEMA['properties']['parole']['items']
        self.assertEqual(item['required'], ['parola', 'voto', 'senso_giusto', 'motivo'])
        self.assertEqual(item['properties']['voto']['enum'], [0, 1, 2])
        self.assertEqual(item['properties']['motivo']['maxLength'], 160)


class FakeRef:
    def is_variant(self, word, secret):
        return False

    def in_reference(self, word):
        return True


class ControlsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(Path(self.tmp.name) / 'r.sqlite3')
        self.addCleanup(self.store.close)
        self.gold = {s: GoldEntry(f'glossa {s}', 'NOUN', {f'{s}1': 1, f'{s}2': 2, f'{s}3': 3}) for s in ('alfa', 'beta', 'gamma', 'delta')}
        self.vocab = sorted([w for e in self.gold.values() for w in e.groups] + [f'v{i}' for i in range(200)] + list(self.gold))
        self.dev = list(self.gold)

    def judge_with(self, answer):
        return Judge(self.store, FakeBackend(answer), 'fake')

    def test_good_judge_scores_one_and_one(self):
        # 2 alle associazioni verificate, 0 alle parole a caso
        def answer(secret, gloss, word):
            return (2 if word in self.gold[secret].groups else 0), None
        result = controls(self.judge_with(answer), self.gold, self.vocab, FakeRef(), self.dev, seed=1, size=3)
        self.assertEqual((result['sensibilita'], result['specificita'], result['n']), (1.0, 1.0, 3))

    def test_permissive_judge_is_caught_by_specificity(self):
        result = controls(self.judge_with(lambda s, g, w: (2, None)), self.gold, self.vocab, FakeRef(), self.dev, seed=1, size=3)
        self.assertEqual((result['sensibilita'], result['specificita']), (1.0, 0.0))

    def test_strict_judge_is_caught_by_sensitivity(self):
        result = controls(self.judge_with(lambda s, g, w: (0, None)), self.gold, self.vocab, FakeRef(), self.dev, seed=1, size=3)
        self.assertEqual((result['sensibilita'], result['specificita']), (0.0, 1.0))

    def test_random_words_are_never_verified_associations_or_the_secret(self):
        seen = []

        def answer(secret, gloss, word):
            seen.append((secret, word))
            return 0, None
        controls(self.judge_with(answer), self.gold, self.vocab, FakeRef(), self.dev, seed=2, size=4)
        for secret, word in seen:
            if word.startswith('v'):
                self.assertNotIn(word, self.gold[secret].groups)
                self.assertNotEqual(word, secret)

    def test_same_seed_same_pairs(self):
        runs = []
        for number in range(2):
            seen = []
            store = Store(Path(self.tmp.name) / f'r{number}.sqlite3')   # una cache vuota per ogni giro
            self.addCleanup(store.close)
            controls(Judge(store, FakeBackend(lambda s, g, w: (seen.append((s, w)) or 0, None)), 'fake'),
                     self.gold, self.vocab, FakeRef(), self.dev, seed=5, size=3)
            runs.append(sorted(seen))
        self.assertEqual(runs[0], runs[1])


class LiveHandler(BaseHTTPRequestHandler):
    reply = (200, {'live': False})

    def do_GET(self):
        status, body = self.reply
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def log_message(self, *args):
        pass


class LiveGuardTest(unittest.TestCase):
    def serve(self, reply):
        LiveHandler.reply = reply
        server = HTTPServer(('127.0.0.1', 0), LiveHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f'http://127.0.0.1:{server.server_port}'

    def test_live_refuses_to_start(self):
        with self.assertRaises(SystemExit) as caught:
            live_guard(self.serve((200, {'live': True})))
        self.assertIn('Diretta in corso', str(caught.exception))

    def test_no_live_goes_on(self):
        live_guard(self.serve((200, {'live': False})))

    def test_server_off_goes_on(self):
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            port = s.getsockname()[1]
        live_guard(f'http://127.0.0.1:{port}')   # porta chiusa: Zerocade non è acceso

    def test_server_that_cannot_say_stops(self):
        with self.assertRaises(SystemExit):
            live_guard(self.serve((404, {'error': 'no'})))   # un Zerocade vecchio, senza la rotta


class FakeQwenModule:
    """Il modulo di gioco-zeroassociations/script/qwen_associations.py, ridotto a quello che usa QwenBackend."""
    def __init__(self, started):
        self.started = started
        self.requests = []
        self.process = type('P', (), {'terminated': False, 'terminate': lambda s: setattr(s, 'terminated', True),
                                      'wait': lambda s, timeout=None: 0})() if started else None

    def config(self):
        return {'served_model': 'qwen-fake', 'endpoint': 'http://x'}

    ensure_called = False

    def ensure_server(self, cfg):
        self.ensure_called = True
        return self.process

    def chat(self, cfg, system, user, schema, seed, max_tokens, temperature):
        self.requests.append((system, user, schema, seed, max_tokens, temperature))
        return {'parole': [{'parola': 'gatto', 'voto': 2, 'senso_giusto': None, 'motivo': 'ok'}]}, {}


class QwenBackendTest(unittest.TestCase):
    def test_importing_the_judge_does_not_load_the_qwen_scripts(self):
        self.assertNotIn('qwen_associations', sys.modules)

    def test_ask_is_deterministic_and_passes_the_schema(self):
        fake = FakeQwenModule(started=False)
        backend = QwenBackend(qwen=fake, lazy=False)
        self.assertEqual(backend.model, 'qwen-fake')
        answer = backend.ask('cane', GLOSS, ['gatto'])
        self.assertEqual(answer['parole'][0]['parola'], 'gatto')
        system, user, schema, seed, max_tokens, temperature = fake.requests[0]
        self.assertEqual((seed, max_tokens, temperature), (0, 2048, 0))
        self.assertIs(schema, judge.SCHEMA)
        self.assertEqual(system, judge.SYSTEM)
        self.assertEqual(user, {'segreta': 'cane', 'glossa': GLOSS, 'parole': ['gatto']})

    def test_close_stops_only_a_server_it_started(self):
        started = FakeQwenModule(started=True)
        QwenBackend(qwen=started, lazy=False).close()
        self.assertTrue(started.process.terminated)
        QwenBackend(qwen=FakeQwenModule(started=False), lazy=False).close()   # un server già attivo non si tocca

    def test_lazy_backend_starts_the_server_only_on_the_first_question(self):
        # Il nome del modello serve per leggere la cache: con la cache piena Qwen non deve nemmeno partire.
        fake = FakeQwenModule(started=True)
        backend = QwenBackend(qwen=fake)
        self.assertEqual(backend.model, 'qwen-fake')
        self.assertFalse(fake.ensure_called)
        backend.close()
        self.assertFalse(fake.process.terminated)
        backend.ask('cane', GLOSS, ['gatto'])
        self.assertTrue(fake.ensure_called)
        backend.close()
        self.assertTrue(fake.process.terminated)


if __name__ == '__main__':
    unittest.main()
