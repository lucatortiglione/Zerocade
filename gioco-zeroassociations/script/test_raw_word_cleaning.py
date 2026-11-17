from contextlib import closing, redirect_stdout
import io
from pathlib import Path
import sqlite3
import tempfile
import unittest

from parole_raw_v2 import WordDatabase
from raw_word_cleaning import clean_word, VERSION


class WordCleaningTests(unittest.TestCase):
    def test_symbols_emoji_and_hashtags_are_cleaned_without_losing_accents(self):
        cases={'#casa':'casa','@@CITTÀ!!':'città','😀caffè❤️':'caffè',
               '##casa##':'casa','ＣＡＳＡ':'casa','citta\u0300':'città',
               '"casa"':'casa'}
        for value,expected in cases.items():
            self.assertEqual(clean_word(value),expected,value)
        for value in ['😂','❤️',':-D',':)','XD','¯\\_(ツ)_/¯','123','h2o','https://example.invalid/casa','test@example.invalid']:
            self.assertIsNone(clean_word(value),value)

    def test_only_single_words_are_kept(self):
        for value in ['cane/gatto','cane🐶gatto','cane_gatto','cane-gatto','a bagnomaria',"a mo' di","a colpo d'occhio","l'acqua","l’acqua","mezz'asta","po'","po’"]:
            self.assertIsNone(clean_word(value),value)
        for value in ['bagnomaria','città']:
            self.assertEqual(clean_word(value),value)

    def test_import_cleaning_deduplicates_and_accepts_source_with_only_faces(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            data=folder/'words.txt'; data.write_text('#casa\ncasa\ncasa😂\n#CITTÀ\n:-D\n❤️\nh2o\n',encoding='utf-8')
            source={'id':'fixture','name':'Fixture','kind':'wordlist','url':'https://example.invalid/words',
                    'license':'Fixture','attribution':'Test'}
            with closing(WordDatabase(folder/'words.sqlite3')) as db:
                result=db.import_source(source,data)
                self.assertEqual(db.con.execute('SELECT parola FROM parole ORDER BY parola').fetchall(),[('casa',),('città',)])
                self.assertEqual(result['non_lexical_records_removed'],3)
                data.write_text('😂\n:-)\n',encoding='utf-8')
                result=db.import_source(source,data)
                self.assertEqual(result['status'],'IMPORTED')
                self.assertEqual(result['records'],0)
                self.assertEqual(db.counts()['parole'],2)

    def test_existing_words_merge_provenance_and_mark_derived_table_stale(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            with closing(WordDatabase(Path(directory)/'words.sqlite3')) as db:
                for key in ['one','two']:
                    db.register([{'id':key,'name':key,'kind':'wordlist','url':'https://example.invalid',
                                  'license':'Fixture','attribution':'Test'}])
                words=['#casa','casa','😂','città😀','città','l’acqua',"l'acqua",'cane/gatto']
                db.con.executemany('INSERT INTO parole VALUES (?,0)',[(w,) for w in words])
                db.con.executemany('INSERT INTO parole_fonti VALUES (?,?)',[(w,'one') for w in words]+[('casa','two')])
                db.con.execute('CREATE TABLE normalizzata(parola TEXT PRIMARY KEY REFERENCES parole(parola),is_single_word INTEGER)')
                db.con.execute('CREATE TABLE normalizzazione_esclusioni(parola TEXT PRIMARY KEY REFERENCES parole(parola))')
                db.con.execute('INSERT INTO normalizzata SELECT * FROM parole')
                db.con.execute("INSERT INTO meta VALUES ('normalizzazione_stato','aggiornata')")
                report=db.clean_existing(force=True)
                self.assertEqual(report['cleaned_words'],2)
                self.assertEqual(report['removed'],4)
                self.assertEqual(report['merged_duplicates'],2)
                self.assertEqual(db.con.execute("SELECT fonte_id FROM parole_fonti WHERE parola='casa' ORDER BY fonte_id").fetchall(),[('one',),('two',)])
                self.assertEqual(db.con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(),('da_aggiornare',))
                self.assertEqual(db.con.execute('SELECT count(*) FROM normalizzata').fetchone()[0],2)
                self.assertIsNone(db.con.execute('PRAGMA foreign_key_check').fetchone())
                self.assertTrue(db.clean_existing()['already_clean'])

    def test_failed_migration_rolls_back_source_and_relations(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            with closing(WordDatabase(Path(directory)/'words.sqlite3')) as db:
                db.con.execute("INSERT INTO parole VALUES ('#casa',0)")
                db.con.execute("CREATE TRIGGER reject_clean BEFORE INSERT ON parole WHEN NEW.parola='casa' BEGIN SELECT RAISE(ABORT,'fixture failure'); END")
                with self.assertRaises(sqlite3.IntegrityError):db.clean_existing(force=True)
                self.assertEqual(db.con.execute('SELECT parola FROM parole').fetchall(),[('#casa',)])
                self.assertEqual(db.con.execute('PRAGMA foreign_keys').fetchone()[0],1)


if __name__=='__main__':
    unittest.main()
