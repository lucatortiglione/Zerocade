"""Il primo step raccoglie attestazioni senza generare né approvare associazioni."""
import bz2
import gzip
import json
from pathlib import Path
import tempfile
import unittest

from prompt_inventory import normalize,records,initialize_inventory,import_source,status
from sqlite_prompt_runtime import SQLite,CACHE


def source(kind='wordlist',key='fixture'):
    return {'id':key,'name':'Fixture tecnica','kind':kind,'url':'https://example.invalid/fixture',
            'license':'Synthetic test data','attribution':'Test fixture'}


class ParserTests(unittest.TestCase):
    def test_normalization_preserves_accents_and_multiword_status(self):
        self.assertEqual(normalize(' CAFFE\u0300 '),'caffè')
        self.assertNotEqual(normalize('caffe'),normalize('caffè'))
        self.assertEqual(normalize(' ferro  da stiro '),'ferro da stiro')

    def test_dictionary_retains_all_pos_inflections_and_proper_names(self):
        entries=[{'word':'casa','lang_code':'it','pos':'noun','senses':[{'glosses':['Abitazione.']}]},
                 {'word':'case','lang_code':'it','pos':'noun','tags':['form-of'],'senses':[{'form_of':[{'word':'casa'}]}]},
                 {'word':'Milano','lang_code':'it','pos':'name','senses':[{}]},
                 {'word':'oggi','lang_code':'it','pos':'adv','senses':[{}]},
                 {'word':'house','lang_code':'en','pos':'noun','senses':[{}]}]
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'dictionary.jsonl'
            path.write_text('\n'.join(json.dumps(r) for r in entries),encoding='utf-8')
            rows=list(records(path,source('wiktextract')))
        self.assertEqual([r['prompt'] for r in rows],['casa','case','milano','oggi'])
        self.assertEqual(rows[1]['role'],'inflected_form')
        self.assertEqual(rows[1]['lemma'],'casa')
        self.assertEqual(rows[2]['role'],'proper_name')

    def test_foreign_definitions_never_become_prompts(self):
        entries=[{'word':'casa','lang_code':'it','pos':'noun','senses':[{'glosses':['maison']} ]},
                 {'word':'maison','lang_code':'fr','pos':'noun','senses':[{'glosses':['casa']}]}]
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'french-edition.jsonl'
            path.write_text('\n'.join(json.dumps(r) for r in entries),encoding='utf-8')
            rows=list(records(path,{**source('wiktextract'),'definition_language':'fr'}))
        self.assertEqual([r['prompt'] for r in rows],['casa'])
        self.assertEqual(rows[0]['details']['definition_language'],'fr')

    def test_morphit_preserves_proper_name_role(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'morph.txt'
            path.write_text('Roma\tRoma\tNPR-F:s\n',encoding='latin-1')
            rows=list(records(path,source('morphit')))
        self.assertEqual(rows[0]['prompt'],'roma')
        self.assertEqual(rows[0]['role'],'proper_name')

    def test_unimorph_imports_explicit_lemma_and_all_analyses(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'ita'
            path.write_text('\nandare\tandai\tV;IND;PST;1;SG;PFV\nandare\tandare\tV;NFIN\n'
                            'andare\tandai\tV;OTHER\n',encoding='utf-8')
            rows=list(records(path,source('unimorph')))
            self.assertEqual([r['prompt'] for r in rows],['andai','andare','andare','andai','andare'])
            self.assertEqual(rows[0]['role'],'inflected_form')
            self.assertEqual(rows[1]['role'],'lemma')
            self.assertEqual(rows[0]['details']['features'],'V;IND;PST;1;SG;PFV')
            self.assertNotEqual(rows[0]['locator'],rows[3]['locator'])
            path.write_text('andare\tandai\n',encoding='utf-8')
            with self.assertRaises(ValueError):list(records(path,source('unimorph')))

    def test_glaffit_reads_bzip2_grace_and_preserves_proper_names(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'GLAFFIT.txt.bz2'
            with bz2.open(path,'wt',encoding='utf-8') as stream:
                stream.write('FORM\tFCODE\tLEMMA\tLCODE\tBESTPHON\n'
                             'città\tNcfp---\tcittà\tNcfs---\ttʃitˈta\n'
                             'andarono\tVmis3p-\tandare\tVmn----\t\n'
                             'Roma\tNpfs---\tRoma\tNpfs---\t\n')
            rows=list(records(path,source('glaffit')))
        self.assertEqual([r['prompt'] for r in rows],['città','andarono','andare','roma'])
        self.assertEqual(rows[1]['role'],'inflected_form')
        self.assertEqual(rows[2]['pos'],'Vmn----')
        self.assertEqual(rows[0]['details']['lexical_fields']['BESTPHON'],'tʃitˈta')
        self.assertEqual(rows[3]['role'],'proper_name')

    def test_flex_it_adjective_codes_are_not_pos_and_frequency_stays_with_form(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'adj.csv'
            path.write_text('"","Form","Lemma","Freq","POS","Gender","Number","Inf_class"\n'
                            '"1","belle","bello","42","fp","femm","plur","a_e o_i"\n',encoding='utf-8')
            config={**source('flex_it'),'pos':'ADJ'}
            rows=list(records(path,config))
            self.assertEqual([r['prompt'] for r in rows],['belle','bello'])
            self.assertEqual(rows[0]['pos'],'ADJ')
            self.assertEqual(rows[0]['details']['source_pos'],'fp')
            self.assertEqual(rows[0]['details']['frequency'],42)
            self.assertEqual(rows[1]['details']['source_scope'],'explicit_lemma')
            self.assertNotIn('frequency',rows[1]['details'])
            with self.assertRaises(ValueError):list(records(path,source('flex_it')))

    def test_new_morphology_rejects_missing_headers_or_lemmas(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'invalid'
            for kind,text in [('glaffit','FORM\tLEMMA\ncase\tcasa\n'),
                              ('flex_it','Form,Lemma\ncase,casa\n'),
                              ('unimorph','\tcase\tN;PL\n')]:
                if kind=='glaffit':
                    with bz2.open(path,'wt',encoding='utf-8') as stream:stream.write(text)
                else:path.write_text(text,encoding='utf-8')
                with self.subTest(kind=kind),self.assertRaises(ValueError):list(records(path,source(kind)))

    def test_hunspell_flags_never_become_lemmas_or_words(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'it_IT.dic'
            path.write_text('2\ncasa/AB\npoeta/C\n',encoding='utf-8')
            rows=list(records(path,source('hunspell')))
        self.assertEqual([r['prompt'] for r in rows],['casa','poeta'])
        self.assertTrue(all(r['role']=='listed_form' and r['lemma']=='' for r in rows))

    def test_wikipedia_titles_are_not_language_proof_or_fragments(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'titles.gz'
            with gzip.open(path,'wt',encoding='utf-8') as stream:stream.write('Casa\nAbstract\nTitolo_composto\n')
            rows=list(records(path,source('wiki_titles')))
        self.assertEqual([r['prompt'] for r in rows],['casa','abstract'])
        self.assertTrue(all(r['details']['language_claim']=='UNVERIFIED_TITLE_ONLY' for r in rows))

    def test_treebank_keeps_observed_form_and_attested_lemma(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'fixture.conllu'
            path.write_text('# sent_id = 1\n1\tandarono\tandare\tVERB\t_\tMood=Ind\t0\troot\t_\t_\n',encoding='utf-8')
            rows=list(records(path,source('conllu')))
        self.assertEqual([r['prompt'] for r in rows],['andarono','andare'])
        self.assertEqual([r['role'] for r in rows],['inflected_form','lemma'])

    def test_sitemap_slug_is_stored_without_guessing_a_lemma(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'sitemap.jsonl'
            path.write_text(json.dumps({'word':'a-fortiori','url':'https://example.invalid/parola/a-fortiori','sitemap':'https://example.invalid/sitemap.xml'}),encoding='utf-8')
            rows=list(records(path,source('sitemap_index')))
        self.assertEqual(rows[0]['prompt'],'a-fortiori')
        self.assertEqual(rows[0]['details']['language_claim'],'UNVERIFIED_DICTIONARY_URL_SLUG')

    def test_frequency_text_preserves_forms_and_validates_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'frequency.txt'
            path.write_text('casa 25\nferro da stiro 3\n',encoding='utf-8')
            rows=list(records(path,source('frequency_text')))
            self.assertEqual([r['prompt'] for r in rows],['casa','ferro da stiro'])
            self.assertEqual(rows[0]['details']['frequency'],25)
            path.write_text('casa not-a-count\n',encoding='utf-8')
            with self.assertRaises(ValueError):list(records(path,source('frequency_text')))

    def test_tei_imports_italian_headwords_and_never_translations(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'fixture.tei'
            path.write_text('''<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><entry xml:id="casa">
              <form><orth>casa</orth><orth xml:lang="de">Haus</orth></form>
              <sense><cit type="trans" xml:lang="de"><quote>Haus</quote></cit></sense>
              </entry></body></text></TEI>''',encoding='utf-8')
            config={**source('tei_headwords'),'dictionary_source_language':'it'}
            rows=list(records(path,config))
            self.assertEqual([r['prompt'] for r in rows],['casa'])
            self.assertFalse(rows[0]['details']['translations_imported'])
            with self.assertRaises(ValueError):list(records(path,source('tei_headwords')))


@unittest.skipUnless((CACHE/'sqlite3.exe').exists(),'Runtime ufficiale assente; nessun download nei test')
class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.directory=Path(self.temporary.name)
        self.db=SQLite(self.directory/'inventory.sqlite3');initialize_inventory(self.db)

    def tearDown(self):self.temporary.cleanup()

    def test_registered_source_first_import_merges_words_and_later_versions_are_staged(self):
        from inventory_updates import register_sources
        existing=self.directory/'existing.txt'
        existing.write_text('casa\n',encoding='utf-8')
        import_source(self.db,source(key='existing'),existing)
        config=source('morphit','registered-morphology')
        register_sources(self.db,[config])
        self.db.run("UPDATE inventory_registered_sources SET enabled=0 WHERE source_key='registered-morphology';")
        path=self.directory/'morph.txt'
        path.write_text('casa\tcasa\tNOUN-F:s\ncasa\tcasa\tNOUN-F:s\ncase\tcasa\tNOUN-F:p\n',encoding='latin-1')
        self.assertEqual(import_source(self.db,config,path)['status'],'IMPORTED')
        self.assertEqual(import_source(self.db,config,path)['status'],'ALREADY_IMPORTED')
        self.assertEqual(self.db.run('SELECT prompt FROM inventory_terms ORDER BY prompt;',rows=True),
                         [{'prompt':'casa'},{'prompt':'case'}])
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM inventory_updates;',rows=True)[0]['n'],0)
        self.assertEqual(self.db.run("SELECT enabled FROM inventory_registered_sources WHERE source_key='registered-morphology';",
                                     rows=True)[0]['enabled'],0)
        path.write_text('gatto\tgatto\tNOUN-M:s\n',encoding='latin-1')
        self.assertEqual(import_source(self.db,config,path)['status'],'PENDING')
        self.assertEqual(self.db.run("SELECT prompt FROM inventory_terms WHERE prompt='gatto';",rows=True),[])

    def test_new_morphology_imports_keep_provenance_and_evidence_flags(self):
        unimorph=self.directory/'ita'
        unimorph.write_text('andare\tandarono\tV;IND;PST;3;PL\n',encoding='utf-8')
        glaffit=self.directory/'glaffit.bz2'
        with bz2.open(glaffit,'wt',encoding='utf-8') as stream:
            stream.write('FORM\tFCODE\tLEMMA\tLCODE\nandarono\tVmis3p-\tandare\tVmn----\n')
        flex=self.directory/'nouns.csv'
        flex.write_text('Form,Lemma,POS,Freq,Gender,Number,Inf_class\n'
                        'case,casa,NOUN-F:p,12,femm,plur,a_e\n',encoding='utf-8')
        for kind,path in [('unimorph',unimorph),('glaffit',glaffit),('flex_it',flex)]:
            config={**source(kind,kind),'pos':'NOUN'}
            self.assertEqual(import_source(self.db,config,path)['status'],'IMPORTED')
            self.assertEqual(import_source(self.db,config,path)['status'],'ALREADY_IMPORTED')
        rows=self.db.run('SELECT prompt,has_lemma_evidence,has_inflected_evidence,has_it_dictionary_evidence '
                         'FROM inventory_terms ORDER BY prompt;',rows=True)
        self.assertEqual(rows,[{'prompt':word,'has_lemma_evidence':lemma,'has_inflected_evidence':1-lemma,
                               'has_it_dictionary_evidence':1}
                              for word,lemma in [('andare',1),('andarono',0),('casa',1),('case',0)]])
        self.assertEqual(self.db.run("SELECT count(DISTINCT snapshot_id) AS n FROM inventory_attestations "
                                     "WHERE prompt='andarono';",rows=True)[0]['n'],2)
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM inventory_term_decisions;',rows=True)[0]['n'],0)

    def test_distinct_prompts_multiple_sources_idempotence_and_safe_text(self):
        first=self.directory/'one.txt';second=self.directory/'two.txt'
        malicious="x'); DROP TABLE inventory_terms;--"
        first.write_text('Casa\nCASA\n'+malicious+'\n',encoding='utf-8')
        second.write_text('casa\ncaffè\n',encoding='utf-8')
        self.assertEqual(import_source(self.db,source(key='one'),first)['records'],3)
        self.assertEqual(import_source(self.db,source(key='one'),first)['status'],'ALREADY_IMPORTED')
        import_source(self.db,source(key='two'),second)
        summary=status(self.db)
        self.assertEqual(summary['collected_prompts'],3)
        self.assertEqual(summary['sources'],2)
        self.assertEqual(summary['attestations'],5)
        self.assertFalse(summary['automatic_gameplay_approval'])
        self.assertEqual(self.db.run('SELECT DISTINCT review_status FROM inventory_terms;',rows=True),[{'review_status':'COLLECTED'}])
        self.assertEqual(self.db.run('SELECT count(*) AS n FROM associations;',rows=True),[{'n':0}])
        self.assertEqual(len(self.db.run('SELECT * FROM inventory_pending_single_words;',rows=True)),2)
        counts=self.db.run('SELECT attestations FROM inventory_source_counts ORDER BY source_key;',rows=True)
        self.assertEqual(counts,[{'attestations':3},{'attestations':2}])

    def test_old_attestation_table_is_migrated_with_the_same_rows_and_layout(self):
        # 'Casa' è la forma della fonte di 'casa': nelle righe nuove resta solo lei (NULL vuol dire uguale).
        first=self.directory/'one.txt';first.write_text('Casa\ncane\n',encoding='utf-8')
        import_source(self.db,source(key='one'),first)
        query='SELECT * FROM inventory_attestations ORDER BY snapshot_id,prompt,locator,role;'
        before=self.db.run(query,rows=True)
        self.assertEqual({r['prompt']:r['source_form'] for r in before},{'casa':'Casa','cane':'cane'})
        # Il vecchio formato: una tabella con i testi dello snapshot, del ruolo e della categoria in ogni riga.
        self.db.run('PRAGMA foreign_keys=OFF;BEGIN;CREATE TABLE old_rows AS SELECT * FROM inventory_attestations;'
            'DROP TRIGGER inventory_attestations_insert;DROP TRIGGER inventory_attestations_delete;'
            'DROP VIEW inventory_attestations;DROP TABLE inventory_attestation_rows;DROP TABLE inventory_snapshot_numbers;'
            'DROP TABLE inventory_attestation_roles;DROP TABLE inventory_attestation_pos;'
            'CREATE TABLE inventory_attestations(prompt TEXT NOT NULL REFERENCES inventory_terms(prompt),'
            'snapshot_id TEXT NOT NULL REFERENCES inventory_snapshots(id),locator TEXT NOT NULL,role TEXT NOT NULL,'
            'pos TEXT NOT NULL,source_form TEXT NOT NULL,lemma TEXT NOT NULL,'
            'details_json TEXT NOT NULL CHECK(json_valid(details_json)),PRIMARY KEY(snapshot_id,prompt,locator,role)) STRICT;'
            'CREATE INDEX inventory_attestations_by_prompt ON inventory_attestations(prompt);'
            'INSERT INTO inventory_attestations SELECT * FROM old_rows;DROP TABLE old_rows;COMMIT;')
        initialize_inventory(self.db)
        self.assertEqual(self.db.run(query,rows=True),before)
        self.assertEqual(self.db.run('SELECT prompt,source_form FROM inventory_attestation_rows ORDER BY prompt;',rows=True),
                         [{'prompt':'cane','source_form':None},{'prompt':'casa','source_form':'Casa'}])
        # La migrazione arriva allo stesso schema di un database nuovo.
        fresh=SQLite(self.directory/'fresh.sqlite3');initialize_inventory(fresh)
        layout=("SELECT type,name,sql FROM sqlite_schema WHERE name LIKE 'inventory_attestation%' "
                "OR name='inventory_snapshot_numbers' ORDER BY name;")
        self.assertEqual(self.db.run(layout,rows=True),fresh.run(layout,rows=True))
        second=self.directory/'two.txt';second.write_text('gatto\n',encoding='utf-8')
        import_source(self.db,source(key='two'),second)
        self.assertEqual(status(self.db)['attestations'],len(before)+1)
        self.assertEqual(self.db.run('PRAGMA foreign_key_check;',rows=True),[])

    def test_old_terms_table_is_migrated_with_the_same_rows_and_layout(self):
        first=self.directory/'one.txt';first.write_text('Casa\ncane\nla casa\n',encoding='utf-8')
        import_source(self.db,source(key='one'),first)
        query='SELECT * FROM inventory_terms ORDER BY prompt;'
        before=self.db.run(query,rows=True)
        pending=self.db.run('SELECT * FROM inventory_pending_single_words ORDER BY prompt;',rows=True)
        self.assertEqual({r['review_status'] for r in before},{'COLLECTED'})
        # Il vecchio formato: tabella con il rowid e review_status scritto in ogni riga.
        self.db.run('PRAGMA foreign_keys=OFF;BEGIN;CREATE TABLE old_terms AS SELECT * FROM inventory_terms;DROP TABLE inventory_terms;'
            'CREATE TABLE inventory_terms(prompt TEXT PRIMARY KEY,is_single_word INTEGER NOT NULL CHECK(is_single_word IN (0,1)),'
            'has_lemma_evidence INTEGER NOT NULL CHECK(has_lemma_evidence IN (0,1)),'
            'has_inflected_evidence INTEGER NOT NULL CHECK(has_inflected_evidence IN (0,1)),'
            'has_proper_name_evidence INTEGER NOT NULL CHECK(has_proper_name_evidence IN (0,1)),'
            'has_it_dictionary_evidence INTEGER NOT NULL CHECK(has_it_dictionary_evidence IN (0,1)),'
            "review_status TEXT NOT NULL DEFAULT 'COLLECTED' CHECK(review_status='COLLECTED')) STRICT;"
            'INSERT INTO inventory_terms SELECT * FROM old_terms;DROP TABLE old_terms;COMMIT;')
        initialize_inventory(self.db)
        self.assertEqual(self.db.run(query,rows=True),before)
        fresh=SQLite(self.directory/'fresh.sqlite3');initialize_inventory(fresh)
        layout="SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='inventory_terms' ORDER BY name;"
        self.assertEqual(self.db.run(layout,rows=True),fresh.run(layout,rows=True))
        self.assertIn('WITHOUT ROWID',self.db.run(layout,rows=True)[0]['sql'])
        # Le viste e le chiavi esterne che nominano la tabella valgono ancora, e l'importazione aggiorna le voci.
        self.assertEqual(self.db.run('SELECT * FROM inventory_pending_single_words ORDER BY prompt;',rows=True),pending)
        self.assertEqual(self.db.run('PRAGMA foreign_key_check;',rows=True),[])
        second=self.directory/'two.txt';second.write_text('casa\ngatto\n',encoding='utf-8')
        import_source(self.db,source(key='two'),second)
        self.assertEqual(status(self.db)['collected_prompts'],len(before)+1)
        with self.assertRaises(RuntimeError):  # review_status non si scrive: è sempre COLLECTED
            self.db.run("UPDATE inventory_terms SET review_status='APPROVED';")

    def test_malformed_source_leaves_no_snapshot_or_terms(self):
        broken=self.directory/'broken.jsonl'
        broken.write_text('{"word":"casa","lang_code":"it","pos":"noun"}\nBROKEN',encoding='utf-8')
        with self.assertRaises(ValueError):import_source(self.db,source('wiktextract'),broken)
        self.assertEqual(status(self.db)['collected_prompts'],0)
        self.assertEqual(self.db.run('SELECT id FROM inventory_snapshots;',rows=True),[])

    def test_lemma_inflection_flags_merge_without_semantic_promotion(self):
        path=self.directory/'morph.txt';path.write_text('case\tcasa\tNOUN-F:p\ncasa\tcasa\tNOUN-F:s\n',encoding='latin-1')
        import_source(self.db,source('morphit'),path)
        rows=self.db.run('SELECT prompt,has_lemma_evidence,has_inflected_evidence FROM inventory_terms ORDER BY prompt;',rows=True)
        self.assertEqual(rows,[{'prompt':'casa','has_lemma_evidence':1,'has_inflected_evidence':0},
                               {'prompt':'case','has_lemma_evidence':0,'has_inflected_evidence':1}])


if __name__=='__main__':unittest.main()
