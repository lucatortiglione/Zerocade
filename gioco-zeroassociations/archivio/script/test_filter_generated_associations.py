import csv
from copy import deepcopy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from filter_generated_associations import evaluate, main, KEEP, EXCLUDE, PENDING
from test_word_association_it_v3_6_0 import candidate, approved_qa


class FilterGeneratedTests(unittest.TestCase):
    def raw(self,prompt,words,source):
        row=candidate(prompt)
        row.update(words=words,source_gloss=source,clue_evidence={})
        return row

    def test_camerata_forma_rejected_but_prompt_and_dormitorio_preserved(self):
        row=self.raw('camerata',['forma','dormitorio'],'camera di forma rettangolare')
        result=evaluate(row,{})
        self.assertEqual(result['excluded_words'],['forma'])
        self.assertEqual(result['retained_words'],['dormitorio'])
        self.assertFalse(result['complete_editorial_set'])
        self.assertEqual(row['words'],['forma','dormitorio'])

    def test_technical_sense_is_quarantined_not_reinterpreted(self):
        result=evaluate(self.raw('anima',['metallo','sforzo'],'profilato in metallo'),{})
        self.assertEqual(result['pending_words'],['metallo','sforzo'])
        self.assertEqual(result['retained_words'],[])

    def test_case_does_not_ban_a_word_in_another_sense(self):
        result=evaluate(self.raw('camerata',['forma'],'gruppo di compagni'),{})
        self.assertNotIn('forma',result['excluded_words'])
        self.assertEqual(result['pending_words'],['forma'])

    def test_no_signal_does_not_promote_raw_tokens(self):
        result=evaluate(self.raw('pizza',['pomodoro','forno'],'alimento'),{})
        self.assertEqual(result['retained_words'],[])
        self.assertEqual(len(result['pending_words']),2)

    def test_editorial_rationales_keep_words_without_inventing_QA(self):
        row=candidate()
        row['editorial_revision']={'sense_description':'Preparazione alimentare di impasto condito',
            'word_reviews':[dict(r,relation='contesto') for r in approved_qa()['word_reviews']]}
        result=evaluate(row,{})
        self.assertEqual(result['retained_words'],row['words'])
        self.assertTrue(result['complete_editorial_set'])
        self.assertFalse(result['approved'])
        self.assertEqual(result['independent_review'],'NOT_RUN')

    def test_foreign_unlisted_or_inaccessible_prompt_blocks_export(self):
        row=candidate()
        row['editorial_revision']={'sense_description':'Preparazione alimentare di impasto condito',
            'word_reviews':[dict(r,relation='contesto') for r in approved_qa()['word_reviews']]}
        result=evaluate(row,{}, {'accepted':False,'reason':'not_accessible'})
        self.assertEqual(result['retained_words'],[])

    def test_adjective_on_secondary_noun_is_excluded(self):
        root=SimpleNamespace(text='camera',lemma_='camera',pos_='NOUN',dep_='ROOT',children=[])
        head=SimpleNamespace(text='edifici',lemma_='edificio',pos_='NOUN',dep_='obl',head=root)
        adj=SimpleNamespace(text='militari',lemma_='militare',pos_='ADJ',dep_='amod',head=head,idx=12)
        row=self.raw('camerata',['militare'],'camera negli edifici militari')
        row['clue_evidence']={'militare':{'kind':'definizione','analysis':{'pos':'ADJ','word':'militari'}}}
        result=evaluate(row,{row['source_gloss']:[adj]})
        self.assertEqual(result['excluded_words'],['militare'])
        self.assertEqual(result['words_review'][0]['adjective_attachment']['governor'],'edifici')


if __name__=='__main__':
    unittest.main()
