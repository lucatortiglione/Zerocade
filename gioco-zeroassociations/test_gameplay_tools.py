"""Bacini letti come il gioco, telemetria della chat e giocatori simulati (senza rete né DB reale)."""
import csv
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from analyze_telemetry import analyze, main as analyze_main
from free_association_llm import propose, recall
from verified_pools import Pool, answer_key, inflections, load_pools

WORDS = ['forno', 'mozzarella', 'pomodoro', 'impasto', 'lievito', 'basilico', 'margherita', 'pala']


def make_db(path: Path):
    db = sqlite3.connect(path)
    db.executescript('''
      CREATE TABLE reviews(id TEXT PRIMARY KEY, decision TEXT NOT NULL);
      CREATE TABLE prompts(lemma TEXT PRIMARY KEY, familiar_sense TEXT NOT NULL);
      CREATE TABLE senses(id TEXT PRIMARY KEY, prompt TEXT, description TEXT, pos TEXT, category_id TEXT, review_id TEXT);
      CREATE TABLE associations(sense_id TEXT, word TEXT, meaning_group TEXT, difficulty TEXT, difficulty_basis TEXT);
      INSERT INTO reviews VALUES ('r1', 'verified');
      INSERT INTO prompts VALUES ('pizza', 'Piatto tondo');
      INSERT INTO senses VALUES ('s1', 'pizza', 'Piatto tondo', 'NOUN', '009', 'r1'), ('s2', 'pizza', 'Altro', 'NOUN', NULL, 'r1');
    ''')
    db.executemany('INSERT INTO associations VALUES (?, ?, ?, ?, ?)',
                   [('s1', w, w, 'easy', 'editorial_estimate_not_gameplay_test') for w in WORDS] + [('s2', 'altro', 'altro', 'easy', '')])
    db.commit(); db.close()


def pool():
    return Pool('s1', 'pizza', 'NOUN', 'Piatto tondo', '009',
                {w: {'group': w, 'difficulty': 'easy', 'difficulty_basis': ''} for w in WORDS})


class WordsTests(unittest.TestCase):
    def test_same_rules_as_the_game(self):
        self.assertEqual(answer_key('CAFFÈ'), 'caffe')
        self.assertEqual(inflections('pomodoro', 'NOUN'), ['pomodori'])
        self.assertEqual(sorted(inflections('fuoco', 'NOUN')), ['fuochi', 'fuoci'])
        self.assertEqual(inflections('barca', 'NOUN'), ['barche'])
        self.assertEqual(sorted(inflections('rosso', 'ADJ')), ['rossa', 'rosse', 'rossi'])
        self.assertEqual(inflections('tremare', 'NOUN'), [])
        self.assertEqual(inflections('mare', 'NOUN'), ['mari'])
        self.assertEqual(inflections('cabina', 'NOUN'), ['cabine'])
        self.assertEqual(sorted(inflections('problema', 'NOUN')), ['probleme', 'problemi'])
        self.assertEqual(pool().answer_for('Pomodori'), 'pomodoro')
        self.assertIsNone(pool().answer_for('pizzeria'))

    def test_pools_read_only_familiar_sense(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'prompt.sqlite3'; make_db(path)
            pools = load_pools(path)
            self.assertEqual([p.prompt for p in pools], ['pizza'])
            self.assertEqual(sorted(pools[0].answers), sorted(WORDS))
            self.assertEqual(pools[0].ref, pool().ref)
            self.assertTrue(pools[0].ref.startswith('c') and len(pools[0].ref) == 25)
            # Come il gioco: un prompt scartato o rimandato nella raccolta non gioca.
            db = sqlite3.connect(path)
            db.executescript("CREATE TABLE inventory_term_decisions(prompt TEXT PRIMARY KEY, decision TEXT NOT NULL);"
                             "INSERT INTO inventory_term_decisions VALUES ('pizza', 'DEFERRED');")
            db.commit(); db.close()
            self.assertEqual(load_pools(path), [])


def rounds_of(p: Pool, n: int):
    """n round: forno sempre trovato presto, pala mai, pizzeria e bufala scritte spesso."""
    guesses = []
    for r in range(1, n+1):
        drawn = [w for w in WORDS if w != 'basilico']  # basilico non estratto: resta nel bacino
        for w in drawn:
            if w == 'forno': guesses.append(dict(round=str(r), ref=p.ref, prompt='pizza', kind='found', word=w, at_ms='4000', hinted='0', count='1'))
            elif w == 'mozzarella' and r % 2: guesses.append(dict(round=str(r), ref=p.ref, prompt='pizza', kind='found', word=w, at_ms='30000', hinted='1', count='1'))
            else: guesses.append(dict(round=str(r), ref=p.ref, prompt='pizza', kind='missed', word=w, at_ms='', hinted='0', count='1'))
        guesses.append(dict(round=str(r), ref=p.ref, prompt='pizza', kind='wrong', word='pizzeria', at_ms='', hinted='0', count='3'))
        guesses.append(dict(round=str(r), ref=p.ref, prompt='pizza', kind='wrong', word='basilici', at_ms='', hinted='0', count='2'))
        if r == 1: guesses.append(dict(round='1', ref=p.ref, prompt='pizza', kind='wrong', word='bufala', at_ms='', hinted='0', count='1'))
    return guesses


class TelemetryTests(unittest.TestCase):
    def test_measured_difficulty_never_found_and_chat_words(self):
        p = pool()
        report = analyze(rounds_of(p, 6), [dict(round=str(r), found='2', total='7') for r in range(1, 7)], [p])
        [prompt] = report['prompts']
        words = {w['word']: w for w in prompt['words']}
        self.assertEqual(words['forno']['measured_difficulty'], 'easy')
        self.assertEqual(words['forno']['median_seconds'], 4.0)
        self.assertEqual(words['mozzarella']['measured_difficulty'], 'medium')
        self.assertEqual(words['mozzarella']['hinted_rate'], 1.0)
        self.assertEqual(words['pala']['measured_difficulty'], 'hard')
        self.assertIn('mai_trovata', words['pala']['flags'])
        self.assertIn('difficoltà_diversa', words['pala']['flags'])  # Stimata facile, mai trovata.
        self.assertEqual(prompt['pool_words_never_drawn'], ['basilico'])
        chat = {c['guess']: c for c in prompt['chat_words']}
        self.assertEqual(chat['pizzeria']['kind'], 'candidata')
        self.assertEqual(chat['pizzeria']['count'], 18)
        self.assertEqual(chat['basilici'], {**chat['basilici'], 'kind': 'nel_bacino', 'pool_word': 'basilico'})
        self.assertNotIn('bufala', chat)  # Un round solo: non basta.
        self.assertEqual([x['word'] for x in report['proposals']], ['pizzeria'])
        self.assertEqual(report['proposals'][0]['status'], 'AWAITING_SEMANTIC_REVIEW')
        self.assertFalse(report['approval'])

    def test_few_rounds_measure_nothing(self):
        report = analyze(rounds_of(pool(), 2), None, [pool()])
        self.assertTrue(all(w['measured_difficulty'] is None and not w['flags'] for w in report['prompts'][0]['words']))
        self.assertEqual(report['proposals'], [])

    def test_cli_reads_dashboard_csv_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d); db = d/'prompt.sqlite3'; make_db(db)
            rows = rounds_of(load_pools(db)[0], 6)
            with (d/'tentativi.csv').open('w', encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, ['round', 'content_id', 'ref', 'prompt', 'kind', 'word', 'at_ms', 'hinted', 'count', 'duration_ms'])
                writer.writeheader()
                for r in rows: writer.writerow({**r, 'content_id': 'x', 'duration_ms': '60000'})
            out, props = d/'rapporto.json', d/'proposte.jsonl'
            analyze_main(['--guesses', str(d/'tentativi.csv'), '--db', str(db), '--output', str(out), '--proposals', str(props)])
            self.assertEqual(json.loads(out.read_text(encoding='utf-8'))['summary']['candidates'], 1)
            self.assertEqual(json.loads(props.read_text(encoding='utf-8').splitlines()[0])['word'], 'pizzeria')
            with self.assertRaises(FileExistsError):
                analyze_main(['--guesses', str(d/'tentativi.csv'), '--db', str(db), '--output', str(out)])


