import csv
from contextlib import redirect_stdout, redirect_stderr
from copy import deepcopy
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from editorial_pipeline import partition_editorial, produce_editorial
from generate_candidates import main as generate_main
from semantic_rules import (regression_cases, screen_set, diversity_signals,
                            editorial_errors, SEMANTIC_POLICY, definitional_connector)
from test_word_association_it_v3_6_0 import candidate, approved_qa, ANSWERS, TAX
from validate_word_association_it_v3_6_0 import check_qa_register, load_taxonomy


class SemanticPipelineTests(unittest.TestCase):
    def test_noun_adjective_derivatives_are_detected_without_counting_them_as_distinct(self):
        signals=diversity_signals('agonistico',['competizione','competitivo'])
        self.assertIn('similar_answer_forms',{s['code'] for s in signals})
        self.assertIn('similar_answer_forms',{s['code'] for s in diversity_signals('ripetuto',['ripetizione','ripetitivo'])})

    def test_definitional_connector_is_contextual_and_not_a_lemma_blacklist(self):
        self.assertIsNotNone(definitional_connector('inerente a competizioni sportive','inerente'))
        self.assertIsNotNone(definitional_connector('relativo alla scuola','relativo'))
        self.assertIsNone(definitional_connector('sinonimo di inerente','inerente'))
        row={'source_gloss':'inerente a competizioni sportive',
             'clue_evidence':{'inerente':{'kind':'definizione','analysis':{'word':'inerente'}}}}
        self.assertIn('definitional_connector',{s['code'] for s in screen_set('altrocontesto',['inerente'],row)['signals']})

    def test_retaining_one_word_does_not_replay_the_old_redundant_pair(self):
        case=regression_cases()['agonistico']
        old=screen_set('agonistico',['competizione','competitivo'],{'sense_id':case['sense_id']})
        self.assertIn('same_semantic_nucleus',{s['code'] for s in old['signals']})
        new=screen_set('agonistico',['competizione','allenamento'],{'sense_id':case['sense_id']})
        self.assertNotIn('same_semantic_nucleus',{s['code'] for s in new['signals']})

    def edited(self, prompt='pizza'):
        row=candidate(prompt,prompt+'-test')
        row['editorial_revision']={'sense_description':'Preparazione alimentare di impasto condito',
            'word_reviews':[{'word':review['word'],'relation':'contesto',
                             'rationale':review['rationale']} for review in approved_qa()['word_reviews']]}
        return row

    def test_every_observed_case_is_reproducible_without_deleting_prompt(self):
        for prompt,case in regression_cases().items():
            with self.subTest(prompt=prompt):
                result=screen_set(prompt,case['original_words'],{'sense_id':case['sense_id']})
                self.assertTrue(result['signals'])
                self.assertEqual(result['prompt'],prompt)
                self.assertTrue(result['prompt_preserved'])
                self.assertFalse(result['semantic_approval'])

    def test_negation_survives_extraction_and_is_not_a_global_word_ban(self):
        row={'source_gloss':'tavola senza manubrio',
             'clue_evidence':{'manubrio':{'analysis':{'word':'manubrio'}}}}
        result=screen_set('tavola',['manubrio'],row)
        self.assertIn('negated_source_feature',{s['code'] for s in result['signals']})
        result=screen_set('bicicletta',['manubrio'],{'source_gloss':'veicolo con manubrio'})
        self.assertNotIn('negated_source_feature',{s['code'] for s in result['signals']})

    def test_changed_sense_does_not_replay_old_sense_as_a_ban(self):
        result=screen_set('tribuna',['altare'],{'sense_id':'different-documented-sense'})
        self.assertEqual(result['signals'],[])

    def test_single_correct_color_is_not_treated_as_concentration(self):
        result=screen_set('tigre',['arancione','felino'])
        self.assertNotIn('attribute_concentration',{s['code'] for s in result['signals']})

    def test_derivatives_and_declared_equivalence_are_detected_separately(self):
        signals=diversity_signals('improvviso',['improvvisare','improvvisato'])
        self.assertIn('prompt_family_accumulation',{s['code'] for s in signals})
        words=['inaspettato','imprevisto','inatteso']
        signals=diversity_signals('improvviso',words,{w:'unexpected' for w in words})
        self.assertIn('semantic_equivalence_accumulation',{s['code'] for s in signals})

    def test_missing_selection_remains_pending_and_preserves_records(self):
        selected=self.edited();raw=candidate('caffè','raw')
        before=deepcopy([selected,raw])
        yes,pending=partition_editorial([selected,raw],lambda r:{'accepted':True})
        self.assertEqual(len(yes),1)
        self.assertEqual(pending[0]['prompt'],'caffè')
        self.assertEqual(pending[0]['record'],raw)
        self.assertEqual([selected,raw],before)
        self.assertEqual(yes[0]['association_selection']['independent_review'],'NOT_RUN')

    def test_copied_editorial_reasons_are_not_a_selection(self):
        row=self.edited()
        for review in row['editorial_revision']['word_reviews']:
            review['rationale']='Questa parola compare nella definizione fornita.'
        self.assertTrue(editorial_errors(row))

    def test_concise_specific_fact_does_not_need_padding(self):
        row=self.edited()
        row['editorial_revision']['word_reviews'][0]['rationale']='Il ragù è un sugo.'
        self.assertEqual(editorial_errors(row),[])

    def test_different_source_occurrence_sentences_do_not_approve_relations(self):
        row=self.edited()
        for review in row['editorial_revision']['word_reviews']:
            review['rationale']='La parola '+review['word']+' compare nella definizione.'
        self.assertIn('La sola presenza nella fonte non motiva una relazione',editorial_errors(row))

    def test_negated_component_is_pending_until_replaced_or_resolved(self):
        row=self.edited('tavola')
        row['words'][0]='manubrio'
        row['source_gloss']='Tavola senza manubrio.'
        row['editorial_revision']['word_reviews'][0].update(
            word='manubrio',relation='parte',rationale='Il manubrio viene usato per guidare il mezzo.')
        selected,pending=partition_editorial([row],lambda r:{'accepted':True})
        self.assertEqual(selected,[])
        self.assertEqual(pending[0]['prompt'],'tavola')
        self.assertTrue(any('negated_source_feature' in reason for reason in pending[0]['reasons']))

    def test_under_yield_cannot_silently_export_raw_tokens(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'input.jsonl';output=root/'out'
            records=[self.edited(),candidate('caffè','raw')]
            source.write_text(''.join(json.dumps(r)+'\n' for r in records),encoding='utf-8')
            args=SimpleNamespace(editorial_jsonl=source,taxonomy_csv=TAX,output=output,
                                 count=2,batch_id='test',with_order=False)
            with redirect_stdout(io.StringIO()):
                code=produce_editorial(args,lambda row:{'accepted':True})
            self.assertEqual(code,2)
            self.assertEqual(list(output.glob('*.csv')),[])
            pending=next(output.glob('*in_revisione*.jsonl'))
            self.assertEqual(json.loads(pending.read_text(encoding='utf-8'))['prompt'],'caffè')

    def test_generator_requires_explicit_lexical_mode_or_editorial_file(self):
        with redirect_stderr(io.StringIO()),self.assertRaises(SystemExit) as error:
            generate_main(['--corpus','unused','--frequency-csv','unused','--definition-df-csv','unused'])
        self.assertEqual(error.exception.code,2)

    def test_editorial_export_preserves_facts_and_stays_unapproved(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'input.jsonl';output=root/'out'
            source.write_text(json.dumps(self.edited())+'\n',encoding='utf-8')
            args=SimpleNamespace(editorial_jsonl=source,taxonomy_csv=TAX,output=output,
                                 count=1,batch_id='test',with_order=False)
            with redirect_stdout(io.StringIO()):
                code=produce_editorial(args,lambda r:{'accepted':True,'semantic_approval':False})
            self.assertEqual(code,0)
            csvs=list(output.glob('*.csv'))
            self.assertEqual(len(csvs),2)
            public=next(output.glob('*candidati_0001.csv'))
            with public.open(encoding='utf-8',newline='') as stream:rows=list(csv.DictReader(stream))
            self.assertEqual(rows[0]['prompt'],'PIZZA')
            self.assertEqual(rows[0]['words'],'|'.join(ANSWERS))
            self.assertFalse(list(output.glob('*con_ordine*')))
            metadata=json.loads(next(output.glob('*metadati_0001.jsonl')).read_text(encoding='utf-8'))
            self.assertEqual(metadata['association_selection']['independent_review'],'NOT_RUN')
            self.assertEqual(metadata['editorial_revision']['word_reviews'],self.edited()['editorial_revision']['word_reviews'])

    def test_QA_rejects_missing_policy_unchecked_roles_copied_reasons_and_synonym_density(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);csv_path=root/'game.csv';qa_dir=root/'qa';qa_dir.mkdir()
            with csv_path.open('w',encoding='utf-8',newline='') as stream:
                writer=csv.writer(stream);writer.writerow(['ref','source','language','prompt','words'])
                writer.writerow(['c'+'0'*24,'platform','it','pizza','|'.join(ANSWERS)])
            for defect in ('policy','polarity','copies','synonyms','set','null_checks'):
                with self.subTest(defect=defect):
                    qa=approved_qa()
                    if defect=='policy':qa.pop('semantic_policy_version')
                    if defect=='polarity':qa['word_reviews'][0]['checks']['source_polarity']=None
                    if defect=='copies':
                        for review in qa['word_reviews']:review['rationale']='Motivazione identica ripetuta per tutte le risposte.'
                    if defect=='synonyms':
                        for review in qa['word_reviews'][:3]:review['meaning_group']='same'
                    if defect=='set':qa['semantic_review']['set_checks']['non_redundant']=None
                    if defect=='null_checks':qa['word_reviews'][0]['checks']=None
                    (qa_dir/'review.json').write_text(json.dumps(qa),encoding='utf-8')
                    result=check_qa_register(csv_path,qa_dir,True,taxonomy=load_taxonomy(TAX))
                    self.assertGreater(result['errors_count'],0)

    def test_editorial_sense_does_not_hide_unknown_or_unlisted_foreign_prompt(self):
        from audit_prompt_familiarity import main as audit_main
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'corpus.jsonl';metadata=root/'metadata.jsonl';csv_path=root/'game.csv';output=root/'audit.json'
            entries=[{'word':word,'lang_code':'it','pos':'noun','raw_tags':tags,
                'senses':[{'id':word+'-source','glosses':['definizione sorgente']}]} for word,tags in [('terna',[]),('glorp',['anglicismo'])]]
            source.write_text(''.join(json.dumps(row)+'\n' for row in entries),encoding='utf-8')
            metadata.write_text(''.join(json.dumps({'prompt':word,'pos':'NOUN','sense_id':None,'source_gloss':None,
                'editorial_revision':{'sense_changed':True}})+'\n' for word in ['terna','glorp','ignoto']),encoding='utf-8')
            with csv_path.open('w',encoding='utf-8',newline='') as stream:
                writer=csv.writer(stream);writer.writerow(['ref','source','language','prompt','words'])
                writer.writerows(['','yours','it',word.upper(),'|'.join(ANSWERS)] for word in ['terna','glorp','ignoto'])
            fake_frequency=SimpleNamespace(zipf_frequency=lambda *args:4.0)
            with patch.dict('sys.modules',{'wordfreq':fake_frequency}),redirect_stdout(io.StringIO()):
                code=audit_main(['--corpus',str(source),'--metadata',str(metadata),'--csv',str(csv_path),'--output',str(output)])
            self.assertEqual(code,1)
            report=json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual({row['prompt'] for row in report['rejected']},{'glorp','ignoto'})
            self.assertIn('terna',report['editorial_senses_requiring_review'])


if __name__=='__main__':unittest.main()
