"""Regressioni di gate preinserimento, transazioni e campionamento vincolato."""
from copy import deepcopy
import csv
import json
from pathlib import Path
import tempfile
import unittest

from collect_prompt_sources import dictionary_proposals
from prompt_database import ROOT,digest,validate_pool,sample_pool,import_reviewed,load_pools,export_csv,sample_database,sample_livecade,load_categories,pool_objects,review_policy
from semantic_rules import SEMANTIC_POLICY
from sqlite_prompt_runtime import SQLite,CACHE,literal


def pool():
    # Il test riusa un verbale reale senza inventare una certificazione umana.
    records=map(json.loads,(ROOT/'resources/prompt_pools_reviewed_20261109.jsonl').read_text(encoding='utf-8').splitlines())
    return next(row for row in records if row['prompt']=='pizza')


def seal(record):
    record['content_sha256']=digest({k:v for k,v in record.items() if k!='content_sha256'})
    return record


class PoolTests(unittest.TestCase):
    def test_changed_word_requires_review_again(self):
        record=pool();record['answers'][0]['word']='inerente'
        with self.assertRaisesRegex(ValueError,'modificato dopo la revisione'):validate_pool(record)

    def test_stale_directives_rejected(self):
        with self.assertRaisesRegex(ValueError,'direttive differenti'):validate_pool(pool(),'0'*64)

    def test_rules_version_not_the_text_of_the_directives(self):
        # Un ritocco al testo non invalida i bacini: conta la versione delle regole.
        self.assertEqual(review_policy(pool()['review']),SEMANTIC_POLICY)
        record=pool();record['review']['directives_sha256']='1'*64;record['review']['policy_version']=SEMANTIC_POLICY
        validate_pool(seal(record))
        record=pool();record['review']['directives_sha256']='1'*64;seal(record)
        with self.assertRaisesRegex(ValueError,'direttive differenti'):validate_pool(record)
        record=pool();record['review']['policy_version']='word-association-semantic-2026-01-01.1';seal(record)
        with self.assertRaisesRegex(ValueError,'direttive differenti'):validate_pool(record)
        record=pool();del record['review']['directives_sha256'];record['review']['policy_version']=SEMANTIC_POLICY;seal(record)
        with self.assertRaisesRegex(ValueError,'Hash delle direttive'):validate_pool(record)

    def test_unreviewed_or_malformed_record_is_rejected(self):
        with self.assertRaises(ValueError):validate_pool({'prompt':'pizza','status':'AWAITING_SEMANTIC_REVIEW'})
        record=pool();record['answers'][0]['checks']=[];seal(record)
        with self.assertRaisesRegex(ValueError,'individuale incompleta'):validate_pool(record)

    def test_missing_individual_semantic_check_is_rejected(self):
        record=pool();record['answers'][0]['checks']['same_sense']=False;seal(record)
        with self.assertRaisesRegex(ValueError,'individuale incompleta'):validate_pool(record)

    def test_foreign_prompt_requires_closed_allowlist(self):
        record=pool();record['prompt']='abstract';record['prompt_language']='common_loanword';seal(record)
        with self.assertRaisesRegex(ValueError,'common_loanwords'):validate_pool(record)

    def test_category_is_required_and_belongs_to_catalog(self):
        for invalid in (None,'000','999','cucina'):
            record=pool();record['category_id']=invalid;seal(record)
            with self.assertRaisesRegex(ValueError,'Categoria obbligatoria'):validate_pool(record)
        self.assertEqual(load_categories()['008']['category_name'],'Panificazione, farine e lievitazioni')

    def test_seed_reproducibility_and_variation(self):
        record=pool()
        self.assertEqual(sample_pool(record,8,'uno'),sample_pool(record,8,'uno'))
        selections={frozenset(sample_pool(record,8,str(i))) for i in range(20)}
        self.assertGreater(len(selections),1)
        self.assertEqual(len(sample_pool(record,7,'uno')),7)

    def test_equivalent_groups_and_pair_conflicts(self):
        record=pool();first,second=record['answers'][:2]
        second['meaning_group']=first['meaning_group']
        record['group_limits']={a['meaning_group']:1 for a in record['answers']}
        pair=[record['answers'][2]['word'],record['answers'][3]['word']]
        record['conflicts']=[{'words':pair,'reason':'Incompatibilità sintetica usata soltanto dal test tecnico.'}]
        seal(record)
        for i in range(20):
            result=sample_pool(record,8,str(i))
            self.assertLessEqual(len(set(result)&{first['word'],second['word']}),1)
            self.assertFalse(set(pair)<=set(result))

    def test_insufficient_pool_never_fills_or_changes_count(self):
        record=pool();record['answers']=record['answers'][:7];seal(record)
        with self.assertRaisesRegex(ValueError,'impossibile estrarre 8'):sample_pool(record,8,'seed')
        with self.assertRaises(ValueError):sample_pool(record,6,'seed')
        with self.assertRaises(ValueError):sample_pool(pool(),8,'seed',{'hard'})

    def test_staging_ignores_inflections_and_never_claims_review(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'dictionary.jsonl'
            entries=[{'word':'casa','lang_code':'it','pos':'noun','senses':[{'glosses':['Edificio abitabile.']}]},
                {'word':'case','lang_code':'it','pos':'noun','tags':['form-of'],'senses':[{'form_of':[{'word':'casa'}]}]},
                {'word':'house','lang_code':'en','pos':'noun','senses':[{}]}]
            path.write_text('\n'.join(json.dumps(r) for r in entries),encoding='utf-8')
            rows=list(dictionary_proposals(path))
            self.assertEqual([r['prompt'] for r in rows],['casa'])
            self.assertFalse(rows[0]['database_inserted'])
            self.assertEqual(rows[0]['status'],'AWAITING_SEMANTIC_REVIEW')


@unittest.skipUnless((CACHE/'sqlite3.exe').exists(),'Runtime ufficiale non installato; i test non scaricano eseguibili')
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.directory=Path(self.temporary.name)
        self.db=SQLite(self.directory/'test.sqlite3')
        self.pack=self.directory/'reviewed.jsonl'
        self.write_pack([pool()])

    def tearDown(self):self.temporary.cleanup()

    def write_pack(self,records):
        self.pack.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records),encoding='utf-8')

    def test_bad_pack_creates_no_database_then_idempotent_import(self):
        bad=deepcopy(pool());bad['prompt']='errore'
        self.write_pack([pool(),bad])
        with self.assertRaises(ValueError):import_reviewed(self.db,self.pack)
        self.assertFalse(self.db.path.exists())
        self.write_pack([pool()]);import_reviewed(self.db,self.pack)
        import_reviewed(self.db,self.pack)
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM reviews;',rows=True)[0]['n'],1)
        self.assertEqual(len(load_pools(self.db)),1)
        self.assertEqual(self.db.run('SELECT sqlite_version() AS v;',rows=True)[0]['v'],'3.54.1')

    def test_transaction_rolls_back_on_late_failure(self):
        import_reviewed(self.db,self.pack)
        count=self.db.run('SELECT count(*) AS n FROM associations;',rows=True)
        with self.assertRaises(RuntimeError):
            self.db.run('BEGIN IMMEDIATE;DELETE FROM associations;INSERT INTO missing_table VALUES(1);COMMIT;')
        self.assertEqual(count,self.db.run('SELECT count(*) AS n FROM associations;',rows=True))

    def test_sql_text_cannot_execute_code(self):
        import_reviewed(self.db,self.pack)
        value="'); DROP TABLE prompts;--\n.shell echo test"
        self.db.run('INSERT INTO metadata VALUES('+literal('sql_text_test')+','+literal(value)+');')
        self.assertEqual(self.db.run("SELECT value FROM metadata WHERE key='sql_text_test';",rows=True)[0]['value'],value)
        self.assertEqual(len(load_pools(self.db)),1)

    def test_dump_restores_relations_reviews_and_constraints(self):
        import_reviewed(self.db,self.pack)
        dump=self.directory/'prompt.sql';self.db.dump(dump)
        restored=SQLite(self.directory/'restored.sqlite3')
        restored.run(dump.read_text(encoding='utf-8'))
        self.assertEqual(load_pools(self.db),load_pools(restored))
        self.assertEqual(restored.run('PRAGMA foreign_key_check;',rows=True),[])

    def test_dump_leaves_out_the_inventory(self):
        import_reviewed(self.db,self.pack)
        self.db.run("CREATE TABLE inventory_terms(prompt TEXT PRIMARY KEY);INSERT INTO inventory_terms VALUES ('grezzo');"
                    "CREATE VIEW inventory_view AS SELECT * FROM inventory_terms;")
        self.assertNotIn('inventory_terms',pool_objects(self.db))
        self.assertIn('prompt_catalog',pool_objects(self.db))
        dump=self.directory/'prompt.sql';self.db.dump(dump,pool_objects(self.db))
        sql=dump.read_text(encoding='utf-8')
        self.assertNotIn('inventory',sql)
        restored=SQLite(self.directory/'restored.sqlite3')
        restored.run(sql)
        self.assertEqual(load_pools(self.db),load_pools(restored))
        self.assertEqual(self.db.run('SELECT * FROM prompt_catalog;',rows=True),restored.run('SELECT * FROM prompt_catalog;',rows=True))
        with self.assertRaises(ValueError):self.db.dump(dump,['prompts; .shell echo'])

    def test_database_requires_categories_and_exposes_names(self):
        import_reviewed(self.db,self.pack)
        catalog=self.db.run('SELECT * FROM prompt_catalog;',rows=True)[0]
        self.assertEqual(catalog['category_id'],'008')
        self.assertIn('Panificazione',catalog['category_name'])
        self.assertEqual(catalog['cluster_id'],'A')
        for invalid in ('NULL',"'999'"):
            with self.assertRaises(RuntimeError):self.db.run('UPDATE prompts SET category_id='+invalid+';')
            with self.assertRaises(RuntimeError):self.db.run('UPDATE senses SET category_id='+invalid+';')

    def test_livecade_seven_words_prompt_sampling_and_pool_preservation(self):
        # Due bacini realmente revisionati, senza fabbricare nuovi verbali.
        records=[json.loads(l) for l in (ROOT/'resources/prompt_pools_reviewed_20261109.jsonl').read_text(encoding='utf-8').splitlines()]
        self.write_pack([r for r in records if r['prompt'] in {'pizza','cane'}])
        import_reviewed(self.db,self.pack)
        before=load_pools(self.db)
        first=sample_livecade(self.db,'lotto-1',2)
        self.assertEqual(first,sample_livecade(self.db,'lotto-1',2))
        self.assertEqual(len({r['prompt'] for r in first['rows']}),2)
        for row in first['rows']:
            self.assertEqual(len(row['words']),7)
            self.assertEqual(len(set(row['words'])),7)
            self.assertTrue(row['category_id'] and row['category_name'])
        self.assertEqual(load_pools(self.db),before)
        self.assertEqual(sample_livecade(self.db,'seed',1,'008')['rows'][0]['prompt'],'pizza')
        selected={sample_livecade(self.db,str(i),1)['rows'][0]['prompt'] for i in range(20)}
        self.assertEqual(selected,{'pizza','cane'})
        with self.assertRaisesRegex(ValueError,'Richiesti 3 prompt distinti'):sample_livecade(self.db,'seed',3)
        with self.assertRaisesRegex(ValueError,'positivo'):sample_livecade(self.db,'seed',0)

    def test_random_seven_eight_csv_roundtrip_and_sequence(self):
        import_reviewed(self.db,self.pack)
        counts=set()
        for i in range(12):
            payload=sample_database(self.db,'random',str(i));counts.add(len(payload['rows'][0]['words']))
        self.assertEqual(counts,{7,8})
        output=self.directory/'csv'
        first=export_csv(payload,output);original=first.read_bytes()
        second=export_csv(payload,output)
        self.assertTrue(first.name.endswith('_0001.csv'))
        self.assertTrue(second.name.endswith('_0002.csv'))
        self.assertEqual(first.read_bytes(),original)
        with first.open(encoding='utf-8',newline='') as stream:rows=list(csv.reader(stream))
        self.assertEqual(rows[0],['ref','source','language','prompt','words'])
        self.assertEqual(len(rows[1]),5)
        self.assertEqual(rows[1][3],'PIZZA')
        self.assertEqual(rows[1][4].split('|'),payload['rows'][0]['words'])


if __name__=='__main__':unittest.main()
