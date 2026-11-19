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
                self.assertEqual(report['words_removed'], 1)  # people (token straniero); house non entra più: è inglese
                self.assertEqual(words, {'casa', 'mela', 'case', 'storica'})
                self.assertNotIn('titles', {f for f, in con.execute('SELECT id FROM fonti')})
                self.assertEqual({w for w, in con.execute('SELECT parola FROM normalizzata')}, words)
                self.assertEqual(con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(), ('da_aggiornare',))
                self.assertIsNone(con.execute('PRAGMA foreign_key_check').fetchone())
                self.assertEqual(db.prune_sources(['italian', 'ud'])['words_removed'], 0)  # idempotente


class ItalianOnlyTests(unittest.TestCase):
    def test_import_skips_foreign_words_and_the_filter_cleans_what_is_already_stored(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            folder = Path(folder)
            path = folder/'mixed.txt'
            path.write_text('\n'.join(['casa', 'climate', 'workshop', 'marinare', 'abaidoo', 'haus']) + '\n', encoding='utf-8')
            with closing(WordDatabase(folder/'raw.sqlite3')) as db:
                result = db.import_source(source('mixed', path), path)
                words = {w for w, in db.con.execute('SELECT parola FROM parole')}
                self.assertEqual(words, {'casa', 'marinare', 'abaidoo'})  # ortografia plausibile e senza liste: non si giudica
                self.assertEqual(result['foreign_records_skipped'], 3)
                # Parole straniere già presenti prima del filtro, con attestazione e riga di normalizzazione.
                con = db.con
                con.execute("INSERT INTO parole VALUES ('climate',1),('house',1)")
                con.execute("INSERT INTO parole_fonti VALUES ('climate','mixed'),('house','mixed')")
                con.executescript('''CREATE TABLE normalizzata(parola TEXT PRIMARY KEY REFERENCES parole(parola), is_single_word INTEGER NOT NULL);
                    INSERT INTO normalizzata SELECT parola, is_single_word FROM parole;
                    INSERT OR REPLACE INTO meta VALUES ('normalizzazione_stato','aggiornata');''')
                report = db.remove_foreign_words()
                self.assertEqual(report['words_removed'], 2)
                self.assertEqual({w for w, in con.execute('SELECT parola FROM parole')}, {'casa', 'marinare', 'abaidoo'})
                self.assertEqual(report['by_language'], {'en': 2})
                self.assertEqual(report['sample_removed'], {'en': ['climate', 'house']})
                self.assertEqual({w for w, in con.execute('SELECT parola FROM normalizzata')}, {'casa', 'marinare', 'abaidoo'})
                self.assertEqual(con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(), ('da_aggiornare',))
                self.assertIsNone(con.execute('PRAGMA foreign_key_check').fetchone())
                self.assertEqual(db.remove_foreign_words()['words_removed'], 0)  # idempotente

    def test_words_with_impossible_italian_spelling_are_removed_unless_attested(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            folder = Path(folder)
            with closing(WordDatabase(folder/'raw.sqlite3')) as db:
                db.register([source('morphit-048-mirror'), source('napolux-paroleitaliane')])
                con = db.con
                words = ['aarhus', 'aamot', 'aavv', 'cnr', 'aarden', 'zzqkx', 'pollar', 'abaidoo', 'abachista', 'casa']
                con.executemany('INSERT INTO parole VALUES (?,1)', ((w,) for w in words))
                con.executemany("INSERT INTO parole_fonti VALUES (?,'napolux-paroleitaliane')", ((w,) for w in words))
                con.execute("INSERT INTO parole_fonti VALUES ('pollar','morphit-048-mirror')")  # apocope attestata: resta
                report = db.remove_foreign_words()
                kept = {w for w, in con.execute('SELECT parola FROM parole')}
                self.assertEqual(kept, {'pollar', 'abaidoo', 'abachista', 'casa'})  # abaidoo: ortografia plausibile, non si giudica
                self.assertEqual(report['by_language'], {'ortografia': 6})
                self.assertIsNone(con.execute('PRAGMA foreign_key_check').fetchone())

    def test_foreign_surnames_with_foreign_graphemes_are_removed_unless_attested(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            folder = Path(folder)
            with closing(WordDatabase(folder/'raw.sqlite3')) as db:
                db.register([source('morphit-048-mirror'), source('napolux-paroleitaliane')])
                con = db.con
                words = ['chaabane', 'chabroux', 'chaddaoui', 'ghanbari', 'bijlsma', 'schiavo', 'chiesa', 'ghiro', 'poiché', 'macchina', 'chaouchi']
                con.executemany('INSERT INTO parole VALUES (?,1)', ((w,) for w in words))
                con.executemany("INSERT INTO parole_fonti VALUES (?,'napolux-paroleitaliane')", ((w,) for w in words))
                con.execute("INSERT INTO parole_fonti VALUES ('chaouchi','morphit-048-mirror')")  # attestata da una fonte italiana: resta
                db.remove_foreign_words()
                kept = {w for w, in con.execute('SELECT parola FROM parole')}
                self.assertEqual(kept, {'schiavo', 'chiesa', 'ghiro', 'poiché', 'macchina', 'chaouchi'})

    def test_person_names_and_surnames_are_removed_unless_they_are_common_words(self):
        def entry(word, pos, gloss, tags=None):
            return json.dumps({'lang_code': 'it', 'word': word, 'pos': pos,
                               'senses': [{'glosses': [gloss], **({'tags': tags} if tags else {})}]})
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            folder = Path(folder)
            dump = folder/'wiktionary.jsonl'
            dump.write_text('\n'.join([
                entry('mario', 'name', 'male given name'), entry('ferrari', 'name', 'A surname.'),
                entry('rossi', 'name', 'A surname.'), entry('rossi', 'adj', 'plural of rosso', ['form-of']),
                entry('colombo', 'name', 'cognome'), entry('colombo', 'noun', 'colomba'),
                entry('roma', 'name', 'capitale d\'Italia'), entry('casa', 'noun', 'edificio'),
            ]) + '\n', encoding='utf-8')
            with closing(WordDatabase(folder/'raw.sqlite3')) as db:
                db.register([{**source('kaikki-itwiktionary'), 'kind': 'wiktextract'}, source('liita-lemma-bank')])
                con = db.con
                words = ['mario', 'ferrari', 'rossi', 'colombo', 'roma', 'casa', 'tortiglione']
                con.executemany('INSERT INTO parole VALUES (?,1)', ((w,) for w in words))
                con.executemany("INSERT INTO parole_fonti VALUES (?,'kaikki-itwiktionary')", ((w,) for w in words))
                con.execute("INSERT INTO parole_fonti VALUES ('rossi','liita-lemma-bank')")  # fonte lessicale: parola comune
                con.executescript('''CREATE TABLE normalizzata(parola TEXT PRIMARY KEY REFERENCES parole(parola), is_single_word INTEGER NOT NULL);
                    INSERT INTO normalizzata SELECT parola, is_single_word FROM parole;
                    INSERT OR REPLACE INTO meta VALUES ('normalizzazione_stato','aggiornata');''')
                db._head_file = lambda source_id: (dump, {}) if source_id == 'kaikki-itwiktionary' else (None, None)
                report = db.remove_person_names()
                self.assertEqual(report['words_removed'], 2)
                self.assertEqual(report['sample_removed'], ['ferrari', 'mario'])
                self.assertEqual(report['sample_kept_as_common_words'], ['colombo', 'rossi'])
                self.assertEqual({w for w, in con.execute('SELECT parola FROM parole')},
                                 {'rossi', 'colombo', 'roma', 'casa', 'tortiglione'})
                self.assertEqual({w for w, in con.execute('SELECT parola FROM normalizzata')},
                                 {'rossi', 'colombo', 'roma', 'casa', 'tortiglione'})
                self.assertEqual(con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(), ('da_aggiornare',))
                self.assertEqual(db.remove_person_names()['words_removed'], 0)  # idempotente

    def test_lemma_resources_liita_complit_and_colfis_are_read_as_lemmas_without_proper_names(self):
        import gzip
        import zipfile
        from prompt_inventory import records
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            liita = folder/'liita.ttl'
            liita.write_text('@prefix lila: <http://lila-erc.eu/ontologies/lila/> .\n'
                             '<http://liita.it/data/id/lemma/1>\n        a lila:Lemma ;\n        lila:hasPOS lila:noun ;\n'
                             '        ontolex:writtenRep  "agostamento"@it .\n\n'
                             '<http://liita.it/data/id/lemma/2>\n        a lila:Lemma ;\n        lila:hasPOS lila:proper_noun ;\n'
                             '        ontolex:writtenRep  "Roma"@it .\n', encoding='utf-8')
            self.assertEqual([r['prompt'] for r in records(liita, {'kind': 'liita_ttl'})], ['agostamento'])
            complit = folder/'complit.ttl.gz'
            with gzip.open(complit, 'wt', encoding='utf-8') as out:
                out.write('lex:aMUSaNOUN a ontolex:Word;\n\trdfs:label "casa"@it;\n\tlexinfo:partOfSpeech lexinfo:noun;\n'
                          '\tontolex:otherForm lex:case_f .\nlex:case_f a ontolex:Form;\n\tontolex:writtenRep "case"@it .\n'
                          'lex:bMUSbPROPER a ontolex:Word;\n\trdfs:label "Mario"@it;\n\tlexinfo:partOfSpeech lexinfo:properNoun .\n')
            self.assertEqual([r['prompt'] for r in records(complit, {'kind': 'complit_ttl'})], ['casa'])
            colfis = folder/'colfis.zip'
            header = 'N Lem      Fq Tot     Lemma      Cat.Gramm\r\n'
            with zipfile.ZipFile(colfis, 'w') as archive:
                archive.writestr('Lemmi_rango.txt', header + '1      100      CASA      S\r\n2      90      ROMA      E\r\n'
                                 '3      80      A CAUSA DI      P@\r\n4      70      ,      K\r\n')
                archive.writestr('read me Lemmi_rango txt.txt', 'Informazioni')
            self.assertEqual([r['prompt'] for r in records(colfis, {'kind': 'colfis_lemmas', 'encoding': 'latin-1'})],
                             ['casa', 'a causa di'])

    def test_magic_and_paisa_are_read_as_lemmas_and_paisa_respects_the_minimum_frequency(self):
        import gzip
        from prompt_inventory import records
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            magic = folder/'magic.txt'
            magic.write_text('->al\n  [ 1] MACRO:word[l_a,al,prep_a,!,m,s,!,!,!,!]\n->scovare\n'
                             '  [ 1] MACRO:word[l_scovare,scovare,v_nofin,!,!,!,!,!,!,pos]\n'
                             '  [ 2] MACRO:word[l_scovare,scovo,v_fin,!,!,s,!,!,!,pos]\n', encoding='utf-8')
            self.assertEqual([r['prompt'] for r in records(magic, {'kind': 'magic_forms'})], ['a', 'scovare', 'scovare'])
            paisa = folder/'paisa.txt.gz'
            with gzip.open(paisa, 'wt', encoding='utf-8') as out:
                out.write('# licenza\ndi,16520744\ncasa,120\nrarissima,3\n')
            self.assertEqual([r['prompt'] for r in records(paisa, {'kind': 'paisa_lemmas', 'min_frequency': 50})], ['di', 'casa'])
            self.assertEqual(len(list(records(paisa, {'kind': 'paisa_lemmas'}))), 3)

    def test_registers_of_discarded_words_are_not_kept_and_old_ones_are_dropped(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'raw.sqlite3'
            with closing(WordDatabase(path)) as db:
                db.con.execute('CREATE TABLE parole_straniere(parola TEXT PRIMARY KEY, lingua TEXT)')
                db.con.execute('CREATE TABLE nomi_persona(parola TEXT PRIMARY KEY)')
                db.con.execute('CREATE TABLE pulizia_parole(originale TEXT PRIMARY KEY, pulita TEXT, motivo TEXT)')
            with closing(WordDatabase(path)) as db:
                tables = {r[0] for r in db.con.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
                self.assertFalse(tables & {'parole_straniere', 'nomi_persona', 'pulizia_parole'})
                db.con.execute("INSERT INTO parole VALUES ('climate',1)")
                db.remove_foreign_words()
                tables = {r[0] for r in db.con.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
                self.assertFalse(tables & {'parole_straniere', 'nomi_persona', 'pulizia_parole', 'parole_da_togliere'})

    def test_common_italian_words_and_homographs_are_kept(self):
        from raw_language_filter import foreign_language
        for word in ('casa', 'sale', 'radio', 'data', 'pasta', 'tutto', 'pensiero', 'stoviglie', 'città', 'fare', 'case', 'area', 'date', 'scale'):
            self.assertIsNone(foreign_language(word), word)
        for word in ('delay', 'workshop', 'climate', 'haus', 'avant', 'hospital'):
            self.assertIsNotNone(foreign_language(word), word)


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
