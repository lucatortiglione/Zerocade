"""Associazioni verificate, caricamento dei profili e ranking uguale a quello del gioco."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import numpy as np

from valutazione import gold, paths, profiles, ranking

REPO = Path(__file__).resolve().parents[2]
WORDS = ['cane', 'gatto', 'guinzaglio', 'osso', 'coda', 'scodinzolare']


def make_giochi(path: Path, vectors_name: str, sha: str, n: int, dim: int, meta_extra: dict | None = None,
                prompts=None) -> None:
    meta = {'vectors_file': vectors_name, 'vectors_sha256': sha, 'dim': dim, 'words': n, 'vector_format': 'float32',
            'links': 0, 'hub_strength': 0, **(meta_extra or {})}
    with closing(sqlite3.connect(path)) as con:
        con.executescript('''
            CREATE TABLE context_original__meta(name TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE context_original__vocab(idx INTEGER PRIMARY KEY, word TEXT);
            CREATE TABLE context_abtt__meta(name TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE context_abtt__vocab(idx INTEGER PRIMARY KEY, word TEXT);
            CREATE TABLE associazioni__prompts(id INTEGER PRIMARY KEY, prompt TEXT, pos TEXT, sense TEXT, category_id TEXT,
                                               ref TEXT, review_id TEXT);
            CREATE TABLE associazioni__words(id INTEGER PRIMARY KEY, word TEXT);
            CREATE TABLE associazioni__prompt_words(prompt_id INTEGER, word_id INTEGER, group_name_id INTEGER,
                                                    difficulty INTEGER, PRIMARY KEY(prompt_id, word_id));
        ''')
        for schema in ('context_original', 'context_abtt'):
            con.executemany(f'INSERT INTO {schema}__meta VALUES (?,?)', [(k, json.dumps(v)) for k, v in meta.items()])
            # Righe inserite in disordine: il vocabolario va letto per idx.
            con.executemany(f'INSERT INTO {schema}__vocab VALUES (?,?)', list(reversed(list(enumerate(WORDS[:n])))))
        con.executemany('INSERT INTO associazioni__words VALUES (?,?)',
                        [(1, 'abbaiare'), (2, 'coda'), (3, 'scodinzolare'), (4, 'guinzaglio')])
        rows = prompts if prompts is not None else [(1, 'cane', 'NOUN', 'Animale domestico della specie canina')]
        con.executemany('INSERT INTO associazioni__prompts VALUES (?,?,?,?,NULL,NULL,NULL)', rows)
        con.executemany('INSERT INTO associazioni__prompt_words VALUES (1,?,?,4)', [(1, 6), (2, 2351), (3, 2351), (4, 4972)])
        con.commit()


class GoldTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.giochi = Path(self.tmp.name) / 'giochi.sqlite3'
        make_giochi(self.giochi, 'v.bin', 'x', 6, 4)

    def test_gold_groups(self):
        g = gold.load_gold(self.giochi)
        self.assertEqual(g['cane'].gloss, 'Animale domestico della specie canina')
        self.assertEqual(g['cane'].pos, 'NOUN')
        self.assertEqual(g['cane'].groups, {'abbaiare': 6, 'coda': 2351, 'scodinzolare': 2351, 'guinzaglio': 4972})

    def test_two_senses_for_one_word_are_refused(self):
        again = Path(self.tmp.name) / 'due.sqlite3'
        make_giochi(again, 'v.bin', 'x', 6, 4, prompts=[(1, 'cane', 'NOUN', 'animale'), (2, 'cane', 'NOUN', 'segno zodiacale')])
        with self.assertRaises(ValueError):
            gold.load_gold(again)

    def test_fingerprint_changes_with_the_content(self):
        before = gold.fingerprint(self.giochi)
        self.assertEqual(before, gold.fingerprint(self.giochi))
        with closing(sqlite3.connect(self.giochi)) as con:
            con.execute("INSERT INTO associazioni__words VALUES (9, 'osso')")
            con.execute('INSERT INTO associazioni__prompt_words VALUES (1, 9, 5000, 4)')
            con.commit()
        self.assertNotEqual(before, gold.fingerprint(self.giochi))


class ProfilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.dir = root / 'data'
        self.dir.mkdir()
        rng = np.random.default_rng(7)
        m = rng.normal(size=(6, 4)).astype('<f4')
        m /= np.linalg.norm(m, axis=1, keepdims=True)
        self.matrix = m.astype('<f4')
        self.file = self.dir / 'vectors.test.bin'
        self.file.write_bytes(self.matrix.tobytes())
        self.sha = hashlib.sha256(self.file.read_bytes()).hexdigest()
        self.giochi = root / 'giochi.sqlite3'
        make_giochi(self.giochi, self.file.name, self.sha, 6, 4)

    def load(self, name='original', **kw):
        return profiles.load_published(name, giochi=self.giochi, vectors_dir=self.dir, **kw)

    def test_loads_vocabulary_by_idx_and_vectors(self):
        p = self.load()
        self.assertEqual(p.words, WORDS)
        self.assertEqual(p.index['guinzaglio'], 2)
        self.assertEqual(p.vectors.shape, (6, 4))
        np.testing.assert_array_equal(np.asarray(p.vectors), self.matrix)
        self.assertEqual(p.sha256, self.sha)
        self.assertIsNone(p.pinned)

    def test_changed_vectors_file_is_refused(self):
        self.file.write_bytes(self.matrix.tobytes()[:-4] + b'\x00\x00\x80\x3f')
        with self.assertRaises(ValueError) as caught:
            self.load()
        self.assertIn('SHA-256', str(caught.exception))

    def test_other_vector_formats_are_refused(self):
        other = Path(self.tmp.name) / 'int8.sqlite3'
        make_giochi(other, self.file.name, self.sha, 6, 4, meta_extra={'vector_format': 'int8'})
        with self.assertRaises(ValueError):
            profiles.load_published('original', giochi=other, vectors_dir=self.dir)

    def test_profile_with_links_or_hubs_is_refused(self):
        # Il ranking del valutatore è un puro coseno: con collegamenti o hub attivi non coinciderebbe con il gioco.
        other = Path(self.tmp.name) / 'links.sqlite3'
        make_giochi(other, self.file.name, self.sha, 6, 4, meta_extra={'links': 12})
        with self.assertRaises(ValueError):
            profiles.load_published('original', giochi=other, vectors_dir=self.dir)

    def test_word_count_must_match_the_vectors(self):
        other = Path(self.tmp.name) / 'count.sqlite3'
        make_giochi(other, self.file.name, self.sha, 5, 4)
        with self.assertRaises(ValueError):
            profiles.load_published('original', giochi=other, vectors_dir=self.dir)

    def test_candidate_profile(self):
        vocab = Path(self.tmp.name) / 'vocab.txt'
        vocab.write_text('\n'.join(WORDS) + '\n', encoding='utf-8')
        p = profiles.load_candidate('nuovo', self.file, vocab, 4)
        self.assertEqual((p.name, p.words, p.vectors.shape), ('nuovo', WORDS, (6, 4)))
        with self.assertRaises(ValueError):
            profiles.load_candidate('nuovo', self.file, vocab, 5)

    def make_export(self, rows_per_secret, extra_words=()):
        path = Path(self.tmp.name) / 'pipeline_b.sqlite3'
        with closing(sqlite3.connect(path)) as con:
            con.executescript('''
                CREATE TABLE lexemes(lexeme_id INTEGER PRIMARY KEY, lemma TEXT);
                CREATE TABLE semantic_pair_scores(source_lexeme_id INTEGER, target_lexeme_id INTEGER, model_version TEXT, rank INTEGER);
                CREATE TABLE pipeline_meta(name TEXT PRIMARY KEY, value TEXT);
                INSERT INTO pipeline_meta VALUES ('model_version', 'v1');
            ''')
            names = list(WORDS) + list(extra_words)
            con.executemany('INSERT INTO lexemes VALUES (?,?)', [(i + 1, w) for i, w in enumerate(names)])
            con.executemany('INSERT INTO semantic_pair_scores VALUES (?,?,?,?)', rows_per_secret)
            con.commit()
        return path

    def test_pinned_follows_the_server_rules(self):
        # lessema 1 = cane. Nell'export: osso(4), assente(7, fuori vocabolario), guinzaglio(3), osso di nuovo, cane stesso.
        rows = [(1, 4, 'v1', 1), (1, 7, 'v1', 2), (1, 3, 'v1', 3), (1, 4, 'v1', 4), (1, 1, 'v1', 5), (1, 2, 'v1', 6),
                (2, 1, 'v1', 1)]  # gatto: una sola parola, meno del minimo
        export = self.make_export(rows, extra_words=['assente'])
        words = profiles.load_published('original', giochi=self.giochi, vectors_dir=self.dir).words
        pinned = profiles.load_pinned(export, words, min_pinned=3)
        self.assertEqual(pinned, {0: [3, 2, 1]})  # cane -> osso, guinzaglio, gatto; niente doppioni, segreta o fuori vocabolario

    def test_pipeline_b_profile_has_the_original_vectors_and_pinned(self):
        rows = [(1, 4, 'v1', 1), (1, 3, 'v1', 2), (1, 2, 'v1', 3)]
        export = self.make_export(rows)
        p = self.load('pipeline_b', pipeline_b=export, min_pinned=3)
        self.assertEqual(p.name, 'pipeline_b')
        self.assertEqual(p.pinned, {0: [3, 2, 1]})
        np.testing.assert_array_equal(np.asarray(p.vectors), self.matrix)

    def test_pipeline_b_without_the_export_names_the_problem(self):
        with self.assertRaises(ValueError) as caught:
            self.load('pipeline_b', pipeline_b=Path(self.tmp.name) / 'manca.sqlite3')
        self.assertIn('Pipeline B', str(caught.exception))


def fixture_profile(data, case) -> profiles.Profile:
    n, dim = data['words'], data['dim']
    words = [f'w{i}' for i in range(n)]
    vectors = np.array(data['vectors'], dtype=np.float32).reshape(n, dim)
    pinned = {case['secret']: case['pinned']} if 'pinned' in case else None
    return profiles.Profile('fixture', words, {w: i for i, w in enumerate(words)}, vectors, '', pinned)


class RankingTest(unittest.TestCase):
    def test_parity_fixture(self):
        # Lo stesso file lo legge tests/context-evaluation-parity.test.ts con rankAgainst del server.
        data = json.loads((REPO / 'tests/fixtures/context-evaluation-parity.json').read_text(encoding='utf-8'))
        for case in data['cases']:
            p = fixture_profile(data, case)
            self.assertEqual(list(ranking.order(p, case['secret'])), case['expected'], case['name'])

    def test_rank_of_and_top(self):
        data = json.loads((REPO / 'tests/fixtures/context-evaluation-parity.json').read_text(encoding='utf-8'))
        case = data['cases'][0]
        p = fixture_profile(data, case)
        ranks = ranking.rank_of(p, case['secret'])
        self.assertEqual(int(ranks[0]), 1)           # la segreta è la posizione 1
        self.assertEqual(int(ranks[5]), 2)           # la più vicina
        self.assertEqual(int(ranks[6]), 8)           # la più lontana
        self.assertEqual(ranking.top(p, case['secret'], k=3), [5, 1, 3])

    def test_top_stops_at_the_vocabulary_size(self):
        data = json.loads((REPO / 'tests/fixtures/context-evaluation-parity.json').read_text(encoding='utf-8'))
        p = fixture_profile(data, data['cases'][0])
        self.assertEqual(len(ranking.top(p, 0, k=20)), 7)

    def test_out_of_range_pinned_entries_are_ignored(self):
        data = json.loads((REPO / 'tests/fixtures/context-evaluation-parity.json').read_text(encoding='utf-8'))
        case = {'secret': 0, 'pinned': [99, 5, 5, -1, 3], 'name': 'x'}
        self.assertEqual(list(ranking.order(fixture_profile(data, case), 0))[:3], [0, 5, 3])


if __name__ == '__main__':
    unittest.main()
