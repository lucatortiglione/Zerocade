"""Copia delle voci revisionate e riuso contestuale delle risposte tra prompt."""
from copy import deepcopy
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from prompt_database import ROOT, import_reviewed, load_pools, sample_livecade, validate_pool
from sqlite_prompt_runtime import CACHE, SQLite, publish_database
from validated_prompt_database import register_reviews, sync_validated


@unittest.skipUnless((CACHE/'sqlite3.exe').exists(), 'Runtime ufficiale non installato')
class ValidatedCopyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.raw = SQLite(self.directory/'raw.sqlite3')
        self.valid = self.directory/'valid.sqlite3'
        records = [json.loads(line) for line in
            (ROOT/'resources/prompt_pools_reviewed_20261109.jsonl').read_text(encoding='utf-8').splitlines()]
        # Due revisioni realmente presenti, non nuove certificazioni semantiche.
        self.records = [r for r in records if r['prompt'] in {'pizza','pane'}]
        pack = self.directory/'pools.jsonl'
        pack.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in self.records),encoding='utf-8')
        import_reviewed(self.raw, pack)

    def prepare(self):
        register_reviews(self.raw, self.records)
        return sync_validated(self.raw, self.valid)

    def test_copy_preserves_shared_answers_and_individual_evidence(self):
        before = load_pools(self.raw)
        result = self.prepare()
        self.assertEqual(result['valid_prompts'], 2)
        self.assertEqual(result['verified_pools'], 2)
        db = SQLite(self.valid)
        self.assertEqual(load_pools(db), before)
        shared = db.run("SELECT s.prompt,a.word,a.rationale,a.review_id FROM associations a "
            "JOIN senses s ON s.id=a.sense_id WHERE a.word='forno' ORDER BY s.prompt;",rows=True)
        self.assertEqual([r['prompt'] for r in shared], ['pane','pizza'])
        self.assertEqual(len({r['rationale'] for r in shared}), 2)
        self.assertEqual(len({r['review_id'] for r in shared}), 2)
        # La casualità non consuma la parola: può uscire per entrambi nello stesso lotto.
        for seed in range(30):
            rows = sample_livecade(db,str(seed),2)['rows']
            if all('forno' in row['words'] for row in rows):
                break
        else:
            self.fail('La parola condivisa non è mai stata estratta per entrambi i prompt')
        self.assertTrue(all(len(set(r['words']))==7 for r in rows))
        self.assertEqual(load_pools(self.raw), before)
        # Vietato invece ripetere la stessa parola nel singolo bacino.
        with self.assertRaises(RuntimeError):
            db.run("INSERT INTO associations SELECT * FROM associations WHERE word='forno';")

    def test_integrated_is_not_a_semantic_validation_and_sync_is_idempotent(self):
        self.raw.run("CREATE TABLE inventory_terms(prompt TEXT PRIMARY KEY);"
            "INSERT INTO inventory_terms VALUES ('casa');"
            "CREATE TABLE inventory_term_decisions(prompt TEXT PRIMARY KEY,decision TEXT);"
            "INSERT INTO inventory_term_decisions VALUES ('casa','INTEGRATED');")
        self.prepare()
        register_reviews(self.raw, self.records)
        sync_validated(self.raw, self.valid)
        db = SQLite(self.valid)
        self.assertEqual(db.run('SELECT count(*) AS n FROM validated_prompts;',rows=True),[{'n':2}])
        self.assertEqual(db.run("SELECT prompt FROM validated_prompts WHERE prompt='casa';",rows=True),[])
        self.assertEqual(self.raw.run('SELECT count(*) AS n FROM prompt_validations;',rows=True),[{'n':2}])

    def test_discarding_prompt_does_not_discard_its_words_for_other_prompts(self):
        self.prepare()
        self.raw.run("CREATE TABLE inventory_term_decisions(prompt TEXT PRIMARY KEY,decision TEXT);"
            "INSERT INTO inventory_term_decisions VALUES ('pane','DISCARDED');")
        result = sync_validated(self.raw, self.valid)
        self.assertEqual(result['valid_prompts'],1)
        db = SQLite(self.valid)
        self.assertEqual([p['prompt'] for p in load_pools(db)],['pizza'])
        self.assertEqual(db.run("SELECT count(*) AS n FROM associations WHERE word='forno';",rows=True),[{'n':1}])
        self.assertEqual(len(load_pools(self.raw)),1)
        self.assertEqual(self.raw.run('SELECT count(*) AS n FROM prompts;',rows=True),[{'n':2}])
        self.assertEqual(self.raw.run('SELECT count(*) AS n FROM prompt_validations;',rows=True),[{'n':2}])

    def test_modification_needs_its_own_review_and_destination_is_protected(self):
        changed = deepcopy(self.records[0])
        changed['answers'][0]['word'] = 'inerente'
        with self.assertRaisesRegex(ValueError,'modificato dopo la revisione'):
            register_reviews(self.raw,[changed])
        self.assertFalse(self.valid.exists())
        with self.assertRaisesRegex(ValueError,'stesso bacino'):
            duplicate = deepcopy(self.records[0])
            duplicate['answers'].append(deepcopy(duplicate['answers'][0]))
            validate_pool(duplicate)
        self.prepare()
        with self.assertRaisesRegex(ValueError,'distinto'):
            sync_validated(self.raw,self.raw.path)
        unrelated = SQLite(self.directory/'unrelated.sqlite3')
        unrelated.run('CREATE TABLE user_data(value TEXT);')
        with self.assertRaisesRegex(ValueError,'non gestita'):
            sync_validated(self.raw,unrelated.path)
        self.assertTrue(unrelated.run("SELECT name FROM sqlite_schema WHERE name='user_data';",rows=True))

    @unittest.skipUnless(os.name=='nt','Gestione dei file aperti su Windows')
    def test_windows_open_reader_can_receive_a_transactional_copy(self):
        self.prepare()
        other = self.directory/'copy.sqlite3'
        self.raw.run('.backup "'+other.as_posix()+'"\n')
        # Il lettore rimane aperto. Il rename rifiutato riproduce il caso Windows.
        reader = sqlite3.connect(self.valid)
        self.addCleanup(reader.close)
        self.assertTrue(reader.execute('SELECT count(*) FROM validated_prompts').fetchone())
        with patch.object(Path,'replace',side_effect=PermissionError('File aperto')):
            self.assertEqual(publish_database(other,self.valid,self.raw.executable),'sqlite_backup_transaction')
        self.assertEqual(reader.execute('SELECT count(*) FROM prompts').fetchone()[0],2)
        self.assertEqual(reader.execute('PRAGMA integrity_check').fetchone()[0],'ok')

    @unittest.skipUnless(os.name=='nt','Gestione dei file aperti su Windows')
    def test_windows_busy_writer_keeps_the_previous_copy(self):
        self.prepare()
        replacement = self.directory/'replacement.sqlite3'
        SQLite(replacement,self.raw.executable).run('CREATE TABLE replacement_only(value TEXT);')
        writer = sqlite3.connect(self.valid)
        self.addCleanup(writer.close)
        writer.execute('BEGIN IMMEDIATE')
        try:
            with patch.object(Path,'replace',side_effect=PermissionError('File aperto')):
                with self.assertRaises(RuntimeError):
                    publish_database(replacement,self.valid,self.raw.executable)
        finally:
            writer.rollback()
        self.assertEqual(writer.execute('SELECT count(*) FROM validated_prompts').fetchone()[0],2)
        self.assertIsNone(writer.execute("SELECT name FROM sqlite_schema WHERE name='replacement_only'").fetchone())
        self.assertEqual(writer.execute('PRAGMA integrity_check').fetchone()[0],'ok')


if __name__ == '__main__':
    unittest.main()
