"""RAW 2.0: deduplicazione, isolamento dal vecchio RAW e import atomici."""
from contextlib import closing, redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

import aggiorna_parole_raw as task
from parole_raw_v2 import WordDatabase, collect_all, LEGACY_DB


def source(key='fixture', path=None):
    return {'id':key,'name':key,'kind':'wordlist','url':'https://example.invalid/list.txt',
            'license':'Fixture','attribution':'Test',**({'local_path':str(path)} if path else {})}


def legacy_fixture(path):
    config = source()
    with closing(sqlite3.connect(path)) as con,con:
        con.executescript('''
            CREATE TABLE raw__inventory_terms(prompt TEXT PRIMARY KEY,is_single_word INTEGER);
            CREATE TABLE raw__inventory_sources(source_key,name,kind,url,license,attribution);
            CREATE TABLE raw__inventory_registered_sources(source_key,config_json);
            CREATE TABLE raw__inventory_snapshots(id,source_key,sha256,acquired_at,cache_path,records,source_config_json);
            CREATE TABLE raw__inventory_snapshot_numbers(n,snapshot_id);
            CREATE TABLE raw__inventory_attestation_rows(snapshot,prompt);
            CREATE TABLE raw__inventory_term_decisions(prompt,decision);
            INSERT INTO raw__inventory_terms VALUES ('fare',1),('stoviglie',1),('bella',1);
            INSERT INTO raw__inventory_term_decisions VALUES ('fare','DISCARDED');
            INSERT INTO raw__inventory_snapshot_numbers VALUES (0,'snapshot');
            INSERT INTO raw__inventory_attestation_rows VALUES (0,'fare'),(0,'fare'),(0,'stoviglie'),(0,'bella');
        ''')
        con.execute('INSERT INTO raw__inventory_sources VALUES (?,?,?,?,?,?)',
                    ('fixture','Fixture','wordlist',config['url'],'Fixture','Test'))
        con.execute('INSERT INTO raw__inventory_registered_sources VALUES (?,?)',('fixture',json.dumps(config)))
        con.execute('INSERT INTO raw__inventory_snapshots VALUES (?,?,?,?,?,?,?)',
                    ('snapshot','fixture','sha','2026-11-16','cache',4,json.dumps(config)))


