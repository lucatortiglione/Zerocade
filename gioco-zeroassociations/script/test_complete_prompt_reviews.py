"""Gate del pilota, ripresa e allineamento delle decisioni; nessuna inferenza reale nei test."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import complete_prompt_reviews as runner


def candidate(word):
    return {'prompt':word,'pos':'NOUN','pos_all':'NOUN','zipf':4.0,'nvdb':1,
        'language':'it','flags':[],'gloss':'Definizione della fixture tecnica',
        'dictionary_senses':[['noun','Definizione della fixture tecnica']]}


CONFIG={'endpoint':'http://example.invalid','served_model':'fixture','model_sha256':'0'*64,
        'base_model':'fixture','quantization':'fixture','pilot_status':'ACCEPTED_FOR_PROMPT_REVIEW'}


class FakeResponse:
    def __init__(self,rows,finish='stop'):
        self.value=json.dumps({'choices':[{'finish_reason':finish,'message':{'content':json.dumps({'rows':rows})}}]}).encode()
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self):return self.value


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)

    def test_duplicate_indices_never_approve_an_unreviewed_prompt(self):
        rows=[{'i':0,'d':'R','p':'NOUN','c':'000','s':'','r':'Motivazione tecnica della fixture di test.'}]*2
        with patch.object(runner.urllib.request,'urlopen',return_value=FakeResponse(rows)):
            with self.assertRaisesRegex(ValueError,'Indici incompleti/duplicati'):
                runner.run_batch([candidate('pizza'),candidate('pane')],CONFIG,self.folder,'bad')

    def test_truncated_output_is_a_failure_not_a_deferred_review(self):
        with patch.object(runner.urllib.request,'urlopen',return_value=FakeResponse([],finish='length')):
            with self.assertRaisesRegex(ValueError,'troncata'):
                runner.run_batch([candidate('pizza')],CONFIG,self.folder,'short')

    def test_acceptance_carries_the_exact_input_and_response_fingerprints(self):
        rows=[{'i':0,'d':'V','p':'NOUN','c':'008','s':'Piatto cotto a base di impasto.',
               'r':'Motivazione sintetica usata esclusivamente dalla fixture tecnica.'}]
        with patch.object(runner.urllib.request,'urlopen',return_value=FakeResponse(rows)):
            result=runner.run_batch([candidate('pizza')],CONFIG,self.folder,'ok')
        self.assertEqual(result[0]['prompt'],'pizza')
        self.assertEqual(result[0]['decision'],'verified')
        self.assertEqual(result[0]['model_review']['candidate_sha256'],runner.digest(candidate('pizza')))
        self.assertTrue(Path(result[0]['model_review']['audit_file']).exists())

    def test_full_run_requires_an_assessed_pilot(self):
        config=deepcopy(CONFIG);config['pilot_status']='AWAITING_EDITORIAL_ASSESSMENT'
        with self.assertRaisesRegex(ValueError,'Pilota non ancora esaminato'):
            runner.infer(self.folder,config)
        self.assertFalse((self.folder/'decisions.jsonl').exists())

    def test_resume_does_not_repeat_finished_reviews(self):
        done={'prompt':'pizza','decision':'rejected','reason':'Fixture tecnica, non un giudizio sulla pizza.'}
        (self.folder/'decisions.jsonl').write_text(json.dumps(done)+'\n',encoding='utf-8')
        def fake(candidates,*args):
            self.assertEqual([c['prompt'] for c in candidates],['pane'])
            return [{'prompt':'pane','decision':'rejected','reason':'Altra fixture tecnica senza revisione reale.'}]
        with patch.object(runner,'prepare',return_value=[candidate('pizza'),candidate('pane')]),patch.object(runner,'run_batch',side_effect=fake):
            self.assertEqual(runner.infer(self.folder,CONFIG,batch_size=1,workers=1),2)
        self.assertEqual(len(runner.read_jsonl(self.folder/'decisions.jsonl')),2)


if __name__=='__main__':unittest.main()
