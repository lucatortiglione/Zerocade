import json
from pathlib import Path
import tempfile
import unittest

from assemble_rewritten_sets import collect, review_coverage


def proposal(index=0,prompt='pizza'):
    facts=[('forno','Il forno cuoce la pizza.'),('mozzarella','La mozzarella condisce la pizza.'),
           ('pomodoro','Il pomodoro condisce la pizza.'),('impasto','La base della pizza è un impasto.'),
           ('lievito','Il lievito fa crescere l’impasto della pizza.'),('basilico','Il basilico aromatizza la pizza.'),
           ('olio','L’olio può condire la pizza.')]
    return {'index':index,'p':prompt,'s':'Preparazione di pasta condita e cotta al forno',
            'c':'008','pos':'NOUN','a':[[w,'contesto',r] for w,r in facts]}


class RewriteAssemblyTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.work=Path(self.tmp.name)
        self.write('input.jsonl',[{'index':0,'prompt':'pizza'},{'index':1,'prompt':'focaccia'}])

    def write(self,name,rows):
        (self.work/name).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')

    def test_partial_chunk_is_not_a_completed_rewrite(self):
        self.write('draft_0000_0002.jsonl',[proposal()])
        _,rows,partial,_=collect(self.work,{'008':{}})
        self.assertEqual(rows,{})
        self.assertIn('draft_0000_0002.jsonl',partial)

    def test_complete_export_requires_every_input_prompt(self):
        self.write('draft_0000_0001.jsonl',[proposal()])
        with self.assertRaisesRegex(ValueError,'Copertura incompleta'):
            collect(self.work,{'008':{}},require_complete=True)

    def test_context_cannot_be_renamed(self):
        self.write('draft_0000_0001.jsonl',[proposal(prompt='focaccia')])
        with self.assertRaisesRegex(ValueError,'Indice/prompt discordante'):
            collect(self.work,{'008':{}})

    def test_overlapping_chunks_are_rejected(self):
        self.write('draft_0000_0001.jsonl',[proposal()])
        self.write('draft_0000_0002.jsonl',[proposal(),proposal(1,'focaccia')])
        with self.assertRaisesRegex(ValueError,'duplicata'):
            collect(self.work,{'008':{}})

    def test_review_is_applied_only_after_its_report_is_complete(self):
        self.write('draft_0000_0001.jsonl',[proposal()])
        patch=proposal();patch['a'][-1]=['origano','contesto','L’origano può aromatizzare la pizza.']
        self.write('review_0000_0001_by_b.jsonl',[patch])
        _,rows,_,changes=collect(self.work,{'008':{}})
        self.assertEqual(rows[0]['a'][-1][0],'olio')
        self.assertEqual(changes,[])
        (self.work/'review_0000_0001_by_b_report.json').write_text(json.dumps({'examined':1,'changed':1}),encoding='utf-8')
        _,rows,_,changes=collect(self.work,{'008':{}})
        self.assertEqual(rows[0]['a'][-1][0],'origano')
        self.assertEqual(len(changes),1)
        self.assertEqual(review_coverage(self.work)[0],{0})

    def test_review_cannot_claim_unexamined_rows(self):
        (self.work/'review_0000_0002_by_b_report.json').write_text(json.dumps({'examined':1,'changed':0}),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'Copertura della revisione'):
            review_coverage(self.work)


if __name__=='__main__':unittest.main()
