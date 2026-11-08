"""Regressioni dell'esportazione numerata e delle direttive POS flessibili."""
import csv
import json
from pathlib import Path
import tempfile
import unittest
import io
from contextlib import redirect_stdout

from association_rules import POSSESSIVES, STOP_ASSOCIATIONS
from generate_candidates import export_numbered_csv, export_public_csv, next_output_paths
from prompt_policy import load_prompt_policy,screen_prompt,borrowing_evidence,familiarity_reference
from validate_word_association_it_v3_6_0 import check_candidates_jsonl, load_taxonomy, TAXONOMY_FILENAME, main as validate_main
from test_word_association_it_v3_6_0 import candidate


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)

    def test_numbered_export_preserves_every_cell(self):
        source=self.root/'game.csv';target=self.root/'numbered.csv'
        rows=[['ref','source','language','prompt','words'],
              ['c'+'0'*24,'platform','it','caffè','aroma|tazza|chicco|moka|bar|tostatura|espresso'],
              ['c'+'1'*24,'platform','it','pizza','forno|mozzarella|pomodoro|impasto|lievito|basilico|margherita']]
        with source.open('w',encoding='utf-8',newline='') as stream: csv.writer(stream).writerows(rows)
        self.assertEqual(export_numbered_csv(source,target),2)
        with target.open(encoding='utf-8-sig',newline='') as stream: result=list(csv.reader(stream,delimiter=','))
        self.assertEqual(result[0],['ordine',*rows[0]])
        self.assertEqual(result[1:],[['1',*rows[1]],['2',*rows[2]]])
        with self.assertRaises(ValueError): export_numbered_csv(source,source)
        with self.assertRaises(FileExistsError): export_numbered_csv(source,target)
        with target.open(encoding='utf-8-sig',newline='') as stream:
            self.assertEqual(list(csv.reader(stream,delimiter=',')),result)

    def test_output_sequence_preserves_existing_batches(self):
        sequence,paths=next_output_paths(self.root,5000)
        self.assertEqual(sequence,1)
        self.assertEqual(paths['candidates'].name,'word_association_it_5000_candidati_0001.csv')
        self.assertEqual(paths['numbered'].name,'word_association_it_5000_candidati_con_ordine_0001.csv')
        for path in paths.values(): path.write_text('existing',encoding='utf-8')
        # A partial later batch also reserves its number; gaps are not reused.
        (self.root/'rapporto_0003.json').write_text('{}',encoding='utf-8')
        (self.root/'unrelated_0099.csv').write_text('unrelated',encoding='utf-8')
        sequence,later=next_output_paths(self.root,1000)
        self.assertEqual(sequence,4)
        self.assertTrue(all(path.stem.endswith('_0004') for path in later.values()))
        self.assertTrue(all(path.read_text(encoding='utf-8')=='existing' for path in paths.values()))

    def test_missing_verbs_is_informational(self):
        taxonomy=load_taxonomy(Path(__file__).parent/TAXONOMY_FILENAME)
        items=[candidate('contesto'+chr(97+i//26)+chr(97+i%26),f'test-{i}') for i in range(30)]
        for i,item in enumerate(items):
            item['difficulty_estimate']='media' if i<21 else 'alta'
            item['relations']=[['strumento','luogo','parte','materiale','funzione'][(i+j)%5] for j in range(7)]
        path=self.root/'items.jsonl'
        path.write_text('\n'.join(json.dumps(item) for item in items),encoding='utf-8')
        result=check_candidates_jsonl(path,taxonomy)
        self.assertEqual(result['errors_count'],0)
        self.assertTrue(result['planning_notes'])
        self.assertFalse(any('POS contesti' in warning for warning in result['warnings']))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(validate_main(['--candidates-jsonl',str(path),'--strict-warnings']),0)

    def test_new_qa_payload_shows_context_and_hides_answers(self):
        import prepare_qa
        path=self.root/'items.jsonl';out=self.root/'review'
        path.write_text(json.dumps(candidate()),encoding='utf-8')
        with redirect_stdout(io.StringIO()): prepare_qa.main([str(path),'--output',str(out)])
        requests=[json.loads(p.read_text(encoding='utf-8')) for p in (out/'blind').glob('*.json')]
        self.assertEqual(len(requests),2)
        self.assertTrue(all(request['visible_context']=='pizza' for request in requests))
        self.assertTrue(all('mozzarella' not in json.dumps(request) for request in requests))

    def test_possessives_remain_filtered(self):
        self.assertTrue(POSSESSIVES<=STOP_ASSOCIATIONS)

    def test_prompt_policy_separates_familiarity_and_closed_loan_list(self):
        policy=load_prompt_policy()
        self.assertNotIn('excluded_prompts',policy)
        self.assertTrue(screen_prompt('computer',4.8,policy,['source_loanword_label'])['accepted'])
        self.assertTrue(screen_prompt('bar',4.8,policy,['source_loanword_label'])['accepted'])
        # High frequency never bypasses the closed list for a foreign loan.
        self.assertFalse(screen_prompt('abstract',6.0,policy,['source_loanword_label'])['accepted'])
        self.assertFalse(screen_prompt('background',6.0,policy,['source_loanword_label'])['accepted'])
        self.assertFalse(screen_prompt('abside',2.94,policy)['accepted'])
        self.assertTrue(screen_prompt('basilico',3.5,policy)['accepted'])
        self.assertNotIn('basilico',policy['common_loanwords'])

    def test_borrowing_detection_ignores_translations_and_italian_derivations(self):
        entry={'word':'basilico','pos':'noun','translations':[{'lang_code':'en','word':'basil'}]}
        self.assertEqual(borrowing_evidence(entry,{}),[])
        entry={'word':'abstract','pos':'noun','etymology_texts':["prestito diretto dall'inglese abstract"]}
        self.assertTrue(borrowing_evidence(entry,{}))
        entry={'word':'filmare','pos':'verb','etymology_texts':['derivazione di film']}
        self.assertEqual(borrowing_evidence(entry,{'raw_tags':['forestierismo']}),[])

    def test_verbal_frequency_uses_only_attested_forms(self):
        scores={'affettare':2.7,'affettato':3.4,'abside':2.94,'absidi':3.8,'avere':6.0}
        reference=familiarity_reference({'word':'affettare','pos':'verb','forms':[{'form':'affettato'},{'form':'avere','tags':['auxiliary']}]},scores.get)
        self.assertEqual(reference['form'],'affettato')
        self.assertTrue(screen_prompt('affettare',2.7,load_prompt_policy(),frequency_reference=reference)['accepted'])
        reference=familiarity_reference({'word':'abside','pos':'noun','forms':[{'form':'absidi'}]},scores.get)
        self.assertEqual(reference['form'],'abside')
        self.assertFalse(screen_prompt('abside',2.94,load_prompt_policy(),frequency_reference=reference)['accepted'])

    def test_public_export_has_five_header_cells(self):
        source=self.root/'ordered.csv';target=self.root/'public.csv'
        source.write_text('ordine,ref,source,language,prompt,words\n1,c000000000000000000000000,platform,it,pizza,forno|mozzarella|pomodoro|impasto|lievito|basilico|margherita\n',encoding='utf-8')
        self.assertEqual(export_public_csv(source,target),1)
        with target.open(encoding='utf-8-sig',newline='') as f: rows=list(csv.reader(f,delimiter=','))
        self.assertEqual(rows[0],['ref','source','language','prompt','words'])
        self.assertTrue(all(len(row)==5 for row in rows))
        self.assertEqual(rows[1],['','ChatGPT','it','PIZZA','forno|mozzarella|pomodoro|impasto|lievito|basilico|margherita'])
        self.assertFalse(target.read_bytes().startswith(b'\xef\xbb\xbf'))
        self.assertEqual(target.read_text(encoding='utf-8-sig').splitlines()[0],'ref,source,language,prompt,words')
        numbered=self.root/'numbered.csv'
        self.assertEqual(export_numbered_csv(target,numbered),1)
        with numbered.open(encoding='utf-8-sig',newline='') as f:
            self.assertEqual(list(csv.reader(f,delimiter=','))[1],['1',*rows[1]])

    def test_delivery_case_preserves_accents_and_internal_input(self):
        source=self.root/'game.csv';target=self.root/'public.csv'
        original='ref,source,language,prompt,words\nc000000000000000000000000,platform,it,caffè,AROMA|TAZZA|CHICCO|MOKA|BAR|TOSTATURA|ESPRESSO\n'
        source.write_text(original,encoding='utf-8')
        export_public_csv(source,target)
        with target.open(encoding='utf-8-sig',newline='') as f: rows=list(csv.reader(f,delimiter=','))
        self.assertEqual(rows[1],['','ChatGPT','it','CAFFÈ','aroma|tazza|chicco|moka|bar|tostatura|espresso'])
        self.assertEqual(source.read_text(encoding='utf-8'),original)

if __name__=='__main__': unittest.main()
