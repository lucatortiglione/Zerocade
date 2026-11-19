"""Riordino dei candidati della Pipeline B: caratteristiche, modello, varianti in fondo, liste per segreta."""
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from riordino.export import Candidate, read_candidates
from riordino.features import FEATURE_NAMES, Lexicon, candidate_features
from riordino.model import Reranker, rank_words
from riordino.build import build_lists, gold_first, training_secrets


def make_export(path: Path, rows) -> None:
    """rows: (segreta, parola, score, emb, pmi, cn, ppmi, rank)."""
    words = sorted({r[0] for r in rows} | {r[1] for r in rows})
    ids = {w: i + 1 for i, w in enumerate(words)}
    with closing(sqlite3.connect(path)) as con:
        con.executescript('''
            CREATE TABLE lexemes(lexeme_id INTEGER PRIMARY KEY, lemma TEXT);
            CREATE TABLE semantic_pair_scores(source_lexeme_id INTEGER, target_lexeme_id INTEGER, model_version TEXT, score REAL,
              embedding_score REAL, pmi_svd_score REAL, conceptnet_score REAL, ppmi_score REAL, rank INTEGER);
            CREATE TABLE pipeline_meta(name TEXT PRIMARY KEY, value TEXT);
            INSERT INTO pipeline_meta VALUES ('model_version', 'v1');''')
        con.executemany('INSERT INTO lexemes VALUES (?,?)', [(i, w) for w, i in ids.items()])
        con.executemany("INSERT INTO semantic_pair_scores VALUES (?,?,'v1',?,?,?,?,?,?)", [(ids[s], ids[w], *rest) for s, w, *rest in rows])
        con.execute("INSERT INTO semantic_pair_scores VALUES (?, ?, 'altra', 9, 9, 9, 9, 9, 1)", (ids[rows[0][0]], ids[rows[0][1]]))
        con.commit()


class FakeRef:
    secrets = {'cane': 'ordinaria', 'gatto': 'ordinaria', 'luna': 'deroga'}
    variants = {('cani', 'cane')}

    def is_variant(self, word, secret):
        return (word, secret) in self.variants

    def lemmas(self, word):
        return {word}


class ExportTest(unittest.TestCase):
    def test_reads_candidates_of_the_requested_secrets_in_the_current_model_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'b.sqlite3'
            make_export(export, [('cane', 'gatto', 0.9, 0.8, 0.7, None, 0.1, 1), ('cane', 'osso', 0.5, 0.4, None, 0.3, 0.2, 2), ('luna', 'sole', 0.6, 0.5, 0.5, 0.5, 0.5, 1)])
            found = read_candidates(export, ['cane', 'inesistente'])
        self.assertEqual(set(found), {'cane'})
        self.assertEqual(found['cane'], [Candidate('gatto', 0.9, 0.8, 0.7, None, 0.1, 1), Candidate('osso', 0.5, 0.4, None, 0.3, 0.2, 2)])


class FeaturesTest(unittest.TestCase):
    lexicon = Lexicon({'gatto': ('MOLTO_FAMILIARE', 5000), 'osso': ('RARA', 3)})

    def test_one_value_per_name(self):
        self.assertEqual(len(candidate_features(Candidate('gatto', 0.9, 0.8, 0.7, 0.6, 0.5, 1), self.lexicon)), len(FEATURE_NAMES))

    def test_missing_signals_are_flagged_not_hidden(self):
        f = dict(zip(FEATURE_NAMES, candidate_features(Candidate('gatto', 0.9, 0.8, None, 0.6, None, 1), self.lexicon)))
        self.assertEqual((f['pmi'], f['pmi_mancante'], f['ppmi'], f['ppmi_mancante'], f['emb_mancante']), (0.0, 1.0, 0.0, 1.0, 0.0))

    def test_familiarity_and_lemma(self):
        known = dict(zip(FEATURE_NAMES, candidate_features(Candidate('gatto', 0, 0, 0, 0, 0, 1), self.lexicon)))
        rare = dict(zip(FEATURE_NAMES, candidate_features(Candidate('osso', 0, 0, 0, 0, 0, 1), self.lexicon)))
        unknown = dict(zip(FEATURE_NAMES, candidate_features(Candidate('gattuzzi', 0, 0, 0, 0, 0, 1), self.lexicon)))
        self.assertEqual((known['molto_familiare'], known['rara'], known['lemma']), (1.0, 0.0, 1.0))
        self.assertEqual((rare['molto_familiare'], rare['rara']), (0.0, 1.0))
        self.assertEqual((unknown['lemma'], unknown['rara'], unknown['molto_familiare']), (0.0, 0.0, 0.0))   # non è un lemma di raw 2.0


