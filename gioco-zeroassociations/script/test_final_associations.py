"""Regressioni tecniche della serializzazione dei fogli e di prompt_finale.sqlite3, senza valutazioni semantiche."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from final_associations import build, serialize, sheet


def write_jsonl(path, items):
    path.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in items), encoding='utf-8')


class SerializeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.job = Path(self.tmp.name)
        shards = self.job/'prepared_shards'
        shards.mkdir()
        (self.job/'agent_outputs'/'shard_01').mkdir(parents=True)
        head = {'pos': 'NOUN', 'sense_description': 'Recipiente usato per coltivare piante',
                'category_id': '161', 'prompt_language': 'it', 'review': {}}
        write_jsonl(shards/'shard_01.jsonl', [{'rank': 0, 'shard': 'shard_01', 'prompt': 'vaso',
                                               'initial_validation_id': 'abc', 'prompt_review': head}])
        (shards/'manifest.json').write_text(json.dumps({'reviewers': {'shard_01': 'Revisore di prova'}}), encoding='utf-8')
        self.sheet = self.job/'agent_outputs'/'shard_01'/'authored_0001.txt'

    def author(self, answers):
        header = ('vaso|161|NOUN|Recipiente usato per coltivare piante|Senso domestico del vaso da fiori, familiare.'
                  '|Il vaso serve a coltivare piante in casa o sul balcone.|Bacino nel senso delle piante; terra e terriccio in gruppo.')
        self.sheet.write_text(header+'\n'+'\n'.join(answers)+'\n', encoding='utf-8')

    def test_sheet_becomes_immutable_batch_with_groups(self):
        self.author(['terra|suolo per le piante|contenuto|Nel vaso si mette la terra per far crescere la pianta.|terra',
                     'terriccio|terra fertile|contenuto|Il terriccio riempie il vaso prima di piantare.|terra',
                     'fiore|pianta ornamentale|contenuto|Nel vaso si coltivano spesso fiori da balcone.'])
        serialize('shard_01', 1, self.job)
        record = json.loads((self.job/'agent_outputs'/'shard_01'/'batch_0001.jsonl').read_text(encoding='utf-8'))
        self.assertEqual(record['reviewer'], 'Revisore di prova')
        self.assertEqual(record['group_limits'], {'terra': 1, 'fiore': 1})
        self.assertEqual([a['word'] for a in record['answers']], ['terra', 'terriccio', 'fiore'])
        with self.assertRaises(ValueError):
            serialize('shard_01', 1, self.job)

    def test_invalid_rows_block_the_whole_sheet(self):
        self.author(['Terra|suolo|contenuto|Parola maiuscola non ammessa nel formato.'])
        with self.assertRaises(ValueError):
            serialize('shard_01', 1, self.job)
        self.assertFalse((self.job/'agent_outputs'/'shard_01'/'batch_0001.jsonl').exists())

    def test_deferral_and_sheet(self):
        self.sheet.write_text('vaso|RINVIO|Senso troppo ambiguo per il gioco in diretta senza aiuti.\n', encoding='utf-8')
        serialize('shard_01', 1, self.job)
        record = json.loads((self.job/'agent_outputs'/'shard_01'/'batch_0001.jsonl').read_text(encoding='utf-8'))
        self.assertEqual(record['decision'], 'deferred')
        self.assertIn('restano 0 prompt', sheet('shard_01', job=self.job))


class RedoQueueTests(unittest.TestCase):
    """prepare --rifai-validi: congela i prompt con bacino e l'impronta del bacino attuale."""
    def setUp(self):
        import final_associations as fa
        self.fa = fa
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        filtered = sqlite3.connect(':memory:')
        filtered.row_factory = sqlite3.Row
        filtered.executescript("CREATE TABLE review_order(prompt); CREATE TABLE filtered_prompts(prompt,language,pos);"
                               "INSERT INTO review_order VALUES('vaso'),('pane');")
        head = lambda w: {'prompt': w, 'pos': 'NOUN', 'prompt_language': 'it', 'content_sha256': 'h-'+w,
                          'sense_description': 'Senso di '+w, 'category_id': '161'}
        heads = {'vaso': head('vaso'), 'pane': head('pane')}
        pools = {'pane': {'content_sha256': 'pool-pane', 'answers': [
            {'word': 'forno', 'answer_sense': 'apparecchio', 'relation': 'luogo', 'meaning_group': 'forno', 'rationale': 'x'}]}}
        self.state = (heads, pools, {})
        patches = {'current': lambda raw: self.state, 'read_only': lambda path: filtered,
                   'qwen_reviewer': lambda: 'Qwen di prova', 'rule_hashes': lambda: {'regole': 'abc'}}
        for name, value in patches.items():
            original = getattr(fa, name)
            setattr(fa, name, value)
            self.addCleanup(setattr, fa, name, original)
        self.addCleanup(filtered.close)
        fa.ROOT, root = Path(self.tmp.name), fa.ROOT
        self.addCleanup(setattr, fa, 'ROOT', root)

    def test_redo_freezes_only_prompts_with_a_pool(self):
        job = Path(self.tmp.name)/'rifai'
        result = self.fa.prepare(job, shards=2, redo=True)
        self.assertEqual(result['queue'], 1)
        entry = json.loads((job/'prepared_shards'/'shard_01.jsonl').read_text(encoding='utf-8'))
        self.assertEqual((entry['prompt'], entry['initial_pool_id']), ('pane', 'pool-pane'))
        self.assertEqual(entry['current_pool'][0]['word'], 'forno')
        self.assertTrue(json.loads((job/'prepared_shards'/'manifest.json').read_text(encoding='utf-8'))['replaces_existing_pools'])
        self.assertIn('bacino attuale', self.fa.sheet('shard_01', job=job))

    def test_without_redo_the_queue_keeps_prompts_without_a_pool(self):
        job = Path(self.tmp.name)/'nuovi'
        self.fa.prepare(job, shards=1)
        entries = [json.loads(x) for x in (job/'queue.jsonl').read_text(encoding='utf-8').splitlines()]
        self.assertEqual([e['prompt'] for e in entries], ['vaso'])
        self.assertNotIn('initial_pool_id', entries[0])

    def test_redo_counts_a_pool_as_done_only_after_replacement(self):
        job = Path(self.tmp.name)/'rifai'
        self.fa.prepare(job, shards=1, redo=True)
        self.assertEqual(self.fa.status(job)['imported_pools'], 0)
        self.state[1]['pane'] = {**self.state[1]['pane'], 'content_sha256': 'pool-nuovo'}
        self.assertEqual(self.fa.status(job)['imported_pools'], 1)


