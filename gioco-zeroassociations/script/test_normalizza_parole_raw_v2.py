from contextlib import closing, redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from normalizza_parole_raw_v2 import analyze, populate
from parole_raw_v2 import WordDatabase


def config(key,kind):
    return {'id':key,'kind':kind,'name':key,'url':'https://example.invalid/fixture',
            'license':'Fixture','attribution':'Test','encoding':'utf-8'}


def fixture(folder):
    morph = folder/'morph.txt'
    rows = [
        ('gatto','gatto','NOUN-M:s'),('gatti','gatto','NOUN-M:p'),
        ('casa','casa','NOUN-F:s'),('case','casa','NOUN-F:p'),('caso','caso','NOUN-M:s'),
        ('stoviglia','stoviglia','NOUN-F:s'),('stoviglie','stoviglia','NOUN-F:p'),
        ('nozze','nozze','NOUN-F:p'),('occhiali','occhiale','NOUN-M:p'),
        ('uovo','uovo','NOUN-M:s'),('uova','uovo','NOUN-F:p'),('uovi','uovo','NOUN-M:p'),
        ('bello','bello','ADJ:pos+m+s'),('bella','bello','ADJ:pos+f+s'),
        ('bello','bello','ADV'),
        ('bellissimo','bello','ADJ:sup+m+s'),('bellissima','bello','ADJ:sup+f+s'),
        ('ragazzo','ragazzo','NOUN-M:s'),('ragazzi','ragazzo','NOUN-M:p'),
        ('ragazza','ragazza','NOUN-F:s'),('ragazze','ragazza','NOUN-F:p'),
        ('volo','volo','NOUN-M:s'),('voli','volo','NOUN-M:p'),
        ('voli','volare','VER:pres+ind+2+s'),('volare','volare','VER:inf'),
        ('fare','fare','VER:inf'),
        ('volavo','volare','VER:ind+impf+1+s'),('volato','volare','VER:part+past+m+s'),
        ('mangiavo','mangiare','VER:ind+impf+1+s')]
    morph.write_text(''.join('\t'.join(r)+'\n' for r in rows),encoding='utf-8')
    wiki = folder/'dictionary.jsonl'
    entries = [
        {'word':'ragazzo','lang_code':'it','pos':'noun','tags':['masculine','singular'],
         'forms':[{'form':'ragazza','tags':['feminine','singular']},
                  {'form':'ragazzi','tags':['masculine','plural']},
                  {'form':'ragazze','tags':['feminine','plural']}]},
        {'word':'ragazza','lang_code':'it','pos':'noun','tags':['feminine','singular'],
         'forms':[{'form':'ragazzo','tags':['masculine','singular']},
                  {'form':'ragazze','tags':['feminine','plural']}]},
        {'word':'ragazze','lang_code':'it','pos':'noun','tags':['feminine','plural'],
         'forms':[{'form':'ragazza','tags':['feminine','singular']},
                  {'form':'ragazzi','tags':['masculine','plural']}]}]
    wiki.write_text(''.join(json.dumps(r)+'\n' for r in entries),encoding='utf-8')
    db = WordDatabase(folder/'raw2.sqlite3')
    db.import_source(config('morphit-048-mirror','morphit'),morph)
    db.import_source(config('kaikki-itwiktionary','wiktextract'),wiki)
    return db,morph


def frequency(word):
    return {'stoviglie':3.15,'stoviglia':1.4,'uova':5,'uovo':3,'uovi':1,'casa':6,'case':4,
            'gatto':4,'gatti':3,'bello':6,'bella':7,'bellissimo':4,'bellissima':5,
            'ragazzo':5,'ragazzi':4,'ragazza':6,'ragazze':6}.get(word,2)


class NormalizeV2Tests(unittest.TestCase):
    def test_populates_second_table_and_keeps_source_with_requested_exceptions(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            folder=Path(directory)
            db,_=fixture(folder)
            with closing(db):
                before=set(db.con.execute('SELECT parola FROM parole'))
                selected,report,baseline=analyze(db.con,frequency)
                populate(db.con,selected,report,baseline)
                kept={w for w, in db.con.execute('SELECT parola FROM normalizzata')}
                # Il lemma resta anche quando una sua forma flessa è più frequente (17/11/2026); "occhiali" resta perché
                # il lemma "occhiale" non è nella raccolta.
                self.assertTrue({'casa','caso','nozze','occhiali','stoviglia','uovo','ragazzo','fare','volo','voli','bellissimo'}<=kept)
                self.assertFalse({'case','gatti','stoviglie','uova','uovi','bella','bellissima','ragazza','ragazze','ragazzi'}&kept)
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='stoviglie'").fetchone(),('stoviglia',))
                self.assertEqual(set(db.con.execute('SELECT parola FROM parole')),before)
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='ragazza'").fetchone(),('ragazzo',))
                # Forme verbali diverse dall'infinito: via; infinito e forme anche nominali restano.
                self.assertFalse({'volavo','volato','mangiavo'}&kept)
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='volavo'").fetchone(),('volare',))
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='mangiavo'").fetchone(),(None,))
                self.assertEqual(len(kept)+len(selected),len(before))
                populate(db.con,selected,report,baseline)
                self.assertEqual(db.con.execute('SELECT count(*) FROM normalizzata').fetchone()[0],len(kept))
                self.assertIsNone(db.con.execute('PRAGMA foreign_key_check').fetchone())

    def test_source_update_marks_normalized_table_stale(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            folder=Path(directory)
            db,morph=fixture(folder)
            with closing(db):
                selected,report,baseline=analyze(db.con,frequency)
                populate(db.con,selected,report,baseline)
                self.assertEqual(db.con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(),('aggiornata',))
                db.import_source(config('morphit-048-mirror','morphit'),morph)
                self.assertEqual(db.con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(),('aggiornata',))
                with morph.open('a',encoding='utf-8') as stream:stream.write('novità\tnovità\tNOUN-F:s\n')
                db.import_source(config('morphit-048-mirror','morphit'),morph)
                self.assertEqual(db.con.execute("SELECT value FROM meta WHERE name='normalizzazione_stato'").fetchone(),('da_aggiornare',))

    def test_missing_cache_leaves_previous_normalization_intact(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            folder=Path(directory)
            db,morph=fixture(folder)
            with closing(db):
                selected,report,baseline=analyze(db.con,frequency)
                populate(db.con,selected,report,baseline)
                before=list(db.con.execute('SELECT parola FROM normalizzata'))
                morph.unlink()
                with self.assertRaises(FileNotFoundError):analyze(db.con,frequency)
                self.assertEqual(list(db.con.execute('SELECT parola FROM normalizzata')),before)


if __name__=='__main__':
    unittest.main()