class ModelTest(unittest.TestCase):
    lexicon = Lexicon({})

    def examples(self):
        """Le giuste hanno l'embedding alto, le altre basso; il punteggio combinato invece è un'esca (alto per le sbagliate)."""
        rows = []
        for i in range(60):
            right = Candidate(f'g{i}', 0.1, 0.9, 0.5, 0.5, 0.5, 500)
            wrong = Candidate(f'x{i}', 0.9, 0.1, 0.5, 0.5, 0.5, 1)
            rows += [(candidate_features(right, self.lexicon), 1), (candidate_features(wrong, self.lexicon), 0)]
        return rows

    def test_it_learns_to_trust_the_signal_that_separates_right_from_wrong(self):
        model = Reranker().fit(self.examples())
        right = model.score(candidate_features(Candidate('g1', 0.1, 0.9, 0.5, 0.5, 0.5, 500), self.lexicon))
        wrong = model.score(candidate_features(Candidate('x1', 0.9, 0.1, 0.5, 0.5, 0.5, 1), self.lexicon))
        self.assertGreater(right, wrong)

    def test_training_is_deterministic(self):
        a, b = Reranker().fit(self.examples()), Reranker().fit(self.examples())
        probe = candidate_features(Candidate('p', 0.3, 0.6, 0.5, 0.5, 0.5, 40), self.lexicon)
        self.assertEqual(a.score(probe), b.score(probe))

    def test_one_class_only_is_refused(self):
        with self.assertRaises(ValueError):
            Reranker().fit([(candidate_features(Candidate('x', 0, 0, 0, 0, 0, 1), self.lexicon), 0)] * 5)


class TreesModelTest(unittest.TestCase):
    """Il modello a alberi coglie ciò che il lineare non può: qui giusto = emb alta XOR ppmi alta (nessun peso solo lo separa)."""
    lexicon = Lexicon({})

    def xor_examples(self):
        import random
        rng, rows = random.Random(3), []
        for _ in range(600):
            a, b = rng.random() > .5, rng.random() > .5
            c = Candidate('p', 0.5, 0.9 if a else 0.1, 0.5, 0.5, 0.9 if b else 0.1, 10)
            rows.append((candidate_features(c, self.lexicon), int(a != b)))
        return rows

    def gap(self, model):
        right = model.score(candidate_features(Candidate('p', 0.5, 0.9, 0.5, 0.5, 0.1, 10), self.lexicon))
        wrong = model.score(candidate_features(Candidate('p', 0.5, 0.9, 0.5, 0.5, 0.9, 10), self.lexicon))
        return right - wrong

    def test_trees_separate_what_the_linear_model_cannot(self):
        self.assertGreater(self.gap(Reranker(kind='alberi').fit(self.xor_examples())), 1.0)
        self.assertLess(abs(self.gap(Reranker().fit(self.xor_examples()))), 0.5)

    def test_training_is_deterministic(self):
        a, b = Reranker(kind='alberi').fit(self.xor_examples()), Reranker(kind='alberi').fit(self.xor_examples())
        probe = candidate_features(Candidate('p', 0.5, 0.9, 0.5, 0.5, 0.1, 10), self.lexicon)
        self.assertEqual(a.score(probe), b.score(probe))

    def test_scores_matches_score_and_weights_are_only_for_the_linear_model(self):
        model = Reranker(kind='alberi').fit(self.xor_examples())
        probe = candidate_features(Candidate('p', 0.5, 0.9, 0.5, 0.5, 0.1, 10), self.lexicon)
        self.assertAlmostEqual(float(model.scores([probe])[0]), model.score(probe))
        self.assertEqual(model.weights(), {})

    def test_an_unknown_kind_is_refused_and_one_class_only_too(self):
        with self.assertRaises(ValueError):
            Reranker(kind='magia')
        with self.assertRaises(ValueError):
            Reranker(kind='alberi').fit([(candidate_features(Candidate('x', 0, 0, 0, 0, 0, 1), self.lexicon), 0)] * 5)


