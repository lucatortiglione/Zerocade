#!/usr/bin/env python3
"""Regressioni standard library: Word Association IT v3.6.0, direzione CONTEXT->7 ANSWERS."""
from __future__ import annotations
from pathlib import Path
import json
import csv
import tempfile
import unittest
from semantic_rules import SEMANTIC_POLICY, WORD_CHECKS, SET_CHECKS

from validate_word_association_it_v3_6_0 import (
    load_taxonomy,check_csv,check_candidates_jsonl,check_qa_register,
    assemble_candidates,retrieval_payload,retrieval_metrics,load_morphology,
    lexical_check,check_double_reviews,kappa,resolve_lexical_flags,
)

ROOT=Path(__file__).parent.parent
TAX=ROOT/'tassonomia_word_association_it_172_categorie_v3_6_0.csv'
ANSWERS=['forno','mozzarella','pomodoro','impasto','lievito','basilico','margherita']


def candidate(prompt='pizza', cid='c0', cat='008'):
    return {'schema_version':'word-association-candidate-3.6.0',
            'candidate_id':cid,'parent_candidate_id':None,'repair_attempt':0,
            'batch_id':'B-01','category_id':cat,'prompt':prompt,'words':ANSWERS[:],
            'pos':'NOUN','difficulty_estimate':'media',
            'word_difficulty_estimates':['facile']*3+['media']*2+['alta']*2,
            'relations':['strumento','ingrediente','ingrediente','materiale','processo','ingrediente','categoria'],
            'strategy':'balanced_322'}


def approved_qa():
    facts=['Il forno cuoce la pizza.', 'La mozzarella condisce la pizza.',
           'Il pomodoro viene usato come condimento della pizza.',
           "L'impasto forma la base della pizza.", 'Il lievito fa lievitare la pizza.',
           'Il basilico aromatizza la pizza.', 'La margherita è una varietà di pizza.']
    reviews=[{'word':word,'relevance':5,'discoverability':4,
              'difficulty':'media','rationale':fact,'answer_sense':word,
              'meaning_group':word,'decision':'accettata','checks':{k:True for k in WORD_CHECKS}}
             for word,fact in zip(ANSWERS,facts)]
    trials=[{'reviewer_id':'human1','reviewer_type':'human','prompt_shown':'pizza',
             'answers_shown':False,'guesses':['forno','pomodoro','impasto'],
             'ui_cues':{'answer_lengths_visible':False}},
            {'reviewer_id':'human2','reviewer_type':'human','prompt_shown':'pizza',
             'answers_shown':False,'guesses':['mozzarella','basilico','salame'],
             'ui_cues':{'answer_lengths_visible':False}}]
    return {'schema_version':'word-association-qa-3.6.0','candidate_id':'c0',
            'semantic_policy_version':SEMANTIC_POLICY,
            'category_id':'008','prompt':'pizza','words':ANSWERS[:],
            'technical':{'passed':True,'errors':[],'warnings_reviewed':True},
            'retrieval_test':{'protocol':'prompt_to_words_independent','prompt_visible':True,
                              'answers_visible':False,'independence_verified':True,
                              'verification_method':'human_review_records',
                              'evidence_refs':['human-1-log','human-2-log'],'trials':trials},
            'word_reviews':reviews,
            'semantic_review':{'ratings':{'Individuabilità':5,'Pertinenza':5,
                                          'Difficoltà':4,'Originalità':5,'Familiarità':5},
                               'total_100':96,'alternative_answer_pressure':'acceptable',
                               'set_checks':{k:True for k in SET_CHECKS},
                               'rationale':'Due prove esterne distinte, giudizi individuali sulle sette risposte.'},
            'safety_review':{'status':'CLEAR','classification':None},
            'decision':'IDONEO_REVISIONE_FINALE'}


