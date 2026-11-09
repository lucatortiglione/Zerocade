"""Aggiornamenti separati dalle decisioni persistenti e dalla revisione semantica."""
import json
import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from prompt_inventory import initialize_inventory,import_source
from inventory_updates import stage_update,decide_update,decide_term,list_changes,head,resolve_latest,register_sources,check_updates,main
from sqlite_prompt_runtime import SQLite,CACHE
from prompt_database import ROOT,import_reviewed,load_pools,pool_objects


def config(kind='wordlist'):
    return {'id':'fixture','name':'Fixture tecnica','kind':kind,'url':'https://example.invalid/list.txt',
            'license':'Synthetic fixture','attribution':'Test'}


class ResolutionTests(unittest.TestCase):
    def test_current_github_commit_and_wikimedia_latest(self):
        sha='a'*40
        source={**config(),'url':'https://raw.githubusercontent.com/owner/repo/'+'b'*40+'/list.txt',
                'license_url':'https://raw.githubusercontent.com/owner/repo/'+'b'*40+'/LICENSE'}
        latest=resolve_latest(source,{'owner/repo':sha})
        self.assertIn(sha,latest['url']);self.assertIn(sha,latest['license_url'])
        self.assertNotEqual(latest['url'],source['url'])
        wiki={**config('wiki_titles'),'url':'https://dumps.wikimedia.org/itwiki/20261101/itwiki-20261101-all-titles-in-ns0.gz'}
        self.assertEqual(resolve_latest(wiki,{})['url'],'https://dumps.wikimedia.org/itwiki/latest/itwiki-latest-all-titles-in-ns0.gz')


