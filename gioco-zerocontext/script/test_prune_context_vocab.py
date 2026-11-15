"""I plurali puri (context_vocabulary.pure_plurals) e la potatura dei dati pubblicati (prune_context_vocab.prune)."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import numpy as np

from context_vocabulary import pure_plurals
from prune_context_vocab import prune


def raw_db(path: Path, rows: list[tuple], terms: list[str]):
    """Un DB di lavoro minimo: le attestazioni come le dà la vista raw__inventory_attestation_rows_json."""
    with closing(sqlite3.connect(path)) as con:
        con.executescript('''
            CREATE TABLE raw__inventory_snapshots(id TEXT, source_key TEXT);
            CREATE TABLE raw__inventory_snapshot_numbers(n INTEGER, snapshot_id TEXT);
            CREATE TABLE raw__inventory_attestation_roles(n INTEGER, role TEXT);
            CREATE TABLE raw__inventory_attestation_pos(n INTEGER, pos TEXT);
            CREATE TABLE raw__inventory_attestation_rows_json(snapshot, prompt, locator, role, pos, source_form, lemma, details_json);
            CREATE TABLE raw__inventory_terms(prompt TEXT, is_single_word INTEGER);''')
        sources = sorted({r[0] for r in rows})
        roles = ['lemma', 'inflected_form', 'proper_name']
        tags = sorted({r[2] for r in rows})
        con.executemany('INSERT INTO raw__inventory_snapshots VALUES (?,?)', [(f's-{s}', s) for s in sources])
        con.executemany('INSERT INTO raw__inventory_snapshot_numbers VALUES (?,?)', [(i, f's-{s}') for i, s in enumerate(sources)])
        con.executemany('INSERT INTO raw__inventory_attestation_roles VALUES (?,?)', list(enumerate(roles)))
        con.executemany('INSERT INTO raw__inventory_attestation_pos VALUES (?,?)', list(enumerate(tags)))
        con.executemany('INSERT INTO raw__inventory_attestation_rows_json VALUES (?,?,?,?,?,?,?,?)', [
            (sources.index(s), word, '', roles.index(role), tags.index(pos), word, lemma, json.dumps(details))
            for s, word, pos, role, lemma, details in rows])
        con.executemany('INSERT INTO raw__inventory_terms VALUES (?,1)', [(t,) for t in terms])
        con.commit()


class PurePluralsTests(unittest.TestCase):
    def test_only_plurals_with_their_singular_and_no_other_reading(self):
        rows = [
            ('morphit-048-mirror', 'gatti', 'NOUN-M:p', 'inflected_form', 'gatto', {}),
            ('morphit-048-mirror', 'gatti', 'NPR', 'proper_name', 'gatti', {}),  # a surname: does not count
            ('flex-it-nouns', 'case', 'NOUN', 'inflected_form', 'casa', {'number': 'plur'}),
            ('glaffit', 'belli', 'Afpmp', 'inflected_form', 'bello', {}),
            ('kaikki-enwiktionary-it', 'pantaloni', 'noun', 'inflected_form', 'pantalone',
             {'senses': [{'tags': ['form-of', 'plural'], 'glosses': ['plural of pantalone']}]}),
            ('kaikki-itwiktionary', 'pantaloni', 'noun', 'lemma', 'pantaloni', {'senses': [{'tags': [], 'glosses': ['indumento']}]}),
            ('glaffit', 'citati', 'Afpmp', 'inflected_form', 'citato', {}),
            ('morphit-048-mirror', 'citati', 'VER:part+past+p+m', 'inflected_form', 'citare', {}),
            ('ud-isdt-train', 'brocchi', 'NOUN', 'inflected_form', 'brocco', {'features': 'Number=Plur'}),
            ('glaffit', 'gatto', 'Ncms', 'lemma', 'gatto', {}),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'raw.sqlite3'
            raw_db(path, rows, ['gatto', 'casa', 'bello', 'pantalone', 'citato', 'citare'])  # no "brocco"
            found = pure_plurals(['gatti', 'case', 'belli', 'pantaloni', 'citati', 'brocchi', 'gatto', 'mare'], path)
        self.assertEqual(found, {'belli': ['bello'], 'case': ['casa'], 'gatti': ['gatto']})


class PruneTests(unittest.TestCase):
    def test_words_vectors_secrets_and_links_stay_aligned(self):
        vocab = ['casa', 'case', 'gatti', 'gatto', 'mare']
        vectors = np.arange(10, dtype=np.int8).reshape(5, 2)
        links = [(3, 0), (3, 2), (0, 4), (2, 3)]
        new_vocab, new_vectors, secrets, new_links = prune(vocab, vectors, ['casa', 'gatti', 'gatto'], links, {'case', 'gatti'})
        self.assertEqual(new_vocab, ['casa', 'gatto', 'mare'])
        self.assertEqual(new_vectors.tolist(), [[0, 1], [6, 7], [8, 9]])
        self.assertEqual(secrets, ['casa', 'gatto'])
        self.assertEqual(new_links, [(0, 2), (1, 0)])


if __name__ == '__main__':
    unittest.main()
