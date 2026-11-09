"""Il primo step raccoglie attestazioni senza generare né approvare associazioni."""
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
