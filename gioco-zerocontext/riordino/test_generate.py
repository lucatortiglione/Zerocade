"""Associazioni generate da Qwen: lettura della risposta, cache riprendibile, fusione nelle liste riordinate."""
from pathlib import Path
import tempfile
import unittest

from riordino.generate import Generator, merge_generated, parse_words

VOCAB = {'abbaiare', 'cucciolo', 'guinzaglio', 'osso', 'cani', 'gatto', 'zampa'}


class FakeRef:
    def is_variant(self, word, secret):
        return (word, secret) == ('cani', 'cane')


class ParseWordsTest(unittest.TestCase):
    def test_keeps_order_and_drops_secret_variants_duplicates_and_words_outside_the_vocabulary(self):
        response = {'parole': ['Guinzaglio', ' abbaiare ', 'cane', 'cani', 'guinzaglio', 'tartufo', 'osso']}
        self.assertEqual(parse_words(response, 'cane', FakeRef(), VOCAB), ['guinzaglio', 'abbaiare', 'osso'])

    def test_a_malformed_response_is_an_error(self):
        for bad in ({}, {'parole': 'osso'}, {'parole': [3]}, None):
            with self.assertRaises(ValueError):
                parse_words(bad, 'cane', FakeRef(), VOCAB)


class FakeBackend:
    model = 'finto'

    def __init__(self, answers):
        self.answers, self.calls = list(answers), []

    def ask(self, secret, pos):
        self.calls.append((secret, pos))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


class GeneratorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name) / 'generate.jsonl'

    def test_asks_once_and_remembers_across_instances(self):
        backend = FakeBackend([{'parole': ['guinzaglio', 'osso']}])
        first = Generator(backend, self.file)
        self.assertEqual(first.words_for('cane', 'nome', FakeRef(), VOCAB), ['guinzaglio', 'osso'])
        second = Generator(FakeBackend([]), self.file)
        self.assertEqual(second.words_for('cane', 'nome', FakeRef(), VOCAB), ['guinzaglio', 'osso'])
        self.assertEqual(backend.calls, [('cane', 'nome')])

    def test_a_different_model_does_not_reuse_the_answers_of_another(self):
        Generator(FakeBackend([{'parole': ['osso']}]), self.file).words_for('cane', 'nome', FakeRef(), VOCAB)
        other = FakeBackend([{'parole': ['zampa']}])
        other.model = 'altro'
        self.assertEqual(Generator(other, self.file).words_for('cane', 'nome', FakeRef(), VOCAB), ['zampa'])

    def test_retries_once_then_gives_up_without_saving(self):
        backend = FakeBackend([ValueError('troncata'), {'parole': 'no'}])
        generator = Generator(backend, self.file)
        self.assertIsNone(generator.words_for('cane', 'nome', FakeRef(), VOCAB))
        self.assertEqual(len(backend.calls), 2)
        self.assertFalse(self.file.exists() and self.file.read_text(encoding='utf-8').strip())

    def test_the_second_attempt_can_succeed(self):
        generator = Generator(FakeBackend([ValueError('troncata'), {'parole': ['osso']}]), self.file)
        self.assertEqual(generator.words_for('cane', 'nome', FakeRef(), VOCAB), ['osso'])

    def test_the_vocabulary_is_applied_when_reading_not_when_saving(self):
        Generator(FakeBackend([{'parole': ['osso', 'tartufo']}]), self.file).words_for('cane', 'nome', FakeRef(), VOCAB)
        again = Generator(FakeBackend([]), self.file)
        self.assertEqual(again.words_for('cane', 'nome', FakeRef(), VOCAB | {'tartufo'}), ['osso', 'tartufo'])


class MergeTest(unittest.TestCase):
    def test_generated_words_go_first_in_the_order_of_the_list_then_the_ones_the_list_lacked(self):
        lists = {'cane': ['gatto', 'abbaiare', 'cucciolo', 'osso', 'zampa']}
        generated = {'cane': ['zampa', 'guinzaglio', 'abbaiare']}
        merged = merge_generated(lists, generated, FakeRef())
        self.assertEqual(merged['cane'], ['abbaiare', 'zampa', 'guinzaglio', 'gatto', 'cucciolo', 'osso'])

    def test_secrets_without_generated_words_and_with_an_empty_answer_are_unchanged(self):
        lists = {'cane': ['gatto', 'osso'], 'luna': ['sole']}
        merged = merge_generated(lists, {'cane': []}, FakeRef())
        self.assertEqual(merged, lists)

    def test_does_not_modify_the_input(self):
        lists = {'cane': ['gatto', 'osso']}
        merge_generated(lists, {'cane': ['osso']}, FakeRef())
        self.assertEqual(lists, {'cane': ['gatto', 'osso']})

    def test_a_secret_with_only_generated_words_gets_a_list(self):
        self.assertEqual(merge_generated({}, {'cane': ['osso']}, FakeRef()), {'cane': ['osso']})


if __name__ == '__main__':
    unittest.main()