class BuildTests(unittest.TestCase):
    def test_shared_word_is_stored_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp)/'validi.sqlite3', Path(tmp)/'finale.sqlite3'
            db = sqlite3.connect(source)
            db.executescript('''
                CREATE TABLE categories(category_id,category_name,cluster_id,cluster_name);
                CREATE TABLE reviews(id,reviewer,method,reviewed_at);
                CREATE TABLE prompts(lemma,language,familiar_sense,review_id,category_id);
                CREATE TABLE senses(id,prompt,description,pos,category_id,review_id);
                CREATE TABLE associations(sense_id,word,relation,rationale,answer_sense,meaning_group,difficulty);
                CREATE TABLE group_limits(sense_id,meaning_group,maximum);
                CREATE TABLE conflicts(sense_id,word_a,word_b,reason);
                CREATE TABLE metadata(key,value);
                INSERT INTO categories VALUES('005','Frutta','A','Cucina');
                INSERT INTO reviews VALUES('r1','Rev','llm_editorial_review','2026-11-10');
                INSERT INTO prompts VALUES('pane','it','Alimento','r1','005'),('pizza','it','Piatto','r1','005');
                INSERT INTO senses VALUES('s1','pane','Alimento','NOUN','005','r1'),('s2','pizza','Piatto','NOUN','005','r1');
                INSERT INTO associations VALUES('s1','forno','luogo','Il pane cuoce nel forno.','apparecchio','forno','unrated'),
                  ('s2','forno','luogo','La pizza cuoce nel forno a legna.','apparecchio','forno','unrated'),
                  ('s2','mozzarella','ingrediente','La mozzarella condisce la pizza.','formaggio','mozzarella','unrated');
                INSERT INTO group_limits VALUES('s1','forno',1),('s2','forno',1),('s2','mozzarella',1);''')
            db.commit()
            db.close()
            result = build(source, output)
            self.assertEqual((result['prompts'], result['words'], result['prompt_words'], result['shared_words']), (2, 2, 3, 1))
            out = sqlite3.connect(output)
            self.assertEqual(out.execute("SELECT prompt_count FROM word_usage WHERE word='forno'").fetchone()[0], 2)
            out.close()


if __name__ == '__main__':
    unittest.main()
