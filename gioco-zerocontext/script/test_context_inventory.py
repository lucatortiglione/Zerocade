"""Casi di selezione dal DB: nessun CSV, fonti correnti e distinzione dei ruoli."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import numpy as np

from context_inventory import select_inventory


def fixture(root):
    raw = root / 'raw.sqlite3'
    cache = root / 'cache'
    cache.mkdir()
    exclusions = root / 'excluded.txt'
    exclusions.write_text('vietata\n', encoding='utf-8')
    forms = ['cuculo', 'luna', 'nido', 'uccello', 'casa', 'case', 'città', 'andassi',
             'rara', 'vietata', 'vecchia', 'rumore']
    (cache / 'fasttext_it_words.txt').write_text('\n'.join(forms), encoding='utf-8')
    np.save(cache / 'fasttext_it_vectors.npy', np.ones((len(forms), 300), dtype=np.float16))
    with closing(sqlite3.connect(raw)) as con:
        con.executescript('''
            CREATE TABLE raw__inventory_sources(source_key PRIMARY KEY,kind);
            CREATE TABLE raw__inventory_registered_sources(source_key PRIMARY KEY,enabled);
            CREATE TABLE raw__inventory_snapshots(id PRIMARY KEY,source_key,sha256,records);
            CREATE TABLE raw__inventory_source_heads(source_key PRIMARY KEY,snapshot_id);
            CREATE TABLE raw__inventory_snapshot_numbers(n PRIMARY KEY,snapshot_id);
            CREATE TABLE raw__inventory_attestation_roles(n PRIMARY KEY,role);
            CREATE TABLE raw__inventory_attestation_pos(n PRIMARY KEY,pos);
            CREATE TABLE raw__inventory_terms(prompt PRIMARY KEY,is_single_word);
            CREATE TABLE raw__inventory_attestation_rows(prompt,snapshot,role,pos,lemma,details_json);
            CREATE INDEX by_prompt ON raw__inventory_attestation_rows(prompt);
            CREATE VIEW raw__inventory_attestation_rows_json AS SELECT * FROM raw__inventory_attestation_rows;
            INSERT INTO raw__inventory_attestation_roles VALUES (1,'lemma'),(2,'inflected_form'),(3,'frequency_form');
            INSERT INTO raw__inventory_attestation_pos VALUES (1,'s.f.'),(2,'NOUN-F:p'),(3,'VERB'),(4,''),(5,'NOUN'),(6,'noun');
        ''')
        sources = [('nvdb-de-mauro-2016', 'nvdb_text'), ('morphit-048-mirror', 'morphit'),
                   ('wordfreq-it-local', 'wordfreq'), ('kaikki-itwiktionary', 'wiktextract'),
                   ('frequencywords-it-2018', 'frequency_text')]
        for n, (key, kind) in enumerate(sources, 1):
            snap = 'snapshot-' + str(n)
            con.execute('INSERT INTO raw__inventory_sources VALUES (?,?)', (key, kind))
            con.execute('INSERT INTO raw__inventory_registered_sources VALUES (?,1)', (key,))
            con.execute('INSERT INTO raw__inventory_snapshots VALUES (?,?,?,10)', (snap, key, 'sha-' + snap))
            con.execute('INSERT INTO raw__inventory_source_heads VALUES (?,?)', (key, snap))
            con.execute('INSERT INTO raw__inventory_snapshot_numbers VALUES (?,?)', (n, snap))
        con.execute("INSERT INTO raw__inventory_snapshots VALUES ('old','nvdb-de-mauro-2016','old-sha',1)")
        con.execute("INSERT INTO raw__inventory_snapshot_numbers VALUES (99,'old')")
        def entry(word, source, role, pos, lemma=None, details=None):
            con.execute('INSERT INTO raw__inventory_attestation_rows VALUES (?,?,?,?,?,?)',
                        (word, source, role, pos, lemma or word, json.dumps(details or {})))
        for word in ['casa', 'città', 'vietata', 'senza']:
            entry(word, 1, 1, 1)
        entry('vecchia', 99, 1, 1)
        entry('case', 2, 2, 2, 'casa')
        entry('andassi', 2, 2, 3, 'andare')
        entry('rara', 2, 1, 5)
        entry('rara', 4, 1, 6)
        entry('rara', 5, 3, 4, details={'frequency': 70})
        for word, rank in [('case', 1), ('rumore', 2), ('rara', 40000), ('casa', 10), ('città', 11)]:
            entry(word, 3, 3, 4, details={'rank': rank})
        con.executemany('INSERT INTO raw__inventory_terms VALUES (?,1)', ((w,) for w in forms + ['senza', 'andare']))
        con.commit()
    return raw, cache, exclusions


class SelectionTests(unittest.TestCase):
    def test_db_only_selection_preserves_existing_and_adds_valid_nouns(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, cache, exclusions = fixture(Path(tmp))
            before = raw.read_bytes()
            words, secrets, report = select_inventory(raw, cache, ['cuculo', 'nido'], ['cuculo'],
                                                     exclusions=exclusions, batch_size=4)
            self.assertEqual(secrets, ['casa', 'città', 'cuculo'])
            self.assertIn('andassi', words)
            self.assertIn('rumore', words)  # frequenza non prova che sia un nuovo sostantivo segreto
            self.assertIn('rara', words)
            self.assertNotIn('rara', secrets)
            self.assertNotIn('vecchia', secrets)  # attestata solo nello snapshot storico
            self.assertNotIn('vietata', secrets)
            self.assertNotIn('senza', words)  # nessun vettore
            self.assertNotIn('case', words)  # plurale puro
            self.assertEqual(report['secrets_added'], 2)
            self.assertEqual(report['extended_reserve'], 1)
            self.assertEqual(report['excluded_pure_plurals'], 1)
            self.assertEqual(before, raw.read_bytes(), 'il DB lessicale resta in sola lettura')
            self.assertFalse(list(Path(tmp).rglob('*.csv')))

    def test_disabled_source_does_not_approve_new_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, cache, exclusions = fixture(Path(tmp))
            with closing(sqlite3.connect(raw)) as con:
                con.execute("UPDATE raw__inventory_registered_sources SET enabled=0 WHERE source_key='nvdb-de-mauro-2016'")
                con.commit()
            _, secrets, _ = select_inventory(raw, cache, ['cuculo'], ['cuculo'], exclusions=exclusions)
            self.assertEqual(secrets, ['cuculo'])

    def test_missing_vector_for_preserved_word_does_not_silently_remove_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, cache, exclusions = fixture(Path(tmp))
            with self.assertRaisesRegex(ValueError, 'conservate senza fastText'):
                select_inventory(raw, cache, ['assente'], ['assente'], exclusions=exclusions)

    def test_existing_candidate_reviews_are_respected_without_overriding_lexical_filters(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, cache, exclusions = fixture(Path(tmp))
            with closing(sqlite3.connect(raw)) as con:
                con.execute('CREATE TABLE raw__context_candidate_reviews(run,prompt,verdict,reason,actor,reviewed_at)')
                con.executemany('INSERT INTO raw__context_candidate_reviews VALUES (1,?,?,?,\'fixture\',\'2026-11-16\')',
                                [('casa', 'NON_CONSIGLIATA', 'escludere dalle nuove segrete'),
                                 ('città', 'DA_RIVEDERE', 'senso da verificare'),
                                 ('vecchia', 'CONSIGLIATA', 'non basta una revisione senza attestazioni correnti')])
                con.commit()
            words, secrets, report = select_inventory(raw, cache, ['cuculo'], ['cuculo'], exclusions=exclusions)
            self.assertEqual(secrets, ['cuculo'])
            self.assertIn('casa', words)
            self.assertIn('città', words)
            self.assertEqual(set(report['candidate_review_holds']), {'casa', 'città'})


if __name__ == '__main__':
    unittest.main()