class PruneSourcesTests(unittest.TestCase):
    def test_removed_source_and_foreign_treebank_tokens_leave_the_collection(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            folder = Path(folder)
            (folder/'it.txt').write_text('casa\nmela\n', encoding='utf-8')
            (folder/'titles.txt').write_text('casa\nhouse\n', encoding='utf-8')
            (folder/'ud.conllu').write_text('1\tcase\tcasa\tNOUN\t_\tNumber=Plur\t0\troot\t_\t_\n'
                                            '2\tpeople\tpeople\tNOUN\t_\tForeign=Yes\t1\tdep\t_\t_\n', encoding='utf-8')
            italian, titles = source('italian', folder/'it.txt'), source('titles', folder/'titles.txt')
            treebank = {**source('ud', folder/'ud.conllu'), 'kind': 'conllu'}
            with closing(WordDatabase(folder/'raw.sqlite3')) as db:
                for config in (italian, titles, treebank):
                    db.import_source(config, Path(config['local_path']))
                con = db.con
                # Un'attestazione straniera registrata prima del filtro dei treebank, e una parola della copia storica senza fonte.
                con.execute("INSERT INTO parole VALUES ('people',1),('storica',1)")
                con.execute("INSERT INTO parole_fonti VALUES ('people','ud')")
                con.executescript('''CREATE TABLE normalizzata(parola TEXT PRIMARY KEY REFERENCES parole(parola), is_single_word INTEGER NOT NULL);
                    INSERT INTO normalizzata SELECT parola, is_single_word FROM parole;
                    INSERT OR REPLACE INTO meta VALUES ('normalizzazione_stato','aggiornata');''')
                report = db.prune_sources(['italian', 'ud'])
                words = {w for w, in con.execute('SELECT parola FROM parole')}
                self.assertEqual(report['removed_sources'], ['titles'])
                self.assertEqual(report['refiltered_sources'], {'ud': 1})
                self.assertEqual(report['words_removed'], 2)  # house (solo dai titoli) e people (token straniero)
                self.assertEqual(words, {'casa', 'mela', 'case', 'storica'})
                self.assertNotIn('titles', {f for f, in con.execute('SELECT id FROM fonti')})
                self.assertEqual({w for w, in con.execute('SELECT parola FROM normalizzata')}, words)
                self.assertEqual(con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(), ('da_aggiornare',))
                self.assertIsNone(con.execute('PRAGMA foreign_key_check').fetchone())
                self.assertEqual(db.prune_sources(['italian', 'ud'])['words_removed'], 0)  # idempotente


class RawV2Tests(unittest.TestCase):
    def test_remote_download_and_http_304_reuse_the_same_words(self):
        with tempfile.TemporaryDirectory() as folder,redirect_stdout(io.StringIO()):
            folder=Path(folder)
            config=source()
            class Response(io.BytesIO):
                headers={'ETag':'fixture-etag','Last-Modified':'Mon, 16 Nov 2026 10:00:00 GMT'}
            with closing(WordDatabase(folder/'new.sqlite3')) as db:
                db.register([config])
                with patch('inventory_updates.urllib.request.urlopen',return_value=Response(b'CASA\nfare\ncasa\n')):
                    first=collect_all(db,[config],folder,folder/'first.json',None,task.full_wordfreq)
                self.assertTrue(first['all_sources_completed'])
                self.assertEqual(first['inventory']['parole'],2)
                unchanged=urllib.error.HTTPError(config['url'],304,'Not Modified',{},None)
                with patch('inventory_updates.urllib.request.urlopen',side_effect=unchanged) as fetch:
                    second=collect_all(db,[config],folder,folder/'second.json',None,task.full_wordfreq)
                self.assertEqual(second['attempts'][0]['status'],'UNCHANGED')
                self.assertEqual(second['inventory']['parole'],2)
                self.assertEqual(second['inventory']['inventory_snapshots'],1)
                self.assertTrue(fetch.call_args[0][0].has_header('If-none-match'))

    def test_deduplicates_across_sources_case_whitespace_and_unicode(self):
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder)
            one,two=folder/'one.txt',folder/'two.txt'
            one.write_text(' Casa \nCASA\ncittà\ncitta\u0300\nfare\n',encoding='utf-8')
            two.write_text('casa\nstoviglie\nbella\n',encoding='utf-8')
            with closing(WordDatabase(folder/'new.sqlite3')) as db:
                db.import_source(source('one'),one)
                db.import_source(source('two'),two)
                self.assertEqual(db.counts()['parole'],5)
                self.assertEqual(db.counts()['parole_fonti'],6)
                self.assertEqual(db.con.execute("SELECT count(*) FROM parole WHERE parola='casa'").fetchone()[0],1)
                self.assertEqual(db.import_source(source('one'),one)['status'],'UNCHANGED')
                self.assertEqual(db.counts()['parole'],5)

    def test_failed_source_rolls_back_earlier_batches(self):
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder)
            bad=folder/'bad.txt'
            bad.write_bytes((''.join('parola'+''.join(chr(97+(n//26**k)%26) for k in range(4))+'\n' for n in range(15000))).encode()+b'\xff\n')
            with closing(WordDatabase(folder/'new.sqlite3')) as db:
                with self.assertRaises(UnicodeDecodeError):
                    db.import_source(source(),bad)
                self.assertEqual(db.counts()['parole'],0)
                self.assertEqual(db.counts()['parole_fonti'],0)
                self.assertEqual(db.counts()['inventory_snapshots'],0)

    def test_seed_keeps_discarded_words_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder,redirect_stdout(io.StringIO()):
            folder=Path(folder)
            old=folder/'old.sqlite3'; legacy_fixture(old)
            with closing(WordDatabase(folder/'new.sqlite3')) as db:
                seeded=db.seed_from(old)
                self.assertEqual(seeded['parole'],3)
                self.assertEqual(seeded['parole_fonti'],3)
                self.assertIsNotNone(db.con.execute("SELECT 1 FROM parole WHERE parola='fare'").fetchone())
                self.assertEqual(db.seed_from(old)['new_words'],0)
                self.assertFalse(db.con.execute("SELECT 1 FROM sqlite_schema WHERE name LIKE '%decisions%'").fetchall())
            with closing(sqlite3.connect(old)) as con:
                self.assertEqual(con.execute('SELECT * FROM raw__inventory_term_decisions').fetchall(),[('fare','DISCARDED')])

    def test_collect_attempts_every_source_and_reports_failure(self):
        with tempfile.TemporaryDirectory() as folder,redirect_stdout(io.StringIO()):
            folder=Path(folder)
            good=folder/'good.txt'; good.write_text('casa\n',encoding='utf-8')
            configs=[source('first',good),source('missing',folder/'missing.txt'),source('last',good)]
            with closing(WordDatabase(folder/'new.sqlite3')) as db:
                db.register(configs)
                report=collect_all(db,configs,folder,folder/'report.json',None,task.full_wordfreq)
                self.assertFalse(report['all_sources_completed'])
                self.assertEqual([r['status'] for r in report['attempts']],['IMPORTED','FAILED','IMPORTED'])
                self.assertEqual(report['inventory']['parole'],1)
                self.assertEqual(report['inventory']['parole_fonti'],2)

    def test_task_creates_new_database_without_download_and_refuses_legacy_target(self):
        with tempfile.TemporaryDirectory() as folder,redirect_stdout(io.StringIO()):
            folder=Path(folder)
            registry=folder/'registry.json'; registry.write_text(json.dumps([source()]),encoding='utf-8')
            target=folder/'new.sqlite3'
            with patch('parole_raw_v2.fetch_current') as fetched:
                self.assertEqual(task.main(['--db',str(target),'--registry',str(registry),
                                           '--report',str(folder/'report.json'),'--initialize-only']),0)
                fetched.assert_not_called()
            with closing(sqlite3.connect(target)) as con:
                self.assertEqual(con.execute('SELECT count(*) FROM parole').fetchone()[0],0)
            with self.assertRaises(ValueError):
                task.main(['--db',str(LEGACY_DB),'--registry',str(registry),'--initialize-only'])


if __name__=='__main__':
    unittest.main()
