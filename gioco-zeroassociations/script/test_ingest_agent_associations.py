"""Regressioni tecniche delle sostituzioni, senza simulare valutazioni semantiche."""
import json
from pathlib import Path
import tempfile
import unittest

from ingest_agent_associations import frozen_replacement, selected


class FrozenReplacementTests(unittest.TestCase):
    redo={'replaces_existing_pools':True}

    def test_redo_queue_replaces_only_the_frozen_pool(self):
        self.assertTrue(frozen_replacement(self.redo,{'initial_pool_id':'p1'},{'content_sha256':'p1'}))
        self.assertFalse(frozen_replacement(self.redo,{'initial_pool_id':'p1'},{'content_sha256':'p2'}))

    def test_ordinary_queue_never_replaces(self):
        self.assertFalse(frozen_replacement({},{'initial_pool_id':'p1'},{'content_sha256':'p1'}))
        self.assertFalse(frozen_replacement(self.redo,{},{'content_sha256':'p1'}))
        self.assertFalse(frozen_replacement(self.redo,{'initial_pool_id':'p1'},None))


class CorrectionSelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)
        self.batch=self.folder/'batch_0001.jsonl'
        self.write(self.batch,[{'prompt':'esempio','revision':0}])

    def write(self,path,rows):
        path.write_text(''.join(json.dumps(r)+'\n' for r in rows),encoding='utf-8')

    def test_latest_explicit_correction_wins_without_editing_original(self):
        before=self.batch.read_bytes()
        self.write(self.folder/'corrections_0001.jsonl',[{'prompt':'esempio','revision':1,
            'supersedes_file':self.batch.name}])
        correction=self.folder/'corrections_0002.jsonl'
        self.write(correction,[{'prompt':'esempio','revision':2,'corrects_file':self.batch.name,
            'correction_reason':'Motivo tecnico conservato nel verbale sostitutivo.'}])
        record,path=selected(self.batch)[0]
        self.assertEqual(record['revision'],2)
        self.assertEqual(path,correction.resolve())
        self.assertEqual(self.batch.read_bytes(),before)

    def test_correction_cannot_add_a_prompt_to_another_batch(self):
        self.write(self.folder/'corrections_0001.jsonl',[{'prompt':'altro',
            'supersedes_file':self.batch.name,'correction_reason':'Motivazione della correzione.'}])
        with self.assertRaisesRegex(ValueError,'priva di origine'):selected(self.batch)

    def test_latest_correction_requires_its_own_reason(self):
        self.write(self.folder/'corrections_0001.jsonl',[{'prompt':'esempio',
            'supersedes_file':self.batch.name}])
        with self.assertRaisesRegex(ValueError,'priva di motivazione'):selected(self.batch)


if __name__=='__main__':unittest.main()
