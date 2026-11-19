from contextlib import closing, redirect_stdout
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from normalizza_parole_raw_v2 import analyze, populate
from parole_raw_v2 import WordDatabase


from raw_word_metrics import WordMetrics, read_prevalence, read_subtlex
FAKE_METRICS=WordMetrics({'casa':(2.5758,1.0,49),'caso':(1.2,0.9,20)},{'casa':(17841,129959)},[{'id':'icp-prevalence','sha256':'a'*64},{'id':'subtlex-it','sha256':'b'*64}])


def config(key,kind):
    return {'id':key,'kind':kind,'name':key,'url':'https://example.invalid/fixture',
            'license':'Fixture','attribution':'Test','encoding':'utf-8'}


def fixture(folder):
    morph = folder/'morph.txt'
    rows = [
        ('gatto','gatto','NOUN-M:s'),('gatti','gatto','NOUN-M:p'),
        ('casa','casa','NOUN-F:s'),('case','casa','NOUN-F:p'),('caso','caso','NOUN-M:s'),
        ('stoviglia','stoviglia','NOUN-F:s'),('stoviglie','stoviglia','NOUN-F:p'),('stoviglie','stoviglie','NOUN-F:p'),
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
            'gatto':4,'gatti':3,'bello':6,'bella':6.2,'bellissimo':4,'bellissima':4.2,
            'ragazzo':5,'ragazzi':4,'ragazza':5.2,'ragazze':6}.get(word,2)


class NormalizeV2Tests(unittest.TestCase):
    def test_populates_second_table_and_keeps_source_with_requested_exceptions(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            folder=Path(directory)
            db,_=fixture(folder)
            with closing(db):
                before=set(db.con.execute('SELECT parola FROM parole'))
                selected,report,baseline=analyze(db.con,frequency)
                populate(db.con,selected,report,baseline,FAKE_METRICS)
                kept={w for w, in db.con.execute('SELECT parola FROM normalizzata')}
                # Il singolare resta, tranne quando il plurale ha una voce propria ed è nettamente più comune (stoviglie; 18/11/2026); "occhiali" resta perché
                # il lemma "occhiale" non è nella raccolta.
                self.assertTrue({'casa','caso','nozze','occhiali','stoviglie','uovo','ragazzo','fare','volo','bello'}<=kept)
                self.assertFalse({'case','gatti','stoviglia','uova','uovi','bella','bellissimo','bellissima','ragazza','ragazze','ragazzi','voli'}&kept)
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='stoviglia'").fetchone(),('stoviglie',))
                self.assertEqual(set(db.con.execute('SELECT parola FROM parole')),before)
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='ragazza'").fetchone(),('ragazzo',))
                # Forme verbali diverse dall'infinito: via; infinito e forme anche nominali restano.
                self.assertFalse({'volavo','volato','mangiavo'}&kept)
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='volavo'").fetchone(),('volare',))
                self.assertEqual(db.con.execute("SELECT sostituita_da FROM normalizzazione_esclusioni WHERE parola='mangiavo'").fetchone(),(None,))
                self.assertEqual(len(kept)+len(selected),len(before))
                populate(db.con,selected,report,baseline,FAKE_METRICS)
                self.assertEqual(db.con.execute('SELECT count(*) FROM normalizzata').fetchone()[0],len(kept))
                # IWFS: valori grezzi, stato e confidence per ogni parola; NULL (mai 0) per Word Prevalence non misurata.
                rows={r[0]:r[1:] for r in db.con.execute('SELECT parola,word_prevalence,contextual_diversity,frequency,iwfs,iwfs_status,iwfs_confidence FROM normalizzata')}
                self.assertEqual(set(rows),kept)
                self.assertEqual(rows['casa'][:3],(2.5758,17841,129959))  # FAKE_METRICS: frequenza della forma come fornita
                self.assertEqual(rows['casa'][4],'FULL')
                self.assertEqual(rows['caso'][0],1.2)
                self.assertEqual(rows['caso'][1:3],(0,0))          # assente da SUBTLEX-IT: zero osservato in un corpus coperto
                self.assertEqual(rows['caso'][4],'FULL')            # tre componenti presenti (due sono zeri osservati)
                self.assertIsNone(rows['uovo'][0])                  # non misurata dall'ICP
                self.assertEqual(rows['uovo'][4],'PARTIAL')
                self.assertEqual(db.con.execute("SELECT status,sample_size FROM word_measurements WHERE parola='uovo' AND metric='prevalence'").fetchone(),('MISSING',None))
                self.assertEqual(db.con.execute("SELECT status,sample_size,source_id FROM word_measurements WHERE parola='casa' AND metric='prevalence'").fetchone(),('OBSERVED',49,'icp-prevalence'))
                self.assertEqual(db.con.execute('SELECT count(*) FROM word_measurements').fetchone()[0],3*len(kept))
                self.assertEqual(report['iwfs']['words'],len(kept))
                self.assertEqual(report['iwfs']['with_word_prevalence'],2)
                self.assertEqual(report['iwfs']['status']['FULL'],2)       # casa e caso
                self.assertIsNone(db.con.execute('PRAGMA foreign_key_check').fetchone())

    def test_source_update_marks_normalized_table_stale(self):
        with tempfile.TemporaryDirectory() as directory,redirect_stdout(io.StringIO()):
            folder=Path(directory)
            db,morph=fixture(folder)
            with closing(db):
                selected,report,baseline=analyze(db.con,frequency)
                populate(db.con,selected,report,baseline,FAKE_METRICS)
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
                populate(db.con,selected,report,baseline,FAKE_METRICS)
                before=list(db.con.execute('SELECT parola FROM normalizzata'))
                morph.unlink()
                with self.assertRaises(FileNotFoundError):analyze(db.con,frequency)
                self.assertEqual(list(db.con.execute('SELECT parola FROM normalizzata')),before)


class WordMetricsFileTests(unittest.TestCase):
    def test_icp_and_subtlex_files_are_read(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            (folder/'icp.txt').write_text('spelling nobs accuracy prevalence\n-fonico 15 0.93 1.46\ncasa 49 1 2.5758293035489\nab 18 0.38 -0.27\n',encoding='utf-8')
            self.assertEqual(read_prevalence(folder/'icp.txt'),{'-fonico':(1.46,0.93,15),'casa':(2.5758293035489,1.0,49),'ab':(-0.27,0.38,18)})
            (folder/'sub.csv').write_bytes('wordform;freq_count;zipf;cd_count;dom_pos;dom_lemma;dom_lemma_freq\r\nè;2288908;7,2;19352;VER;essere;3507888\r\nCasa;100;5,0;17000;NOM;casa;134170\r\ncasa;129959;6,0;17841;NOM;casa;134170\r\nx;1;1,0;;N;x;1\r\n'.encode('latin-1'))
            # La frequenza è quella del lemma quando la forma è il suo lemma dominante (casa: 134170, non 129959); per «è» è la forma.
            self.assertEqual(read_subtlex(folder/'sub.csv'),{'è':(19352,2288908),'casa':(17841,134170)})
            (folder/'bad.txt').write_text('a b c\n',encoding='utf-8')
            with self.assertRaises(ValueError):
                read_prevalence(folder/'bad.txt')


if __name__=='__main__':
    unittest.main()
