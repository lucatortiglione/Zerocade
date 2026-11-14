"""Casi che distinguono davvero segrete, tentativi e fonti dipendenti."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from evaluate_context_inventory import (add_evidence, collect_batch, empty_features, evaluate,
                                        feature_summary, heads, rows_digest, save_to_raw)


def noun(word='casa'):
    f = empty_features()
    add_evidence(f, word, 'nvdb-de-mauro-2016', 'nvdb_text', 'lemma', 's.f.', word, '{}')
    return f


class EvaluationTests(unittest.TestCase):
    def verdict(self, word, f=None, **changes):
        env = {'excluded': set(), 'fasttext': {'casa'}, 'base_vocab': set(), 'livecade': set()}
        env.update(changes)
        return evaluate(word, f if f is not None else empty_features(), **env)

    def test_noun_with_vector_is_secret_and_bank_guess(self):
        self.assertEqual(self.verdict('casa', noun()),
                         (('CANDIDATA_SEGRETA', 'base'), ('CANDIDATA_VOCAB', 'banca_sostantivi')))

    def test_valid_noun_without_vector_is_not_playable(self):
        self.assertEqual(self.verdict('casa', noun(), fasttext=set()),
                         (('DA_VETTORIZZARE', 'base'), ('NON_GIOCABILE', 'vettore_fasttext_assente')))

    def test_inflection_can_be_guess_without_being_secret(self):
        f = empty_features()
        add_evidence(f, 'andassi', 'unimorph-ita', 'unimorph', 'inflected_form', 'V', 'andare', '{}')
        secret, guess = self.verdict('andassi', f, fasttext={'andassi'}, base_vocab={'andassi'})
        self.assertEqual(secret, ('ESCLUSA', 'non_sostantivo'))
        self.assertEqual(guess, ('CANDIDATA_VOCAB', 'selezione_frequenze'))

    def test_exclusion_applies_to_legacy_secrets_but_not_existing_guess_policy(self):
        secret, guess = self.verdict('casa', noun(), excluded={'casa'}, livecade={'casa'})
        self.assertEqual(secret, ('ESCLUSA', 'esclusione_editoriale'))
        self.assertEqual(guess, ('CANDIDATA_VOCAB', 'banca_livecade'))

    def test_legacy_membership_does_not_supply_a_noun_analysis(self):
        self.assertEqual(self.verdict('casa', livecade={'casa'})[0], ('ESCLUSA', 'non_sostantivo'))

    def test_hunspell_does_not_prove_nounhood(self):
        f = empty_features()
        add_evidence(f, 'casa', 'libreoffice-it-dictionary', 'hunspell', 'listed_form', '', '', '{}')
        self.assertEqual(self.verdict('casa', f)[0], ('ESCLUSA', 'non_sostantivo'))

    def test_glaff_grace_and_flex_ud_are_understood_without_double_counting(self):
        f = empty_features()
        for source, kind, tag in [('glaffit', 'glaffit', 'Ncfp'),
                                  ('kaikki-itwiktionary', 'wiktextract', 'noun'),
                                  ('flex-it-nouns', 'flex_it', 'NOUN'),
                                  ('morphit-048-mirror', 'morphit', 'NOUN')]:
            add_evidence(f, 'casa', source, kind, 'lemma', tag, 'casa', '{}')
        self.assertEqual(feature_summary(f)['noun_families'], ['kaikki-itwiktionary', 'morphit-048-mirror'])

    def test_unimorph_participle_does_not_become_a_noun(self):
        f = empty_features()
        add_evidence(f, 'fatto', 'unimorph-ita', 'unimorph', 'inflected_form', 'V.PTCP', 'fare', '{}')
        self.assertEqual(f['N'], set())
        self.assertEqual(f['inflO'], {'unimorph-ita'})

    def test_global_dictionary_labels_are_used(self):
        f = noun()
        add_evidence(f, 'casa', 'kaikki-itwiktionary', 'wiktextract', 'lemma', 'noun', 'casa',
                     json.dumps({'entry_tags': ['offensive'], 'senses': [{'tags': []}]}))
        self.assertEqual(self.verdict('casa', f)[0], ('ESCLUSA', 'volgare'))

    def test_flex_frequencies_are_not_subtitle_counts(self):
        f = empty_features()
        add_evidence(f, 'casa', 'flex-it-nouns', 'flex_it', 'frequency_form', 'NOUN', 'casa',
                     '{"rank":1,"frequency":999999}')
        self.assertNotIn('wf', f); self.assertNotIn('os', f)

    def test_accents_and_boundary_lengths(self):
        self.assertEqual(self.verdict('città', noun('città'), fasttext={'città'})[0][0], 'CANDIDATA_SEGRETA')
        self.assertEqual(self.verdict('ape', base_vocab={'ape'}, fasttext={'ape'})[0], ('ESCLUSA', 'lunghezza_4_14'))
        self.assertEqual(self.verdict('due parole')[1][0], 'ESCLUSA')

    def test_frequent_rank_alone_is_not_actual_vocab_selection(self):
        self.assertEqual(self.verdict('casa')[1], ('NON_SELEZIONATA', 'fuori_selezione_frequenze_e_banca'))

    def test_attested_expansion_and_preserved_words_are_playable_without_frequency_cap(self):
        self.assertEqual(self.verdict('casa', expanded_vocab={'casa'})[1],
                         ('CANDIDATA_VOCAB', 'inventario_lessicale'))
        self.assertEqual(self.verdict('casa', current_vocab={'casa'})[1],
                         ('CANDIDATA_VOCAB', 'vocabolario_conservato'))
        self.assertEqual(self.verdict('casa', expanded_vocab={'casa'}, fasttext=set())[1],
                         ('NON_GIOCABILE', 'vettore_fasttext_assente'))

    def test_extended_tier_is_not_a_secret(self):
        f = empty_features()
        f['N'] = {'kaikki-itwiktionary', 'morphit-048-mirror'}
        f.update(wf=40000, os=70)
        self.assertEqual(self.verdict('casa', f),
                         (('RISERVA_ESTESA', 'esteso'), ('CANDIDATA_VOCAB', 'banca_sostantivi')))

    def test_batch_uses_only_selected_current_snapshots(self):
        con = sqlite3.connect(':memory:')
        con.executescript('''CREATE TABLE context_targets(word TEXT PRIMARY KEY);
            CREATE TABLE raw__inventory_attestation_rows(prompt,snapshot,role,pos,lemma,details_json);
            CREATE INDEX raw__inventory_attestations_by_prompt ON raw__inventory_attestation_rows(prompt);
            CREATE VIEW raw__inventory_attestation_rows_json AS SELECT * FROM raw__inventory_attestation_rows;
            INSERT INTO raw__inventory_attestation_rows VALUES ('casa',1,1,1,'casa','{}');
            INSERT INTO raw__inventory_attestation_rows VALUES ('casa',2,1,2,'casa','{}');''')
        f = collect_batch(con, ['casa'], {2: ('unimorph-ita', 'unimorph')}, {1: 'lemma'}, {1: 'N', 2: 'V'})['casa']
        self.assertEqual(f['N'], set())
        self.assertEqual(f['V'], {'unimorph-ita'})
        con.close()


class PersistenceTests(unittest.TestCase):
    def fixture(self, folder):
        raw = Path(folder) / 'raw.sqlite3'
        stage = Path(folder) / 'stage.sqlite3'
        con = sqlite3.connect(raw)
        con.executescript('''CREATE TABLE raw__inventory_terms(prompt TEXT PRIMARY KEY);
            INSERT INTO raw__inventory_terms VALUES ('casa');
            CREATE TABLE raw__inventory_source_heads(source_key,snapshot_id);
            INSERT INTO raw__inventory_source_heads VALUES ('unimorph-ita','snapshot-1');
            CREATE TABLE raw__inventory_snapshots(id,sha256,records);
            INSERT INTO raw__inventory_snapshots VALUES ('snapshot-1','sha-source',1);
            CREATE TABLE raw__inventory_sources(source_key,kind);
            INSERT INTO raw__inventory_sources VALUES ('unimorph-ita','unimorph');
            CREATE TABLE raw__inventory_registered_sources(source_key,enabled);
            INSERT INTO raw__inventory_registered_sources VALUES ('unimorph-ita',1);''')
        manifest = {'active_snapshots': heads(con), 'inventory_terms': 1,
                    'inventory_sha256': rows_digest(['casa'])}
        con.close()
        con = sqlite3.connect(stage)
        con.executescript('''CREATE TABLE codes(n INTEGER PRIMARY KEY,role,status,reason);
            INSERT INTO codes VALUES (1,'secret','CANDIDATA_SEGRETA','base');
            INSERT INTO codes VALUES (2,'guess','CANDIDATA_VOCAB','banca_sostantivi');
            CREATE TABLE terms(prompt,secret_code,guess_code,in_inventory,livecade,current_secret,
                current_vocab,fasttext,numberbatch,details_json);
            INSERT INTO terms VALUES ('casa',1,2,1,0,0,0,1,1,'{}');''')
        con.close()
        report = {'run_id': 'same-input', 'evaluated_at': '2026-11-14T00:00:00Z',
                  'summary': {'evaluated_terms': 1}}
        return raw, stage, manifest, report

    def test_publication_is_complete_and_repeat_does_not_duplicate(self):
        with tempfile.TemporaryDirectory() as folder, patch('evaluate_context_inventory.unified_db.register_objects'):
            raw, stage, manifest, report = self.fixture(folder)
            first = save_to_raw(raw, stage, manifest, report)
            self.assertEqual(first, save_to_raw(raw, stage, manifest, report))
            con = sqlite3.connect(raw)
            self.assertEqual(con.execute('SELECT count(*) FROM raw__context_evaluation_terms').fetchone()[0], 1)
            self.assertEqual(con.execute('SELECT count(*) FROM raw__context_evaluation_runs').fetchone()[0], 1)
            self.assertEqual(con.execute('SELECT prompt,secret_status,guess_status FROM raw__context_evaluation_results').fetchone(),
                             ('casa', 'CANDIDATA_SEGRETA', 'CANDIDATA_VOCAB'))
            self.assertEqual(con.execute('SELECT * FROM raw__inventory_terms').fetchall(), [('casa',)])
            self.assertEqual(con.execute('PRAGMA foreign_key_check').fetchall(), [])
            con.close()

    def test_changed_input_prevents_publication_even_with_unchanged_term_count(self):
        with tempfile.TemporaryDirectory() as folder, patch('evaluate_context_inventory.unified_db.register_objects'):
            raw, stage, manifest, report = self.fixture(folder)
            con = sqlite3.connect(raw)
            con.execute("UPDATE raw__inventory_terms SET prompt='gatto'"); con.commit(); con.close()
            with self.assertRaisesRegex(RuntimeError, 'Termini cambiati'):
                save_to_raw(raw, stage, manifest, report)
            con = sqlite3.connect(raw)
            self.assertEqual(con.execute('SELECT count(*) FROM raw__context_evaluation_terms').fetchone()[0], 0)
            con.close()


if __name__ == '__main__': unittest.main()