def fake_players(answers: list[list[str]]):
    """Un «LLM» finto: il giocatore n scrive answers[n % len(answers)]."""
    seen = []
    def sample(prompt, hint, count, seed):
        seen.append((prompt, hint, count))
        return answers[seed % len(answers)][:count]
    return sample, seen


class SimulatedPlayersTests(unittest.TestCase):
    def test_recall_counts_each_player_once_with_inflections(self):
        sample, seen = fake_players([
            ['forni', 'forno', 'mozzarella', 'Pizza', 'pizzeria', 'teglia'],
            ['pomodori', 'pizzeria', 'forno'],
            ['pizzeria', 'margherita', 'forno', 'teglia'],
            ['forno', 'bufala'],
        ])
        result = recall(pool(), sample, k=4, count=10, with_hint=True)
        answers = {a['word']: a for a in result['answers']}
        self.assertEqual(answers['forno']['players'], 4)  # "forni" e "forno" dallo stesso: uno.
        self.assertEqual(answers['pomodoro']['players'], 1)
        self.assertEqual(answers['pala']['recall'], 0.0)
        self.assertIn('poco_recuperabile', answers['pala']['flags'])
        self.assertEqual(result['candidates'], [{'word': 'pizzeria', 'players': 3}, {'word': 'teglia', 'players': 2}])
        self.assertEqual(seen[0], ('pizza', 'Piatto tondo', 10))  # Con --with-hint vede l'accezione.

    def test_propose_keeps_what_half_the_players_say(self):
        sample, _ = fake_players([['sabbia', 'ombrellone', 'onde'], ['ombrellone', 'sabbia', 'pesce'], ['sabbia', 'mare'], ['sole', 'Sabbia']])
        draft = propose('mare', sample, k=4, count=10)
        self.assertEqual(draft['words'], [{'word': 'sabbia', 'players': 4}, {'word': 'ombrellone', 'players': 2}])
        self.assertEqual(draft['status'], 'UNREVIEWED_LOCAL_DRAFT')
        self.assertFalse(draft['database_inserted'])


if __name__ == '__main__':
    unittest.main()