class RankingTest(unittest.TestCase):
    lexicon = Lexicon({})

    def model(self):
        return Reranker().fit(ModelTest().examples())

    def test_best_first_secret_and_nothing_else_excluded(self):
        cands = [Candidate('x1', 0.9, 0.1, 0.5, 0.5, 0.5, 1), Candidate('g1', 0.1, 0.9, 0.5, 0.5, 0.5, 500), Candidate('cane', 0.9, 0.9, 0.9, 0.9, 0.9, 1)]
        self.assertEqual(rank_words('cane', cands, self.lexicon, FakeRef(), self.model()), ['g1', 'x1'])   # la segreta non è un candidato di se stessa

    def test_variants_are_kept_out_of_the_first_twenty_places(self):
        good = [Candidate(f'g{i}', 0.1, 0.9, 0.5, 0.5, 0.5, 100 + i) for i in range(25)]
        variant = Candidate('cani', 0.1, 1.0, 1.0, 1.0, 1.0, 1)   # il candidato migliore di tutti, ma è una variante
        words = rank_words('cane', [variant, *good], self.lexicon, FakeRef(), self.model())
        self.assertNotIn('cani', words[:20])
        self.assertEqual(words.index('cani'), 20)
        self.assertEqual(len(words), 26)               # non si perde nessuna parola

    def test_with_few_candidates_the_variants_go_last(self):
        words = rank_words('cane', [Candidate('cani', 0.1, 1.0, 1.0, 1.0, 1.0, 1), Candidate('g1', 0.1, 0.9, 0.5, 0.5, 0.5, 5)], self.lexicon, FakeRef(), self.model())
        self.assertEqual(words, ['g1', 'cani'])


class BuildTest(unittest.TestCase):
    class Gold(dict):
        pass

    def world(self):
        gold = {'cane': type('G', (), {'groups': {'osso': 1, 'coda': 2}})(), 'gatto': type('G', (), {'groups': {'topo': 1}})(),
                'luna': type('G', (), {'groups': {'sole': 1}})()}
        return gold

    def test_training_uses_only_development_secrets_with_associations(self):
        import valutazione.split as split
        chosen = training_secrets(FakeRef(), self.world(), split.is_measure)
        self.assertTrue(all(not split.is_measure(s) for s in chosen))
        self.assertTrue(all(s in self.world() for s in chosen))
        self.assertEqual(sorted(chosen), sorted(s for s in ('cane', 'gatto', 'luna') if not split.is_measure(s)))

    def test_lists_are_limited_and_contain_every_secret_of_the_export(self):
        import valutazione.split as split
        # abbastanza segrete di sviluppo con esempi buoni e cattivi perché il modello si possa addestrare
        dev = [f's{i}' for i in range(200) if not split.is_measure(f's{i}')][:12]
        ref = FakeRef()
        ref.secrets = {s: 'ordinaria' for s in dev}
        gold = {s: type('G', (), {'groups': {f'g{i}_{s}': 1 for i in range(2)}})() for s in dev}
        rows = []
        for s in dev:
            rows += [(s, f'g{i}_{s}', 0.1, 0.9, 0.5, 0.5, 0.5, 300 + i) for i in range(2)]
            rows += [(s, f'x{i}_{s}', 0.9, 0.1, 0.5, 0.5, 0.5, 1 + i) for i in range(30)]
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'b.sqlite3'
            make_export(export, rows)
            lists, report = build_lists(export, ref, gold, Lexicon({}), top=10)
        self.assertEqual(set(lists), set(dev))
        self.assertTrue(all(len(v) == 10 for v in lists.values()))
        # le giuste, che il punteggio combinato metteva in fondo, ora sono in cima
        self.assertTrue(all(lists[s][0].startswith('g') and lists[s][1].startswith('g') for s in dev))
        self.assertEqual(report['segrete_addestramento'], len(dev))
        trees, report = self.lists_with(dev, ref, gold, rows, 'alberi')
        self.assertTrue(all(trees[s][0].startswith('g') and trees[s][1].startswith('g') for s in dev))
        self.assertEqual(report['tipo_modello'], 'alberi')

    def lists_with(self, dev, ref, gold, rows, kind):
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'b.sqlite3'
            make_export(export, rows)
            return build_lists(export, ref, gold, Lexicon({}), top=10, kind=kind)

    def test_a_right_word_the_export_lacked_comes_in_from_the_vectors(self):
        import numpy as np
        import valutazione.split as split
        from valutazione.profiles import Profile
        dev = [f's{i}' for i in range(200) if not split.is_measure(f's{i}')][:12]
        ref = FakeRef()
        ref.secrets = {s: 'ordinaria' for s in dev} | {'extra': 'ordinaria'}   # «extra» non è nell'export
        gold = {s: type('G', (), {'groups': {f'g_{s}': 1}})() for s in dev}
        rows = [(s, f'x{i}_{s}', 0.5, 0.5, 0.5, 0.5, 0.5, 1 + i) for s in dev for i in range(30)]   # l'export non conosce le giuste
        n = len(dev)
        words = dev + [f'g_{s}' for s in dev] + [f'x{i}_{s}' for s in dev for i in range(30)] + ['extra', 'g_extra']
        vectors = np.zeros((len(words), n + 2), dtype=np.float32)
        for j in range(n):
            vectors[j, j] = 1
            vectors[n + j, j], vectors[n + j, n] = 0.95, 0.3
        vectors[2 * n:, n] = 1
        vectors[-2, n], vectors[-2, n + 1] = 0, 1
        vectors[-1, n], vectors[-1, n + 1] = 0.3, 0.95
        profile = Profile('prova', words, {w: i for i, w in enumerate(words)}, vectors, 'sha')
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'b.sqlite3'
            make_export(export, rows)
            wide, report = build_lists(export, ref, gold, Lexicon({}), top=10, profile=profile, neighbours=3)
        self.assertTrue(all(wide[s][0] == f'g_{s}' for s in dev))
        self.assertEqual(wide['extra'][0], 'g_extra')   # senza export, la lista viene dai soli vettori
        self.assertEqual(report['vicini_dai_vettori'], 3)

    def test_new_signals_decide_when_the_export_cannot(self):
        import valutazione.split as split
        dev = [f's{i}' for i in range(200) if not split.is_measure(f's{i}')][:12]
        ref = FakeRef()
        ref.secrets = {s: 'ordinaria' for s in dev}
        gold = {s: type('G', (), {'groups': {f'g{i}_{s}': 1 for i in range(2)}})() for s in dev}
        rows = []
        for s in dev:   # per l'export giuste e sbagliate sono identiche
            rows += [(s, f'g{i}_{s}', 0.5, 0.5, 0.5, 0.5, 0.5, 1 + i) for i in range(2)]
            rows += [(s, f'x{i}_{s}', 0.5, 0.5, 0.5, 0.5, 0.5, 3 + i) for i in range(30)]

        class Stub:   # il segnale nuovo: le giuste hanno la stessa categoria della segreta
            def enrich(self, secret, candidates):
                from dataclasses import replace
                return [replace(c, pos_same=c.word.startswith('g')) for c in candidates]
        seen = {}
        with tempfile.TemporaryDirectory() as tmp:
            export = Path(tmp) / 'b.sqlite3'
            make_export(export, rows)
            lists, _ = build_lists(export, ref, gold, Lexicon({}), top=10, signals_for=lambda found: seen.setdefault('found', found) and Stub())
        self.assertEqual(set(seen['found']), set(dev))   # la fabbrica dei segnali riceve i candidati dell'export
        self.assertTrue(all(lists[s][0].startswith('g') and lists[s][1].startswith('g') for s in dev))