@unittest.skipUnless((CACHE/'sqlite3.exe').exists(),'Runtime ufficiale assente')
class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.directory=Path(self.temporary.name)
        self.db=SQLite(self.directory/'test.sqlite3');initialize_inventory(self.db)
        self.first=self.directory/'v1.txt';self.first.write_text('casa\nalbero\n',encoding='utf-8')
        import_source(self.db,config(),self.first)

    def tearDown(self):self.temporary.cleanup()

    def make(self,name,text):
        path=self.directory/name;path.write_text(text,encoding='utf-8');return path

    def test_reordered_file_does_not_modify_terms_and_deduplicates(self):
        update=stage_update(self.db,config(),self.make('v2.txt','albero\ncasa\ncasa\n'))
        self.assertEqual(update['unchanged_terms'],2)
        self.assertEqual((update['new_terms'],update['changed_terms'],update['removed_terms']),(0,0,0))
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM inventory_catalog;',rows=True)[0]['n'],2)

    def test_initial_collection_stages_later_versions_instead_of_applying(self):
        before=head(self.db,'fixture')
        update=import_source(self.db,config(),self.make('v2.txt','casa\nfiore\n'))
        self.assertEqual(update['status'],'PENDING')
        self.assertEqual(head(self.db,'fixture'),before)
        self.assertEqual(self.db.run("SELECT prompt FROM inventory_terms WHERE prompt='fiore';",rows=True),[])
        self.assertEqual(self.db.run("SELECT prompt FROM inventory_catalog WHERE prompt='fiore';",rows=True),[{'prompt':'fiore'}])
        changes=list_changes(self.db,update['update_id'])
        self.assertEqual({r['prompt']:r['kind'] for r in changes},{'fiore':'NEW','albero':'REMOVED','casa':'UNCHANGED'})

    def test_discarded_term_stays_discarded_after_integrating_updates(self):
        update=stage_update(self.db,config(),self.make('v2.txt','casa\nfiore\n'))
        decide_term(self.db,'FIORE','DISCARDED','Decisione esplicita della fixture')
        decide_update(self.db,update['update_id'],'APPLY','Integrazione della nuova fonte nella fixture')
        row=self.db.run("SELECT decision,in_inventory FROM inventory_catalog WHERE prompt='fiore';",rows=True)[0]
        self.assertEqual(row,{'decision':'DISCARDED','in_inventory':1})
        self.assertEqual(self.db.run("SELECT prompt FROM inventory_current_attestations ORDER BY prompt;",rows=True),
                         [{'prompt':'casa'},{'prompt':'fiore'}])
        self.assertTrue(self.db.run("SELECT prompt FROM inventory_terms WHERE prompt='albero';",rows=True))
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM associations;',rows=True)[0]['n'],0)
        again=stage_update(self.db,config(),self.make('v3.txt','casa\nfiore\nsole\n'))
        decide_update(self.db,again['update_id'],'APPLY','Altro aggiornamento della fixture')
        reopened=SQLite(self.db.path)
        self.assertEqual(reopened.run("SELECT decision FROM inventory_term_decisions WHERE prompt='fiore';",rows=True)[0]['decision'],'DISCARDED')
        decide_term(reopened,'fiore','INTEGRATED','Riconsiderazione esplicita della fixture')
        self.assertEqual(reopened.run("SELECT count(*) AS n FROM inventory_decision_history WHERE subject_type='TERM';",rows=True)[0]['n'],2)

    def test_rejected_update_is_remembered_and_can_be_explicitly_reconsidered(self):
        path=self.make('v2.txt','casa\nfiore\n');update=stage_update(self.db,config(),path)
        decide_update(self.db,update['update_id'],'DISCARD','Rifiuto esplicito della fixture')
        self.assertEqual(stage_update(self.db,config(),path)['status'],'PREVIOUSLY_DISCARDED')
        decide_update(self.db,update['update_id'],'DEFER','Riapertura esplicita della fixture')
        self.assertEqual(stage_update(self.db,config(),path)['status'],'DEFERRED')
        decide_update(self.db,update['update_id'],'APPLY','Conferma successiva della fixture')
        self.assertEqual(stage_update(self.db,config(),path)['status'],'UNCHANGED')
        with self.assertRaises(ValueError):decide_update(self.db,update['update_id'],'DISCARD','Non si riscrive lo storico applicato')

    def test_modified_metadata_and_stale_base(self):
        source=config('frequency_text')
        # Nuova fonte con frequenze: il contenuto conta, non la sola grafia.
        source['id']='frequency'
        initial=self.make('freq1.txt','casa 10\n');import_source(self.db,source,initial)
        second=stage_update(self.db,source,self.make('freq2.txt','casa 11\n'))
        third=stage_update(self.db,source,self.make('freq3.txt','casa 12\n'))
        self.assertEqual(second['changed_terms'],1)
        decide_update(self.db,third['update_id'],'APPLY','Scelta della versione più recente nella fixture')
        with self.assertRaisesRegex(ValueError,'fonte attiva è cambiata'):
            decide_update(self.db,second['update_id'],'APPLY','Questo confronto è diventato obsoleto')

    def test_unknown_term_and_malformed_source_do_not_create_decisions(self):
        with self.assertRaises(ValueError):decide_term(self.db,'inesistente','DISCARDED','Fixture')
        source=config('wiktextract')
        broken=self.make('broken.jsonl','{"word":"casa","lang_code":"it"}\nBROKEN')
        with self.assertRaises(ValueError):stage_update(self.db,source,broken)
        self.assertEqual(self.db.run('SELECT id FROM inventory_updates;',rows=True),[])

    def test_local_update_check_reads_sql_registry_without_a_json_file(self):
        path=self.make('local.txt','casa\nsole\n');source={**config(),'local_path':str(path)}
        register_sources(self.db,[source])
        result=check_updates(self.db,['fixture'],self.directory/'cache')
        self.assertEqual(result[0]['status'],'PENDING')
        self.assertEqual(result[0]['new_terms'],1)

    def test_discarded_verified_prompt_stays_excluded_in_the_small_sql_dump(self):
        # Un bacino realmente revisionato: il test verifica la decisione, non simula QA.
        pools=[json.loads(line) for line in (ROOT/'resources/prompt_pools_reviewed_20261109.jsonl').read_text(encoding='utf-8').splitlines()]
        pizza=next(row for row in pools if row['prompt']=='pizza')
        pack=self.directory/'pizza.jsonl';pack.write_text(json.dumps(pizza,ensure_ascii=False)+'\n',encoding='utf-8')
        import_reviewed(self.db,pack)
        self.assertEqual(len(load_pools(self.db)),1)
        self.assertEqual(self.db.run("SELECT has_verified_pool FROM inventory_catalog WHERE prompt='pizza';",rows=True),[{'has_verified_pool':1}])
        decide_term(self.db,'pizza','DISCARDED','Esclusione esplicita soltanto nella fixture')
        self.assertEqual(load_pools(self.db),[])
        dump=self.directory/'prompt.sql';self.db.dump(dump,pool_objects(self.db))
        restored=SQLite(self.directory/'restored.sqlite3');restored.run(dump.read_text(encoding='utf-8'))
        self.assertEqual(load_pools(restored),[])
        self.assertEqual(restored.run("SELECT decision FROM inventory_term_decisions WHERE prompt='pizza';",rows=True)[0]['decision'],'DISCARDED')

    def test_conditional_http_304_reuses_unchanged_cache(self):
        import urllib.error
        from inventory_updates import fetch_current
        from collect_prompt_sources import checksum
        source=config();cached=self.make('cached.txt','casa\n')
        from sqlite_prompt_runtime import literal
        values=['fixture',source['url'],'"etag-test"',None,str(cached),checksum(cached),'2026-11-09']
        self.db.run('INSERT INTO inventory_http_cache VALUES ('+','.join(literal(v) for v in values)+');')
        with patch('inventory_updates.urllib.request.urlopen',side_effect=urllib.error.HTTPError(source['url'],304,'Not Modified',{},None)) as opener:
            effective,path=fetch_current(self.db,source,self.directory/'cache',{})
        self.assertEqual(path,cached)
        request=opener.call_args[0][0]
        self.assertEqual(request.get_header('If-none-match'),'"etag-test"')

    def test_complete_backup_keeps_pending_updates_and_word_decisions(self):
        update=stage_update(self.db,config(),self.make('v2.txt','casa\nfiore\n'))
        decide_term(self.db,'fiore','DISCARDED','Scelta della fixture da conservare nel backup')
        decide_update(self.db,update['update_id'],'DEFER','Aggiornamento in attesa nella fixture')
        backup=self.directory/'backup.sqlite3'
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(['--db',str(self.db.path),'backup','--output',str(backup)]),0)
        restored=SQLite(backup)
        self.assertEqual(restored.run("SELECT decision FROM inventory_term_decisions WHERE prompt='fiore';",rows=True)[0]['decision'],'DISCARDED')
        self.assertEqual(restored.run('SELECT status FROM inventory_updates;',rows=True)[0]['status'],'DEFERRED')
        self.assertEqual(restored.run('PRAGMA foreign_key_check;',rows=True),[])
        with self.assertRaises(FileExistsError):main(['--db',str(self.db.path),'backup','--output',str(backup)])
