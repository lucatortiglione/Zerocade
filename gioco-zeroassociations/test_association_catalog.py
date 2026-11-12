"""Coda riprendibile e protezione della raccolta: non test di qualità semantica."""
import json
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest

from association_catalog import prepare, status, apply_reviewed, rule_hashes, verify_annotation
from filter_prompts import SCHEMA
from prompt_database import ROOT, import_reviewed, digest
from sqlite_prompt_runtime import SQLite, CACHE
from validated_prompt_database import register_reviews


@unittest.skipUnless((CACHE/'sqlite3.exe').exists(),'Runtime ufficiale assente')
class AssociationQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.folder=Path(self.temp.name)
        self.raw=SQLite(self.folder/'raw.sqlite3')
        self.record=next(json.loads(line) for line in
            (ROOT/'resources/prompt_pools_reviewed_20261109.jsonl').read_text(encoding='utf-8').splitlines()
            if json.loads(line)['prompt']=='pizza')
        self.pack=self.folder/'pack.jsonl'
        self.pack.write_text(json.dumps(self.record,ensure_ascii=False)+'\n',encoding='utf-8')
        import_reviewed(self.raw,self.pack);register_reviews(self.raw,[self.record])
        self.raw.run('CREATE TABLE inventory_term_decisions(prompt TEXT PRIMARY KEY,decision TEXT);')
        self.filtered=self.folder/'filtered.sqlite3'
        db=sqlite3.connect(self.filtered);db.executescript(SCHEMA)
        for word in ('pizza','nuovo'):
            db.execute('INSERT INTO filtered_prompts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (word,'it','NOUN','NOUN',4.0,1,'Dato di input del test tecnico.',1,'[]',0,None,0,None,'FILTERED_AUTOMATIC'))
        db.commit();db.close()

    def test_queue_is_frozen_and_unreviewed_entry_stays_pending(self):
        queue=self.folder/'queue'
        first=prepare(queue,self.raw.path,self.filtered)
        self.assertEqual(first['candidate_count'],2)
        self.assertEqual(first['states'],{'WAITING_PROMPT_REVIEW':1,'REVIEWED_POOL':1})
        self.assertFalse(first['coverage_complete'])
        db=sqlite3.connect(self.filtered)
        db.execute("INSERT INTO filtered_prompts SELECT 'farina',language,pos,pos_all,zipf,senses,gloss,sources,flags,nvdb,aoa,in_game,playability,status FROM filtered_prompts WHERE prompt='pizza'")
        db.commit();db.close()
        self.assertEqual(prepare(queue,self.raw.path,self.filtered)['candidate_count'],2)
        entries=queue/'entries.jsonl';entries.write_bytes(entries.read_bytes()+b' ')
        with self.assertRaisesRegex(ValueError,'Coda modificata'):status(queue,self.raw.path)

    def test_negative_decision_is_not_reported_as_reviewed_pool(self):
        queue=self.folder/'queue';prepare(queue,self.raw.path,self.filtered)
        self.raw.run("INSERT INTO inventory_term_decisions VALUES ('pizza','DEFERRED');")
        updated=status(queue,self.raw.path)
        self.assertEqual(updated['states'].get('BLOCKED_DEFERRED'),1)
        self.assertNotIn('REVIEWED_POOL',updated['states'])

    def test_changed_rules_block_import_before_mutating_source(self):
        pool=json.loads(json.dumps(self.record))
        pool['association_catalog']={'prompt_validation_id':self.record['content_sha256'],
            'rule_files_sha256':{key:'0'*64 for key in rule_hashes()}}
        pool['content_sha256']=digest({k:v for k,v in pool.items() if k!='content_sha256'})
        self.pack.write_text(json.dumps(pool,ensure_ascii=False)+'\n',encoding='utf-8')
        before=self.raw.path.read_bytes()
        with self.assertRaisesRegex(ValueError,'Regole cambiate'):
            apply_reviewed(self.pack,self.raw.path,self.folder/'valid.sqlite3')
        self.assertEqual(self.raw.path.read_bytes(),before)
        self.assertFalse((self.folder/'valid.sqlite3').exists())

    def bound_record(self):
        """Riusa il materiale editoriale reale della fixture, senza una nuova valutazione."""
        pool=json.loads(json.dumps(self.record))
        text=self.folder/'original.txt';text.write_text('Fixture del verbale reale: pizza.\n',encoding='utf-8')
        document={'reviewer':pool['review']['reviewer'],'method':pool['review']['method'],
            'reviewed_at':pool['review']['reviewed_at'],'rules_sha256':rule_hashes(),
            'source_text':str(text),'source_text_sha256':hashlib.sha256(text.read_bytes()).hexdigest(),
            'entries':[{'prompt':'pizza','decision':'accepted','validation_id':self.record['content_sha256'],
                'answers':pool['answers'],'group_limits':pool['group_limits'],'conflicts':pool.get('conflicts',[])}]}
        annotation=self.folder/'annotation.json';annotation.write_text(json.dumps(document,ensure_ascii=False),encoding='utf-8')
        sha=hashlib.sha256(annotation.read_bytes()).hexdigest()
        pool['association_catalog']={'prompt_validation_id':self.record['content_sha256'],
            'rule_files_sha256':rule_hashes(),'annotation_sha256':sha}
        pool['evidence'].append({**pool['evidence'][0], 'source_url':annotation.as_uri(),
            'url':annotation.as_uri()+'#pizza','scope':'individual_association_editorial_review',
            'snapshot_sha256':sha})
        pool['content_sha256']=digest({k:v for k,v in pool.items() if k!='content_sha256'})
        return pool,text

    def test_resealed_unreviewed_answer_is_rejected_against_original_decisions(self):
        pool,_=self.bound_record();verify_annotation(pool)
        pool['answers'][0]['word']='inerente'
        pool['content_sha256']=digest({k:v for k,v in pool.items() if k!='content_sha256'})
        self.pack.write_text(json.dumps(pool,ensure_ascii=False)+'\n',encoding='utf-8')
        before=self.raw.path.read_bytes()
        with self.assertRaisesRegex(ValueError,'diversi dalle decisioni editoriali'):
            apply_reviewed(self.pack,self.raw.path,self.folder/'valid.sqlite3')
        self.assertEqual(self.raw.path.read_bytes(),before)

    def test_original_editorial_sheet_cannot_be_changed_after_compilation(self):
        pool,text=self.bound_record();verify_annotation(pool)
        text.write_text('Input cambiato dopo la compilazione.\n',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'Foglio editoriale originale'):
            verify_annotation(pool)


if __name__=='__main__':unittest.main()