class GoldFirstTest(unittest.TestCase):
    # osso e coda/scodinzolare (stesso gruppo) e guinzaglio sono associazioni verificate di «cane»; «cani» è una variante della segreta.
    gold = {'cane': type('G', (), {'groups': {'osso': 1, 'coda': 2, 'scodinzolare': 2, 'cani': 3, 'guinzaglio': 4}})()}

    def test_one_word_per_meaning_first_in_the_order_of_the_reranking_then_the_rest(self):
        lists = {'cane': ['gatto', 'coda', 'cagnolino', 'osso', 'cuccia']}
        # rappresentanti dei gruppi: coda (posizione 1 nella lista) e osso (3), poi guinzaglio che nella lista non c'è;
        # poi gli altri membri dei gruppi (scodinzolare); poi il resto della lista, senza ripetizioni
        self.assertEqual(gold_first(lists, self.gold, FakeRef())['cane'], ['coda', 'osso', 'guinzaglio', 'scodinzolare', 'gatto', 'cagnolino', 'cuccia'])

    def test_the_variants_of_the_secret_are_not_promoted(self):
        merged = gold_first({'cane': ['gatto']}, self.gold, FakeRef())
        self.assertNotIn('cani', merged['cane'])                                    # «cani» vale già come soluzione: non occupa un posto

    def test_a_meaning_takes_one_place_before_any_other_word_of_the_same_meaning(self):
        merged = gold_first({'cane': ['gatto', 'coda', 'scodinzolare']}, self.gold, FakeRef())['cane']
        self.assertEqual(merged, ['coda', 'guinzaglio', 'osso', 'scodinzolare', 'gatto'])   # assenti dalla lista: in ordine alfabetico

    def test_secrets_without_associations_are_untouched(self):
        self.assertEqual(gold_first({'luna': ['sole', 'notte']}, self.gold, FakeRef())['luna'], ['sole', 'notte'])

    def test_a_secret_that_is_only_in_gold_gets_a_list(self):
        self.assertEqual(gold_first({}, self.gold, FakeRef())['cane'], ['coda', 'guinzaglio', 'osso', 'scodinzolare'])


if __name__ == '__main__':
    unittest.main()