class Tests360(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.tax=load_taxonomy(TAX)
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.work=Path(self.temp.name)
    def jsonl(self,items):
        out=self.work/'candidati.jsonl'
        out.write_text(''.join(json.dumps(v,ensure_ascii=False)+'\n' for v in items),encoding='utf-8')
        return out
    def csv_file(self,items):
        out=self.work/'gioco.csv'
        with out.open('w',newline='',encoding='utf-8') as file:
            writer=csv.writer(file);writer.writerow(['ref','source','language','prompt','words'])
            for i,(prompt,words) in enumerate(items):
                writer.writerow(['c'+f'{i:024d}','platform','it',prompt,'|'.join(words)])
        return out
    def qa(self,obj):
        folder=self.work/'qa';folder.mkdir(exist_ok=True)
        (folder/'pizza.json').write_text(json.dumps(obj,ensure_ascii=False),encoding='utf-8')
        return folder
    def test_taxonomy_preserved(self):
        self.assertEqual(len(self.tax),172)
        self.assertEqual(len({v['cluster_id'] for v in self.tax.values()}),16)
    def test_prompt_visible_seven_answers_valid(self):
        r=check_csv(self.csv_file([('pizza',ANSWERS)]))
        self.assertEqual(r['errors_count'],0,r['errors'])
        self.assertEqual(r['game_direction'],'visible_prompt_to_hidden_answers')
    def test_prompt_as_answer_rejected(self):
        words=ANSWERS[:]; words[0]='pizza'
        r=check_csv(self.csv_file([('pizza',words)]))
        self.assertTrue(r['counts'].get('error:prompt_as_answer',0))
    def test_answers_cannot_repeat(self):
        words=ANSWERS[:];words[0]=words[1]
        r=check_csv(self.csv_file([('pizza',words)]))
        self.assertGreater(r['counts'].get('error:duplicate_answers',0),0)
    def test_duplicate_context_rejected(self):
        r=check_csv(self.csv_file([('pizza',ANSWERS),('pizza',['farina','pasta','pizzaio','forchetta','fornello','tavolo','tovaglia'])]))
        self.assertGreater(r['counts'].get('error:duplicate_prompt',0),0)
    def test_generic_answer_is_warning_not_auto_reject(self):
        answers=ANSWERS[:];answers[0]='tempo'
        r=check_csv(self.csv_file([('pizza',answers)]))
        self.assertEqual(r['errors_count'],0)
        self.assertTrue(r['counts'].get('warning:generic_answer',0))
    def test_same_answer_can_occur_for_different_contexts(self):
        others=['forno','mozzarella','pane','piatto','acqua','calore','cuocere']
        r=check_csv(self.csv_file([('pizza',ANSWERS),('cucina',others)]))
        self.assertEqual(r['errors_count'],0,r['errors'])
    def test_identical_seven_answer_set_rejected(self):
        r=check_csv(self.csv_file([('pizza',ANSWERS),('cucina',ANSWERS)]))
        self.assertGreater(r['counts'].get('error:identical_answer_set',0),0)
    def test_three_shared_answers_warns(self):
        other=['forno','mozzarella','pomodoro','salame','pizzeria','tavola','pietanza']
        r=check_csv(self.csv_file([('pizza',ANSWERS),('cucina',other)]))
        self.assertEqual(r['errors_count'],0,r['errors'])
        self.assertTrue(any(x['count']==3 for x in r['collision_examples']))
    def test_candidate_new_schema_pass(self):
        r=check_candidates_jsonl(self.jsonl([candidate()]),taxonomy=self.tax)
        self.assertEqual(r['errors_count'],0,r['errors'])
        self.assertEqual(r['by_category']['008'],1)
    def test_candidate_old_strategy_rejected(self):
        c=candidate();c['strategy']='progressive_322'
        r=check_candidates_jsonl(self.jsonl([c]),taxonomy=self.tax)
        self.assertTrue(any('strategy' in e for e in r['errors']))
    def test_candidate_old_schema_rejected(self):
        c=candidate();c['schema_version']='word-association-candidate-3.5.5'
        r=check_candidates_jsonl(self.jsonl([c]),taxonomy=self.tax)
        self.assertTrue(any('schema_version' in e for e in r['errors']))
    def test_candidate_bad_category_rejected(self):
        c=candidate(cat='999')
        r=check_candidates_jsonl(self.jsonl([c]),taxonomy=self.tax)
        self.assertTrue(any('category_id' in e for e in r['errors']))
    def test_candidate_repair_genealogy_valid(self):
        a=candidate();b=candidate(cid='c1')
        b['parent_candidate_id']='c0';b['repair_attempt']=1
        b['words'][-1]='salame'
        r=check_candidates_jsonl(self.jsonl([a,b]),taxonomy=self.tax)
        self.assertEqual(r['errors_count'],0,r['errors'])
    def test_repair_second_attempt_rejected(self):
        c=candidate();c['repair_attempt']=2;c['parent_candidate_id']='c_previous'
        r=check_candidates_jsonl(self.jsonl([c]),taxonomy=self.tax)
        self.assertGreater(r['errors_count'],0)
    def test_export_candidate_five_columns(self):
        c=self.jsonl([candidate()]);dest=self.work/'export.csv'
        self.assertEqual(assemble_candidates(c,dest),1)
        with dest.open(encoding='utf-8') as f:r=list(csv.reader(f))
        self.assertEqual(r[0],['ref','source','language','prompt','words'])
        self.assertEqual(r[1][3],'pizza')
    def test_retrieval_payload_never_shows_seven_answers(self):
        out=retrieval_payload('pizza',max_guesses=15)
        self.assertEqual(out['visible_context'],'pizza')
        self.assertNotIn('words',out)
        self.assertNotIn('forno',str(out))
    def test_retrieval_recall_diagnostic(self):
        trials=[{'guesses':['forno','salame','mozzarella']},{'guesses':['forno','basilico']}]
        r=retrieval_metrics('pizza',ANSWERS,trials)
        self.assertEqual(r['per_answer_recall']['forno'],1)
        self.assertEqual(r['per_answer_recall']['impasto'],0)
        self.assertEqual(r['distinct_answers_recalled'],3)
    def test_QA_with_correct_direction_approved(self):
        csv_path=self.csv_file([('pizza',ANSWERS)])
        out=check_qa_register(csv_path,self.qa(approved_qa()),True,taxonomy=self.tax)
        self.assertEqual(out['errors_count'],0,out['errors'])
    def test_QA_reverse_direction_not_approved(self):
        qa=approved_qa();qa['retrieval_test']['prompt_visible']=False
        csv_path=self.csv_file([('pizza',ANSWERS)])
        out=check_qa_register(csv_path,self.qa(qa),True,taxonomy=self.tax)
        self.assertGreater(out['errors_count'],0)
    def test_QA_old_blind_stages_rejected(self):
        qa=approved_qa();qa['blind_test']={'stages':[3,5,7]}
        csv_path=self.csv_file([('pizza',ANSWERS)])
        out=check_qa_register(csv_path,self.qa(qa),True,taxonomy=self.tax)
        self.assertTrue(any('OBSOLETO' in e for e in out['errors']))
    def test_QA_missing_individual_word_review_rejected(self):
        qa=approved_qa();qa['word_reviews']=qa['word_reviews'][:-1]
        out=check_qa_register(self.csv_file([('pizza',ANSWERS)]),self.qa(qa),True,taxonomy=self.tax)
        self.assertGreater(out['errors_count'],0)
    def test_QA_no_actual_human_rejected(self):
        qa=approved_qa()
        for t in qa['retrieval_test']['trials']:t['reviewer_type']='llm_diagnostic'
        out=check_qa_register(self.csv_file([('pizza',ANSWERS)]),self.qa(qa),True,taxonomy=self.tax)
        self.assertGreater(out['errors_count'],0)
    def test_QA_not_run_safety_blocks(self):
        qa=approved_qa();qa['safety_review']['status']='NOT_RUN'
        out=check_qa_register(self.csv_file([('pizza',ANSWERS)]),self.qa(qa),True,taxonomy=self.tax)
        self.assertGreater(out['errors_count'],0)
    def test_morphology_lookup_real_file(self):
        m=self.work/'morph.csv'
        m.write_text('form,lemma,pos\nre,re,NOUN\nforno,forno,NOUN\npizza,pizza,NOUN\n',encoding='utf-8')
        lookup=load_morphology(m)
        self.assertIn(('re','NOUN'),lookup['re'])
        r=lexical_check(self.csv_file([('pizza',ANSWERS)]),morphology=m)
        self.assertTrue(r['morphology_loaded'])
        self.assertGreater(r['counts'].get('review',0),0) # most answers not in this tiny test lexicon
    def test_kappa_degenerate(self):
        self.assertIsNone(kappa([1]*30,[1]*30))
        path=self.work/'pair.jsonl'
        rows=[{'batch_id':'B','reviewer_a':{'decision':'IDONEO'},
               'reviewer_b':{'decision':'IDONEO'}} for _ in range(30)]
        path.write_text(''.join(json.dumps(x)+'\n' for x in rows),encoding='utf-8')
        self.assertEqual(check_double_reviews(path)['agreement_status'],'UNDEFINED')
    def test_release_without_external_proofs_is_impossible(self):
        # Test gate indirectly: technical success does not constitute semantic approval.
        csv_path=self.csv_file([('pizza',ANSWERS)])
        out=check_qa_register(csv_path,self.work,True,taxonomy=self.tax)
        self.assertGreater(out['errors_count'],0)

    def test_missing_verbs_is_not_a_pos_warning_or_error(self):
        records=[candidate('contesto'+chr(97+i//26)+chr(97+i%26),f'fixture-{i}') for i in range(30)]
        out=check_candidates_jsonl(self.jsonl(records),self.tax)
        self.assertEqual(out['errors_count'],0)
        self.assertFalse(out['pos_quotas_are_mandatory'])
        self.assertTrue(out['planning_notes'])
        self.assertFalse(any('POS contesti' in warning for warning in out['warnings']))

if __name__=='__main__':unittest.main(verbosity=2)
